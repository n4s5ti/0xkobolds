# Changelog

## 0.2.0 (2026-04-07)

### Phase 2 & 3 Features

- **WebSocket transport**: `WebSocketClientTransport` from SDK, `/mcp add-ws` command, auto-detect `ws://`/`wss://` URLs
- **Tool filtering**: Per-server `allowedTools`/`deniedTools` in config, `/mcp filter` command
- **Roots support**: `roots/list` handler registered on MCP client, returns workspace roots
- **Env variable interpolation**: `${VAR}` patterns in `env` and `headers` resolved from `process.env`
- **Config migration hardening**: Old `{ url }` format → `streamable-http`/`websocket`, validates required fields
- **Error handling**: Descriptive messages (ENOENT → "Command not found", ECONNREFUSED, timeout), connect timeout (30s), tool call timeout (60s)
- **69 tests, 134 assertions** across unit + integration test suites

## 0.1.0 (2026-04-07)

### Initial Release

- **MCP Client** using official `@modelcontextprotocol/sdk` v1.29.0
- **Three transport types**: stdio, SSE, StreamableHTTP
- **Auto tool registration**: MCP tools appear as native pi tools with `mcp_<server>_<tool>` naming
- **Resource access**: Read MCP server resources via `mcp_<server>_read_resource`
- **Prompt access**: Get MCP prompt templates via `mcp_<server>_get_prompt`
- **Auto-reconnect**: Configurable with exponential backoff
- **Claude Desktop import**: Import servers from `~/.claude/mcp.json` and `~/.config/claude-code/mcp.json`
- **10 subcommands**: list, connect, disconnect, enable, disable, add, add-http, remove, refresh, import
- **2 pi tools**: `mcp_discover` (list available capabilities), `mcp_call_tool` (direct tool invocation)
- **Config at `~/.0xkobold/mcp.json`**
- **Full lifecycle management**: Auto-connect on startup, graceful disconnect on shutdown