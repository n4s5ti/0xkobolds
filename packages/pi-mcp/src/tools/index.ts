/**
 * Tool Bridge - Registers MCP tools/resources/prompts as pi-coding-agent tools
 *
 * Converts MCP tool definitions into pi registerTool() calls.
 * Each MCP tool becomes a pi tool prefixed with `mcp_<server>_`.
 * Resources and prompts get dedicated pi tools per server.
 *
 * DRY: One function to register all tools for a server
 * KISS: Simple prefix-based naming
 * FP: Stateless - takes (pi, connectionInfo) and registers tools
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { MCPConnectionManager, ConnectionInfo, DiscoveredTool } from "../client/index.js";

// ---------------------------------------------------------------------------
// Tool name helpers
// ---------------------------------------------------------------------------

const SEP = "_";
const PREFIX = "mcp";

function mcpToolName(server: string, tool: string): string {
  return `${PREFIX}${SEP}${server}${SEP}${tool}`;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Track which tools we've registered so we can clean up */
const registeredTools: Map<string, string[]> = new Map();

/**
 * Register all discovered tools, resources, and prompts from a server
 * as pi-coding-agent tools. Respects allowedTools/deniedTools filtering.
 */
export function registerServerTools(
  pi: ExtensionAPI,
  manager: MCPConnectionManager,
  info: ConnectionInfo
): string[] {
  const names: string[] = [];
  const { allowedTools, deniedTools } = info;

  // Register each MCP tool (filtered)
  for (const tool of info.tools) {
    if (!isToolAllowed(tool.name, allowedTools, deniedTools)) {
      console.log(`[MCP] Skipping tool '${tool.name}' on server '${info.name}' (filtered)`);
      continue;
    }
    const fullName = mcpToolName(info.name, tool.name);
    registerMcpTool(pi, manager, info.name, tool, fullName);
    names.push(fullName);
  }

  // Always register resource/prompt tools regardless of filters
  const resourceToolName = `${PREFIX}${SEP}${info.name}${SEP}read_resource`;
  registerResourceTool(pi, manager, info.name, resourceToolName);
  names.push(resourceToolName);

  const promptToolName = `${PREFIX}${SEP}${info.name}${SEP}get_prompt`;
  registerPromptTool(pi, manager, info.name, promptToolName);
  names.push(promptToolName);

  registeredTools.set(info.name, names);
  return names;
}

/**
 * Check if a tool should be registered based on allowlist/denylist.
 * If allowedTools is set, ONLY those tools are registered.
 * If deniedTools is set, those tools are excluded.
 * If neither is set, all tools are registered.
 */
export function isToolAllowed(
  toolName: string,
  allowedTools: string[] | undefined,
  deniedTools: string[] | undefined
): boolean {
  if (allowedTools && allowedTools.length > 0) {
    return allowedTools.includes(toolName);
  }
  if (deniedTools && deniedTools.length > 0) {
    return !deniedTools.includes(toolName);
  }
  return true;
}

/**
 * Unregister tools for a disconnected server
 * Note: pi-coding-agent doesn't have unregisterTool(), so this is best-effort
 */
export function unregisterServerTools(serverName: string): void {
  registeredTools.delete(serverName);
}

/**
 * Unregister all server tools
 */
export function unregisterAllTools(): void {
  registeredTools.clear();
}

// ---------------------------------------------------------------------------
// Individual tool registration
// ---------------------------------------------------------------------------

function registerMcpTool(
  pi: ExtensionAPI,
  manager: MCPConnectionManager,
  serverName: string,
  tool: DiscoveredTool,
  fullName: string
): void {
  // Convert MCP inputSchema to TypeBox parameters
  const parameters = mcpSchemaToTypeBox(tool.inputSchema, tool.name);

  pi.registerTool({
    name: fullName,
    label: `[MCP:${serverName}] ${tool.name}`,
    description: tool.description ?? `${tool.name} from MCP server ${serverName}`,
    parameters,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const result = await manager.callTool(serverName, tool.name, params as Record<string, unknown>);

        // Format MCP result content
        const text = formatMcpResult(result);

        return {
          content: [{ type: "text" as const, text }],
          details: { server: serverName, tool: tool.name, result },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `MCP error (${serverName}/${tool.name}): ${err}` }],
          details: { server: serverName, tool: tool.name, error: String(err) },
        };
      }
    },
  });
}

function registerResourceTool(
  pi: ExtensionAPI,
  manager: MCPConnectionManager,
  serverName: string,
  fullName: string
): void {
  pi.registerTool({
    name: fullName,
    label: `[MCP:${serverName}] Read Resource`,
    description: `Read a resource from MCP server '${serverName}'. Use mcp_discover to find available resource URIs.`,
    parameters: Type.Object({
      uri: Type.String({ description: "Resource URI to read" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const result = await manager.readResource(serverName, params.uri as string);
        const text = formatMcpResult(result);

        return {
          content: [{ type: "text" as const, text }],
          details: { server: serverName, uri: params.uri, result },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `MCP resource error: ${err}` }],
          details: { server: serverName, uri: params.uri, error: String(err) },
        };
      }
    },
  });
}

