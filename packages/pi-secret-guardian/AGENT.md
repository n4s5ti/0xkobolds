# AGENT.md — @0xkobold/pi-secret-guardian

## What This Package Does

Secret detection and pi-share-hf integration for pi agents. Scans project files, sessions, and environment for API keys, tokens, and passwords using both pattern matching and TruffleHog verified detection. Syncs discovered secrets to pi-share-hf's `secrets.txt` for deterministic redaction before upload.

## Architecture

```
src/
├── index.ts    # Extension factory (4 tools + 2 commands + lifecycle hooks)
└── shared.ts   # Types, patterns, and utility functions (library API)
```

**Key design:** Types and utility functions live in `shared.ts` so library consumers can import them without pulling in the full extension factory. The main `index.ts` re-exports everything from shared for convenience.

## Extension Factory

```typescript
export default async function factory(pi: ExtensionAPI): Promise<void>
```

Async factory matching pi-kobold's `await factory(pi)` pattern. Registered in pi-kobold's `subExtensions` array with sentinel `{ type: "tool", name: "secret_scan" }`.

## Tools

| Tool | Description |
|------|-------------|
| `secret_scan` | Scan project/sessions/env for secrets (pattern + TruffleHog) |
| `secret_sync_hf` | Sync secrets to pi-share-hf workspace + run collect |
| `secret_report` | Report on pi-share-hf workspace status |
| `secret_upload` | Upload reviewed sessions to HuggingFace |

## Commands

| Command | Description |
|---------|-------------|
| `/secret-scan` | Quick scan for secrets (dispatches to secret_scan tool) |
| `/hf-status` | Show pi-share-hf workspace status |

## Lifecycle Hooks

- `session_start` — Notifies secrets count from `.pi/hf-sessions/secrets.txt`
- `tool_call` — Blocks dangerous bash/write commands that would leak secrets to non-temporary files

## Sentinel Tool

`secret_scan` — Used by pi-kobold's duplicate-load guard to detect if the extension was already loaded.

## Key Types (importable from `@0xkobold/pi-secret-guardian/shared`)

```typescript
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
} from "@0xkobold/pi-secret-guardian/shared";

// Or from the main entry (convenience re-exports)
import { maskSecret, type SecretFinding } from "@0xkobold/pi-secret-guardian";
```

## Configuration

| File | Purpose |
|------|---------|
| `.pi/hf-sessions/secrets.txt` | Auto-managed list of secrets to redact |
| `.pi/hf-sessions/deny.txt` | Regex patterns to reject sessions |
| `.pi/hf-sessions/workspace.json` | pi-share-hf workspace config |

## pi-share-hf Ollama Patch

pi-share-hf's LLM review uses `pi --no-extensions`, which prevents pi-ollama from loading. This extension includes `scripts/pi-share-hf-patch.sh` that adds `-e <pi-ollama-path>` after `--no-extensions` so review can use Ollama models.

Applied automatically by `secret_sync_hf`, or manually:
```bash
bash packages/pi-secret-guardian/scripts/pi-share-hf-patch.sh
```

Re-run after any `npm update -g pi-share-hf`.

## Integration with pi-kobold

Loaded as a sub-extension in pi-kobold's `index.ts`. Users can install either:

- `pi install npm:@0xkobold/pi-secret-guardian` — standalone
- `pi install npm:@0xkobold/pi-kobold` — bundled (loads secret-guardian automatically)

No conflicts if both installed — pi-kobold's duplicate guard skips re-loading.

## Dependencies

- `@mariozechner/pi-coding-agent` >=0.65.0 (peer)
- `@sinclair/typebox` >=0.32.0 (peer)
- **External:** `trufflehog` (optional, for verified secret detection)
- **External:** `pi-share-hf` (optional, for HF sync/upload pipeline)