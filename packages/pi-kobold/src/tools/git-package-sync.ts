/**
 * Git Sync Tools
 *
 * Generic git↔GitHub sync tools that work for any project:
 *
 * - Monorepo subtree sync (push/pull subdirectories to individual repos)
 * - Standalone repo push/pull
 * - GitHub Issues & PR management
 * - Git worktree management
 *
 * All org names, prefixes, and directory structures are configurable
 * via tool parameters or a `.git-sync.json` config file at the repo root.
 *
 * Auto-detection: if no config or params are provided, the tools infer
 * the GitHub org from git remotes and list subdirectories from the
 * directory structure.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Types
// ============================================================================

interface GitSyncConfig {
  /** GitHub org or user (e.g. "my-org") */
  org?: string;
  /** Subdirectory prefix in the monorepo (e.g. "packages", "libs") */
  prefix?: string;
  /** Glob pattern for listing subdirectories (e.g. "pi-*", "lib-*", "*") */
  pattern?: string;
  /** Remote naming convention: "pkg-{name}" by default */
  remotePrefix?: string;
  /** Default branch (default: "main") */
  defaultBranch?: string;
  /** Visibility for new repos: "public" or "private" */
  visibility?: "public" | "private";
  /** Mode: "subtree" for monorepo prefix sync, "standalone" for single repo */
  mode?: "subtree" | "standalone";
}

interface RunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

// ============================================================================
// Shell Helpers
// ============================================================================

function run(cmd: string, cwd?: string): RunResult {
  try {
    const stdout = execSync(cmd, {
      cwd: cwd || process.cwd(),
      encoding: "utf-8",
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, stdout: stdout.trim(), stderr: "", code: 0 };
  } catch (err: any) {
    return {
      ok: false,
      stdout: (err.stdout || "").trim(),
      stderr: (err.stderr || "").trim(),
      code: err.status ?? 1,
    };
  }
}

function runQuiet(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, { cwd: cwd || process.cwd(), encoding: "utf-8", timeout: 30_000 }).trim();
  } catch {
    return "";
  }
}

// ============================================================================
// Config Resolution
// ============================================================================

const CONFIG_FILES = [".git-sync.json", ".git-sync.jsonc"];

/** Read config from a JSON file in the repo root */
function readConfigFile(root: string): GitSyncConfig {
  for (const file of CONFIG_FILES) {
    const path = join(root, file);
    if (existsSync(path)) {
      try {
        const raw = readFileSync(path, "utf-8");
        // Strip comments for .jsonc
        const stripped = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
        return JSON.parse(stripped);
      } catch (err) {
        console.warn(`[git-sync] Warning: Failed to parse ${path}: ${err}`);
      }
    }
  }
  return {};
}

/** Read org from package.json repository field */
function readOrgFromPackageJson(root: string, pkgDir?: string): string | undefined {
  const dir = pkgDir ? join(root, pkgDir) : root;
  const pkgJsonPath = join(dir, "package.json");
  if (!existsSync(pkgJsonPath)) return undefined;

  try {
    const data = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    // "repository": { "url": "https://github.com/org/name.git" }
    const repoUrl = data.repository?.url || data.repository;
    if (typeof repoUrl === "string") {
      const match = repoUrl.match(/github\.com[:/]([^/]+)/);
      if (match) return match[1];
    }
  } catch { /* ignore */ }

  return undefined;
}

/** Detect the GitHub org from git remotes */
function detectOrg(root: string): string | undefined {
  const remotes = runQuiet("git remote -v", root);
  for (const line of remotes.split("\n")) {
    const match = line.match(/github\.com[:/]([^/]+)/);
    if (match) return match[1];
  }
  return undefined;
}

