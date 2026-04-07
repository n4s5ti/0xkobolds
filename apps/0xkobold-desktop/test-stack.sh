#!/bin/bash
set -e

echo "=== 0xKobold Desktop Stack Verification ==="

# 1. Build check
echo "[1/5] Checking builds..."
[ -f dist/main/index.js ] && echo "  ✓ Main built" || exit 1
[ -f dist/preload/index.mjs ] && echo "  ✓ Preload built" || exit 1

# 2. Dev server responds
echo "[2/5] Checking dev server..."
bun run dev &
DEV_PID=$!
sleep 5

if curl -s http://localhost:5173/ >/dev/null; then
  echo "  ✓ Dev server responds"
else  
  echo "  ✗ Dev server not responding"
  kill $DEV_PID 2>/dev/null
  exit 1
fi

# 3. Gateway is accessible
echo "[3/5] Checking gateway..."
if curl -s http://localhost:18789 >/dev/null 2>&1 || [ "$?" -eq 52 ]; then
  echo "  ✓ Gateway running (WebSocket on :18789)"
else
  echo "  ⚠ Gateway may need check"
fi

# 4. API types check
echo "[4/5] Checking IPC bindings..."
ode -e "const fs=require('fs'); const content=fs.readFileSync('./src/shared/ipc-channels.ts','utf8'); if(content.includes('IPC_CHANNELS')) console.log('  ✓ IPC channels defined'); else process.exit(1);"

# 5. Component check
echo "[5/5] Checking renderer components..."
for comp in Sidebar StatusBar WelcomePanel KoboldChatPanel; do
  [ -f "src/renderer/components/${comp}.ts" ] && echo "  ✓ ${comp} exists"
done

kill $DEV_PID 2>/dev/null || true
echo ""
echo "=== Stack verification complete ==="
