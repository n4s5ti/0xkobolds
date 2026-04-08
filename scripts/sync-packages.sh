#!/bin/bash
# sync-packages.sh - Bidirectional sync between monorepo and individual pi-package repos
#
# Pull:  Uses content-based sync (git archive + extract) instead of git subtree pull,
#        which avoids the "unrelated histories" problem that subtree creates.
# Push:  Uses git subtree push (which works correctly).
#
# Usage:
#   ./sync-packages.sh              # Interactive: check all packages, prompt to pull/push
#   ./sync-packages.sh pull pi-ollama   # Pull specific package from GH
#   ./sync-packages.sh push pi-ollama   # Push specific package to GH
#   ./sync-packages.sh status            # Show sync status for all packages
#   ./sync-packages.sh pull-all          # Pull all packages with changes (no prompts)
#   ./sync-packages.sh push-all          # Push all packages with changes (no prompts)

set +e

MONOREPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$MONOREPO_ROOT"

# Map package name → remote name (populated by ensure_remote)
declare -A REMOTE_MAP

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

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Helpers
# ============================================================================

ensure_remote() {
  local pkg="$1"
  local remote_name="pkg-$pkg"
  local remote_url="https://github.com/0xKobold/${pkg}.git"

  # Check if any remote already points to this package repo
  local existing_remote
  existing_remote=$(git remote -v | grep "github.com.*[/:]0xKobold/${pkg}[./]" | head -1 | awk '{print $1}')
  if [ -n "$existing_remote" ]; then
    REMOTE_MAP[$pkg]="$existing_remote"
    return 0
  fi

  # Check if the pkg- remote already exists
  if git remote | grep -q "^${remote_name}$"; then
    REMOTE_MAP[$pkg]="$remote_name"
    return 0
  fi

  echo "  Adding remote ${remote_name} → ${remote_url}"
  git remote add "$remote_name" "$remote_url" 2>/dev/null || {
    echo -e "${RED}  Could not add remote (repo may not exist)${NC}"
    return 1
  }
  REMOTE_MAP[$pkg]="$remote_name"
}

fetch_remote() {
  local pkg="$1"

  ensure_remote "$pkg" || return 1

  local remote_name="${REMOTE_MAP[$pkg]}"
  echo "  Fetching ${remote_name}..."
  git fetch "$remote_name" main --quiet 2>/dev/null || {
    echo -e "${RED}  Could not fetch (no main branch or no access)${NC}"
    return 1
  }
}

# Content-based diff: compares local package dir against remote tree
# Returns 0 if identical, 1 if different, 2 on error
content_diff() {
  local pkg="$1"
  local remote_name="${REMOTE_MAP[$pkg]}"
  local pkg_dir="packages/${pkg}"
  local tmp_remote="/tmp/sync-${pkg}-remote"
  local tmp_local="/tmp/sync-${pkg}-local"

  rm -rf "$tmp_remote" "$tmp_local" 2>/dev/null || true

  # Extract remote tree into temp dir
  mkdir -p "$tmp_remote"
  git archive "$remote_name/main" | tar -x -C "$tmp_remote" 2>/dev/null || {
    echo -e "${RED}  Could not extract remote tree${NC}"
    rm -rf "$tmp_remote" "$tmp_local" 2>/dev/null
    return 2
  }

  # Extract local package dir into temp dir
  mkdir -p "$tmp_local"
  # Use git archive on local tree to avoid .git and node_modules noise
  git archive HEAD -- "$pkg_dir" | tar -x -C "$tmp_local" 2>/dev/null || {
    echo -e "${RED}  Could not extract local tree${NC}"
    rm -rf "$tmp_remote" "$tmp_local" 2>/dev/null
    return 2
  }

  # diff -r strips the leading path difference
  local_diff=$(diff -rq "$tmp_local/$pkg_dir" "$tmp_remote" 2>/dev/null || true)

  rm -rf "$tmp_remote" "$tmp_local" 2>/dev/null

  if [ -z "$local_diff" ]; then
    return 0  # identical
  else
    echo "$local_diff"
    return 1  # different
  fi
}

# ============================================================================
# Commands
# ============================================================================

cmd_status() {
  echo -e "${BLUE}=== Package Sync Status ===${NC}"
  echo ""

  for pkg in "${PACKAGES[@]}"; do
    local pkg_dir="packages/${pkg}"

    if [ ! -d "$pkg_dir" ]; then
      echo -e "  ${YELLOW}⊗${NC} ${pkg} — directory not found"
      continue
    fi

    ensure_remote "$pkg" 2>/dev/null || {
      echo -e "  ${RED}✗${NC} ${pkg} — no remote / repo doesn't exist"
      continue
    }

    fetch_remote "$pkg" 2>/dev/null || {
      echo -e "  ${RED}✗${NC} ${pkg} — fetch failed"
      continue
    }

    local diff_output
    diff_output=$(content_diff "$pkg" 2>/dev/null)
    local diff_rc=$?

    if [ $diff_rc -eq 0 ]; then
      echo -e "  ${GREEN}✓${NC} ${pkg} — synced"
    elif [ $diff_rc -eq 1 ]; then
      echo -e "  ${YELLOW}↔${NC} ${pkg} — has changes"
      echo "$diff_output" | head -5 | sed 's/^/     /'
      local line_count
      line_count=$(echo "$diff_output" | wc -l)
      if [ "$line_count" -gt 5 ]; then
        echo "     ... and $((line_count - 5)) more"
      fi
    else
      echo -e "  ${RED}?${NC} ${pkg} — could not compare"
    fi
  done

  echo ""
}