/** Detect git root (walk up from cwd looking for .git) */
function findGitRoot(startDir?: string): string | null {
  let dir = startDir || process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Merge config from file + params, with auto-detection fallbacks */
function resolveConfig(root: string, params: GitSyncConfig = {}): Required<GitSyncConfig> {
  const fileConfig = readConfigFile(root);
  const org = params.org || fileConfig.org || detectOrg(root) || "UNKNOWN_ORG";
  const prefix = params.prefix !== undefined ? params.prefix : (fileConfig.prefix || "packages");
  const pattern = params.pattern || fileConfig.pattern || "*";
  const remotePrefix = params.remotePrefix || fileConfig.remotePrefix || "pkg-";
  const defaultBranch = params.defaultBranch || fileConfig.defaultBranch || "main";
  const visibility = params.visibility || fileConfig.visibility || "public";
  const mode = params.mode || fileConfig.mode || (prefix ? "subtree" : "standalone");

  return { org, prefix, pattern, remotePrefix, defaultBranch, visibility, mode };
}

// ============================================================================
// Directory & Remote Helpers
// ============================================================================

/** List subdirectories matching a pattern under the prefix */
function listSubdirs(root: string, prefix: string, pattern: string): string[] {
  const targetDir = prefix ? join(root, prefix) : root;
  if (!existsSync(targetDir)) return [];

  const glob = `${targetDir}/${pattern}`;
  const result = run(`ls -d ${glob}/ 2>/dev/null`, root);
  if (!result.ok) return [];

  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((p) => p.replace(/\/$/, "").replace(/.*\//, ""))  // basename
    .filter((name) => !name.startsWith("."))                 // skip hidden
    .sort();
}

/** Get the npm/package name from a directory's package.json */
function getPackageName(dir: string): string {
  const pkgJsonPath = join(dir, "package.json");
  if (!existsSync(pkgJsonPath)) return "";
  try {
    return JSON.parse(readFileSync(pkgJsonPath, "utf-8")).name || "";
  } catch {
    return "";
  }
}

/** Check if a GitHub repo exists */
function repoExists(org: string, name: string): boolean {
  return run(`gh repo view ${org}/${name} --json name 2>/dev/null`).ok;
}

/** Get or create the remote name for a subdirectory */
function ensureRemote(root: string, name: string, org: string, remotePrefix: string): { ok: boolean; remote: string; url: string } {
  const remoteName = `${remotePrefix}${name}`;
  const httpsUrl = `https://github.com/${org}/${name}.git`;

  // Check if any remote already points to this repo (any name, any protocol)
  const remotes = runQuiet(`git remote -v`, root);
  const matchLine = remotes.split('\n').find(line =>
    line.includes('github.com') && line.match(new RegExp(`[/:]${org}/${name}[./]`))
  );
  if (matchLine) {
    const existingRemote = matchLine.split(/\s+/)[0];
    const existingUrl = runQuiet(`git remote get-url ${existingRemote}`, root);
    return { ok: true, remote: existingRemote, url: existingUrl };
  }

  // Check if the named remote already exists
  const existing = runQuiet(`git remote get-url ${remoteName}`, root);
  if (existing) {
    return { ok: true, remote: remoteName, url: existing };
  }

  // Add new remote — use HTTPS (SSH requires key setup)
  const addResult = run(`git remote add ${remoteName} ${httpsUrl}`, root);
  if (addResult.ok || runQuiet(`git remote`, root).split("\n").includes(remoteName)) {
    return { ok: true, remote: remoteName, url: httpsUrl };
  }

  return { ok: false, remote: remoteName, url: httpsUrl };
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * git_status — Show sync status of subdirectories or standalone repo
 */
async function gitStatus(params: {
  name?: string;
  org?: string;
  prefix?: string;
  pattern?: string;
  mode?: "subtree" | "standalone";
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findGitRoot(params.cwd) || process.cwd();
  const config = resolveConfig(root, params);
  const { org, prefix, pattern, remotePrefix, defaultBranch, mode } = config;

  // Standalone mode — just show the current repo status
  if (mode === "standalone") {
    const remote = runQuiet("git remote get-url origin", root);
    const branch = runQuiet("git branch --show-current", root);
    const ahead = runQuiet(`git log origin/${branch}..HEAD --oneline 2>/dev/null | wc -l`, root);
    const behind = runQuiet(`git log HEAD..origin/${branch} --oneline 2>/dev/null | wc -l`, root);
    const hasRemote = !!remote;
    const onGitHub = hasRemote && remote.includes("github.com");

    const text = [
      `## 📦 Git Status (standalone)\n`,
      `| Property | Value |`,
      `|----------|-------|`,
      `| Root | \`${root}\` |`,
      `| Branch | \`${branch || "unknown"}\` |`,
      `| Remote | ${hasRemote ? `\`${remote}\`` : "—"} |`,
      `| GitHub | ${onGitHub ? "✅" : "—"} |`,
      `| Ahead | ${ahead || 0} commits |`,
      `| Behind | ${behind || 0} commits |`,
    ].join("\n");

    return {
      content: [{ type: "text", text }],
      details: { root, mode: "standalone", org, branch, remote, ahead, behind },
    };
  }

  // Subtree mode — list subdirectories and their sync status
  const names = params.name ? [params.name] : listSubdirs(root, prefix, pattern);

  if (names.length === 0) {
    return {
      content: [{ type: "text", text: `No subdirectories found under \`${prefix}/${pattern}\` in \`${root}\`.\n\nTip: Set \`prefix\` and \`pattern\` params or create a \`.git-sync.json\` config file.` }],
      details: { root, mode: "subtree", names: [], org, prefix, pattern },
    };
  }

  // Fetch all remotes
  runQuiet("git fetch --all --quiet 2>/dev/null", root);

  const rows: Array<{
    name: string;
    npmName: string;
    hasRemote: boolean;
    repoExists: boolean;
    syncStatus: string;
  }> = [];

  const lines: string[] = [
    `## 📦 Package Sync Status\n`,
    `**Org:** \`${org}\` • **Prefix:** \`${prefix}\` • **Pattern:** \`${pattern}\`\n`,
    `| Name | Package | Remote | GitHub | Sync |`,
    `|------|---------|--------|--------|------|`,
  ];

  for (const name of names) {
    const pkgDir = join(root, prefix, name);
    const npmName = getPackageName(pkgDir) || name;
    const remoteName = `${remotePrefix}${name}`;
    const hasRemote = !!runQuiet(`git remote get-url ${remoteName}`, root);
    const onGitHub = repoExists(org, name);

    let syncStatus = "—";

    if (onGitHub) {
      const remoteSetup = ensureRemote(root, name, org, remotePrefix);
      if (remoteSetup.ok) {
        runQuiet(`git fetch ${remoteSetup.remote} ${defaultBranch} 2>/dev/null`, root);

        // Content-based comparison instead of git subtree split
        // Extract both trees to temp dirs and diff them
        const tmpRemote = `/tmp/git-sync-${name}-st`;
        const tmpLocal = `/tmp/git-sync-${name}-sl`;
        runQuiet(`rm -rf "${tmpRemote}" "${tmpLocal}"`, root);
        runQuiet(`mkdir -p "${tmpRemote}"`, root);
        runQuiet(`mkdir -p "${tmpLocal}/${prefix}/${name}"`, root);

        const remoteArchiveOk = runQuiet(`git archive ${remoteSetup.remote}/${defaultBranch} 2>/dev/null | tar -x -C "${tmpRemote}"`, root);
        const localArchiveOk = runQuiet(`git archive HEAD -- ${prefix}/${name} 2>/dev/null | tar -x -C "${tmpLocal}"`, root);

        const diffOutput = runQuiet(`diff -rq "${tmpLocal}/${prefix}/${name}" "${tmpRemote}" 2>/dev/null || true`, root);
        runQuiet(`rm -rf "${tmpRemote}" "${tmpLocal}"`, root);

        if (diffOutput.trim() === "") {
          syncStatus = "✅ synced";
        } else {
          const fileCount = diffOutput.trim().split("\n").length;
          syncStatus = `↔ ${fileCount} file${fileCount !== 1 ? "s" : ""} differ`;
        }
      } else {
        syncStatus = "⚠️ no remote";
      }
    } else if (!onGitHub) {
      syncStatus = "❌ no repo";
    } else {
      syncStatus = "⚠️ no remote";
    }

    rows.push({ name, npmName, hasRemote, repoExists: onGitHub, syncStatus });
    lines.push(`| ${name} | ${npmName} | ${hasRemote ? "✅" : "—"} | ${onGitHub ? "✅" : "—"} | ${syncStatus} |`);
  }

  lines.push("");
  lines.push(`**${names.length} packages** • Root: \`${root}\` • Org: \`${org}\``);

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: { root, mode: "subtree", packages: rows, org, prefix, pattern },
  };
}

/**
 * git_push — Push a subdirectory or standalone repo to GitHub
 */
async function gitPush(params: {
  name?: string;
  org?: string;
  prefix?: string;
  mode?: "subtree" | "standalone";
  branch?: string;
  force?: boolean;
  remote?: string;
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findGitRoot(params.cwd) || process.cwd();
  const config = resolveConfig(root, params);
  const { org, prefix, remotePrefix, defaultBranch, visibility, mode } = config;
  const branch = params.branch || defaultBranch;
  const forceFlag = params.force ? " --force" : "";

  // Standalone mode — simple git push
  if (mode === "standalone") {
    const remote = params.remote || "origin";
    const pushResult = run(`git push${forceFlag} ${remote} ${branch} 2>&1`, root);

    if (!pushResult.ok) {
      return {
        content: [{ type: "text", text: `❌ Push failed:\n\`\`\`\n${pushResult.stderr}\n\`\`\`` }],
        details: { error: true, mode: "standalone", remote, branch },
      };
    }

    return {
      content: [{ type: "text", text: `✅ Pushed to \`${remote}/${branch}\`\n\n${pushResult.stdout}` }],
      details: { success: true, mode: "standalone", remote, branch },
    };
  }

  // Subtree mode
  const name = params.name;
  if (!name) {
    return {
      content: [{ type: "text", text: "❌ `name` is required in subtree mode (the subdirectory name to push)" }],
      details: { error: true, mode: "subtree" },
    };
  }

  const pkgDir = join(root, prefix, name);
  if (!existsSync(pkgDir)) {
    return {
      content: [{ type: "text", text: `❌ Directory not found: \`${prefix}/${name}\`` }],
      details: { error: true, name, mode: "subtree" },
    };
  }

  // Ensure GitHub repo exists
  if (!repoExists(org, name)) {
    const desc = getPackageName(pkgDir) || name;
    const createResult = run(`gh repo create ${org}/${name} --${visibility} --description "${desc}" 2>&1`);
    if (!createResult.ok) {
      return {
        content: [{ type: "text", text: `❌ Failed to create ${org}/${name}: ${createResult.stderr}` }],
        details: { error: true, name, step: "create_repo" },
      };
    }
  }

  // Ensure remote is configured
  const remoteSetup = ensureRemote(root, name, org, remotePrefix);
  if (!remoteSetup.ok) {
    return {
      content: [{ type: "text", text: `❌ Failed to set up git remote for \`${name}\`` }],
      details: { error: true, name, step: "remote_setup" },
    };
  }

  // Push via subtree
  const pushCmd = `git subtree push${forceFlag} --prefix=${prefix}/${name} ${remoteSetup.remote} ${branch}`;
  const pushResult = run(pushCmd, root);

  if (!pushResult.ok) {
    return {
      content: [{
        type: "text",
        text: `❌ Subtree push failed for \`${name}\`:\n\`\`\`\n${pushResult.stderr}\n\`\`\`\n\nTry with \`force: true\` to overwrite, or resolve conflicts manually.`,
      }],
      details: { error: true, name, step: "push", stderr: pushResult.stderr },
    };
  }

  return {
    content: [{ type: "text", text: `✅ Pushed \`${name}\` to \`${org}/${name}\` (${branch})\n\n${pushResult.stdout}` }],
    details: { success: true, name, remote: remoteSetup.remote, branch, org },
  };
}

/**
 * git_pull — Pull changes from GitHub into a subdirectory or standalone repo
 */
async function gitPull(params: {
  name?: string;
  org?: string;
  prefix?: string;
  mode?: "subtree" | "standalone";
  branch?: string;
  squash?: boolean;
  remote?: string;
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findGitRoot(params.cwd) || process.cwd();
  const config = resolveConfig(root, params);
  const { org, prefix, remotePrefix, defaultBranch, mode } = config;
  const branch = params.branch || defaultBranch;
  const squash = params.squash !== false; // default true
  const remote = params.remote || "origin";

  // Standalone mode
  if (mode === "standalone") {
    const pullResult = run(`git pull ${remote} ${branch} 2>&1`, root);

    if (!pullResult.ok) {
      if (pullResult.stderr.includes("CONFLICT") || pullResult.stderr.includes("conflict")) {
        return {
          content: [{ type: "text", text: `⚠️ Merge conflicts:\n\`\`\`\n${pullResult.stderr}\n\`\`\`\n\nResolve conflicts, then \`git add . && git commit\`.` }],
          details: { error: true, mode: "standalone", step: "conflict" },
        };
      }
      return {
        content: [{ type: "text", text: `❌ Pull failed:\n\`\`\`\n${pullResult.stderr}\n\`\`\`` }],
        details: { error: true, mode: "standalone" },
      };
    }

    return {
      content: [{ type: "text", text: `✅ Pulled from \`${remote}/${branch}\`\n\n${pullResult.stdout}` }],
      details: { success: true, mode: "standalone", remote, branch },
    };
  }

  // Subtree mode
  const name = params.name;
  if (!name) {
    return {
      content: [{ type: "text", text: "❌ `name` is required in subtree mode (the subdirectory name to pull)" }],
      details: { error: true, mode: "subtree" },
    };
  }

  const pkgDir = join(root, prefix, name);
  if (!existsSync(pkgDir)) {
    return {
      content: [{ type: "text", text: `❌ Directory not found: \`${prefix}/${name}\`` }],
      details: { error: true, name },
    };
  }

  if (!repoExists(org, name)) {
    return {
      content: [{ type: "text", text: `❌ GitHub repo \`${org}/${name}\` does not exist` }],
      details: { error: true, name },
    };
  }

  const remoteSetup = ensureRemote(root, name, org, remotePrefix);
  if (!remoteSetup.ok) {
    return {
      content: [{ type: "text", text: `❌ Failed to set up remote for \`${name}\`` }],
      details: { error: true, name },
    };
  }

  // Fetch
  const fetchResult = run(`git fetch ${remoteSetup.remote} ${branch}`, root);
  if (!fetchResult.ok) {
    return {
      content: [{ type: "text", text: `❌ Fetch failed: ${fetchResult.stderr}` }],
      details: { error: true, name, step: "fetch" },
    };
  }

  // Content-based pull: extract remote tree into the package directory
  // This avoids the "unrelated histories" problem that git subtree pull creates
  // when the standalone repo has a different commit history than the monorepo prefix.
  //
  // How it works:
  //   1. git archive the remote tree to a temp dir
  //   2. git archive the local package dir to another temp dir (with prefix stripped)
  //   3. Compare with diff -rq to check for changes
  //   4. If different, extract remote tree over the package dir
  //   5. Stage changes and prompt user to commit

  // Check for content differences
  const tmpRemote = `/tmp/git-sync-${name}-remote`;
  const tmpLocal = `/tmp/git-sync-${name}-local`;
  runQuiet(`rm -rf "${tmpRemote}" "${tmpLocal}"`, root);
  run(`mkdir -p "${tmpRemote}"`, root);
  run(`mkdir -p "${tmpLocal}/${prefix}/${name}"`, root);

  // Extract remote tree
  const archiveRemote = run(`git archive ${remoteSetup.remote}/${branch} | tar -x -C "${tmpRemote}"`, root);
  if (!archiveRemote.ok) {
    runQuiet(`rm -rf "${tmpRemote}" "${tmpLocal}"`, root);
    return {
      content: [{ type: "text", text: `❌ Could not extract remote tree for \`${name}\`\n\`\`\`\n${archiveRemote.stderr}\n\`\`\`` }],
      details: { error: true, name, step: "archive_remote" },
    };
  }

  // Extract local package dir
  runQuiet(`git archive HEAD -- ${prefix}/${name} | tar -x -C "${tmpLocal}"`, root);

  // Compare
  const diffResult = run(`diff -rq "${tmpLocal}/${prefix}/${name}" "${tmpRemote}" 2>&1 || true`, root);
  runQuiet(`rm -rf "${tmpRemote}" "${tmpLocal}"`, root);

  if (diffResult.stdout.trim() === "" || !diffResult.ok) {
    if (diffResult.stdout.trim() === "") {
      return {
        content: [{ type: "text", text: `✅ \`${name}\` is already up to date` }],
        details: { success: true, name, branch, org, changes: 0 },
      };
    }
  }

  // Apply changes: extract remote tree over the local package directory
  const extractResult = run(`git archive ${remoteSetup.remote}/${branch} | tar -x -C "${pkgDir}"`, root);
  if (!extractResult.ok) {
    return {
      content: [{ type: "text", text: `❌ Could not extract remote tree into \`${prefix}/${name}\`\n\`\`\`\n${extractResult.stderr}\n\`\`\`` }],
      details: { error: true, name, step: "extract" },
    };
  }

  // Stage changes
  run(`git add "${prefix}/${name}/"`, root);
  const staged = run(`git diff --cached --stat`, root);

  if (!staged.stdout.trim()) {
    return {
      content: [{ type: "text", text: `✅ \`${name}\` is already up to date (no content changes)` }],
      details: { success: true, name, branch, org, changes: 0 },
    };
  }

  const changeLines = staged.stdout.trim().split("\n").length;
  return {
    content: [{
      type: "text",
      text: [
        `✅ Pulled \`${name}\` from \`${org}/${name}\` (${branch})`,
        "",
        "Changed files:",
        "```",
        staged.stdout.trim(),
        "```",
        "",
        "Changes are staged but **not committed**. Review and commit:",
        "```bash",
        `git commit -m "sync(${name}): pull from ${org}/${name}"`,
        "```",
      ].join("\n"),
    }],
    details: { success: true, name, branch, org, changes: changeLines, staged: true },
  };
}

/**
 * git_init — Initialize a new GitHub repo for a subdirectory or standalone project
 */
async function gitInit(params: {
  name?: string;
  org?: string;
  prefix?: string;
  mode?: "subtree" | "standalone";
  private?: boolean;
  description?: string;
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findGitRoot(params.cwd) || process.cwd();
  const config = resolveConfig(root, params);
  const { org, prefix, remotePrefix, defaultBranch, visibility, mode } = config;
  const vis = params.private ? "private" : visibility;

  // Standalone mode — init git + create GitHub repo + push
  if (mode === "standalone") {
    const name = params.name || root.split("/").pop() || "unnamed";
    const desc = params.description || name;

    // Check if already a git repo
    if (!existsSync(join(root, ".git"))) {
      run("git init", root);
      run("git add .", root);
      run(`git commit -m "Initial commit"`, root);
    }

    // Check if GitHub repo exists
    if (repoExists(org, name)) {
      return {
        content: [{ type: "text", text: `ℹ️ Repo \`${org}/${name}\` already exists.\n\nUse \`git_push\` to sync.` }],
        details: { name, existing: true, org },
      };
    }

    // Create repo
    const createResult = run(`gh repo create ${org}/${name} --${vis} --description "${desc}" 2>&1`, root);
    if (!createResult.ok) {
      return {
        content: [{ type: "text", text: `❌ Failed to create GitHub repo: ${createResult.stderr}` }],
        details: { error: true, name, step: "create_repo" },
      };
    }

    // Add origin remote and push
    const remoteUrl = `https://github.com/${org}/${name}.git`;
    const existingOrigin = runQuiet("git remote get-url origin", root);
    if (!existingOrigin) {
      run(`git remote add origin ${remoteUrl}`, root);
    }
    run(`git push -u origin ${defaultBranch}`, root);

    return {
      content: [{ type: "text", text: `✅ Initialized \`${org}/${name}\` (${vis})\n\n- Remote: \`${remoteUrl}\`\n- Branch: \`${defaultBranch}\`` }],
      details: { success: true, name, org, url: `https://github.com/${org}/${name}`, visibility: vis },
    };
  }

  // Subtree mode
  const name = params.name;
  if (!name) {
    return {
      content: [{ type: "text", text: "❌ `name` is required in subtree mode" }],
      details: { error: true, mode: "subtree" },
    };
  }

  const pkgDir = join(root, prefix, name);
  if (!existsSync(pkgDir)) {
    return {
      content: [{ type: "text", text: `❌ Directory not found: \`${prefix}/${name}\`` }],
      details: { error: true, name },
    };
  }

  const desc = params.description || getPackageName(pkgDir) || name;

  // Already exists?
  if (repoExists(org, name)) {
    const remoteSetup = ensureRemote(root, name, org, remotePrefix);
    return {
      content: [{
        type: "text",
        text: `ℹ️ Repo \`${org}/${name}\` already exists.\nRemote: ${remoteSetup.ok ? `✅ \`${remoteSetup.remote} → ${remoteSetup.url}\`` : "⚠️ not configured"}\n\nUse \`git_push\` to sync.`,
      }],
      details: { name, existing: true, remote: remoteSetup },
    };
  }

  // Create GitHub repo
  const createResult = run(`gh repo create ${org}/${name} --${vis} --description "${desc}" 2>&1`, root);
  if (!createResult.ok) {
    return {
      content: [{ type: "text", text: `❌ Failed to create GitHub repo: ${createResult.stderr}` }],
      details: { error: true, name, step: "create_repo" },
    };
  }

  // Add remote
  const remoteSetup = ensureRemote(root, name, org, remotePrefix);

  // Initial push
  const pushResult = run(`git subtree push --prefix=${prefix}/${name} ${remoteSetup.remote} ${defaultBranch} 2>&1`, root);

  const lines = [
    `✅ Initialized \`${name}\``,
    "",
    `| Step | Status |`,
    `|------|--------|`,
    `| GitHub repo | ✅ \`${org}/${name}\` (${vis}) |`,
    `| Git remote | ${remoteSetup.ok ? "✅" : "❌"} \`${remoteSetup.remote}\` |`,
    `| Initial push | ${pushResult.ok ? "✅" : "⚠️"} |`,
    "",
    pushResult.ok ? "Content pushed." : "Push failed — run `git_push` manually.",
  ];

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: {
      success: true,
      name,
      org,
      repoUrl: `https://github.com/${org}/${name}`,
      remote: remoteSetup.remote,
      pushed: pushResult.ok,
    },
  };
}

/**
 * git_issue — List or create GitHub issues
 */
async function gitIssue(params: {
  repo: string;
  org?: string;
  action?: "list" | "create";
  title?: string;
  body?: string;
  labels?: string[];
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findGitRoot() || process.cwd();
  const config = resolveConfig(root, params);
  const { org } = config;
  const { repo } = params;
  const action = params.action || (params.title ? "create" : "list");
  const fullName = `${org}/${repo}`;

  if (!repoExists(org, repo)) {
    return {
      content: [{ type: "text", text: `❌ Repo \`${fullName}\` does not exist. Use \`git_init\` first.` }],
      details: { error: true, repo, org },
    };
  }

  if (action === "list") {
    const result = run(`gh issue list --repo ${fullName} --limit 20 --json number,title,labels,state`);
    if (!result.ok) {
      return {
        content: [{ type: "text", text: `❌ Failed to list issues: ${result.stderr}` }],
        details: { error: true, repo: fullName },
      };
    }

    try {
      const issues = JSON.parse(result.stdout);
      if (issues.length === 0) {
        return {
          content: [{ type: "text", text: `No open issues on \`${fullName}\`` }],
          details: { repo: fullName, issues: [] },
        };
      }

      const lines = [`## Issues on \`${fullName}\`\n`];
      for (const issue of issues) {
        const labelStr = issue.labels?.map((l: any) => `\`${l.name}\``).join(" ") || "";
        lines.push(`- #${issue.number} ${issue.title} ${labelStr}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { repo: fullName, issues },
      };
    } catch {
      return {
        content: [{ type: "text", text: `Raw output:\n${result.stdout}` }],
        details: { repo: fullName, raw: result.stdout },
      };
    }
  }

  // Create
  if (!params.title) {
    return {
      content: [{ type: "text", text: "❌ `title` is required for creating an issue" }],
      details: { error: true },
    };
  }

  const labelFlag = params.labels?.length ? ` --label "${params.labels.join(",")}"` : "";
  const bodyFlag = params.body ? ` --body "${params.body.replace(/"/g, '\\"')}"` : "";

  const result = run(`gh issue create --repo ${fullName} --title "${params.title}"${bodyFlag}${labelFlag}`);
  if (!result.ok) {
    return {
      content: [{ type: "text", text: `❌ Failed to create issue: ${result.stderr}` }],
      details: { error: true, repo: fullName },
    };
  }

  return {
    content: [{ type: "text", text: `✅ Created issue on \`${fullName}\`\n\n${result.stdout}` }],
    details: { success: true, repo: fullName, url: result.stdout },
  };
}

/**
 * git_pr — List or create pull requests
 */
async function gitPR(params: {
  repo: string;
  org?: string;
  action?: "list" | "create";
  title?: string;
  body?: string;
  head?: string;
  base?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findGitRoot() || process.cwd();
  const config = resolveConfig(root, params);
  const { org, defaultBranch } = config;
  const { repo } = params;
  const action = params.action || (params.title ? "create" : "list");
  const fullName = `${org}/${repo}`;

  if (!repoExists(org, repo)) {
    return {
      content: [{ type: "text", text: `❌ Repo \`${fullName}\` does not exist. Use \`git_init\` first.` }],
      details: { error: true, repo, org },
    };
  }

  if (action === "list") {
    const result = run(`gh pr list --repo ${fullName} --limit 20 --json number,title,headRefName,state`);
    if (!result.ok) {
      return {
        content: [{ type: "text", text: `❌ Failed to list PRs: ${result.stderr}` }],
        details: { error: true, repo: fullName },
      };
    }

    try {
      const prs = JSON.parse(result.stdout);
      if (prs.length === 0) {
        return {
          content: [{ type: "text", text: `No open PRs on \`${fullName}\`` }],
          details: { repo: fullName, prs: [] },
        };
      }

      const lines = [`## Pull Requests on \`${fullName}\`\n`];
      for (const pr of prs) {
        lines.push(`- #${pr.number} ${pr.title} (\`${pr.headRefName}\`)`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { repo: fullName, prs },
      };
    } catch {
      return {
        content: [{ type: "text", text: `Raw output:\n${result.stdout}` }],
        details: { repo: fullName, raw: result.stdout },
      };
    }
  }

  // Create
  if (!params.title) {
    return {
      content: [{ type: "text", text: "❌ `title` is required for creating a PR" }],
      details: { error: true },
    };
  }

  const baseFlag = params.base ? ` --base ${params.base}` : ` --base ${defaultBranch}`;
  const headFlag = params.head ? ` --head ${params.head}` : "";
  const bodyFlag = params.body ? ` --body "${params.body.replace(/"/g, '\\"')}"` : "";

  const result = run(`gh pr create --repo ${fullName} --title "${params.title}"${bodyFlag}${baseFlag}${headFlag}`);
  if (!result.ok) {
    return {
      content: [{ type: "text", text: `❌ Failed to create PR: ${result.stderr}` }],
      details: { error: true, repo: fullName },
    };
  }

  return {
    content: [{ type: "text", text: `✅ Created PR on \`${fullName}\`\n\n${result.stdout}` }],
    details: { success: true, repo: fullName, url: result.stdout },
  };
}

/**
 * git_worktree — Manage git worktrees
 */
async function gitWorktree(params: {
  action: "list" | "add" | "remove";
  name?: string;
  branch?: string;
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findGitRoot(params.cwd) || process.cwd();
  const { action } = params;

  if (action === "list") {
    const result = run("git worktree list", root);
    if (!result.ok) {
      return {
        content: [{ type: "text", text: `❌ Failed to list worktrees: ${result.stderr}` }],
        details: { error: true },
      };
    }

    const lines = result.stdout.split("\n").filter(Boolean);
    const formatted = lines.map((line) => {
      const parts = line.split(/\s+/);
      return `| ${parts.slice(0, 3).join(" | ")} |`;
    });

    return {
      content: [{
        type: "text",
        text: `## Git Worktrees\n\n| Path | Hash | Branch |\n|------|------|--------|\n${formatted.join("\n")}`,
      }],
      details: { worktrees: lines },
    };
  }

  if (action === "add") {
    const name = params.name;
    if (!name) {
      return {
        content: [{ type: "text", text: "❌ `name` is required for add action" }],
        details: { error: true },
      };
    }

    const branch = params.branch || `${name}-work`;
    const worktreePath = join(root, ".worktrees", name);

    const addResult = run(`git worktree add -b ${branch} ${worktreePath} 2>&1`, root);
    if (!addResult.ok) {
      // Branch might already exist
      const addResult2 = run(`git worktree add ${worktreePath} ${branch} 2>&1`, root);
      if (!addResult2.ok) {
        return {
          content: [{ type: "text", text: `❌ Failed to create worktree:\n${addResult.stderr}\n${addResult2.stderr}` }],
          details: { error: true, name },
        };
      }
    }

    return {
      content: [{
        type: "text",
        text: `✅ Created worktree for **${name}**\n\n- Branch: \`${branch}\`\n- Path: \`${worktreePath}\`\n\n\`\`\`bash\ncd ${worktreePath}\ngit worktree remove ${worktreePath}  # When done\n\`\`\``,
      }],
      details: { success: true, name, branch, path: worktreePath },
    };
  }

  if (action === "remove") {
    const name = params.name;
    if (!name) {
      return {
        content: [{ type: "text", text: "❌ `name` is required for remove action" }],
        details: { error: true },
      };
    }

    const worktreePath = join(root, ".worktrees", name);
    if (!existsSync(worktreePath)) {
      return {
        content: [{ type: "text", text: `❌ Worktree not found at ${worktreePath}` }],
        details: { error: true, name },
      };
    }

    const removeResult = run(`git worktree remove ${worktreePath} 2>&1`, root);
    if (!removeResult.ok) {
      const forceResult = run(`git worktree remove --force ${worktreePath} 2>&1`, root);
      if (!forceResult.ok) {
        return {
          content: [{ type: "text", text: `❌ Failed to remove worktree: ${removeResult.stderr}` }],
          details: { error: true, name },
        };
      }
    }

    return {
      content: [{ type: "text", text: `✅ Removed worktree for **${name}**` }],
      details: { success: true, name },
    };
  }

  return {
    content: [{ type: "text", text: `❌ Unknown action: ${action}. Use list, add, or remove.` }],
    details: { error: true, action },
  };
}

// ============================================================================
// Registration
// ============================================================================

export function registerGitPackageSyncTools(pi: ExtensionAPI): void {
  // Common config schema fragment — included via spread in each tool
  const configProps = {
    org: Type.Optional(Type.String({ description: "GitHub org or user (auto-detected from git remotes if omitted)" })),
    prefix: Type.Optional(Type.String({ description: "Monorepo subdirectory prefix, e.g. 'packages' or 'libs' (default: 'packages')" })),
    pattern: Type.Optional(Type.String({ description: "Glob pattern for subdirectories, e.g. 'pi-*' or '*' (default: '*')" })),
    mode: Type.Optional(Type.Union([Type.Literal("subtree"), Type.Literal("standalone")], { description: "Mode: subtree for monorepo prefix sync, standalone for single repo (auto-detected)" })),
  };

  pi.registerTool({
    name: "git_package_status",
    label: "Git Sync Status",
    description: "Show sync status of subdirectories (subtree mode) or the current repo (standalone mode). Detects drift, missing repos, and unconfigured remotes. Config auto-detected from git remotes, .git-sync.json, or params.",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "Specific subdirectory to check. Omit for all." })),
      ...configProps,
      cwd: Type.Optional(Type.String({ description: "Project root directory (auto-detected if omitted)" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return gitStatus({
        ...params,
        cwd: params.cwd || ctx?.cwd,
      });
    },
  });

  pi.registerTool({
    name: "git_package_push",
    label: "Push to GitHub",
    description: "Push a subdirectory (subtree mode) or the current repo (standalone mode) to GitHub. Creates the GitHub repo if it doesn't exist. Uses git subtree in subtree mode, plain git push in standalone mode.",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "Subdirectory name to push (required in subtree mode, e.g. 'pi-gateway')" })),
      branch: Type.Optional(Type.String({ description: "Branch to push to (default: main)" })),
      force: Type.Optional(Type.Boolean({ description: "Force push even if diverged (default: false)" })),
      remote: Type.Optional(Type.String({ description: "Remote name for standalone mode (default: origin)" })),
      ...configProps,
      cwd: Type.Optional(Type.String({ description: "Project root directory" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return gitPush({
        ...params,
        cwd: params.cwd || ctx?.cwd,
      });
    },
  });

  pi.registerTool({
    name: "git_package_pull",
    label: "Pull from GitHub",
    description: "Pull changes from GitHub into a subdirectory (content-based sync) or the current repo (standalone, git pull). Content-based pull avoids the 'unrelated histories' problem that git subtree pull creates.",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "Subdirectory name to pull (required in subtree mode)" })),
      branch: Type.Optional(Type.String({ description: "Branch to pull from (default: main)" })),
      squash: Type.Optional(Type.Boolean({ description: "Squash subtree pull (default: true, subtree mode only)" })),
      remote: Type.Optional(Type.String({ description: "Remote name for standalone mode (default: origin)" })),
      ...configProps,
      cwd: Type.Optional(Type.String({ description: "Project root directory" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return gitPull({
        ...params,
        cwd: params.cwd || ctx?.cwd,
      });
    },
  });

  pi.registerTool({
    name: "git_package_init",
    label: "Initialize GitHub Repo",
    description: "Create a new GitHub repo for a subdirectory (subtree mode) or standalone project. Adds git remote and pushes initial content.",
    parameters: Type.Object({
      name: Type.Optional(Type.String({ description: "Project/subdirectory name (required in subtree mode; defaults to directory name in standalone mode)" })),
      private: Type.Optional(Type.Boolean({ description: "Create as private repo (default: from config or public)" })),
      description: Type.Optional(Type.String({ description: "Repo description" })),
      ...configProps,
      cwd: Type.Optional(Type.String({ description: "Project root directory" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return gitInit({
        ...params,
        cwd: params.cwd || ctx?.cwd,
      });
    },
  });

  pi.registerTool({
    name: "git_issue",
    label: "Manage GitHub Issues",
    description: "List or create GitHub issues on any repo. Org auto-detected from git remotes or config.",
    parameters: Type.Object({
      repo: Type.String({ description: "Repository name (e.g. 'pi-gateway', 'my-app')" }),
      action: Type.Optional(Type.Union([Type.Literal("list"), Type.Literal("create")], { description: "Action: list or create (default: list unless title is provided)" })),
      title: Type.Optional(Type.String({ description: "Issue title (required for create)" })),
      body: Type.Optional(Type.String({ description: "Issue body (markdown)" })),
      labels: Type.Optional(Type.Array(Type.String(), { description: "Labels to apply" })),
      org: Type.Optional(Type.String({ description: "GitHub org (auto-detected if omitted)" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return gitIssue(params);
    },
  });

  pi.registerTool({
    name: "git_pr",
    label: "Manage GitHub PRs",
    description: "List or create pull requests on any repo. Org auto-detected from git remotes or config.",
    parameters: Type.Object({
      repo: Type.String({ description: "Repository name (e.g. 'pi-gateway', 'my-app')" }),
      action: Type.Optional(Type.Union([Type.Literal("list"), Type.Literal("create")], { description: "Action: list or create (default: list unless title is provided)" })),
      title: Type.Optional(Type.String({ description: "PR title (required for create)" })),
      body: Type.Optional(Type.String({ description: "PR body (markdown)" })),
      head: Type.Optional(Type.String({ description: "Head branch for the PR" })),
      base: Type.Optional(Type.String({ description: "Base branch (default: main)" })),
      org: Type.Optional(Type.String({ description: "GitHub org (auto-detected if omitted)" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return gitPR(params);
    },
  });

  pi.registerTool({
    name: "git_worktree",
    label: "Manage Git Worktrees",
    description: "Manage git worktrees for isolated development. List, add, or remove worktrees in any git repo.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("list"), Type.Literal("add"), Type.Literal("remove")], { description: "Action: list, add, or remove" }),
      name: Type.Optional(Type.String({ description: "Worktree name (required for add/remove)" })),
      branch: Type.Optional(Type.String({ description: "Branch name for worktree (default: <name>-work)" })),
      cwd: Type.Optional(Type.String({ description: "Git root directory" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return gitWorktree({
        ...params,
        cwd: params.cwd || ctx?.cwd,
      });
    },
  });

  console.log("[pi-kobold] Git sync tools registered (7 tools)");
}