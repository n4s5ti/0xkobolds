# Gateway Migration: src/gateway/ → pi-gateway (via pi-kobold)

**Goal:** Remove `src/gateway/` (6,000 lines) and use `pi-gateway` (loaded as a pi-kobold sub-extension) for all gateway functionality.

**Status: ✅ COMPLETE**

## Summary

- **Deleted:** `src/gateway/` (6,000+ lines), `src/channels/` (874 lines), `src/cli/commands/gateway.ts`, `src/cli/commands/whatsapp.ts`, `src/cli/commands/telegram.ts`, `config/` (632 lines), `daemon/` (29 lines), `src/cli/commands/daemon.ts` (204 lines), plus 15 dead extensions (7,952 lines)
- **Total lines removed:** ~16,000+
- **Replaced by:** `@0xkobold/pi-gateway@0.6.0` with programmatic API

## Completed Phases

### ✅ Phase 1: Add programmatic API to pi-gateway
- Created `packages/pi-gateway/src/api.ts` with `startGateway()`, `stopGateway()`, `isGatewayRunning()`, `getStatus()`, etc.
- `index.ts` (extension factory) imports from `api.ts` and shares state
- Added `"./api"` export in package.json
- Published `@0xkobold/pi-gateway@0.6.0` to npm

### ✅ Phase 2: Move shared types out of src/gateway/
- Inlined `AgentStatus` and `AgentType` types in `src/sessions/types.ts`
- Removed `src/gateway/index.ts` re-exports of session-store and session-memory-bridge

### ✅ Phase 3: Add delivery system to pi-gateway
- Moved `delivery.ts` → `src/delivery/index.ts` (independent of gateway)
- Created `src/delivery/integration.ts` with simplified adapter interfaces
- No dependency on `RealGatewayServer` or `src/gateway/`

### ✅ Phase 4: Update src/index.ts to use pi-gateway API
- Replaced `import { startGateway } from './gateway/index'` with `import from '@0xkobold/pi-gateway/api'`
- Gateway auto-starts via pi-gateway programmatic API at boot
- Default port changed from 7777 to 3847
- `noAgent: true` since pi is already running the session

### ✅ Phase 5: Remove dead channel adapters
- Deleted `src/channels/` (WhatsApp, Telegram, Slack integrations)
- pi-gateway has its own adapters
- Deleted `src/cli/commands/whatsapp.ts` and `telegram.ts`

### ✅ Phase 6: Delete src/gateway/ and gateway CLI
- Deleted `src/gateway/` (all 20 files)
- Deleted `src/cli/commands/gateway.ts` (replaced by pi-gateway's `/gateway` command)
- Removed gateway command from `src/cli/program.ts`

### ✅ Phase 7: Handle remaining dependencies
- Rewrote `src/body/gateway-integration.ts` to use simple duck-typed interfaces instead of `RealGatewayServer`/`DeliverySystem`
- Updated `src/delivery/integration.ts` to use broadcast functions

### ✅ Phase 8: Cleanup daemon/gateway references
- Renamed daemon → gateway in `client.ts`, `chat.ts`, `agent.ts`, `repl.ts`
- Removed dead help text from `init.ts`
- Updated `start.ts` flag description

## Architecture After Migration

```
src/index.ts ──► @0xkobold/pi-gateway/api ──► startGateway({ noAgent: true })
               │                              isGatewayRunning()
               │                              broadcast()
               │
               └──► src/delivery/ ──► getDeliverySystem()
                                       initDeliveryFromBroadcast()

pi-kobold ──► pi.extensions ──► @0xkobold/pi-gateway loads in pi session
                                  (registers /gateway command + tools)
                                  shares state with api.ts
```

## What Was Lost (Intentional)

These `src/gateway/` features were NOT migrated and are now gone:
- **AgentStore** (524 lines) — SQLite-backed agent registry. Only `src/sessions/types.ts` used the types, which were inlined.
- **HeartbeatScheduler** (570 lines) — Cron-based heartbeat. Not used outside `src/gateway/`.
- **CronScheduler** (556 lines) — Duplicated by `src/cron/scheduler.ts`.
- **QueueModes** (446 lines) — Hermes-style message queuing. Not used outside gateway.
- **GatewayChat** (339 lines) — Per-session chat context. Not used outside gateway.
- **DiscordBot** (228 lines) — pi-gateway has DiscordAdapter instead.
- **Client module** (407 lines) — WebSocket client. pi-gateway spawns pi directly.
- **Method handlers** (1,106 lines) — JSON-RPC handlers. pi-gateway uses direct handlers.
- **Protocol frames** (117 lines) — Wire protocol. pi-gateway uses WebSocket messages.
- **Channel adapters** (874 lines) — pi-gateway has its own adapters.

## Version Pinning

| Package | Version | Pinned? |
|---------|---------|---------|
| `@0xkobold/pi-gateway` | 0.6.0 | In pi-kobold |
| `@0xkobold/pi-ollama` | 0.4.1 | Exact |
| `@0xkobold/pi-kobold` | 0.7.1 | - |