/**
 * pi-mcp - Model Context Protocol Extension for pi-coding-agent
 *
 * Connects to MCP servers (stdio, SSE, StreamableHTTP) and exposes
 * their tools, resources, and prompts as native pi tools.
 *
 * Architecture:
 * - client/     MCPConnectionManager - SDK-based client connections
 * - config/     Load/save MCP server configs from ~/.0xkobold/mcp.json
 * - tools/      Tool bridge - registers MCP tools as pi tools
 *
 * Commands:
 *   /mcp              Show MCP status & help
 *   /mcp list         List all configured servers
 *   /mcp connect      Connect to a server
 *   /mcp disconnect   Disconnect from a server
 *   /mcp enable       Enable auto-connect for a server
 *   /mcp disable      Disable auto-connect for a server
 *   /mcp add          Add a new server
 *   /mcp remove       Remove a server
 *   /mcp refresh      Re-discover tools for a server
 *   /mcp import       Import servers from Claude Desktop config
 *
 * Tools:
 *   mcp_discover      List all available MCP tools/resources/prompts
 *   mcp_<server>_*    Individual tools from connected servers
 *
 * NASA 10 Rules: No recursion, no dynamic memory, fixed bounds, assertions
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { MCPConnectionManager } from "./client/index.js";
import type { ConnectionInfo, MCPServerConfig, ServerTransportConfig } from "./client/index.js";
import {
  loadConfig,
  saveConfig,
  importClaudeDesktopServers,
  getEnabledServers,
  upsertServer,
  removeServer,
  toggleServer,
  type MCPConfig,
} from "./config/index.js";
import {
  registerServerTools,
  unregisterServerTools,
} from "./tools/index.js";

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let manager: MCPConnectionManager | null = null;
let config: MCPConfig | null = null;
let globalCtx: ExtensionContext | null = null;

// ---------------------------------------------------------------------------
// Main extension
// ---------------------------------------------------------------------------

export default async function mcpExtension(pi: ExtensionAPI): Promise<void> {
  console.assert(pi !== null, "pi must not be null");
  console.assert(pi !== undefined, "pi must not be undefined");

  manager = new MCPConnectionManager([process.cwd()]);
  config = loadConfig();

  // -----------------------------------------------------------------------
  // Auto-connect to enabled servers
  // -----------------------------------------------------------------------

  const enabledServers = getEnabledServers(config);
  for (const server of enabledServers) {
    try {
      const info = await manager.connect(server);
      registerServerTools(pi, manager, info);
      console.log(`[MCP] Auto-connected: ${server.name} (${info.tools.length} tools)`);
    } catch (err) {
      console.warn(`[MCP] Auto-connect failed for ${server.name}:`, err);
    }
  }

  // -----------------------------------------------------------------------
  // Listen for connection changes
  // -----------------------------------------------------------------------

  manager.onChange((name, info) => {
    if (info.status === "ready") {
      registerServerTools(pi, manager!, info);
    } else if (info.status === "disconnected" || info.status === "error") {
      unregisterServerTools(name);
    }
  });

  // -----------------------------------------------------------------------
  // Register pi commands
  // -----------------------------------------------------------------------

  pi.registerCommand("mcp", {
    description: "Manage MCP (Model Context Protocol) server connections",
    getArgumentCompletions: (prefix: string) => {
      const cmds = [
        "list", "connect", "disconnect", "enable", "disable",
        "add", "add-stdio", "add-http", "add-ws", "remove", "filter", "refresh", "import", "status",
      ];
      return cmds.filter((c) => c.startsWith(prefix)).map((c) => ({ value: c, label: c }));
    },
    handler: async (args: string, ctx) => {
      const parts = args.split(/\s+/).filter(Boolean);
      const subcmd = parts[0]?.toLowerCase();
      const nameArg = parts[1];

      switch (subcmd) {
        // ----- LIST -----
        case "list": {
          const serverList = config!.servers;
          const lines: string[] = ["🔌 MCP Servers\n"];

          for (const server of serverList) {
            const info = manager!.getConnectionInfo(server.name);
            const status = info?.status ?? (server.enabled ? "disconnected" : "disabled");
            const emoji = statusEmoji(status);
            lines.push(`${emoji} ${server.name} (${server.transport.type})`);
            lines.push(`   Status: ${status}`);
            if (info?.tools?.length) {
              lines.push(`   Tools: ${info.tools.length} | Resources: ${info.resources.length} | Prompts: ${info.prompts.length}`);
            }
            if (server.allowedTools?.length) {
              lines.push(`   Allowed: ${server.allowedTools.join(", ")}`);
            }
            if (server.deniedTools?.length) {
              lines.push(`   Denied: ${server.deniedTools.join(", ")}`);
            }
            lines.push("");
          }

          ctx.ui.notify(lines.join("\n"), "info");
          return;
        }

        // ----- CONNECT -----
        case "connect": {
          if (!nameArg) {
            ctx.ui.notify("Usage: /mcp connect <server-name>", "error");
            return;
          }

          const server = config!.servers.find((s) => s.name === nameArg);
          if (!server) {
            ctx.ui.notify(`Server '${nameArg}' not found in config. Use /mcp add first.`, "error");
            return;
          }

          ctx.ui.notify(`Connecting to ${nameArg}...`, "info");
          try {
            const info = await manager!.connect(server);
            registerServerTools(pi, manager!, info);
            ctx.ui.notify(
              `✅ Connected to ${nameArg}\n` +
              `Tools: ${info.tools.length} | Resources: ${info.resources.length} | Prompts: ${info.prompts.length}`,
              "info"
            );
          } catch (err) {
            ctx.ui.notify(`❌ Failed to connect to ${nameArg}: ${err}`, "error");
          }
          return;
        }

        // ----- DISCONNECT -----
        case "disconnect": {
          if (!nameArg) {
            ctx.ui.notify("Usage: /mcp disconnect <server-name>", "error");
            return;
          }

          await manager!.disconnect(nameArg);
          unregisterServerTools(nameArg);
          ctx.ui.notify(`Disconnected from ${nameArg}`, "info");
          return;
        }

        // ----- ENABLE -----
        case "enable": {
          if (!nameArg) {
            ctx.ui.notify("Usage: /mcp enable <server-name>", "error");
            return;
          }

          config = toggleServer(config!, nameArg);
          const server = config.servers.find((s) => s.name === nameArg);
          if (!server?.enabled) {
            ctx.ui.notify(`Server '${nameArg}' not found`, "error");
            return;
          }

          saveConfig(config);
          ctx.ui.notify(`✅ Enabled ${nameArg}. Use /mcp connect ${nameArg} to connect.`, "info");
          return;
        }

        // ----- DISABLE -----
        case "disable": {
          if (!nameArg) {
            ctx.ui.notify("Usage: /mcp disable <server-name>", "error");
            return;
          }

          config = toggleServer(config!, nameArg);
          saveConfig(config);
          await manager!.disconnect(nameArg);
          unregisterServerTools(nameArg);
          ctx.ui.notify(`Disabled ${nameArg}`, "info");
          return;
        }

        // ----- ADD STDIO -----
        case "add":
        case "add-stdio": {
          if (!nameArg || !parts[2]) {
            ctx.ui.notify("Usage: /mcp add <name> <command> [args...]", "error");
            return;
          }

          const newServer: MCPServerConfig = {
            name: nameArg,
            transport: {
              type: "stdio",
              command: parts[2],
              args: parts.slice(3),
            },
            enabled: false,
            autoReconnect: true,
          };

          config = upsertServer(config!, newServer);
          saveConfig(config);
          ctx.ui.notify(`Added stdio server: ${nameArg}. Use /mcp enable ${nameArg} then /mcp connect ${nameArg}.`, "info");
          return;
        }

        // ----- ADD HTTP -----
        case "add-http": {
          if (!nameArg || !parts[2]) {
            ctx.ui.notify("Usage: /mcp add-http <name> <url>", "error");
            return;
          }

          const newServer: MCPServerConfig = {
            name: nameArg,
            transport: {
              type: "streamable-http",
              url: parts[2],
            },
            enabled: false,
            autoReconnect: true,
          };

          config = upsertServer(config!, newServer);
          saveConfig(config);
          ctx.ui.notify(`Added HTTP server: ${nameArg}. Use /mcp enable ${nameArg} then /mcp connect ${nameArg}.`, "info");
          return;
        }

        // ----- ADD WEBSOCKET -----
        case "add-ws": {
          if (!nameArg || !parts[2]) {
            ctx.ui.notify("Usage: /mcp add-ws <name> <url>", "error");
            return;
          }

          const wsServer: MCPServerConfig = {
            name: nameArg,
            transport: {
              type: "websocket",
              url: parts[2],
            },
            enabled: false,
            autoReconnect: true,
          };

          config = upsertServer(config!, wsServer);
          saveConfig(config);
          ctx.ui.notify(`Added WebSocket server: ${nameArg}. Use /mcp enable ${nameArg} then /mcp connect ${nameArg}.`, "info");
          return;
        }

        // ----- REMOVE -----
        case "remove": {
          if (!nameArg) {
            ctx.ui.notify("Usage: /mcp remove <server-name>", "error");
            return;
          }

          await manager!.disconnect(nameArg);
          unregisterServerTools(nameArg);
          config = removeServer(config!, nameArg);
          saveConfig(config);
          ctx.ui.notify(`Removed server: ${nameArg}`, "info");
          return;
        }

        // ----- FILTER -----
        case "filter": {
          // /mcp filter <name> allow|deny <tool1,tool2,...>|clear
          if (!nameArg || !parts[2] || !parts[3]) {
            ctx.ui.notify(
              "Usage:\n" +
              "  /mcp filter <name> allow <tool1,tool2,...>  Only register these tools\n" +
              "  /mcp filter <name> deny <tool1,tool2,...>   Register all except these\n" +
              "  /mcp filter <name> clear                   Remove all filters",
              "error"
            );
            return;
          }

          const filterServer = config!.servers.find(s => s.name === nameArg);
          if (!filterServer) {
            ctx.ui.notify(`Server '${nameArg}' not found in config`, "error");
            return;
          }

          const action = parts[2]; // allow, deny, clear

          if (action === "clear") {
            const updated = {
              ...filterServer,
              allowedTools: undefined,
              deniedTools: undefined,
            };
            config = upsertServer(config!, updated);
            saveConfig(config);
            ctx.ui.notify(`Cleared tool filters for '${nameArg}'`, "info");
          } else if (action === "allow" || action === "deny") {
            const tools = parts[3].split(",").map(t => t.trim()).filter(Boolean);
            if (tools.length === 0) {
              ctx.ui.notify("No tool names provided. Use comma-separated list.", "error");
              return;
            }
            const updated = {
              ...filterServer,
              allowedTools: action === "allow" ? tools : undefined,
              deniedTools: action === "deny" ? tools : undefined,
            };
            config = upsertServer(config!, updated);
            saveConfig(config);
            const filterType = action === "allow" ? "allowlist" : "denylist";
            ctx.ui.notify(`Set ${filterType} for '${nameArg}': ${tools.join(", ")}`, "info");
          } else {
            ctx.ui.notify("Filter action must be 'allow', 'deny', or 'clear'", "error");
          }
          return;
        }

        // ----- REFRESH -----
        case "refresh": {
          if (!nameArg) {
            ctx.ui.notify("Usage: /mcp refresh <server-name>", "error");
            return;
          }

          const info = await manager!.refresh(nameArg);
          if (info) {
            registerServerTools(pi, manager!, info);
            ctx.ui.notify(
              `Refreshed ${nameArg}: ${info.tools.length} tools, ${info.resources.length} resources, ${info.prompts.length} prompts`,
              "info"
            );
          } else {
            ctx.ui.notify(`Server '${nameArg}' is not connected`, "error");
          }
          return;
        }

        // ----- IMPORT FROM CLAUDE DESKTOP -----
        case "import": {
          const imported = importClaudeDesktopServers();
          if (imported.length === 0) {
            ctx.ui.notify("No MCP servers found in Claude Desktop config.", "info");
            return;
          }

          for (const server of imported) {
            config = upsertServer(config!, server);
          }
          saveConfig(config);

          const names = imported.map((s) => s.name).join(", ");
          ctx.ui.notify(
            `Imported ${imported.length} servers from Claude Desktop:\n${names}\n\nUse /mcp enable <name> then /mcp connect <name>.`,
            "info"
          );
          return;
        }

        // ----- STATUS -----
        case "status": {
          const infos = manager!.getAllConnectionInfo();
          const lines: string[] = ["🔌 MCP Status\n"];

          if (infos.length === 0) {
            lines.push("No active connections.");
            lines.push("Use /mcp list to see configured servers.");
          } else {
            for (const info of infos) {
              lines.push(`${statusEmoji(info.status)} ${info.name}`);
              lines.push(`   Transport: ${info.name}`);
              lines.push(`   Tools: ${info.tools.length} | Resources: ${info.resources.length} | Prompts: ${info.prompts.length}`);
              if (info.connectedAt) {
                const uptime = Math.round((Date.now() - info.connectedAt) / 1000);
                const uptimeStr = uptime < 60 ? `${uptime}s` : uptime < 3600 ? `${Math.floor(uptime / 60)}m ${uptime % 60}s` : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
                lines.push(`   Uptime: ${uptimeStr}`);
              }
              if ((info.toolCallCount ?? 0) > 0) {
                lines.push(`   Calls: ${info.toolCallCount} ok, ${info.toolCallErrorCount} err`);
              }
              if (info.allowedTools && info.allowedTools.length > 0) {
                lines.push(`   Allowed: ${info.allowedTools.join(", ")}`);
              }
              if (info.deniedTools && info.deniedTools.length > 0) {
                lines.push(`   Denied: ${info.deniedTools.join(", ")}`);
              }
              if (info.serverVersion) {
                lines.push(`   Version: ${info.serverVersion}`);
              }
              if (info.error) {
                lines.push(`   Error: ${info.error}`);
              } else if (info.lastError) {
                lines.push(`   Last error: ${info.lastError}`);
              }
              lines.push("");
            }
          }

          ctx.ui.setWidget("mcp-status", lines, { placement: "belowEditor" });
          setTimeout(() => ctx.ui.setWidget("mcp-status", undefined), 15000);
          return;
        }

        // ----- DEFAULT: HELP -----
        default: {
          ctx.ui.notify(
            "🔌 MCP Commands:\n\n" +
            "  /mcp list              List configured servers\n" +
            "  /mcp connect <name>    Connect to a server\n" +
            "  /mcp disconnect <name> Disconnect from a server\n" +
            "  /mcp enable <name>     Enable auto-connect\n" +
            "  /mcp disable <name>    Disable auto-connect\n" +
            "  /mcp add <name> <cmd>  Add stdio server\n" +
            "  /mcp add-http <name> <url>  Add HTTP server\n" +
            "  /mcp add-ws <name> <url>    Add WebSocket server\n" +
            "  /mcp remove <name>    Remove a server\n" +
            "  /mcp filter <name> allow|deny|clear <tools>\n" +
            "  /mcp refresh <name>   Re-discover tools\n" +
            "  /mcp import            Import from Claude Desktop\n" +
            "  /mcp status            Show active connections\n\n" +
            "Config: ~/.0xkobold/mcp.json (+ .0xkobold/mcp.json for project-local overrides)\n" +
            "Docs: https://modelcontextprotocol.io",
            "info"
          );
        }
      }
    },
  });

  // -----------------------------------------------------------------------
  // Register pi tools
  // -----------------------------------------------------------------------

  // Tool: Discover all MCP tools
  pi.registerTool({
    name: "mcp_discover",
    label: "MCP Discover",
    description: "List all available MCP tools, resources, and prompts from connected servers. Use this to find what MCP capabilities are available.",
    parameters: Type.Object({
      server: Type.Optional(Type.String({ description: "Filter by server name" })),
      type: Type.Optional(Type.Union(
        [Type.Literal("tools"), Type.Literal("resources"), Type.Literal("prompts")],
        { description: "Filter by type: tools, resources, or prompts" }
      )),
    }),
    async execute(_toolCallId, params) {
      const infos = manager!.getAllConnectionInfo();
      const filtered = params.server
        ? infos.filter((i) => i.name === params.server)
        : infos;

      if (filtered.length === 0) {
        return {
          content: [{ type: "text" as const, text: params.server ? `Server '${params.server}' not connected.` : "No MCP servers connected. Use /mcp connect to start." }],
          details: {},
        };
      }

      const lines: string[] = [];

      for (const info of filtered) {
        if (info.status !== "ready") {
          lines.push(`❌ ${info.name}: ${info.status}`);
          continue;
        }

        // Tools
        if (!params.type || params.type === "tools") {
          if (info.tools.length > 0) {
            lines.push(`📋 ${info.name} Tools:`);
            for (const tool of info.tools) {
              lines.push(`  • mcp_${info.name}_${tool.name}: ${tool.description ?? "(no description)"}`);
            }
          }
        }

        // Resources
        if (!params.type || params.type === "resources") {
          if (info.resources.length > 0) {
            lines.push(`📦 ${info.name} Resources:`);
            for (const res of info.resources) {
              lines.push(`  • ${res.uri} - ${res.name}${res.description ? `: ${res.description}` : ""}`);
            }
          }
        }

        // Prompts
        if (!params.type || params.type === "prompts") {
          if (info.prompts.length > 0) {
            lines.push(`💬 ${info.name} Prompts:`);
            for (const prompt of info.prompts) {
              lines.push(`  • ${prompt.name}${prompt.description ? `: ${prompt.description}` : ""}`);
            }
          }
        }

        lines.push("");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") || "No MCP capabilities discovered." }],
        details: { servers: filtered.map((i) => ({ name: i.name, tools: i.tools.length, resources: i.resources.length, prompts: i.prompts.length })) } as any,
      };
    },
  });

  // Tool: Call any MCP tool directly by server + tool name
  pi.registerTool({
    name: "mcp_call_tool",
    label: "MCP Call Tool",
    description: "Call a specific tool on an MCP server. Prefer using the individual mcp_<server>_<tool> tools instead - use this only if the specific tool is not registered.",
    parameters: Type.Object({
      server: Type.String({ description: "MCP server name" }),
      tool: Type.String({ description: "Tool name on the server" }),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Tool arguments" })),
    }),
    async execute(_toolCallId, params) {
      try {
        const result = await manager!.callTool(
          params.server as string,
          params.tool as string,
          (params.arguments ?? {}) as Record<string, unknown>
        );

        const text = formatResult(result);
        return {
          content: [{ type: "text" as const, text }],
          details: { server: params.server as string, tool: params.tool as string, result } as any,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `MCP error: ${err}` }],
          details: { server: params.server as string, tool: params.tool as string, error: String(err) } as any,
        };
      }
    },
  });

  // -----------------------------------------------------------------------
  // Lifecycle hooks
  // -----------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    globalCtx = ctx;
    const connected = manager!.getAllConnectionInfo().filter((i) => i.status === "ready").length;
    ctx.ui.setStatus("mcp", connected > 0 ? `🔌 ${connected} MCP` : "🔌 MCP");
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    await manager!.disconnectAll();
  });

  console.log("[MCP] Extension loaded - Model Context Protocol integration ready");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusEmoji(status: string): string {
  switch (status) {
    case "ready": return "🟢";
    case "connecting":
    case "initializing": return "🟡";
    case "error": return "🔴";
    case "disconnected": return "⚫";
    case "disabled": return "⚪";
    default: return "❓";
  }
}

function formatResult(result: unknown): string {
  if (!result) return "(empty result)";
  if (typeof result === "string") return result;

  const res = result as any;

  if (res.content && Array.isArray(res.content)) {
    return res.content
      .map((c: any) => {
        if (c.type === "text") return c.text;
        if (c.type === "image") return `[Image: ${c.mimeType}]`;
        if (c.type === "audio") return `[Audio: ${c.mimeType}]`;
        if (c.type === "resource") return c.resource?.text ?? `[Resource: ${c.resource?.uri}]`;
        return JSON.stringify(c);
      })
      .join("\n");
  }

  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}