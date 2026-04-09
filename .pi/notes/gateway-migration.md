# Gateway Migration: src/gateway/ → pi-gateway (via pi-kobold)

**Goal:** Remove `src/gateway/` (6,000 lines) and use `pi-gateway` (loaded as a pi-kobold sub-extension) for all gateway functionality.

**Status: PLAN — Not yet started**

## Problem

Two parallel gateway implementations exist:
- **`src/gateway/`** (6,000 lines) — Core internal gateway, started at boot by `src/index.ts`
- **`packages/pi-gateway/`** (3,584 lines) — Pi extension, loaded as pi-kobold sub-extension via `pi.extensions`

Both implement WebSocket servers, platform adapters, and session management. pi-gateway has more features (pairing, allowlists, background tasks) but no programmatic API — it only exports an extension factory.

## Current Architecture

```
src/index.ts ──► src/gateway/ ──► src/index.ts auto-starts gateway on boot
               │                 src/cli/commands/gateway.ts (CLI command)
               │                 src/body/ (agent body integration)
               │                 src/channels/ (WhatsApp, Telegram, Slack)
               │                 src/sessions/types.ts (AgentStore types)

pi-kobold ──► pi.extensions ──► @0xkobold/pi-gateway loads in pi session
                                  (registers /gateway command + tools)
```

**Problem:** pi-gateway has no exported functions. `src/index.ts` can't call `piGateway.startGateway()`.

## What pi-gateway Already Has ✅

- WebSocket + HTTP server (`createServer` + `WebSocketServer`)
- Platform adapters (Discord, Telegram, Slack, Twitch, WhatsApp, WebSocket)
- Session management with reset policies (idle/daily/both)
- Security (allowlists, pairing codes)
- Background task support
- In-session `/gateway` command + 4 tools
- Config from `~/.0xkobold/gateway/config.json`

## What src/gateway/ Has That pi-gateway Lacks ❌

### Critical (blocks migration)

1. **Programmatic API** — pi-gateway only exports an extension factory. No `startGateway()`, `stopGateway()`, `getGateway()` exports. `src/index.ts` needs these to auto-start gateway at boot.

2. **Delivery system** (`delivery.ts` + `delivery-integration.ts` — 739 lines) — Proactive message delivery to platforms. Used by `src/body/gateway-integration.ts` and `src/index.ts`.

3. **AgentStore** (`persistence/AgentStore.ts` — 524 lines) — SQLite-backed agent registry. `src/sessions/types.ts` imports `AgentStatus`, `AgentType` from it.

