# 🛡️ pi-secret-guardian

Secret detection and [pi-share-hf](https://github.com/badlogic/pi-share-hf) integration for [pi](https://pi.dev).

Part of the [0xKobold](https://github.com/0xKobold) ecosystem.

## What it does

- **Scans** project files, pi sessions, and environment for secrets (API keys, tokens, passwords)
- **Runs TruffleHog** for verified secret detection as a backstop
- **Syncs** discovered secrets to pi-share-hf's `secrets.txt` for deterministic redaction
- **Patches** pi-share-hf to load pi-ollama during LLM review (patches `--no-extensions`)
- **Manages** the full collect → review → upload pipeline

## Installation

### Bundled (recommended)

```bash
pi install npm:@0xkobold/pi-kobold
# pi-secret-guardian loaded as sub-extension automatically
```

### Standalone

```bash
pi install npm:@0xkobold/pi-secret-guardian

# Or in pi-config.ts
{
  extensions: [
    'npm:@0xkobold/pi-secret-guardian'
  ]
}

# Or temporary (testing)
pi -e npm:@0xkobold/pi-secret-guardian
```

### External dependencies

```bash
# TruffleHog (required for verified secret detection)
brew install trufflehog

# pi-share-hf (required for HF sync/upload)
npm install -g pi-share-hf
```

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
| `/secret-scan` | Quick scan for secrets |
| `/hf-status` | Show pi-share-hf workspace status |

## Usage

### 1. Scan for secrets

```
Run secret_scan with scope=all and includeTruffleHog=true
```

### 2. Sync and collect

```
Run secret_sync_hf to sync secrets and run pi-share-hf collect
```

### 3. Review and upload

```
Run secret_report to check uploadable sessions
Run secret_upload to upload to HuggingFace
```

## API / Library Usage

Types and utility functions are available for programmatic use:

```typescript
// Import from shared module (recommended)
import {
  type SecretFinding,
  type TruffleHogFinding,
  type ScanResult,
  maskSecret,
  parseEnvFile,
  parseNpmrc,
  scanWithPatterns,
  SECRET_PATTERNS,
  ENV_FILES,
} from "@0xkobold/pi-secret-guardian/shared";

// Or from the main entry (convenience re-exports)
import { maskSecret, type SecretFinding } from "@0xkobold/pi-secret-guardian";

// Mask a secret for safe display
maskSecret("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890");
// → "ghp_****890"

// Parse an .env file for secrets
const findings = parseEnvFile(envContent, "/path/to/.env");

// Scan content against known patterns
const patternHits = scanWithPatterns(sourceCode, "/path/to/file.ts", "project-file");
```

## pi-share-hf Ollama Patch

pi-share-hf's LLM review subprocess uses `pi --no-extensions`, which prevents pi-ollama from loading. This extension includes a patch script that adds `-e <pi-ollama-path>` after `--no-extensions` so the review can use your ollama models.

The patch is applied automatically by `secret_sync_hf`. To apply manually:

```bash
bash packages/pi-secret-guardian/scripts/pi-share-hf-patch.sh
```

Re-run after any `npm update -g pi-share-hf`.

## Configuration

| File | Purpose |
|------|---------|
| `.pi/hf-sessions/secrets.txt` | Auto-managed list of secrets to redact |
| `.pi/hf-sessions/deny.txt` | Regex patterns to reject sessions |
| `.pi/hf-sessions/workspace.json` | pi-share-hf workspace config |

## Architecture

```
src/
├── index.ts    # Extension factory (4 tools + 2 commands + lifecycle hooks)
└── shared.ts   # Types, patterns, and utility functions (library API)
scripts/
└── pi-share-hf-patch.sh  # Patches pi-share-hf for ollama support
```

Integrated into pi-kobold as a sub-extension with duplicate-load guard.

## Related Packages

- [`@0xkobold/pi-kobold`](https://github.com/0xKobold/pi-kobold) — Meta-extension that bundles this and other sub-extensions
- [`@0xkobold/pi-ollama`](https://github.com/0xKobold/pi-ollama) — Ollama integration (required for HF review patch)

## Local Development

```bash
git clone https://github.com/0xKobold/pi-secret-guardian
cd pi-secret-guardian
npm install
npm run build
pi install ./
```

## License

MIT © 0xKobold