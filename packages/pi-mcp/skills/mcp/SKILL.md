---
name: mcp
description: Use MCP (Model Context Protocol) to connect to external tool servers. Use when the user needs to connect to MCP servers, use MCP tools, access MCP resources, or manage MCP server connections. Triggers include "connect to MCP server", "use MCP tools", "MCP server", "add MCP server", "list MCP tools", or any task requiring Model Context Protocol access.
---

# MCP - Model Context Protocol

## Overview

This skill provides Model Context Protocol (MCP) integration, allowing the agent to connect to any MCP-compatible server and use its tools, resources, and prompts natively.

**MCP** is an open protocol that standardizes how AI models interact with external tools and data sources. Any MCP server can provide tools, resources, and prompts.

## When to Use

- User wants to connect to an MCP server
- User mentions "MCP" or "Model Context Protocol"
- User wants to use tools from external services via MCP
- User wants to import servers from Claude Desktop config
- User needs to access resources or prompts from MCP servers

## Tool Reference

| Tool | Description |
|------|-------------|
| `mcp_discover` | List all available MCP tools/resources/prompts |
| `mcp_call_tool` | Call a specific MCP tool by server + tool name |
| `mcp_<server>_<tool>` | Individual tools from connected servers (auto-registered) |
| `mcp_<server>_read_resource` | Read a resource from an MCP server |
| `mcp_<server>_get_prompt` | Get a prompt template from an MCP server |

## Commands

| Command | Description |
|---------|-------------|
| `/mcp` | Show MCP help |
| `/mcp list` | List all configured servers |
| `/mcp connect <name>` | Connect to a server |
| `/mcp disconnect <name>` | Disconnect from a server |
| `/mcp enable <name>` | Enable auto-connect |
| `/mcp disable <name>` | Disable auto-connect |
| `/mcp add <name> <cmd> [args]` | Add stdio server |
| `/mcp add-http <name> <url>` | Add HTTP server |
| `/mcp remove <name>` | Remove a server |
| `/mcp refresh <name>` | Re-discover tools |
| `/mcp import` | Import from Claude Desktop |
| `/mcp status` | Show active connections |

## Transport Types

### stdio
Local process communication via stdin/stdout. Best for local tools.
```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
  "env": {}
}
```

### streamable-http
Modern HTTP-based transport. Best for remote servers.
```json
{
  "type": "streamable-http",
  "url": "https://example.com/mcp"
}
```

### sse (legacy)
Server-Sent Events transport. Legacy but still supported.
```json
{
  "type": "sse",
  "url": "https://example.com/sse"
}
```

## Configuration

Config file: `~/.0xkobold/mcp.json`

```json
{
  "servers": [
    {
      "name": "my-server",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@example/mcp-server"]
      },
      "enabled": true,
      "autoReconnect": true,
      "maxReconnectAttempts": 5,
      "reconnectDelayMs": 1000
    }
  ],
  "importClaudeDesktop": true
}
```

## Examples

```
User: "Connect to the filesystem MCP server"
Command: /mcp connect filesystem

User: "What MCP tools are available?"
Tool: mcp_discover({})

User: "Add a GitHub MCP server"
Command: /mcp add github npx -y @modelcontextprotocol/server-github

User: "Import my servers from Claude Desktop"
Command: /mcp import
```

## Popular MCP Servers

| Server | Package | Description |
|--------|---------|-------------|
| Filesystem | `@modelcontextprotocol/server-filesystem` | File system access |
| GitHub | `@modelcontextprotocol/server-github` | GitHub API |
| SQLite | `@modelcontextprotocol/server-sqlite` | SQLite database |
| Brave Search | `@modelcontextprotocol/server-brave-search` | Web search |
| PostgreSQL | `@modelcontextprotocol/server-postgres` | PostgreSQL database |
| Google Drive | `@modelcontextprotocol/server-google-drive` | Google Drive |
| Slack | `@modelcontextprotocol/server-slack` | Slack API |

More servers: https://github.com/modelcontextprotocol/servers