4. **Channel adapters in src/channels/** — WhatsApp, Telegram, Slack each import `getGateway()` to forward messages.

### Nice-to-have (can migrate later)

5. **HeartbeatScheduler** (570 lines) — Cron-based heartbeat. Not used outside `src/gateway/`.
6. **CronScheduler** (556 lines) — General cron scheduling. Duplicated by `src/cron/scheduler.ts`.
7. **Queue modes** (`queue-modes.ts` — 446 lines) — Hermes-style message queuing.
8. **Gateway chat** (`gateway-chat.ts` — 339 lines) — Per-session chat management.
9. **Discord bot** (`discord-bot.ts` — 228 lines) — Full Discord.js bot. pi-gateway has a DiscordAdapter.
10. **Client module** (`client.ts` — 407 lines) — WebSocket client. pi-gateway spawns pi directly.
11. **Method handlers** (`methods/` — 1,106 lines) — JSON-RPC handlers. pi-gateway uses direct handlers.
12. **Protocol frames** (`protocol/` — 117 lines) — Wire protocol definitions.

## Migration Plan

### Phase 1: Add programmatic API to pi-gateway ⚡ Priority

pi-gateway needs exported functions so `src/index.ts` can start the gateway at boot without needing a pi session.

**Changes to `packages/pi-gateway/src/index.ts`:**
- [ ] Extract gateway state into a module-level singleton (already partly done — `state`, `server`, `wss`, `rpcProcess`)
- [ ] Export `startGatewayFromOutside(config?)` that creates the server + adapters without needing a pi session
- [ ] Export `stopGatewayFromOutside()`, `getGatewayStatus()`
- [ ] Add `"./api"` export in `package.json` exports map for programmatic use
- [ ] When pi-gateway extension loads in a pi session, attach to the already-running gateway instead of starting a new one

**New file: `packages/pi-gateway/src/api.ts`:**
```typescript
// Programmatic API for starting gateway outside of pi session
export function startGateway(config?: Partial<GatewayConfig>) { ... }
export function stopGateway() { ... }
export function getGatewayStatus() { ... }
```

**Update `packages/pi-gateway/package.json` exports:**
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./api": "./dist/api.js"
  }
}
```

### Phase 2: Move shared types out of src/gateway/

- [ ] Move `AgentStatus` and `AgentType` types from `src/gateway/persistence/AgentStore.ts` to `src/sessions/types.ts` (or a shared `src/types/` directory)
- [ ] Remove `src/gateway/index.ts` re-exports of `session-store` and `session-memory-bridge` (they're already in `src/memory/`)
- [ ] Remove `AgentStore` import from `src/sessions/types.ts`

### Phase 3: Add delivery system to pi-gateway

Two options:
- **Option A:** Move `delivery.ts` + `delivery-integration.ts` into pi-gateway
- **Option B:** Create `packages/pi-delivery/` as a separate package

Recommend **Option A** — delivery is gateway functionality.

- [ ] Move `src/gateway/delivery.ts` → `packages/pi-gateway/src/delivery.ts`
- [ ] Move `src/gateway/delivery-integration.ts` → `packages/pi-gateway/src/delivery-integration.ts`
- [ ] Add `./delivery` export to pi-gateway package.json
- [ ] Update `src/body/gateway-integration.ts` to import from `@0xkobold/pi-gateway/delivery`

### Phase 4: Update src/index.ts to use pi-gateway

- [ ] Replace `import { startGateway } from './gateway/index'` with `import { startGateway } from '@0xkobold/pi-gateway/api'`
- [ ] Replace `import { isGatewayRunning } from './gateway/gateway-server'` with pi-gateway API
- [ ] Replace `import { getGateway } from './gateway/gateway-server'` with pi-gateway API
- [ ] Replace `import { getDeliverySystem } from './gateway/delivery'` with `@0xkobold/pi-gateway/delivery`

### Phase 5: Update channel adapters

- [ ] `src/channels/whatsapp/integration.ts` — Replace `getGateway()` with pi-gateway API
- [ ] `src/channels/telegram/bot.ts` — Replace `getGateway()` with pi-gateway API
- [ ] `src/channels/slack/webhook.ts` — Replace `getGateway()` with pi-gateway API

### Phase 6: Delete src/gateway/ and src/cli/commands/gateway.ts

- [ ] Delete `src/gateway/` (6,000 lines across 20 files)
- [ ] Delete `src/cli/commands/gateway.ts` (203 lines) — replaced by pi-gateway's `/gateway` command
- [ ] Remove `createGatewayCommand` import from `src/cli/program.ts`
- [ ] Remove gateway-related code from `src/index.ts` boot sequence (pi-gateway handles its own startup)

### Phase 7: Handle remaining dependencies

- [ ] `src/body/gateway-integration.ts` — Rewrite to use pi-gateway types
- [ ] `src/cli/commands/daemon.ts` — Already deleted ✅
- [ ] `src/heartbeat/` — Uses `HeartbeatScheduler` from `src/gateway/`. Migrate or use pi-gateway's cron.
- [ ] Clean up `src/memory/` re-exports that went through `src/gateway/index.ts`

### Phase 8: Cleanup daemon references

- [ ] `src/cli/client.ts` — Remove daemon socket/client references (lines 25, 38-39, 97, 166)
- [ ] `src/cli/commands/agent.ts` — Remove "daemon not running" messages (lines 14, 253)
- [ ] `src/cli/commands/chat.ts` — Remove "daemon not running" messages (lines 17, 168)
- [ ] `src/cli/commands/init.ts` — Remove "0xkobold daemon start" help text (line 480)
- [ ] `src/cli/repl.ts` — Remove daemon status check references (lines 39, 50-54, 112-114)
- [ ] `src/cli/commands/start.ts` — Remove `--daemon` option (line 15)

## Open Questions

1. **Auto-start behavior** — Currently `src/index.ts` auto-starts the gateway. With pi-gateway, should the gateway start when pi-kobold loads (via `pi.extensions`), or should `src/index.ts` call `startGateway()` from pi-gateway's programmatic API?
   → **Recommendation:** pi-gateway should auto-start when pi-kobold loads it as a sub-extension. No need for `src/index.ts` to start it separately. The `pi.extensions` mechanism already handles this.

2. **Body system integration** — `src/body/gateway-integration.ts` receives a `RealGatewayServer` and `DeliverySystem` at startup. With pi-gateway, these would come from pi-gateway's internal state.
   → **Recommendation:** pi-gateway should export a `getGatewayState()` function that returns the running server + delivery system.

3. **Channel adapters** — `src/channels/` has its own WhatsApp/Telegram/Slack adapters that call `getGateway()`. pi-gateway has adapters too. Which to keep?
   → **Recommendation:** Use pi-gateway's adapters. They're more complete and maintained.

4. **JSON-RPC vs direct** — `src/gateway/` uses JSON-RPC for agent↔gateway communication. pi-gateway spawns a pi process directly. Which model?
   → **Recommendation:** pi-gateway's direct approach is simpler and works with pi's extension system. JSON-RPC adds complexity for no benefit in this context.

5. **What about features only in src/gateway/** — HeartbeatScheduler, CronScheduler, QueueModes, GatewayChat, AgentStore, Client module?
   → **Recommendation:** Migrate only what's actively used. Most of these are only used within `src/gateway/` itself. The externally-used ones (AgentStore types, delivery) get migrated. The rest dies with `src/gateway/`.

## Estimated Effort

| Phase | Description | Time |
|-------|-------------|------|
| 1 | Add programmatic API to pi-gateway | 2-3 hrs |
| 2 | Move shared types out of gateway | 1 hr |
| 3 | Add delivery system to pi-gateway | 1-2 hrs |
| 4 | Update src/index.ts | 1 hr |
| 5 | Update channel adapters | 1-2 hrs |
| 6 | Delete src/gateway/ | 30 min |
| 7 | Handle remaining deps | 2-3 hrs |
| 8 | Cleanup daemon refs | 1 hr |
| **Total** | | **~9-13 hrs** |