#!/bin/bash
# sync-packages.sh - Pull changes from individual pi-package repos

set -e

cd "$(dirname "$0")"

echo "=== Syncing pi-packages from individual repos ==="
echo ""

# Packages to sync
PACKAGES=(
  "pi-bridge"
  "pi-cloudflare-browser"
  "pi-erc8004"
  "pi-gateway"
  "pi-gateway-v2"
  "pi-learn"
  "pi-obsidian-bridge"
  "pi-ollama"
  "pi-suggest"
  "pi-wallet"
)

for PKG in "${PACKAGES[@]}"; do
  echo "--- Syncing $PKG ---"
  
  PKG_DIR="packages/$PKG"
  REMOTE="git@github.com:0xKobold/$PKG.git"
  
  if [ ! -d "$PKG_DIR" ]; then
    echo "⚠️  $PKG_DIR not found, skipping"
    continue
  fi
  
  # Check if remote exists locally
  if ! git remote | grep -q "^pkg-$PKG$"; then
    echo "Adding remote for $PKG..."
    git remote add "pkg-$PKG" "$REMOTE" 2>/dev/null || {
      echo "⚠️  Could not add remote (repo may not exist)"
      continue
    }
  fi
  
  # Fetch latest
  echo "Fetching from $REMOTE..."
  git fetch "pkg-$PKG" main --quiet 2>/dev/null || {
    echo "⚠️  Could not fetch (no main branch or no access)")
    continue
  fi
  
  # Check if there are changes
  LOCAL_HASH=$(git rev-parse HEAD:packages/$PKG 2>/dev/null || echo "")
  REMOTE_HASH=$(git rev-parse pkg-$PKG/main: 2>/dev/null || echo "")
  
  if [ "$LOCAL_HASH" = "$REMOTE_HASH" ]; then
    echo "✅ $PKG is up to date"
  else
    echo "📦 Changes found in $PKG"
    echo "   Local:  $LOCAL_HASH"
    echo "   Remote: $REMOTE_HASH"
    
    # Show diff summary
    git diff --stat "pkg-$PKG/main...HEAD" -- "$PKG_DIR" 2>/dev/null || true
    
    read -p "   Pull changes? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      git subtree pull --prefix="$PKG_DIR" "pkg-$PKG" main --squash -m "sync: $PKG from individual repo"
      echo "✅ $PKG synced"
    else
      echo "⏭️  Skipped $PKG"
    fi
  fi
  
  echo ""
done

echo "=== Sync complete ==="
