/**
 * pi-secret-guardian Extension
 *
 * Secret detection and pi-share-hf integration for pi-coding-agent.
 * Scans projects, sessions, and environment for secrets, syncs to
 * pi-share-hf workspace, and manages the collection/upload pipeline.
 *
 * Tools:
 * - secret_scan:       Scan project/sessions/env for secrets (pattern + TruffleHog)
 * - secret_sync_hf:    Sync secrets to pi-share-hf workspace + run collect
 * - secret_report:     Report on pi-share-hf workspace status
 * - secret_upload:     Upload reviewed sessions to HuggingFace
 *
 * Commands:
 * - /secret-scan:      Quick scan for secrets
 * - /hf-status:        Show pi-share-hf workspace status
 *
 * Standalone: pi install @0xkobold/pi-secret-guardian
 * Bundled:    pi install @0xkobold/pi-kobold (loads as sub-extension)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

// Shared types and utilities — also available from "@0xkobold/pi-secret-guardian/shared"
import {
  type SecretFinding,
  type TruffleHogFinding,
  type ScanResult,
  maskSecret,
  truncate,
  parseEnvFile,
  parseNpmrc,
  scanWithPatterns,
  SECRET_PATTERNS,
  ENV_FILES,
  SHELL_FILES,
  NPMRC_FILES,
  HF_WORKSPACE_DIR,
  SECRETS_FILE,
  DENY_FILE,
} from "./shared.js";

// Re-export for library consumers importing from the main entry
export type { SecretFinding, TruffleHogFinding, ScanResult } from "./shared.js";
export {
  maskSecret,
  truncate,
  parseEnvFile,
  parseNpmrc,
  scanWithPatterns,
  SECRET_PATTERNS,
  ENV_FILES,
  SHELL_FILES,
  NPMRC_FILES,
  HF_WORKSPACE_DIR,
  SECRETS_FILE,
  DENY_FILE,
} from "./shared.js";

// ─── Configuration ───────────────────────────────────────────────────

const CONFIG = {
  version: "0.1.0",
  secretsFile: SECRETS_FILE,
  denyFile: DENY_FILE,
  reportFile: "secret-scan-report.json",
  envFiles: [...ENV_FILES],
  shellFiles: [...SHELL_FILES],
  npmrcFiles: [...NPMRC_FILES],
  hfWorkspace: HF_WORKSPACE_DIR,
  secretPatterns: [...SECRET_PATTERNS],
} as const;

// ─── Internal Helpers ────────────────────────────────────────────────

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function exec(
  cmd: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = execFile(
      cmd,
      args,
      { cwd: options.cwd, timeout: options.timeout ?? 30000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          code: err ? (err as any).code ?? 1 : 0,
        });
      }
    );
    proc.on("error", (err) => resolve({ stdout: "", stderr: err.message, code: 1 }));
  });
}

// ─── TruffleHog Integration ─────────────────────────────────────────

async function runTruffleHog(targetPath: string): Promise<TruffleHogFinding[]> {
  const { stdout } = await exec("trufflehog", [
    "filesystem",
    "--no-update",
    "--json",
    targetPath,
  ], { timeout: 60000 });

  const findings: TruffleHogFinding[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      if (data.DecodedValue || data.Raw) {
        findings.push({
          detectorType: data.DetectorType ?? "unknown",
          raw: data.Raw ?? data.DecodedValue ?? "",
          file: data.SourceMetadata?.Data?.Filesystem?.file ?? data.file ?? "",
          line: data.SourceMetadata?.Data?.Filesystem?.line ?? 0,
          verified: data.VerificationResult !== null,
        });
      }
    } catch {
      // Skip non-JSON lines
    }
  }
  return findings;
}

// ─── Main Extension Factory ──────────────────────────────────────────

const factory = async (pi: ExtensionAPI): Promise<void> => {

  let lastScanResult: ScanResult | null = null;

  // ─── Tool: secret_scan ──────────────────────────────────────────────
  pi.registerTool({
    name: "secret_scan",
    label: "Secret Scanner",
    description:
      "Scan project files, sessions, and environment for secrets (API keys, tokens, passwords). " +
      "Discovers secrets from .env files, shell configs, .npmrc, pi sessions, " +
      "and optionally runs TruffleHog for verified secret detection. " +
      "Updates pi-share-hf secrets.txt automatically.",
    promptSnippet: "Scan for secrets in the project, environment, and sessions",
    promptGuidelines: [
      "Use when the user asks about security, secrets, API keys, or preparing data for sharing.",
      "Always run with includeTruffleHog=true for thorough scans.",
    ],
    parameters: Type.Object({
      scope: Type.Optional(
        Type.Union([
          Type.Literal("project"),
          Type.Literal("sessions"),
          Type.Literal("all"),
          Type.Literal("env"),
        ], { default: "all" })
      ),
      includeTruffleHog: Type.Optional(
        Type.Boolean({
          default: true,
          description: "Run TruffleHog for verified secret detection",
        })
      ),
      updateHfWorkspace: Type.Optional(
        Type.Boolean({
          default: false,
          description: "Auto-update pi-share-hf secrets.txt with discovered secrets",
        })
      ),
    }),

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const scope = params.scope ?? "all";
      const includeTruffleHog = params.includeTruffleHog ?? true;
      const updateHfWorkspace = params.updateHfWorkspace ?? false;

      onUpdate?.({
        content: [{ type: "text", text: `🔍 Scanning for secrets (scope: ${scope})...` }],
        details: { scope, phase: "start" },
      });

      const projectDir = ctx.cwd;
      const home = homedir();
      const allFindings: SecretFinding[] = [];
      const truffleHogFindings: TruffleHogFinding[] = [];

      // ── Scan environment files ──
      if (scope === "env" || scope === "all") {
        onUpdate?.({ content: [{ type: "text", text: "📜 Scanning environment files..." }], details: { phase: "env" } });

        for (const envFile of CONFIG.envFiles) {
          const projectPath = join(projectDir, envFile);
          if (existsSync(projectPath)) {
            const content = await readFile(projectPath, "utf8");
            allFindings.push(...parseEnvFile(content, projectPath));
          }
        }

        for (const shellFile of CONFIG.shellFiles) {
          const shellPath = join(home, shellFile);
          if (existsSync(shellPath)) {
            const content = await readFile(shellPath, "utf8");
            allFindings.push(...parseEnvFile(content, shellPath));
          }
        }

        for (const npmrc of CONFIG.npmrcFiles) {
          const projectPath = join(projectDir, npmrc);
          if (existsSync(projectPath)) {
            const content = await readFile(projectPath, "utf8");
            allFindings.push(...parseNpmrc(content, projectPath));
          }
        }
      }

      // ── Scan project source files ──
      if (scope === "project" || scope === "all") {
        onUpdate?.({ content: [{ type: "text", text: "📁 Scanning project files..." }], details: { phase: "project" } });

        const { stdout } = await exec(
          "rg",
          [
            "-l",
            "--glob",
            "!node_modules",
            "--glob",
            "!{.git,dist,out,*.lock}",
            "-i",
            "(api_key|apikey|secret_key|auth_token|access_token|private_key|password|credential|bearer)",
            projectDir,
          ],
          { timeout: 15000 }
        );

        for (const file of stdout.trim().split("\n").filter(Boolean)) {
          if (signal?.aborted) break;
          try {
            const content = await readFile(file, "utf8");
            allFindings.push(...scanWithPatterns(content, file, "project-file"));
          } catch {
            // Skip unreadable files
          }
        }
      }

      // ── Scan pi sessions ──
      if (scope === "sessions" || scope === "all") {
        onUpdate?.({ content: [{ type: "text", text: "💬 Scanning pi sessions..." }], details: { phase: "sessions" } });

        const sessionDir = join(
          home,
          ".pi/agent/sessions/",
          "--" + projectDir.replace(/\//g, "-") + "--"
        );

        if (existsSync(sessionDir)) {
          const { stdout: sessionFiles } = await exec("ls", [sessionDir]);

          for (const sessionFile of sessionFiles.trim().split("\n").filter(Boolean)) {
            if (signal?.aborted) break;
            try {
              const fullPath = join(sessionDir, sessionFile);
              const content = await readFile(fullPath, "utf8");
              allFindings.push(...scanWithPatterns(content, fullPath, "session"));
            } catch {
              // Skip unreadable sessions
            }
          }
        }
      }

      // ── TruffleHog scan ──
      if (includeTruffleHog) {
        onUpdate?.({
          content: [{ type: "text", text: "🐷 Running TruffleHog verified scan..." }],
          details: { phase: "trufflehog" },
        });

        const targets: string[] = [];
        if (scope === "sessions" || scope === "all") {
          const sessionDir = join(
            home,
            ".pi/agent/sessions/",
            "--" + projectDir.replace(/\//g, "-") + "--"
          );
          if (existsSync(sessionDir)) targets.push(sessionDir);
        }
        if (scope === "project" || scope === "all") {
          targets.push(projectDir);
        }
        if (scope === "env") {
          for (const envFile of CONFIG.envFiles) {
            const p = join(projectDir, envFile);
            if (existsSync(p)) targets.push(p);
          }
          for (const shellFile of CONFIG.shellFiles) {
            const p = join(home, shellFile);
            if (existsSync(p)) targets.push(p);
          }
        }

        for (const target of targets) {
          if (signal?.aborted) break;
          try {
            const thFindings = await runTruffleHog(target);
            truffleHogFindings.push(...thFindings);
          } catch {
            // TruffleHog may fail on some paths
          }
        }
      }

      // ── De-duplicate findings ──
      const uniqueSecretValues = new Set<string>();
      const dedupedFindings: SecretFinding[] = [];
      for (const f of allFindings) {
        if (!uniqueSecretValues.has(f.value)) {
          uniqueSecretValues.add(f.value);
          dedupedFindings.push(f);
        }
      }

      const uniqueThFindings: TruffleHogFinding[] = [];
      const thValues = new Set<string>();
      for (const f of truffleHogFindings) {
        if (!thValues.has(f.raw)) {
          thValues.add(f.raw);
          uniqueThFindings.push(f);
        }
      }

      const allSecretValues = new Set([...uniqueSecretValues, ...thValues]);

      // ── Update pi-share-hf workspace ──
      let updatedHf = false;
      if (updateHfWorkspace && allSecretValues.size > 0) {
        const hfWorkspace = join(projectDir, CONFIG.hfWorkspace);
        if (existsSync(hfWorkspace)) {
          const secretsPath = join(hfWorkspace, CONFIG.secretsFile);
          let existing = new Set<string>();
          if (existsSync(secretsPath)) {
            const existingContent = await readFile(secretsPath, "utf8");
            existing = new Set(
              existingContent.split("\n").filter((l) => l.trim() && !l.startsWith("#"))
            );
          }

          const newSecrets = [...allSecretValues].filter((s) => !existing.has(s));
          if (newSecrets.length > 0) {
            const content =
              (existing.size > 0
                ? await readFile(secretsPath, "utf8")
                : "# Auto-managed by pi-secret-guardian\n") +
              newSecrets.join("\n") +
              "\n";
            await writeFile(secretsPath, content, "utf8");
            updatedHf = true;
          }
        }
      }

      // ── Build report ──
      lastScanResult = {
        timestamp: new Date().toISOString(),
        projectDir,
        totalFindings: dedupedFindings.length + uniqueThFindings.length,
        secrets: dedupedFindings,
        truffleHogFindings: uniqueThFindings,
      };

      // ── Format output ──
      const parts: string[] = [];

      if (dedupedFindings.length > 0) {
        parts.push("## 🔍 Pattern-Based Findings");
        parts.push("");
        for (const f of dedupedFindings) {
          parts.push(
            `- **${f.keyName}** in \`${truncate(f.path, 80)}\`:${f.line} — ${maskSecret(f.value)} [${f.type}]`
          );
        }
        parts.push("");
      }

      if (uniqueThFindings.length > 0) {
        parts.push("## 🐷 TruffleHog Verified Findings");
        parts.push("");
        for (const f of uniqueThFindings) {
          parts.push(
            `- **${f.detectorType}** in \`${truncate(f.file, 80)}\`:${f.line} — ${maskSecret(f.raw)} ${f.verified ? "✅ verified" : "⚠️ unverified"}`
          );
        }
        parts.push("");
      }

      if (dedupedFindings.length === 0 && uniqueThFindings.length === 0) {
        parts.push("✅ No secrets found!");
      } else {
        parts.push("## Summary");
        parts.push(`- **Pattern findings:** ${dedupedFindings.length}`);
        parts.push(`- **TruffleHog findings:** ${uniqueThFindings.length}`);
        parts.push(`- **Unique secret values:** ${allSecretValues.size}`);
      }

      if (updatedHf) {
        parts.push("");
        parts.push("📝 **Updated** `.pi/hf-sessions/secrets.txt` with newly discovered secrets.");
      }

      return {
        content: [{ type: "text", text: parts.join("\n") }],
        details: {
          totalFindings: lastScanResult.totalFindings,
          patternFindings: dedupedFindings.length,
          truffleHogFindings: uniqueThFindings.length,
          uniqueSecretValues: allSecretValues.size,
          hfWorkspaceUpdated: updatedHf,
          secretValues: [...allSecretValues],
        },
      };
    },
  });

  // ─── Tool: secret_sync_hf ──────────────────────────────────────────
  pi.registerTool({
    name: "secret_sync_hf",
    label: "Sync Secrets to pi-share-hf",
    description:
      "Sync discovered secrets to the pi-share-hf workspace. " +
      "Generates/updates secrets.txt and deny.txt, applies the pi-ollama review patch, " +
      "then runs pi-share-hf collect with proper flags.",
    promptSnippet: "Sync secrets to pi-share-hf and run collection",
    promptGuidelines: [
      "Use after secret_scan to update the HF workspace with discovered secrets.",
    ],
    parameters: Type.Object({
      runCollect: Type.Optional(
        Type.Boolean({
          default: true,
          description: "Run pi-share-hf collect after syncing secrets",
        })
      ),
      contextFiles: Type.Optional(
        Type.Array(Type.String(), {
          description: "Context files for LLM review (e.g., README.md, AGENTS.md)",
        })
      ),
      provider: Type.Optional(
        Type.String({ description: "LLM provider for review (e.g., ollama)" })
      ),
      model: Type.Optional(
        Type.String({ description: "LLM model for review" })
      ),
      parallel: Type.Optional(
        Type.Number({ description: "Parallel LLM reviews", default: 4 })
      ),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const projectDir = ctx.cwd;
      const hfWorkspace = join(projectDir, CONFIG.hfWorkspace);

      if (!existsSync(hfWorkspace)) {
        return {
          content: [
            { type: "text", text: "❌ pi-share-hf workspace not found. Run `pi-share-hf init` first." },
          ],
          details: { error: "workspace-not-found" },
        };
      }

      const parts: string[] = [];

      // ── Ensure pi-ollama patch is applied ──
      const patchScript = join(projectDir, ".pi/scripts/pi-share-hf-patch.sh");
      if (existsSync(patchScript)) {
        await exec("bash", [patchScript], { timeout: 15000 });
      }

      // ── Gather all secrets ──
      const secretsPath = join(hfWorkspace, CONFIG.secretsFile);
      let secretValues = new Set<string>();

      if (existsSync(secretsPath)) {
        const content = await readFile(secretsPath, "utf8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#")) secretValues.add(trimmed);
        }
      }

      for (const envFile of CONFIG.envFiles) {
        const p = join(projectDir, envFile);
        if (existsSync(p)) {
          const findings = parseEnvFile(await readFile(p, "utf8"), p);
          for (const f of findings) secretValues.add(f.value);
        }
      }

      for (const shellFile of CONFIG.shellFiles) {
        const p = join(homedir(), shellFile);
        if (existsSync(p)) {
          const findings = parseEnvFile(await readFile(p, "utf8"), p);
          for (const f of findings) secretValues.add(f.value);
        }
      }

      for (const npmrc of CONFIG.npmrcFiles) {
        const p = join(projectDir, npmrc);
        if (existsSync(p)) {
          const findings = parseNpmrc(await readFile(p, "utf8"), p);
          for (const f of findings) secretValues.add(f.value);
        }
      }

      // Write consolidated secrets.txt
      const secretsContent =
        "# Auto-managed by pi-secret-guardian\n" +
        "# One secret per line - these are deterministically redacted before TruffleHog\n" +
        [...secretValues].join("\n") +
        "\n";
      await writeFile(secretsPath, secretsContent, "utf8");
      parts.push(
        `📝 Updated \`.pi/hf-sessions/secrets.txt\` with ${secretValues.size} secrets`
      );

      // ── Build collect command ──
      const args = [
        "collect",
        "--secret",
        secretsPath,
        "--workspace",
        hfWorkspace,
      ];

      const denyPath = join(hfWorkspace, CONFIG.denyFile);
      if (existsSync(denyPath)) {
        args.push("--deny", denyPath);
      }

      const zshrc = join(homedir(), ".zshrc");
      if (existsSync(zshrc)) {
        args.push("--env-file", zshrc);
      }

      const contextFiles = params.contextFiles ?? [];
      for (const defaultFile of ["README.md", "AGENTS.md"]) {
        if (
          existsSync(join(projectDir, defaultFile)) &&
          !contextFiles.includes(defaultFile)
        ) {
          contextFiles.push(defaultFile);
        }
      }
      args.push(...contextFiles);

      if (params.provider) args.push("--provider", params.provider);
      if (params.model) args.push("--model", params.model);
      if (params.parallel) args.push("--parallel", String(params.parallel));

      // ── Run collect ──
      if (params.runCollect) {
        parts.push(`\n🚀 Running \`pi-share-hf collect\`...`);
        parts.push(`   Command: \`${["pi-share-hf", ...args].join(" ")}\``);

        const { stdout, stderr, code } = await exec("pi-share-hf", args, {
          cwd: projectDir,
          timeout: 300000,
        });

        if (code === 0) {
          parts.push("\n✅ **pi-share-hf collect completed successfully**");
          if (stdout.trim()) {
            const outputLines = stdout.trim().split("\n").slice(-30);
            parts.push("```");
            parts.push(...outputLines);
            parts.push("```");
          }
        } else {
          parts.push(`\n❌ **pi-share-hf collect failed** (exit code ${code})`);
          if (stderr.trim()) parts.push(`Error: ${stderr.slice(-500)}`);
          if (stdout.trim()) parts.push(`Output: ${stdout.slice(-500)}`);
        }
      } else {
        parts.push("\nℹ️ Skipping collect (runCollect=false)");
        parts.push(
          `\nTo run manually:\n\`\`\`bash\npi-share-hf ${args.join(" ")}\n\`\`\``
        );
      }

      return {
        content: [{ type: "text", text: parts.join("\n") }],
        details: {
          secretsSynced: secretValues.size,
          collectRun: params.runCollect ?? true,
        },
      };
    },
  });

  // ─── Tool: secret_report ───────────────────────────────────────────
  pi.registerTool({
    name: "secret_report",
    label: "Secret Report",
    description:
      "Generate a summary report of the pi-share-hf workspace status: " +
      "uploadable sessions, rejected sessions, TruffleHog findings, and secrets managed. " +
      "Does NOT scan for new secrets (use secret_scan for that).",
    promptSnippet: "Report on pi-share-hf workspace and session status",
    parameters: Type.Object({
      grepPattern: Type.Optional(
        Type.String({
          description: "Search uploadable sessions for this pattern",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectDir = ctx.cwd;
      const hfWorkspace = join(projectDir, CONFIG.hfWorkspace);

      if (!existsSync(hfWorkspace)) {
        return {
          content: [
            {
              type: "text",
              text: "❌ pi-share-hf workspace not found at `.pi/hf-sessions/`",
            },
          ],
          details: { error: true, reason: "workspace-not-found" },
        };
      }

      const parts: string[] = ["## 📊 pi-share-hf Workspace Report"];
      parts.push("");

      // Secrets count
      const secretsPath = join(hfWorkspace, CONFIG.secretsFile);
      if (existsSync(secretsPath)) {
        const content = await readFile(secretsPath, "utf8");
        const count = content
          .split("\n")
          .filter((l) => l.trim() && !l.startsWith("#")).length;
        parts.push(`- **Secrets managed:** ${count}`);
      } else {
        parts.push("- **Secrets managed:** 0 (no secrets.txt)");
      }

      // Deny patterns
      const denyPath = join(hfWorkspace, CONFIG.denyFile);
      if (existsSync(denyPath)) {
        const content = await readFile(denyPath, "utf8");
        const count = content
          .split("\n")
          .filter((l) => l.trim() && !l.startsWith("#")).length;
        parts.push(`- **Deny patterns:** ${count}`);
      }

      // Manifest
      const manifestPath = join(hfWorkspace, "manifest.local.jsonl");
      if (existsSync(manifestPath)) {
        const { stdout } = await exec("wc", ["-l", manifestPath]);
        const count = parseInt(stdout.trim().split(/\s+/)[0] || "0");
        parts.push(`- **Sessions collected:** ${count}`);
      }

      // Redacted
      const redactedDir = join(hfWorkspace, "redacted");
      if (existsSync(redactedDir)) {
        const { stdout } = await exec("ls", [redactedDir]);
        const count = stdout.trim().split("\n").filter(Boolean).length;
        parts.push(`- **Redacted sessions:** ${count}`);
      }

      // Reviews
      const reviewDir = join(hfWorkspace, "review");
      if (existsSync(reviewDir)) {
        const { stdout } = await exec("ls", [reviewDir]);
        const count = stdout.trim().split("\n").filter(Boolean).length;
        parts.push(`- **Reviewed sessions:** ${count}`);
      }

      // TruffleHog
      const reportsDir = join(hfWorkspace, "reports");
      if (existsSync(reportsDir)) {
        const { stdout } = await exec("bash", [
          "-c",
          `ls ${reportsDir}/*.trufflehog.json 2>/dev/null | wc -l`,
        ]);
        const count = parseInt(stdout.trim());
        const { stdout: findingsCount } = await exec("bash", [
          "-c",
          `for f in ${reportsDir}/*.trufflehog.json; do python3 -c "import json; d=json.load(open('$f')); print(d.get('summary',{}).get('findings',0))" 2>/dev/null; done | grep -v '^0$' | wc -l`,
        ]);
        parts.push(
          `- **TruffleHog reports:** ${count} (${findingsCount.trim()} with findings)`
        );
      }

      // List uploadable
      parts.push("");
      const { stdout: listOutput, code: listCode } = await exec(
        "pi-share-hf",
        ["list", "--uploadable", "--workspace", hfWorkspace],
        { cwd: projectDir }
      );

      if (listCode === 0 && listOutput.trim()) {
        parts.push("### Uploadable Sessions");
        parts.push("```");
        parts.push(listOutput.trim().slice(-2000));
        parts.push("```");
      } else {
        parts.push("_No uploadable sessions yet_");
      }

      // Grep
      if (params.grepPattern) {
        parts.push("");
        parts.push(`### Grep Results: \`${params.grepPattern}\``);
        const { stdout: grepOutput } = await exec(
          "pi-share-hf",
          ["grep", "-i", params.grepPattern, "--workspace", hfWorkspace],
          { cwd: projectDir }
        );
        if (grepOutput.trim()) {
          parts.push("```");
          parts.push(grepOutput.trim().slice(-2000));
          parts.push("```");
        } else {
          parts.push("_No matches_");
        }
      }

      return {
        content: [{ type: "text", text: parts.join("\n") }],
        details: { tool: "secret_report" },
      };
    },
  });

  // ─── Tool: secret_upload ───────────────────────────────────────────
  pi.registerTool({
    name: "secret_upload",
    label: "Upload to Hugging Face",
    description:
      "Upload reviewed pi-share-hf sessions to Hugging Face. " +
      "Runs with --dry-run first to show what would be uploaded, " +
      "then proceeds with actual upload.",
    promptSnippet: "Upload sessions to Hugging Face dataset",
    parameters: Type.Object({
      dryRunOnly: Type.Optional(
        Type.Boolean({
          default: false,
          description: "Only run dry-run, don't actually upload",
        })
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectDir = ctx.cwd;
      const hfWorkspace = join(projectDir, CONFIG.hfWorkspace);
      const parts: string[] = [];

      // Dry run
      const { stdout: dryOutput, code: dryCode } = await exec(
        "pi-share-hf",
        ["upload", "--dry-run", "--workspace", hfWorkspace],
        { cwd: projectDir, timeout: 60000 }
      );

      if (dryCode !== 0) {
        parts.push("❌ Dry-run failed:");
        parts.push(dryOutput);
        return { content: [{ type: "text", text: parts.join("\n") }], details: { error: true, phase: "dry-run" } };
      }

      parts.push("## 🏗️ Dry Run Results");
      parts.push("```");
      parts.push(dryOutput.trim().slice(-2000));
      parts.push("```");

      if (params.dryRunOnly) {
        parts.push("\nℹ️ Dry-run only — no files uploaded.");
        return { content: [{ type: "text", text: parts.join("\n") }], details: { dryRun: true } };
      }

      // Actual upload
      parts.push("\n🚀 Proceeding with actual upload...");
      const { stdout: uploadOutput, code: uploadCode } = await exec(
        "pi-share-hf",
        ["upload", "--workspace", hfWorkspace],
        { cwd: projectDir, timeout: 120000 }
      );

      if (uploadCode === 0) {
        parts.push("\n✅ **Upload completed successfully!**");
        parts.push("```");
        parts.push(uploadOutput.trim().slice(-2000));
        parts.push("```");
      } else {
        parts.push(`\n❌ **Upload failed** (exit code ${uploadCode})`);
        parts.push(uploadOutput.slice(-1000));
      }

      return { content: [{ type: "text", text: parts.join("\n") }], details: { uploaded: uploadCode === 0 } };
    },
  });

  // ─── Command: /secret-scan ──────────────────────────────────────────
  pi.registerCommand("secret-scan", {
    description: "Quick scan for secrets in the project and sessions",
    getArgumentCompletions(prefix: string) {
      return ["project", "sessions", "all", "env"]
        .filter((s) => s.startsWith(prefix))
        .map((s) => ({ value: s, label: s }));
    },
    async handler(args, ctx) {
      const scope = args?.trim() || "all";
      ctx.ui.notify(
        `🔍 Scanning for secrets (scope: ${scope})...`,
        "info"
      );
      pi.sendUserMessage(
        `/skill: Run secret_scan with scope=${scope} and includeTruffleHog=true to scan for secrets`
      );
    },
  });

  // ─── Command: /hf-status ───────────────────────────────────────────
  pi.registerCommand("hf-status", {
    description: "Show pi-share-hf workspace status and uploadable sessions",
    async handler(_args, ctx) {
      const projectDir = ctx.cwd;
      const hfWorkspace = join(projectDir, CONFIG.hfWorkspace);

      if (!existsSync(hfWorkspace)) {
        ctx.ui.notify(
          "❌ pi-share-hf workspace not found. Run `pi-share-hf init` first.",
          "error"
        );
        return;
      }

      const { stdout, code } = await exec(
        "pi-share-hf",
        ["list", "--uploadable", "--workspace", hfWorkspace],
        { cwd: projectDir }
      );

      if (code === 0) {
        ctx.ui.notify(stdout.trim() || "No uploadable sessions", "info");
      } else {
        ctx.ui.notify("Failed to list sessions", "error");
      }
    },
  });

  // ─── Lifecycle: Prevent leaking secrets via tool output ─────────────
  pi.on("tool_call", async (event, _ctx) => {
    if (
      event.toolName !== "write" &&
      event.toolName !== "edit" &&
      event.toolName !== "bash"
    )
      return;

    if (event.toolName === "bash" && event.input?.command) {
      const cmd = event.input.command as string;
      const dangerousPatterns = [
        /cat\s+.*\.env.*>\s+(?!\/tmp|\/var\/tmp)/,
        /echo.*(?:NPM_TOKEN|HF_TOKEN|API_KEY|SECRET).*>\s+(?!\/tmp|\/var\/tmp)/,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(cmd)) {
          return {
            block: true,
            reason:
              "🛡️ Blocked: Writing secrets to a non-temporary file. " +
              "Use /tmp or .pi/hf-sessions/secrets.txt instead.",
          };
        }
      }
    }
  });

  // ─── Lifecycle: Notify on startup ──────────────────────────────────
  pi.on("session_start", async (_event, ctx) => {
    if (_event.reason === "startup" || _event.reason === "new") {
      const secretsPath = join(ctx.cwd, CONFIG.hfWorkspace, CONFIG.secretsFile);
      if (existsSync(secretsPath)) {
        const content = await readFile(secretsPath, "utf8");
        const count = content
          .split("\n")
          .filter((l) => l.trim() && !l.startsWith("#")).length;
        if (count > 0) {
          ctx.ui.notify(
            `🛡️ Secret Guardian: ${count} secrets managed for pi-share-hf`,
            "info"
          );
        }
      }
    }
  });

  console.log("[pi-secret-guardian] Extension loaded — 4 tools + 2 commands registered");
};

export default factory;