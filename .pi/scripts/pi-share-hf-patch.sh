#!/usr/bin/env bash
# Delegates to pi-secret-guardian's patch script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PKG_SCRIPT="$PROJECT_ROOT/packages/pi-secret-guardian/scripts/pi-share-hf-patch.sh"

if [ -f "$PKG_SCRIPT" ]; then
    exec bash "$PKG_SCRIPT" "$@"
else
    echo "❌ pi-secret-guardian package script not found at $PKG_SCRIPT"
    echo "   Run: cd packages/pi-secret-guardian && bun install"
    exit 1
fi
