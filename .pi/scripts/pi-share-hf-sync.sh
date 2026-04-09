#!/usr/bin/env bash
# pi-share-hf-sync.sh
#
# Incremental session sync: collect new/changed sessions, upload what passes review.
# Designed to be called by systemd timer or cron.
#
# Prerequisites:
#   - pi-share-hf installed (npm install -g pi-share-hf)
#   - trufflehog installed (brew install trufflehog)
#   - ollama running locally
#   - HF_TOKEN set (in ~/.cache/huggingface/token)
#   - pi-share-hf ollama patch applied
#
# Exit codes:
#   0 - success (or nothing to do)
#   1 - prerequisites missing
#   2 - collect failed
#   3 - upload failed

set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────
PROJECT_DIR="${1:-$HOME/Documents/code/0xKobolds}"
HF_WORKSPACE="$PROJECT_DIR/.pi/hf-sessions"
LOG_TAG="pi-share-hf-sync"

# ─── Logging ──────────────────────────────────────────────────────
log()  { echo "[$(date -Iseconds)] [$LOG_TAG] $*"; }
warn() { log "WARN: $*"; }
err()  { log "ERROR: $*" >&2; }

# ─── Guard: prerequisites ────────────────────────────────────────
check_prereqs() {
    local missing=0

    if ! command -v pi-share-hf &>/dev/null; then
        err "pi-share-hf not installed. Run: npm install -g pi-share-hf"
        missing=1
    fi

    if ! command -v trufflehog &>/dev/null; then
        err "trufflehog not installed. Run: brew install trufflehog"
        missing=1
    fi

    if [ ! -d "$HF_WORKSPACE" ]; then
        err "pi-share-hf workspace not found at $HF_WORKSPACE. Run: pi-share-hf init"
        missing=1
    fi

    if [ ! -f "$HOME/.cache/huggingface/token" ] && [ -z "${HF_TOKEN:-}" ]; then
        err "No HF_TOKEN set. Run: export HF_TOKEN=hf_xxx or save to ~/.cache/huggingface/token"
        missing=1
    fi

    # Check ollama is reachable (needed for LLM review)
    if ! curl -sf http://localhost:11434/api/tags &>/dev/null; then
        err "Ollama not running at localhost:11434. Start it first."
        missing=1
    fi

    # Check pi-ollama patch is applied
    if command -v pi-share-hf &>/dev/null; then
        SHARE_HF_DIR="$(dirname $(dirname $(readlink -f $(which pi-share-hf) 2>/dev/null || which pi-share-hf))))/lib/node_modules/pi-share-hf"
        if [ -d "$SHARE_HF_DIR" ] && ! grep -q "pi-ollama" "$SHARE_HF_DIR/dist/review.js" 2>/dev/null; then
            warn "pi-ollama patch not applied. Run: bash $PROJECT_DIR/packages/pi-secret-guardian/scripts/pi-share-hf-patch.sh"
        fi
    fi

    return $missing
}

# ─── Main pipeline ────────────────────────────────────────────────
main() {
    log "Starting sync for $PROJECT_DIR"

    if ! check_prereqs; then
        log "Prerequisites not met, exiting"
        exit 1
    fi

    cd "$PROJECT_DIR"

    # ── Step 1: Gather secrets ──
    SECRETS_FILE="$HF_WORKSPACE/secrets.txt"
    DENY_FILE="$HF_WORKSPACE/deny.txt"

    if [ ! -f "$SECRETS_FILE" ]; then
        warn "No secrets.txt found. Run secret_scan first."
    fi

    # ── Step 2: Collect (redact + trufflehog + LLM review) ──
    log "Running pi-share-hf collect..."

    COLLECT_ARGS=(
        "collect"
        "--workspace" "$HF_WORKSPACE"
        "--env-file" "$HOME/.zshrc"
    )

    if [ -f "$SECRETS_FILE" ]; then
        COLLECT_ARGS+=("--secret" "$SECRETS_FILE")
    fi

    if [ -f "$DENY_FILE" ]; then
        COLLECT_ARGS+=("--deny" "$DENY_FILE")
    fi

    # Add context files that exist
    for ctx in README.md AGENTS.md; do
        if [ -f "$PROJECT_DIR/$ctx" ]; then
            COLLECT_ARGS+=("$ctx")
        fi
    done

    COLLECT_ARGS+=("--parallel" "2")

    # Auto-confirm the LLM review prompt
    if ! echo "y" | pi-share-hf "${COLLECT_ARGS[@]}" 2>&1; then
        err "pi-share-hf collect failed"
        exit 2
    fi

    log "Collect completed"

    # ── Step 3: Check if there's anything to upload ──
    UPLOADABLE=$(pi-share-hf list --uploadable --workspace "$HF_WORKSPACE" 2>/dev/null | grep -c '\.jsonl' || echo "0")

    if [ "$UPLOADABLE" -eq 0 ]; then
        log "No new uploadable sessions. Done."
        exit 0
    fi

    log "$UPLOADABLE uploadable session(s) found"

    # ── Step 4: Upload ──
    log "Running pi-share-hf upload..."

    if ! pi-share-hf upload --workspace "$HF_WORKSPACE" 2>&1; then
        err "pi-share-hf upload failed"
        exit 3
    fi

    log "Upload completed successfully"
}

main "$@"