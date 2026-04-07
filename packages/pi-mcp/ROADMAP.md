# pi-mcp Roadmap

> Task list for `@0xkobold/pi-mcp` — Model Context Protocol integration for pi-coding-agent

## 🔴 Critical (Ship Blockers)

- [x] **TASK-01: Runtime smoke test** — All 18 tests pass. Extension loads, config works, live MCP server connects.
- [x] **TASK-02: Connect to a real MCP server** — `@modelcontextprotocol/server-filesystem` via stdio: 14 tools discovered, `list_directory` + `read_text_file` executed successfully.
- [x] **TASK-03: Remove/archive old mcp-extension.ts** — Moved to `packages/deprecated/mcp-extension.ts`, all references cleaned up (pi-config.ts, index.ts, setup.ts, SOURCE_AUDIT.md).

## 🟡 High Priority (Quality)

- [x] **TASK-04: Unit tests** — 35 unit + 18 integration tests (53 total, 114 assertions). Config validation, migration, CRUD, error handling, onChange.
- [x] **TASK-05: WebSocket transport** — `WebSocketClientTransport` from SDK, `/mcp add-ws` command, auto-detect ws:// URLs in config.
- [x] **TASK-06: Config migration** — Old `{ url }` format maps to streamable-http/websocket. Validates names, commands, URLs, transport types.
- [x] **TASK-07: Error handling** — Descriptive errors, connection timeout (30s), tool call timeout (60s), config field validation.

## 🟢 Medium Priority (Polish)

- [x] **TASK-08: Tool filtering** — Per-server `allowedTools`/`deniedTools` in config + `/mcp filter` command. Mutual exclusivity validated. IsToolAllows logic tested.
- [ ] **TASK-09: Sampling support** — Client declares `sampling: {}` but doesn't handle sampling requests from servers; implement callback bridge to pi's LLM
- [x] **TASK-10: Roots support** — `roots/list` handler registered on client, returns workspace roots. Manager takes `workspaceRoots` constructor param.
- [ ] **TASK-11: Progressive tool registration** — For servers with many tools (50+), consider lazy registration or pagination instead of registering all on connect
- [ ] **TASK-12: TUI status widget** — Rich real-time connection dashboard using `setWidget` (currently status command is text-only, 15s timeout)

## 🔵 Low Priority (Nice-to-Have)

- [ ] **TASK-13: Server health monitoring** — Periodic ping/uptime tracking, show in `/mcp status`
- [ ] **TASK-14: Tool result caching** — Cache read-only resource results with configurable TTL
- [ ] **TASK-15: SSE transport headers** — Add header support to `SSEClientTransport` config (consistent with StreamableHTTP)
- [x] **TASK-16: Env variable interpolation** — `interpolateEnv()` resolves `${VAR}` patterns in env and headers. Applied at transport creation time.
- [ ] **TASK-17: Multi-project config** — Per-project `.0xkobold/mcp.json` that merges with global config

---

## Execution Plan

### Phase 1: Ship It (TASK-01 → TASK-03)
Get the package running and replace the old extension. ~1-2 hours.

### Phase 2: Harden (TASK-04 → TASK-07)
Tests, WebSocket, migration, error handling. Makes it production-ready. ~2-3 hours.

### Phase 3: Polish (TASK-08 → TASK-12)
Feature gaps vs the full MCP spec. Nice-to-have but expected by power users. ~3-4 hours.

### Phase 4: Enhancement (TASK-13 → TASK-17)
Quality-of-life improvements. Can be done incrementally. ~2-3 hours.