cmd_pull() {
  local pkg="$1"

  if [ -z "$pkg" ]; then
    echo -e "${RED}Usage: $0 pull <package-name>${NC}"
    echo "Available: ${PACKAGES[*]}"
    exit 1
  fi

  local pkg_dir="packages/${pkg}"

  if [ ! -d "$pkg_dir" ]; then
    echo -e "${RED}Directory ${pkg_dir} not found${NC}"
    exit 1
  fi

  fetch_remote "$pkg" || exit 1

  local remote_name="${REMOTE_MAP[$pkg]}"

  echo "  Pulling ${pkg} from GH into monorepo..."

  # Content-based pull: extract remote tree into package dir, then commit
  # First, check if there are actual differences
  local diff_output
  diff_output=$(content_diff "$pkg" 2>/dev/null)
  local diff_rc=$?

  if [ $diff_rc -eq 0 ]; then
    echo -e "  ${GREEN}Already up to date${NC}"
    return 0
  fi

  # Extract remote tree over the local package directory
  # git archive gives us a clean snapshot from the remote
  git archive "$remote_name/main" | tar -x -C "$pkg_dir"

  # Stage and check for changes
  git add "$pkg_dir"

  local changed
  changed=$(git diff --cached --stat)
  if [ -z "$changed" ]; then
    echo -e "  ${GREEN}Already up to date (no content changes)${NC}"
    git reset HEAD "$pkg_dir" > /dev/null 2>&1
    return 0
  fi

  # Show what changed
  echo ""
  echo "$changed"
  echo ""
  echo -e "  ${GREEN}Pulled ${pkg} from GH. Commit when ready.${NC}"
  echo "  Suggested commit message:"
  echo "    git commit -m \"sync(${pkg}): pull from individual repo\""
}

cmd_push() {
  local pkg="$1"

  if [ -z "$pkg" ]; then
    echo -e "${RED}Usage: $0 push <package-name>${NC}"
    echo "Available: ${PACKAGES[*]}"
    exit 1
  fi

  local pkg_dir="packages/${pkg}"

  if [ ! -d "$pkg_dir" ]; then
    echo -e "${RED}Directory ${pkg_dir} not found${NC}"
    exit 1
  fi

  ensure_remote "$pkg" || exit 1
  fetch_remote "$pkg" || exit 1

  local remote_name="${REMOTE_MAP[$pkg]}"

  echo "  Pushing ${pkg} to GH via git subtree..."

  # git subtree push works fine — it splits the prefix and pushes
  # Allow force for the first push or after history rewrites
  if git subtree push --prefix="$pkg_dir" "$remote_name" main 2>&1; then
    echo -e "  ${GREEN}✓ Pushed ${pkg} to GH${NC}"
  else
    echo -e "  ${YELLOW}Subtree push failed. Trying with --force...${NC}"
    if git subtree push --prefix="$pkg_dir" "$remote_name" main --force 2>&1; then
      echo -e "  ${GREEN}✓ Force-pushed ${pkg} to GH${NC}"
    else
      echo -e "  ${RED}✗ Push failed. You may need to resolve conflicts manually.${NC}"
      echo "  Try: git subtree push --prefix=$pkg_dir $remote_name main"
      exit 1
    fi
  fi
}

cmd_pull_all() {
  for pkg in "${PACKAGES[@]}"; do
    echo -e "\n${BLUE}--- ${pkg} ---${NC}"
    local pkg_dir="packages/${pkg}"
    [ ! -d "$pkg_dir" ] && continue

    ensure_remote "$pkg" 2>/dev/null || continue
    fetch_remote "$pkg" 2>/dev/null || continue

    local diff_output
    diff_output=$(content_diff "$pkg" 2>/dev/null)
    local diff_rc=$?

    if [ $diff_rc -eq 1 ]; then
      cmd_pull "$pkg"
    fi
  done
}

cmd_push_all() {
  for pkg in "${PACKAGES[@]}"; do
    echo -e "\n${BLUE}--- ${pkg} ---${NC}"
    local pkg_dir="packages/${pkg}"
    [ ! -d "$pkg_dir" ] && continue

    ensure_remote "$pkg" 2>/dev/null || continue
    fetch_remote "$pkg" 2>/dev/null || continue

    local diff_output
    diff_output=$(content_diff "$pkg" 2>/dev/null)
    local diff_rc=$?

    if [ $diff_rc -eq 1 ]; then
      cmd_push "$pkg"
    fi
  done
}

# ============================================================================
# Main
# ============================================================================

ACTION="${1:-status}"
PKG="$2"

case "$ACTION" in
  status)
    cmd_status
    ;;
  pull)
    cmd_pull "$PKG"
    ;;
  push)
    cmd_push "$PKG"
    ;;
  pull-all)
    cmd_pull_all
    ;;
  push-all)
    cmd_push_all
    ;;
  *)
    echo "Usage: $0 {status|pull|push|pull-all|push-all} [package-name]"
    echo ""
    echo "Commands:"
    echo "  status     Show sync status for all packages (default)"
    echo "  pull <pkg> Pull changes from GH into monorepo"
    echo "  push <pkg> Push monorepo changes to GH"
    echo "  pull-all   Pull all packages with changes"
    echo "  push-all   Push all packages with changes"
    echo ""
    echo "Available packages: ${PACKAGES[*]}"
    exit 1
    ;;
esac