# AGENT.md — pi-mcp

## Project Overview

`@0xkobold/pi-mcp` is a pi-coding-agent extension that provides **Model Context Protocol (MCP)** integration. It connects to any MCP server (stdio, SSE, StreamableHTTP, WebSocket) and exposes the server's tools, resources, and prompts as native pi tools.

**Core dependency**: `@modelcontextprotocol/sdk` (^1.29.0) — the official MCP client SDK.

**Runtime**: Bun (uses `bun test`). TypeScript with ESM (`"type": "module"`).

## Architecture

```
src/
├── index.ts          # Extension entry point — registers /mcp command, mcp_discover & mcp_call_tool tools, lifecycle hooks
├── client/
│   └── index.ts      # MCPConnectionManager — SDK-based client, transport creation, discovery, reconnect, ResourceCache, env interpolation
├── config/
│   └── index.ts      # Config loading/saving — ~/.0xkobold/mcp.json, project-local merge, Claude Desktop import, CRUD, normalization
└── tools/
    └── index.ts      # Tool bridge — converts MCP tool/resource/prompt definitions into pi registerTool() calls, filtering, dispatch mode
```

### Key Abstractions

| Abstraction | File | Role |
|---|---|---|
| `MCPConnectionManager` | `client/index.ts` | Manages SDK Client instances per server. Handles connect/disconnect/reconnect, discovery, tool calls, resource reads, prompt gets. Owns `ResourceCache`. |
| `MCPConfig` / `MCPServerConfig` | `config/index.ts` | Typed config model. Loaded from `~/.0xkobold/mcp.json` + `.0xkobold/mcp.json` (project-local override by name). |
| `ConnectionInfo` | `client/index.ts` | Read-only snapshot of a connection's state — status, discovered tools/resources/prompts, health stats. |
| `registerServerTools()` | `tools/index.ts` | Bridges MCP → pi tool registration. Handles `allowedTools`/`deniedTools` filtering, progressive registration (dispatch mode when tools > `maxTools`). |

### Data Flow

1. Extension loads → `loadConfig()` reads `~/.0xkobold/mcp.json` + project-local merge
2. Auto-connect to `enabled` servers → `MCPConnectionManager.connect()` → SDK `Client.connect(transport)` → discover tools/resources/prompts
3. `registerServerTools()` converts each MCP tool → `pi.registerTool()` with `mcp_<server>_<tool>` naming
4. Agent calls pi tool → `MCPConnectionManager.callTool()` → SDK `client.callTool()` → MCP server → result formatted back
5. `onChange` callbacks re-register/unregister tools when connection status changes

## Coding Conventions

- **NASA 10 Rules** — No recursion, no dynamic memory after init, fixed bounds, assertions via `console.assert()`, minimal scope, check all returns
- **DRY** — Single source of truth: config schema in `config/`, transport types in `client/`, tool registration in `tools/`
- **KISS** — Plain JSON config (no ORM), prefix-based tool naming, simple Map-based connections
- **FP** — Pure functions for config operations (`upsertServer`, `removeServer`, `toggleServer`, `mergeProjectConfig` return new objects)

## Important Patterns

### Tool Naming
- Individual tools: `mcp_<server>_<tool>` (e.g., `mcp_filesystem_read_file`)
- Dispatch mode (50+ tools): `mcp_<server>_call` + `mcp_<server>_tools`
- Resources: `mcp_<server>_read_resource`
- Prompts: `mcp_<server>_get_prompt`

### Transport Creation
`MCPConnectionManager.createTransport()` switches on `config.transport.type`:
- `"stdio"` → `StdioClientTransport` (spawn local process)
- `"sse"` → `SSEClientTransport` (legacy HTTP/SSE)
- `"streamable-http"` → `StreamableHTTPClientTransport` (modern HTTP)
- `"websocket"` → `WebSocketClientTransport` (real-time bidirectional)

### Config Merging
Global config (`~/.0xkobold/mcp.json`) is loaded first. If `.0xkobold/mcp.json` exists in the project directory, it's merged — project servers override global servers by name.

### Env Interpolation
`${ENV_VAR}` patterns in `env` and `headers` config values are resolved at transport creation time via `interpolateEnv()`. Missing env vars emit warnings and resolve to empty string.

### Schema Conversion
MCP tool `inputSchema` (JSON Schema) is converted to TypeBox schemas via `mcpSchemaToTypeBox()`. Falls back to `Type.Object({})` on conversion failure.

## Commands Reference

All accessed via `/mcp <subcommand>`:

| Subcommand | Purpose |
|---|---|
| `list` | List configured servers with status |
| `connect <name>` | Connect to a configured server |
| `disconnect <name>` | Disconnect from a server |
| `enable <name>` | Enable auto-connect on startup |
| `disable <name>` | Disable auto-connect + disconnect |
| `add <name> <cmd> [args]` | Add stdio server (disabled) |
| `add-http <name> <url>` | Add HTTP server (disabled) |
| `add-ws <name> <url>` | Add WebSocket server (disabled) |
| `remove <name>` | Remove server from config |
| `filter <name> allow\|deny\|clear <tools>` | Tool allowlist/denylist |
| `refresh <name>` | Re-discover tools/resources/prompts |
| `import` | Import from Claude Desktop config |
| `status` | Show active connections with health stats |
| `tools <name>` | List tools for a connected server |

## Testing

```bash
bun test                        # All tests (~95 tests, 182 assertions)
bun test test/unit.test.ts      # Unit tests only (config, client, tools, edge cases)
bun test test/integration.test  # Integration tests (requires npx for live MCP server)
```

Test structure:
- **Unit tests** — Config normalization/migration/CRUD, `interpolateEnv()`, `ResourceCache` TTL/eviction, `isToolAllowed()`, `MCPConnectionManager` error handling
- **Integration tests** — Extension module loading, config file I/O, live MCP server connection (`@modelcontextprotocol/server-filesystem`)

## Build

```bash
bun run build    # tsc → dist/
bun run dev      # tsc --watch
```

Output: `dist/` with declaration files. Entry points per `package.json` exports: `.` (main), `./client`, `./config`.

## Exports

| Path | What's Exported |
|---|---|
| `@0xkobold/pi-mcp` | Extension default export (function), `MCPConnectionManager`, `ConnectionInfo`, `MCPServerConfig`, config functions |
| `@0xkobold/pi-mcp/client` | `MCPConnectionManager`, `ResourceCache`, `interpolateEnv`, all client types |
| `@0xkobold/pi-mcp/config` | `loadConfig`, `saveConfig`, `normalizeConfig`, `upsertServer`, `removeServer`, `toggleServer`, `mergeProjectConfig`, etc. |

## Config File Location

- **Global**: `~/.0xkobold/mcp.json`
- **Project-local**: `<cwd>/.0xkobold/mcp.json` (merged, project overrides global by name)
- **Claude Desktop import sources**: `~/.claude/mcp.json`, `~/.config/claude-code/mcp.json`

## Common Gotchas

- **`unregisterServerTools()` is best-effort** — pi-coding-agent lacks `unregisterTool()`, so the extension only clears its internal tracking Map.
- **Sampling returns a placeholder** — The default `SamplingHandler` logs and returns a message saying LLM completion isn't available. Custom handlers can be injected via the `MCPConnectionManager` constructor.
- **Preload is CJS in the desktop app** — This package is ESM-only, but if consumed by the desktop app, it goes through the pi-coding-agent extension loader which handles ESM.
- **Tool count > 50 triggers dispatch mode** — Instead of registering 50+ individual tools, a single `mcp_<server>_call` dispatch tool is registered. Configurable per-server via `maxTools`.