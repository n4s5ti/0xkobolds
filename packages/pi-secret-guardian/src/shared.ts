/**
 * Shared types and utilities for pi-secret-guardian.
 *
 * Re-exports the types and helper functions used by the extension
 * so library consumers can import them without pulling in the full
 * extension factory.
 *
 * Usage:
 *   import { type SecretFinding, maskSecret, parseEnvFile } from "@0xkobold/pi-secret-guardian/shared";
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface SecretFinding {
  path: string;
  line: number;
  type: "env-file" | "shell-file" | "npmrc" | "session" | "project-file";
  keyName: string;
  value: string;
  detector: string;
}

export interface TruffleHogFinding {
  detectorType: string;
  raw: string;
  file: string;
  line: number;
  verified: boolean;
}

export interface ScanResult {
  timestamp: string;
  projectDir: string;
  totalFindings: number;
  secrets: SecretFinding[];
  truffleHogFindings: TruffleHogFinding[];
}

// ─── Configuration ─────────────────────────────────────────────────

export const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"]?([^\s'"]{8,})/gi,
  /(?:secret[_-]?key|secret)\s*[=:]\s*['"]?([^\s'"]{8,})/gi,
  /(?:auth[_-]?token|access[_-]?token|token)\s*[=:]\s*['"]?([^\s'"]{8,})/gi,
  /(?:password|passwd|pass)\s*[=:]\s*['"]?([^\s'"]{8,})/gi,
  /(?:private[_-]?key)\s*[=:]\s*['"]?([^\s'"]{20,})/gi,
  /(?:credentials?)\s*[=:]\s*['"]?([^\s'"]{8,})/gi,
  /(?:bearer)\s+([^\s]{8,})/gi,
  /(?:sk-|sk_live_|sk_test_)[a-zA-Z0-9]{20,}/g,
  /(?:ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}/g,
  /(?:npm_[a-zA-Z0-9]{36,})/g,
  /(?:hf_[a-zA-Z0-9]{30,})/g,
  /(?:xox[bpors]-[a-zA-Z0-9-]{10,})/g,
  /(?:AKIA[0-9A-Z]{16})/g,
  /(?:AIza[0-9A-Za-z_-]{35})/g,
] as const;

export const ENV_FILES = [".env", ".env.local", ".env.production", ".env.development"] as const;
export const SHELL_FILES = [".zshrc", ".bashrc", ".bash_profile", ".profile"] as const;
export const NPMRC_FILES = [".npmrc"] as const;

export const HF_WORKSPACE_DIR = ".pi/hf-sessions";
export const SECRETS_FILE = "secrets.txt";
export const DENY_FILE = "deny.txt";

// ─── Utility Functions ──────────────────────────────────────────────

/**
 * Mask a secret value for safe display.
 * Shows first 4 and last 4 characters, replacing the middle with ****.
 */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

/**
 * Truncate a string to maxLen, showing first 3 and last 3 chars with "...".
 */
export function truncate(s: string, maxLen: number): string {
  if (maxLen <= 4) return s.slice(0, maxLen);
  return s.length <= maxLen ? s : s.slice(0, 3) + "..." + s.slice(-3);
}

/**
 * Parse an environment file for secrets by key name.
 * Detects keys containing "token", "key", "secret", "password", etc.
 */
export function parseEnvFile(content: string, filePath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split("\n");
  const secretKeyPattern = /(?:token|key|secret|password|passwd|auth|credential|api|private|bearer)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^export\s+([\w_]+)\s*=\s*["']?([^"'\n]+)["']?/);
    if (match) {
      const [, key, value] = match;
      if (secretKeyPattern.test(key) && value.trim().length >= 8) {
        findings.push({
          path: filePath,
          line: i + 1,
          type: filePath.includes(".npmrc") ? "npmrc" : "env-file",
          keyName: key,
          value: value.trim(),
          detector: "env-key-name",
        });
      }
    }
  }
  return findings;
}

/**
 * Parse an .npmrc file for auth tokens.
 */
export function parseNpmrc(content: string, filePath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/_authToken=(.+)/);
    if (match) {
      findings.push({
        path: filePath,
        line: i + 1,
        type: "npmrc",
        keyName: "_authToken",
        value: match[1].trim(),
        detector: "npmrc-auth-token",
      });
    }
  }
  return findings;
}

/**
 * Scan content against known secret patterns.
 */
export function scanWithPatterns(
  content: string,
  filePath: string,
  type: SecretFinding["type"]
): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const pattern of SECRET_PATTERNS) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      pattern.lastIndex = 0;
      const match = pattern.exec(lines[i]);
      if (match && match[1]) {
        const existing = findings.find(
          (f) => f.path === filePath && f.line === i + 1 && f.value === match![1]
        );
        if (!existing) {
          findings.push({
            path: filePath,
            line: i + 1,
            type,
            keyName: match[0].split(/\s*[=:]\s*/)[0] || "unknown",
            value: match[1],
            detector: pattern.source.slice(0, 40),
          });
        }
      }
    }
  }
  return findings;
}