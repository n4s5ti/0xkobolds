/**
 * Git Package Sync Tools
 *
 * Bidirectional sync between the 0xKobold monorepo and individual
 * pi-package repos, plus GitHub Issues/PR management scoped to packages.
 *
 * Uses git subtree for history-preserving splits and the GitHub CLI
 * (gh) for repo/issue/PR operations.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ============================================================================
// Constants
// ============================================================================

const ORG = "0xKobold";
const PACKAGES_DIR = "packages";
const KOBOLD_DIR = join(process.env.HOME || "~", ".0xkobold");

// ============================================================================
// Helpers
// ============================================================================

function run(cmd: string, cwd?: string): { ok: boolean; stdout: string; stderr: string; code: number } {
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

/** Detect the monorepo root by walking up from cwd looking for packages/ */
function findMonorepoRoot(startDir?: string): string | null {
  let dir = startDir || process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, PACKAGES_DIR)) && existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = join(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** List all pi- packages in the monorepo */
function listPackages(root: string): string[] {
  const result = run(`ls -d ${PACKAGES_DIR}/pi-*/`, root);
  if (!result.ok) return [];
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((p) => p.replace(/\/$/, "").replace(/^packages\//, ""))
    .sort();
}

/** Read package.json name field */
function getPackageName(root: string, pkg: string): string {
  const pkgJson = join(root, PACKAGES_DIR, pkg, "package.json");
  if (!existsSync(pkgJson)) return `${ORG.toLowerCase()}/${pkg}`;
  try {
    const data = JSON.parse(readFileSync(pkgJson, "utf-8"));
    return data.name || pkg;
  } catch {
    return pkg;
  }
}

/** Check if a GitHub repo exists */
function repoExists(pkg: string): boolean {
  const result = run(`gh repo view ${ORG}/${pkg} --json name 2>/dev/null`);
  return result.ok;
}

/** Get the git remote name for a package (pkg-<name> convention) */
function getRemoteName(pkg: string): string {
  return `pkg-${pkg}`;
}

/** Ensure the remote exists in the local git config */
function ensureRemote(root: string, pkg: string): { ok: boolean; remote: string; url: string } {
  const remoteName = getRemoteName(pkg);
  const url = `git@github.com:${ORG}/${pkg}.git`;

  const existing = runQuiet(`git remote get-url ${remoteName}`, root);
  if (existing) {
    return { ok: true, remote: remoteName, url: existing };
  }

  const addResult = run(`git remote add ${remoteName} ${url}`, root);
  if (addResult.ok) {
    return { ok: true, remote: remoteName, url };
  }

  // Remote might already exist under a different case
  const listResult = runQuiet(`git remote`, root);
  if (listResult.split("\n").includes(remoteName)) {
    return { ok: true, remote: remoteName, url };
  }

  return { ok: false, remote: remoteName, url };
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * git_package_status — Show sync status of all pi-packages
 */
async function packageStatus(params: {
  package?: string;
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findMonorepoRoot(params.cwd) || process.cwd();
  const packages = params.package ? [params.package] : listPackages(root);

  if (packages.length === 0) {
    return {
      content: [{ type: "text", text: "No pi-packages found in monorepo." }],
      details: { packages: [] },
    };
  }

  // Fetch all remotes first for accurate status
  runQuiet(`git fetch --all --quiet 2>/dev/null`, root);

  const rows: Array<{
    package: string;
    npmName: string;
    hasRemote: boolean;
    repoExists: boolean;
    syncStatus: string;
    remoteAhead: number;
    localAhead: number;
  }> = [];

  const lines: string[] = [
    "## 📦 Package Sync Status\n",
    "| Package | NPM Name | Remote | GitHub | Sync |",
    "|---------|----------|--------|--------|------|",
  ];

  for (const pkg of packages) {
    const npmName = getPackageName(root, pkg);
    const remoteName = getRemoteName(pkg);
    const hasRemote = runQuiet(`git remote get-url ${remoteName}`, root).length > 0;
    const onGitHub = repoExists(pkg);

    let syncStatus = "—";
    let remoteAhead = 0;
    let localAhead = 0;

    if (hasRemote && onGitHub) {
      // Fetch the remote
      runQuiet(`git fetch ${remoteName} main 2>/dev/null`, root);

      // Try subtree split to get the local hash for this prefix
      const splitResult = run(`git subtree split --prefix=${PACKAGES_DIR}/${pkg} -b _sync_${pkg} 2>/dev/null`, root);
      let localHash = "";
      if (splitResult.ok) {
        localHash = splitResult.stdout.split("\n").pop() || "";
        runQuiet(`git branch -D _sync_${pkg} 2>/dev/null`, root);
      }

      const remoteHead = runQuiet(`git rev-parse ${remoteName}/main 2>/dev/null`, root);

      if (localHash && remoteHead) {
        if (localHash === remoteHead) {
          syncStatus = "✅ synced";
        } else {
          // Check divergence
          const aheadCount = runQuiet(
            `git rev-list ${remoteHead}..${localHash} --count 2>/dev/null`,
            root
          );
          const behindCount = runQuiet(
            `git rev-list ${localHash}..${remoteHead} --count 2>/dev/null`,
            root
          );
          remoteAhead = parseInt(behindCount) || 0;
          localAhead = parseInt(aheadCount) || 0;
          syncStatus = remoteAhead > 0 ? `⬇️ behind by ${remoteAhead}` : `⬆️ ahead by ${localAhead}`;
        }
      } else {
        syncStatus = "⚠️ no history";
      }
    } else if (!onGitHub) {
      syncStatus = "❌ no repo";
    } else {
      syncStatus = "⚠️ no remote";
    }

    rows.push({ package: pkg, npmName, hasRemote, repoExists: onGitHub, syncStatus, remoteAhead, localAhead });
    lines.push(
      `| ${pkg} | ${npmName} | ${hasRemote ? "✅" : "—"} | ${onGitHub ? "✅" : "—"} | ${syncStatus} |`
    );
  }

  lines.push("");
  lines.push(`**${packages.length} packages** • Monorepo root: \`${root}\``);

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: {
      root,
      packages: rows,
    },
  };
}

/**
 * git_package_push — Push a package subtree to its individual repo
 */
async function packagePush(params: {
  package: string;
  branch?: string;
  force?: boolean;
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findMonorepoRoot(params.cwd) || process.cwd();
  const pkg = params.package;
  const branch = params.branch || "main";
  const forceFlag = params.force ? " --force" : "";
  const pkgDir = join(root, PACKAGES_DIR, pkg);

  if (!existsSync(pkgDir)) {
    return {
      content: [{ type: "text", text: `❌ Package directory not found: ${PACKAGES_DIR}/${pkg}` }],
      details: { error: true, package: pkg },
    };
  }

  // Ensure GitHub repo exists
  if (!repoExists(pkg)) {
    const createResult = run(`gh repo create ${ORG}/${pkg} --public --description "Pi package: ${pkg}" 2>&1`);
    if (!createResult.ok) {
      return {
        content: [{ type: "text", text: `❌ Failed to create GitHub repo ${ORG}/${pkg}: ${createResult.stderr}` }],
        details: { error: true, package: pkg, step: "create_repo" },
      };
    }
  }

  // Ensure remote is configured
  const remoteSetup = ensureRemote(root, pkg);
  if (!remoteSetup.ok) {
    return {
      content: [{ type: "text", text: `❌ Failed to set up git remote for ${pkg}` }],
      details: { error: true, package: pkg, step: "remote_setup" },
    };
  }

  // Fetch remote main
  runQuiet(`git fetch ${remoteSetup.remote} ${branch} 2>/dev/null`, root);

  // Push via subtree
  const pushCmd = `git subtree push${forceFlag} --prefix=${PACKAGES_DIR}/${pkg} ${remoteSetup.remote} ${branch}`;
  const pushResult = run(pushCmd, root);

  if (!pushResult.ok) {
    return {
      content: [{
        type: "text",
        text: `❌ Subtree push failed for ${pkg}:\n\`\`\`\n${pushResult.stderr}\n\`\`\`\n\nTry with \`force: true\` to overwrite, or resolve conflicts manually.`,
      }],
      details: { error: true, package: pkg, step: "push", stderr: pushResult.stderr },
    };
  }

  return {
    content: [{
      type: "text",
      text: `✅ Pushed \`${pkg}\` to \`${ORG}/${pkg}\` (${branch})\n\n${pushResult.stdout}`,
    }],
    details: { success: true, package: pkg, remote: remoteSetup.remote, branch },
  };
}

/**
 * git_package_pull — Pull changes from an individual repo into the monorepo
 */
async function packagePull(params: {
  package: string;
  branch?: string;
  squash?: boolean;
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findMonorepoRoot(params.cwd) || process.cwd();
  const pkg = params.package;
  const branch = params.branch || "main";
  const squash = params.squash !== false; // default true
  const pkgDir = join(root, PACKAGES_DIR, pkg);

  if (!existsSync(pkgDir)) {
    return {
      content: [{ type: "text", text: `❌ Package directory not found: ${PACKAGES_DIR}/${pkg}` }],
      details: { error: true, package: pkg },
    };
  }

  if (!repoExists(pkg)) {
    return {
      content: [{ type: "text", text: `❌ GitHub repo ${ORG}/${pkg} does not exist` }],
      details: { error: true, package: pkg },
    };
  }

  const remoteSetup = ensureRemote(root, pkg);
  if (!remoteSetup.ok) {
    return {
      content: [{ type: "text", text: `❌ Failed to set up remote for ${pkg}` }],
      details: { error: true, package: pkg, step: "remote_setup" },
    };
  }

  // Fetch latest
  const fetchResult = run(`git fetch ${remoteSetup.remote} ${branch}`, root);
  if (!fetchResult.ok) {
    return {
      content: [{ type: "text", text: `❌ Failed to fetch ${remoteSetup.remote}/${branch}: ${fetchResult.stderr}` }],
      details: { error: true, package: pkg, step: "fetch" },
    };
  }

  // Subtree pull
  const squashFlag = squash ? " --squash" : "";
  const pullCmd = `git subtree pull${squashFlag} --prefix=${PACKAGES_DIR}/${pkg} ${remoteSetup.remote} ${branch}`;
  const pullResult = run(pullCmd, root);

  if (!pullResult.ok) {
    // Check for conflicts
    if (pullResult.stderr.includes("conflict") || pullResult.stderr.includes("CONFLICT")) {
      return {
        content: [{
          type: "text",
          text: `⚠️ Merge conflicts pulling ${pkg}:\n\`\`\`\n${pullResult.stderr}\n\`\`\`\n\nResolve conflicts manually:\n1. \`cd ${root}\`\n2. Edit conflicted files in \`${PACKAGES_DIR}/${pkg}/\`\n3. \`git add ${PACKAGES_DIR}/${pkg}/\`\n4. \`git commit -m "merge: resolve conflicts from ${pkg} sync"\``,
        }],
        details: { error: true, package: pkg, step: "conflict", stderr: pullResult.stderr },
      };
    }

    return {
      content: [{ type: "text", text: `❌ Subtree pull failed for ${pkg}:\n\`\`\`\n${pullResult.stderr}\n\`\`\`` }],
      details: { error: true, package: pkg, step: "pull", stderr: pullResult.stderr },
    };
  }

  return {
    content: [{
      type: "text",
      text: `✅ Pulled ${pkg} changes from ${ORG}/${pkg} (${branch})${squash ? " [squashed]" : ""}\n\n${pullResult.stdout}`,
    }],
    details: { success: true, package: pkg, branch, squash },
  };
}

/**
 * git_package_init — Initialize a new GitHub repo for a package
 */
async function packageInit(params: {
  package: string;
  private?: boolean;
  description?: string;
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findMonorepoRoot(params.cwd) || process.cwd();
  const pkg = params.package;
  const visibility = params.private ? "private" : "public";
  const description = params.description || `Pi package: ${pkg}`;
  const pkgDir = join(root, PACKAGES_DIR, pkg);

  if (!existsSync(pkgDir)) {
    return {
      content: [{ type: "text", text: `❌ Package directory not found: ${PACKAGES_DIR}/${pkg}` }],
      details: { error: true, package: pkg },
    };
  }

  // Check if repo already exists
  if (repoExists(pkg)) {
    const remoteSetup = ensureRemote(root, pkg);
    return {
      content: [{
        type: "text",
        text: `ℹ️ Repo ${ORG}/${pkg} already exists.\nRemote: ${remoteSetup.ok ? `✅ ${remoteSetup.remote} → ${remoteSetup.url}` : "⚠️ not configured locally"}\n\nUse \`git_package_push\` to sync content.`,
      }],
      details: { package: pkg, existing: true, remote: remoteSetup },
    };
  }

  // Create GitHub repo
  const createResult = run(
    `gh repo create ${ORG}/${pkg} --${visibility} --description "${description}" 2>&1`,
    root
  );
  if (!createResult.ok) {
    return {
      content: [{ type: "text", text: `❌ Failed to create GitHub repo: ${createResult.stderr}` }],
      details: { error: true, package: pkg, step: "create_repo" },
    };
  }

  // Add remote
  const remoteSetup = ensureRemote(root, pkg);

  // Initial subtree push
  const pushResult = run(
    `git subtree push --prefix=${PACKAGES_DIR}/${pkg} ${remoteSetup.remote} main 2>&1`,
    root
  );

  const lines: string[] = [
    `✅ Initialized ${pkg}`,
    "",
    `| Step | Status |`,
    `|------|--------|`,
    `| GitHub repo | ✅ ${ORG}/${pkg} (${visibility}) |`,
    `| Git remote | ${remoteSetup.ok ? "✅" : "❌"} ${remoteSetup.remote} |`,
    `| Initial push | ${pushResult.ok ? "✅" : "⚠️ (may need manual push)"} |`,
    "",
    pushResult.ok ? "Content pushed to individual repo." : "Push failed — run `git_package_push` manually.",
  ];

  return {
    content: [{ type: "text", text: lines.join("\n") }],
    details: {
      success: true,
      package: pkg,
      repoUrl: `https://github.com/${ORG}/${pkg}`,
      remote: remoteSetup.remote,
      pushed: pushResult.ok,
    },
  };
}

/**
 * git_issue — Create or list GitHub issues on a package repo
 */
async function packageIssue(params: {
  package: string;
  action?: "list" | "create";
  title?: string;
  body?: string;
  labels?: string[];
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const { package: pkg } = params;
  const action = params.action || (params.title ? "create" : "list");

  if (!repoExists(pkg)) {
    return {
      content: [{ type: "text", text: `❌ GitHub repo ${ORG}/${pkg} does not exist. Use \`git_package_init\` first.` }],
      details: { error: true, package: pkg },
    };
  }

  if (action === "list") {
    const result = run(`gh issue list --repo ${ORG}/${pkg} --limit 20 --json number,title,labels,state,createdAt`);
    if (!result.ok) {
      return {
        content: [{ type: "text", text: `❌ Failed to list issues: ${result.stderr}` }],
        details: { error: true, package: pkg },
      };
    }

    try {
      const issues = JSON.parse(result.stdout);
      if (issues.length === 0) {
        return {
          content: [{ type: "text", text: `No open issues on ${ORG}/${pkg}` }],
          details: { package: pkg, issues: [] },
        };
      }

      const lines: string[] = [`## Issues on ${ORG}/${pkg}\n`];
      for (const issue of issues) {
        const labelStr = issue.labels?.map((l: any) => `\`${l.name}\``).join(" ") || "";
        lines.push(`- #${issue.number} ${issue.title} ${labelStr}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { package: pkg, issues },
      };
    } catch {
      return {
        content: [{ type: "text", text: `Raw output:\n${result.stdout}` }],
        details: { package: pkg, raw: result.stdout },
      };
    }
  }

  // Create issue
  if (!params.title) {
    return {
      content: [{ type: "text", text: "❌ `title` is required for creating an issue" }],
      details: { error: true },
    };
  }

  const labelFlag = params.labels?.length ? ` --label "${params.labels.join(",")}"` : "";
  const bodyFlag = params.body ? ` --body "${params.body.replace(/"/g, '\\"')}"` : "";

  const result = run(
    `gh issue create --repo ${ORG}/${pkg} --title "${params.title}"${bodyFlag}${labelFlag}`,
  );
  if (!result.ok) {
    return {
      content: [{ type: "text", text: `❌ Failed to create issue: ${result.stderr}` }],
      details: { error: true, package: pkg, step: "create" },
    };
  }

  return {
    content: [{ type: "text", text: `✅ Created issue on ${ORG}/${pkg}\n\n${result.stdout}` }],
    details: { success: true, package: pkg, url: result.stdout },
  };
}

/**
 * git_pr — Create or list PRs on a package repo
 */
async function packagePR(params: {
  package: string;
  action?: "list" | "create";
  title?: string;
  body?: string;
  head?: string;
  base?: string;
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const { package: pkg } = params;
  const action = params.action || (params.title ? "create" : "list");

  if (!repoExists(pkg)) {
    return {
      content: [{ type: "text", text: `❌ GitHub repo ${ORG}/${pkg} does not exist. Use \`git_package_init\` first.` }],
      details: { error: true, package: pkg },
    };
  }

  if (action === "list") {
    const result = run(`gh pr list --repo ${ORG}/${pkg} --limit 20 --json number,title,headRefName,state,createdAt`);
    if (!result.ok) {
      return {
        content: [{ type: "text", text: `❌ Failed to list PRs: ${result.stderr}` }],
        details: { error: true, package: pkg },
      };
    }

    try {
      const prs = JSON.parse(result.stdout);
      if (prs.length === 0) {
        return {
          content: [{ type: "text", text: `No open PRs on ${ORG}/${pkg}` }],
          details: { package: pkg, prs: [] },
        };
      }

      const lines: string[] = [`## Pull Requests on ${ORG}/${pkg}\n`];
      for (const pr of prs) {
        lines.push(`- #${pr.number} ${pr.title} (\`${pr.headRefName}\`)`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { package: pkg, prs },
      };
    } catch {
      return {
        content: [{ type: "text", text: `Raw output:\n${result.stdout}` }],
        details: { package: pkg, raw: result.stdout },
      };
    }
  }

  // Create PR
  if (!params.title) {
    return {
      content: [{ type: "text", text: "❌ `title` is required for creating a PR" }],
      details: { error: true },
    };
  }

  const baseFlag = params.base ? ` --base ${params.base}` : " --base main";
  const headFlag = params.head ? ` --head ${params.head}` : "";
  const bodyFlag = params.body ? ` --body "${params.body.replace(/"/g, '\\"')}"` : "";

  const result = run(
    `gh pr create --repo ${ORG}/${pkg} --title "${params.title}"${bodyFlag}${baseFlag}${headFlag}`,
  );
  if (!result.ok) {
    return {
      content: [{ type: "text", text: `❌ Failed to create PR: ${result.stderr}` }],
      details: { error: true, package: pkg, step: "create" },
    };
  }

  return {
    content: [{ type: "text", text: `✅ Created PR on ${ORG}/${pkg}\n\n${result.stdout}` }],
    details: { success: true, package: pkg, url: result.stdout },
  };
}

/**
 * git_worktree — Manage git worktrees for isolated package work
 */
async function packageWorktree(params: {
  action: "list" | "add" | "remove";
  package?: string;
  branch?: string;
  cwd?: string;
}): Promise<{ content: Array<{ type: "text"; text: string }>; details: any }> {
  const root = findMonorepoRoot(params.cwd) || process.cwd();
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
      // Format: /path/to/dir  abc1234 [branch]
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
    const pkg = params.package;
    if (!pkg) {
      return {
        content: [{ type: "text", text: "❌ `package` is required for add action" }],
        details: { error: true },
      };
    }

    const branch = params.branch || `${pkg}-work`;
    const worktreePath = join(root, ".worktrees", pkg);

    // Create worktree
    const addResult = run(`git worktree add -b ${branch} ${worktreePath} 2>&1`, root);
    if (!addResult.ok) {
      // Branch might already exist — try without creating new branch
      const addResult2 = run(`git worktree add ${worktreePath} ${branch} 2>&1`, root);
      if (!addResult2.ok) {
        return {
          content: [{ type: "text", text: `❌ Failed to create worktree: ${addResult.stderr}\n${addResult2.stderr}` }],
          details: { error: true, package: pkg, step: "add" },
        };
      }
    }

    return {
      content: [{
        type: "text",
        text: `✅ Created worktree for **${pkg}**\n\n- Branch: \`${branch}\`\n- Path: \`${worktreePath}\`\n\n\`\`\`bash\ncd ${worktreePath}\n# Work on ${pkg} in isolation\ngit worktree remove ${worktreePath}  # When done\n\`\`\``,
      }],
      details: { success: true, package: pkg, branch, path: worktreePath },
    };
  }

  if (action === "remove") {
    const pkg = params.package;
    if (!pkg) {
      return {
        content: [{ type: "text", text: "❌ `package` is required for remove action" }],
        details: { error: true },
      };
    }

    const worktreePath = join(root, ".worktrees", pkg);
    if (!existsSync(worktreePath)) {
      return {
        content: [{ type: "text", text: `❌ Worktree not found at ${worktreePath}` }],
        details: { error: true, package: pkg },
      };
    }

    const removeResult = run(`git worktree remove ${worktreePath} 2>&1`, root);
    if (!removeResult.ok) {
      // Force remove if dirty
      const forceResult = run(`git worktree remove --force ${worktreePath} 2>&1`, root);
      if (!forceResult.ok) {
        return {
          content: [{ type: "text", text: `❌ Failed to remove worktree: ${removeResult.stderr}` }],
          details: { error: true, package: pkg },
        };
      }
    }

    return {
      content: [{ type: "text", text: `✅ Removed worktree for **${pkg}**` }],
      details: { success: true, package: pkg },
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
  // git_package_status
  pi.registerTool({
    name: "git_package_status",
    label: "Package Sync Status",
    description: "Show sync status of all pi-packages between monorepo and individual GitHub repos. Detects drift, missing repos, and unconfigured remotes.",
    parameters: Type.Object({
      package: Type.Optional(Type.String({ description: "Specific package to check (e.g. 'pi-gateway'). Omit for all." })),
      cwd: Type.Optional(Type.String({ description: "Monorepo root directory (auto-detected if omitted)" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return packageStatus({
        package: params.package,
        cwd: params.cwd || ctx?.cwd,
      });
    },
  });

  // git_package_push
  pi.registerTool({
    name: "git_package_push",
    label: "Push Package to Individual Repo",
    description: "Push a pi-package from the monorepo to its individual GitHub repo using git subtree. Creates the repo if it doesn't exist.",
    parameters: Type.Object({
      package: Type.String({ description: "Package name (e.g. 'pi-gateway')" }),
      branch: Type.Optional(Type.String({ description: "Branch to push to (default: main)" })),
      force: Type.Optional(Type.Boolean({ description: "Force push even if diverged (default: false)" })),
      cwd: Type.Optional(Type.String({ description: "Monorepo root directory" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return packagePush({
        package: params.package,
        branch: params.branch,
        force: params.force,
        cwd: params.cwd || ctx?.cwd,
      });
    },
  });

  // git_package_pull
  pi.registerTool({
    name: "git_package_pull",
    label: "Pull Package from Individual Repo",
    description: "Pull changes from a package's individual GitHub repo into the monorepo using git subtree pull.",
    parameters: Type.Object({
      package: Type.String({ description: "Package name (e.g. 'pi-gateway')" }),
      branch: Type.Optional(Type.String({ description: "Branch to pull from (default: main)" })),
      squash: Type.Optional(Type.Boolean({ description: "Squash subtree pull (default: true)" })),
      cwd: Type.Optional(Type.String({ description: "Monorepo root directory" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return packagePull({
        package: params.package,
        branch: params.branch,
        squash: params.squash,
        cwd: params.cwd || ctx?.cwd,
      });
    },
  });

  // git_package_init
  pi.registerTool({
    name: "git_package_init",
    label: "Initialize Package Repo",
    description: "Create a new GitHub repo for a pi-package, add the git remote, and push initial content via subtree.",
    parameters: Type.Object({
      package: Type.String({ description: "Package name (e.g. 'pi-mymodule')" }),
      private: Type.Optional(Type.Boolean({ description: "Create as private repo (default: false)" })),
      description: Type.Optional(Type.String({ description: "Repo description" })),
      cwd: Type.Optional(Type.String({ description: "Monorepo root directory" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return packageInit({
        package: params.package,
        private: params.private,
        description: params.description,
        cwd: params.cwd || ctx?.cwd,
      });
    },
  });

  // git_issue
  pi.registerTool({
    name: "git_issue",
    label: "Manage Package Issues",
    description: "List or create GitHub issues on a pi-package's individual repo.",
    parameters: Type.Object({
      package: Type.String({ description: "Package name (e.g. 'pi-gateway')" }),
      action: Type.Optional(Type.Union([Type.Literal("list"), Type.Literal("create")], { description: "Action: list or create (default: list unless title is provided)" })),
      title: Type.Optional(Type.String({ description: "Issue title (required for create)" })),
      body: Type.Optional(Type.String({ description: "Issue body (markdown)" })),
      labels: Type.Optional(Type.Array(Type.String(), { description: "Labels to apply" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return packageIssue({
        package: params.package,
        action: params.action,
        title: params.title,
        body: params.body,
        labels: params.labels,
      });
    },
  });

  // git_pr
  pi.registerTool({
    name: "git_pr",
    label: "Manage Package PRs",
    description: "List or create pull requests on a pi-package's individual GitHub repo.",
    parameters: Type.Object({
      package: Type.String({ description: "Package name (e.g. 'pi-gateway')" }),
      action: Type.Optional(Type.Union([Type.Literal("list"), Type.Literal("create")], { description: "Action: list or create (default: list unless title is provided)" })),
      title: Type.Optional(Type.String({ description: "PR title (required for create)" })),
      body: Type.Optional(Type.String({ description: "PR body (markdown)" })),
      head: Type.Optional(Type.String({ description: "Head branch for the PR" })),
      base: Type.Optional(Type.String({ description: "Base branch (default: main)" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return packagePR({
        package: params.package,
        action: params.action,
        title: params.title,
        body: params.body,
        head: params.head,
        base: params.base,
      });
    },
  });

  // git_worktree
  pi.registerTool({
    name: "git_worktree",
    label: "Manage Git Worktrees",
    description: "Manage git worktrees for isolated package development. List, add, or remove worktrees.",
    parameters: Type.Object({
      action: Type.Union([Type.Literal("list"), Type.Literal("add"), Type.Literal("remove")], { description: "Action: list, add, or remove" }),
      package: Type.Optional(Type.String({ description: "Package name (required for add/remove)" })),
      branch: Type.Optional(Type.String({ description: "Branch name for worktree (default: <package>-work)" })),
      cwd: Type.Optional(Type.String({ description: "Monorepo root directory (auto-detected if omitted)" })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return packageWorktree({
        action: params.action,
        package: params.package,
        branch: params.branch,
        cwd: params.cwd,
      });
    },
  });

  console.log("[pi-kobold] Git package sync tools registered (6 tools)");
}