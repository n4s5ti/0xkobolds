# @0xkobold/pi-mcp

> Model Context Protocol (MCP) integration for [pi-coding-agent](https://github.com/nicholasgasior/pi-coding-agent)

Connect to any MCP server and use its tools, resources, and prompts natively within your pi agent.

## Features

- 🌐 **Four Transport Types** - stdio, SSE, StreamableHTTP, and WebSocket
- 🔧 **Auto Tool Registration** - MCP tools appear as native pi tools
- 🔒 **Tool Filtering** - Allowlist/denylist to control which tools are registered
- 📦 **Resource Access** - Read MCP server resources directly
- 💬 **Prompt Templates** - Use MCP prompt templates
- 🌱 **Roots Support** - Servers can discover workspace roots
- 🔄 **Auto-Reconnect** - Reconnects on disconnect with exponential backoff
- 🔐 **Env Interpolation** - `${VAR}` in config resolved from environment
- 📥 **Claude Desktop Import** - Import servers from `~/.claude/mcp.json`
- ⚙️ **Hot Config** - Add/remove servers without restart (commands)

## Quick Start

### 1. Configure servers

Edit `~/.0xkobold/mcp.json`:

```json
{
  "servers": [
    {
      "name": "filesystem",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
      },
      "enabled": true,
      "autoReconnect": true
    }
  ],
  "importClaudeDesktop": true
}
```

### 2. Or use commands

```
/mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /home/user
/mcp enable filesystem
/mcp connect filesystem
```

### 3. Use tools

The agent will automatically discover and use MCP tools. You can also:

```
/mcp list          # See all configured servers
/mcp status        # See active connections
/mcp discover      # Find available tools
```

## Commands

| Command | Description |
|---------|-------------|
| `/mcp` | Show help |
| `/mcp list` | List all configured servers |
| `/mcp connect <name>` | Connect to a server |
| `/mcp disconnect <name>` | Disconnect from a server |
| `/mcp enable <name>` | Enable auto-connect for a server |
| `/mcp disable <name>` | Disable auto-connect for a server |
| `/mcp add <name> <cmd> [args]` | Add a stdio server |
| `/mcp add-http <name> <url>` | Add an HTTP server |
| `/mcp add-ws <name> <url>` | Add a WebSocket server |
| `/mcp filter <name> allow <tools>` | Only register listed tools for server |
| `/mcp filter <name> deny <tools>` | Register all except listed tools |
| `/mcp filter <name> clear` | Remove tool filters for server |
| `/mcp remove <name>` | Remove a server from config |
| `/mcp refresh <name>` | Re-discover tools/resources/prompts |
| `/mcp import` | Import servers from Claude Desktop config |
| `/mcp status` | Show active connections |

## Tools

| Tool | Description |
|------|-------------|
| `mcp_discover` | List available MCP tools, resources, and prompts |
| `mcp_call_tool` | Call any MCP tool by server + tool name |
| `mcp_<server>_<tool>` | Individual tools (auto-registered per server) |
| `mcp_<server>_read_resource` | Read a resource from an MCP server |
| `mcp_<server>_get_prompt` | Get a prompt from an MCP server |

## Transport Types

### stdio
Spawns a local process and communicates via stdin/stdout:
```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
  "env": { "API_KEY": "..." },
  "cwd": "/working/dir"
}
```

### StreamableHTTP
Modern HTTP transport (recommended for remote servers):
```json
{
  "type": "streamable-http",
  "url": "https://example.com/mcp",
  "headers": { "Authorization": "Bearer ..." }
}
```

### SSE (legacy)
Server-Sent Events transport:
```json
{
  "type": "sse",
  "url": "https://example.com/sse"
}
```

### WebSocket
Real-time bidirectional transport:
```json
{
  "type": "websocket",
  "url": "ws://localhost:8080/mcp"
}
```

## Tool Filtering

Control which tools are registered per server using allowlist or denylist:

```json
// Only register specific tools (allowlist)
{
  "name": "filesystem",
  "allowedTools": ["read_file", "list_directory"],
  ...
}

// Register all except (denylist)
{
  "name": "github",
  "deniedTools": ["delete_repository", "create_issue"],
  ...
}
```

Or via commands:
```
/mcp filter github allow search_repositories,get_file_contents
/mcp filter filesystem deny write_file,delete_file
/mcp filter github clear
```

## Environment Variable Interpolation

Use `${ENV_VAR}` patterns in config values to avoid hardcoding secrets:

```json
{
  "name": "github",
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

HTTP headers also support interpolation:
```json
{
  "transport": {
    "type": "streamable-http",
    "url": "https://api.example.com/mcp",
    "headers": {
      "Authorization": "Bearer ${API_TOKEN}"
    }
  }
}
```

## Architecture

```
src/
├── index.ts          # Extension entry point (commands, tools, lifecycle)
├── client/
│   └── index.ts      # MCPConnectionManager - SDK-based client connections
├── config/
│   └── index.ts      # Config loading/saving, Claude Desktop import
└── tools/
    └── index.ts      # Tool bridge - MCP tools → pi tools
```

## Configuration

**Config file**: `~/.0xkobold/mcp.json`

**Full schema**:
```json
{
  "servers": [
    {
      "name": "string (required)",
      "transport": {
        "type": "stdio | sse | streamable-http | websocket",
        // stdio fields:
        "command": "string",
        "args": ["string"],
        "env": {},
        "cwd": "string",
        // http/sse fields:
        "url": "string",
        "headers": {},
        "sessionId": "string",
        // websocket fields:
        "url": "ws://..."
      },
      "enabled": false,
      "autoReconnect": true,
      "maxReconnectAttempts": 5,
      "reconnectDelayMs": 1000,
      "connectTimeoutMs": 30000,
      "allowedTools": ["tool_name"],
      "deniedTools": ["tool_name"]
    }
  ],
  "importClaudeDesktop": true
}
```

## Claude Desktop Compatibility

Set `"importClaudeDesktop": true` to automatically discover servers from:
- `~/.claude/mcp.json`
- `~/.config/claude-code/mcp.json`

Or run `/mcp import` to manually import.

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Development watch
bun run dev

# Test
bun test    # 69 tests, 134 assertions
bun test test/unit.test.ts  # Unit tests only
bun test test/integration.test.ts  # Integration tests (requires npx)
```

## License

MIT