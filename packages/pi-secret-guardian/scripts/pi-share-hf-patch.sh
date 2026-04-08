#!/usr/bin/env bash
# pi-share-hf-patch.sh
#
# Patches pi-share-hf to load pi-ollama extension during LLM review.
# pi-share-hf uses `pi --no-extensions` which prevents pi-ollama from loading.
# This patch adds `-e <pi-ollama-path>` after `--no-extensions` so the review
# subprocess can use ollama models.
#
# Run after: npm install -g pi-share-hf
# Called by: pi-secret-guardian's secret_sync_hf tool
#
# Location: packages/pi-secret-guardian/scripts/pi-share-hf-patch.sh

set -euo pipefail

OLLAMA_EXT_PATH="/home/moika/.pi/agent/git/github.com/0xKobold/pi-ollama/src/index.ts"

# Resolve pi-share-hf installation
PI_SHARE_HF_BIN=$(which pi-share-hf 2>/dev/null || echo "")
if [ -z "$PI_SHARE_HF_BIN" ]; then
    echo "❌ pi-share-hf not found. Install with: npm install -g pi-share-hf"
    exit 1
fi

SHARE_HF_DIR=$(dirname $(dirname $(readlink -f "$PI_SHARE_HF_BIN" 2>/dev/null || echo "$PI_SHARE_HF_BIN")))/lib/node_modules/pi-share-hf

# Also try npm root -g as fallback
if [ ! -d "$SHARE_HF_DIR" ]; then
    NPM_ROOT=$(npm root -g 2>/dev/null || echo "")
    if [ -d "$NPM_ROOT/pi-share-hf" ]; then
        SHARE_HF_DIR="$NPM_ROOT/pi-share-hf"
    fi
fi

if [ ! -d "$SHARE_HF_DIR" ]; then
    echo "❌ Cannot find pi-share-hf installation at $SHARE_HF_DIR"
    exit 1
fi

REVIEW_JS="$SHARE_HF_DIR/dist/review.js"

if [ ! -f "$REVIEW_JS" ]; then
    echo "❌ Cannot find review.js at $REVIEW_JS"
    exit 1
fi

# Check if already patched
if grep -q "pi-ollama" "$REVIEW_JS" 2>/dev/null; then
    echo "✅ Already patched: $REVIEW_JS"
    exit 0
fi

# Create backup
cp "$REVIEW_JS" "$REVIEW_JS.bak"

# Apply patch using python3 for reliability with special characters
python3 << 'PYEOF'
import sys

review_js = sys.argv[1]
ollama_path = sys.argv[2]

with open(review_js, 'r') as f:
    content = f.read()

old = '"--no-extensions",'
new = '"--no-extensions",\n        "-e", "' + ollama_path + '",'

if old not in content:
    print("❌ Could not find --no-extensions in review.js - patch format may have changed")
    sys.exit(1)

# Only replace the first occurrence (in reviewChunkWithPi)
content = content.replace(old, new, 1)

with open(review_js, 'w') as f:
    f.write(content)

print("✅ Patched successfully")
PYEOF

# Verify
if grep -q "pi-ollama" "$REVIEW_JS" 2>/dev/null; then
    echo "✅ pi-share-hf patched: -e $OLLAMA_EXT_PATH added to review subprocess"
else
    echo "❌ Patch failed - restoring backup"
    cp "$REVIEW_JS.bak" "$REVIEW_JS"
    exit 1
fi