function registerPromptTool(
  pi: ExtensionAPI,
  manager: MCPConnectionManager,
  serverName: string,
  fullName: string
): void {
  pi.registerTool({
    name: fullName,
    label: `[MCP:${serverName}] Get Prompt`,
    description: `Get a prompt template from MCP server '${serverName}'. Use mcp_discover to find available prompts.`,
    parameters: Type.Object({
      name: Type.String({ description: "Prompt name" }),
      arguments: Type.Optional(Type.Record(Type.String(), Type.String(), { description: "Prompt arguments" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const result = await manager.getPrompt(
          serverName,
          params.name as string,
          params.arguments as Record<string, string> | undefined
        );
        const text = formatMcpResult(result);

        return {
          content: [{ type: "text" as const, text }],
          details: { server: serverName, prompt: params.name, result },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: `MCP prompt error: ${err}` }],
          details: { server: serverName, prompt: params.name, error: String(err) },
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Schema conversion
// ---------------------------------------------------------------------------

/**
 * Convert an MCP inputSchema (JSON Schema) to a TypeBox schema.
 * Falls back to a generic object schema if conversion fails.
 */
function mcpSchemaToTypeBox(schema: Record<string, unknown>, toolName: string): any {
  // Defensive: if schema is missing or invalid, return empty object
  if (!schema || typeof schema !== "object") {
    return Type.Object({});
  }

  try {
    // MCP inputSchema is already JSON Schema - TypeBox can often accept it
    // We wrap it as a Type.Object if it has properties
    if (schema.type === "object" && schema.properties) {
      // Build TypeBox properties from JSON Schema properties
      const properties: Record<string, any> = {};
      const required = (schema.required as string[]) ?? [];

      for (const [key, value] of Object.entries(schema.properties as Record<string, any>)) {
        properties[key] = jsonSchemaPropertyToTypeBox(value, key, required.includes(key));
      }

      return Type.Object(properties);
    }

    // Fallback: pass through as generic object
    return Type.Object({});
  } catch (err) {
    console.warn(`[MCP] Schema conversion failed for ${toolName}:`, err);
    return Type.Object({});
  }
}

/**
 * Convert a single JSON Schema property to TypeBox type
 */
function jsonSchemaPropertyToTypeBox(prop: any, name: string, isRequired: boolean): any {
  let tb: any;

  switch (prop.type) {
    case "string":
      tb = prop.enum
        ? Type.Union(prop.enum.map((v: string) => Type.Literal(v)))
        : Type.String({ description: prop.description });
      break;
    case "number":
    case "integer":
      tb = Type.Number({ description: prop.description });
      break;
    case "boolean":
      tb = Type.Boolean({ description: prop.description });
      break;
    case "array":
      tb = Type.Array(
        prop.items ? jsonSchemaPropertyToTypeBox(prop.items, `${name}_item`, true) : Type.Any(),
        { description: prop.description }
      );
      break;
    case "object":
      tb = Type.Object(
        prop.properties
          ? Object.fromEntries(
              Object.entries(prop.properties).map(([k, v]) => [
                k,
                jsonSchemaPropertyToTypeBox(v as any, k, true),
              ])
            )
          : {},
        { description: prop.description }
      );
      break;
    default:
      tb = Type.Any({ description: prop.description });
  }

  // Make optional if not in required array
  if (!isRequired && !prop.default) {
    return Type.Optional(tb);
  }

  return tb;
}

// ---------------------------------------------------------------------------
// Result formatting
// ---------------------------------------------------------------------------

/**
 * Format an MCP call result into readable text
 */
function formatMcpResult(result: unknown): string {
  if (!result) return "(empty result)";

  if (typeof result === "string") return result;

  // MCP CallToolResult shape
  const res = result as any;

  // Handle content array (standard MCP result)
  if (res.content && Array.isArray(res.content)) {
    return res.content
      .map((c: any) => {
        if (c.type === "text") return c.text;
        if (c.type === "image") return `[Image: ${c.mimeType}, ${c.data.length} bytes]`;
        if (c.type === "audio") return `[Audio: ${c.mimeType}, ${c.data.length} bytes]`;
        if (c.type === "resource") {
          const r = c.resource;
          return r?.text ?? r?.blob ?? `[Resource: ${r?.uri}]`;
        }
        return JSON.stringify(c);
      })
      .join("\n");
  }

  // Handle resource contents array
  if (res.contents && Array.isArray(res.contents)) {
    return res.contents
      .map((c: any) => c.text ?? (c.blob ? `[Blob: ${c.uri}, ${c.mimeType}]` : JSON.stringify(c)))
      .join("\n");
  }

  // Handle prompt messages
  if (res.messages && Array.isArray(res.messages)) {
    return res.messages
      .map((m: any) => {
        const content = m.content;
        if (typeof content === "string") return `[${m.role}] ${content}`;
        if (content?.text) return `[${m.role}] ${content.text}`;
        return `[${m.role}] ${JSON.stringify(content)}`;
      })
      .join("\n\n");
  }

  // Fallback: JSON stringify
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}