#!/bin/bash
# 0xKobold Desktop - Stack Verification Script
# Inspired by agent-browser snapshot/check pattern

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

echo "=========================================="
echo "  0xKobold Desktop Stack Verification"
echo "=========================================="
echo ""

# Layer 1: Build
echo "[Layer 1] Build Integrity"
if [ -f "dist/main/index.js" ]; then
  echo -e "  ${GREEN}✓${NC} Main process built"
else
  echo -e "  ${RED}✗${NC} Main process not built (run: bun run build:main)"
  ((ERRORS++))
fi

if [ -f "dist/preload/index.mjs" ]; then
  echo -e "  ${GREEN}✓${NC} Preload script built"
else
  echo -e "  ${RED}✗${NC} Preload script not built (run: bun run build:preload)"
  ((ERRORS++))
fi
if [ -d "dist/renderer" ]; then
  echo -e "  ${GREEN}✓${NC} Renderer built"
else
  echo -e "  ${YELLOW}⚠${NC} Renderer not built (optional for dev)"
fi
echo ""

# Layer 2: Dependencies
echo "[Layer 2] Dependencies"
if [ -d "node_modules/@0xkobold/pi-kobold" ]; then
  echo -e "  ${GREEN}✓${NC} @0xkobold/pi-kobold installed"
else
  echo -e "  ${RED}✗${NC} pi-kobold not installed (run: bun install)"
  ((ERRORS++))
fi

if [ -d "node_modules/@mariozechner/pi-agent-core" ]; then
  echo -e "  ${GREEN}✓${NC} pi-agent-core installed"
else
  echo -e "  ${RED}✗${NC} pi-agent-core not installed"
  ((ERRORS++))
fi
echo ""

# Layer 3: Configuration
echo "[Layer 3] Configuration"
if [ -f "src/main/pi-config.ts" ]; then
  echo -e "  ${GREEN}✓${NC} Desktop pi-config exists"
else
  echo -e "  ${RED}✗${NC} pi-config missing"
  ((ERRORS++))
fi

if grep -q "@0xkobold/pi-kobold" "src/main/pi-config.ts" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} pi-kobold extension registered"
else
  echo -e "  ${YELLOW}⚠${NC} pi-kobold not in extensions list"
fi
echo ""

# Layer 4: Components
echo "[Layer 4] Renderer Components"
COMPONENTS=("Sidebar" "StatusBar" "WelcomePanel" "KoboldChatPanel")
for comp in "${COMPONENTS[@]}"; do
  if [ -f "src/renderer/components/${comp}.ts" ]; then
    echo -e "  ${GREEN}✓${NC} ${comp}.ts"
  else
    echo -e "  ${RED}✗${NC} ${comp}.ts missing"
    ((ERRORS++))
  fi
done
echo ""

# Summary
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
  echo -e "  ${GREEN}All checks passed!${NC}"
  echo "  Run: bun run dev"
  exit 0
else
  echo -e "  ${RED}${ERRORS} check(s) failed${NC}"
  echo "  Fix issues above, then run: bun run build"
  exit 1
fi
