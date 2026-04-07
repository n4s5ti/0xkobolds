/**
 * MCP Configuration - Load/save MCP server configs from ~/.0xkobold/mcp.json
 *
 * Also supports Claude Desktop's config format at:
 * - ~/.claude/mcp.json
 * - ~/.config/claude-code/mcp.json
 *
 * DRY: Single source of truth for MCP server configuration
 * KISS: Plain JSON, no ORM, no migration
 * FP: Pure functions for loading/saving
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { MCPServerConfig, ServerTransportConfig } from "../client/index.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const KOBOLD_DIR = join(homedir(), ".0xkobold");
const MCP_CONFIG_FILE = join(KOBOLD_DIR, "mcp.json");

const CLAUDE_CONFIG_PATHS = [
  join(homedir(), ".claude", "mcp.json"),
  join(homedir(), ".config", "claude-code", "mcp.json"),
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPConfig {
  servers: MCPServerConfig[];
  /** Import servers from Claude Desktop config */
  importClaudeDesktop?: boolean;
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/** Create a default config with common servers disabled */
export function createDefaultConfig(): MCPConfig {
  return {
    servers: [
      {
        name: "filesystem",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", homedir()],
        },
        enabled: false,
        autoReconnect: true,
      },
      {
        name: "github",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "" },
        },
        enabled: false,
        autoReconnect: true,
      },
      {
        name: "sqlite",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-sqlite"],
        },
        enabled: false,
        autoReconnect: true,
      },
    ],
    importClaudeDesktop: true,
  };
}

/** Load config from disk, creating default if missing */
const PROJECT_CONFIG_FILE = join(process.cwd(), ".0xkobold", "mcp.json");

/** Merge global config with project-local config.
 * Project servers override global servers with the same name (by name). */
export function mergeProjectConfig(global: MCPConfig, project: MCPConfig): MCPConfig {
  const seen = new Set<string>();
  const merged: MCPServerConfig[] = [];

  // Add global servers first
  for (const server of global.servers) {
    merged.push(server);
    seen.add(server.name);
  }

  // Add/override project servers
  for (const server of project.servers) {
    if (seen.has(server.name)) {
      const idx = merged.findIndex((s) => s.name === server.name);
      console.assert(idx >= 0, "mergeProjectConfig: name should exist");
      merged[idx] = server;
    } else {
      merged.push(server);
      seen.add(server.name);
    }
  }

  return {
    servers: merged,
    importClaudeDesktop: global.importClaudeDesktop ?? project.importClaudeDesktop,
  };
}

export function loadConfig(): MCPConfig {
  let config: MCPConfig;

  // Load global config
  if (!existsSync(MCP_CONFIG_FILE)) {
    config = createDefaultConfig();
    saveConfig(config);
  } else {
    try {
      const raw = readFileSync(MCP_CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      config = normalizeConfig(parsed);
    } catch (err) {
      console.error("[MCP] Failed to load config:", err);
      config = createDefaultConfig();
    }
  }

  // Merge project-local config if it exists
  if (existsSync(PROJECT_CONFIG_FILE)) {
    try {
      const raw = readFileSync(PROJECT_CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      const projectConfig = normalizeConfig(parsed);
      console.log(`[MCP] Merging project config from ${PROJECT_CONFIG_FILE}`);
      config = mergeProjectConfig(config, projectConfig);
    } catch (err) {
      console.warn("[MCP] Failed to load project config:", err);
    }
  }

  return config;
}

/** Save config to disk */
export function saveConfig(config: MCPConfig): void {
  try {
    if (!existsSync(KOBOLD_DIR)) {
      mkdirSync(KOBOLD_DIR, { recursive: true });
    }
    writeFileSync(MCP_CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error("[MCP] Failed to save config:", err);
  }
}

/**
 * Import servers from Claude Desktop's config format.
 * Claude Desktop uses: { "mcpServers": { "name": { "command": ..., "args": ... } } }
 */
export function importClaudeDesktopServers(): MCPServerConfig[] {
  const servers: MCPServerConfig[] = [];

  for (const configPath of CLAUDE_CONFIG_PATHS) {
    if (!existsSync(configPath)) continue;

    try {
      const raw = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      const mcpServers = parsed.mcpServers ?? {};

      for (const [name, serverDef] of Object.entries(mcpServers)) {
        const def = serverDef as any;

        // Skip if already imported (by name)
        if (servers.some((s) => s.name === name)) continue;

        if (def.command) {
          // stdio server
          servers.push({
            name,
            transport: {
              type: "stdio",
              command: def.command,
              args: def.args,
              env: def.env,
              cwd: def.cwd,
            },
            enabled: false,
            autoReconnect: true,
          });
        } else if (def.url) {
          // Determine transport type from URL scheme
          const urlStr = String(def.url);
          const isWebSocket = urlStr.startsWith("ws://") || urlStr.startsWith("wss://");
          servers.push({
            name,
            transport: isWebSocket
              ? { type: "websocket", url: urlStr }
              : { type: "streamable-http", url: urlStr, headers: def.headers },
            enabled: false,
            autoReconnect: true,
          });
        }
      }
    } catch (err) {
      console.warn(`[MCP] Failed to import from ${configPath}:`, err);
    }
  }

  return servers;
}

/**
 * Get all enabled servers from config, optionally merging Claude Desktop servers
 */
export function getEnabledServers(config: MCPConfig): MCPServerConfig[] {
  let servers = config.servers;

  if (config.importClaudeDesktop) {
    const claudeServers = importClaudeDesktopServers();
    // Merge: prefer our config if name conflicts
    const ourNames = new Set(servers.map((s) => s.name));
    for (const cs of claudeServers) {
      if (!ourNames.has(cs.name)) {
        servers = [...servers, cs];
      }
    }
  }

  return servers.filter((s) => s.enabled);
}

/** Add or update a server config */
export function upsertServer(config: MCPConfig, server: MCPServerConfig): MCPConfig {
  const idx = config.servers.findIndex((s) => s.name === server.name);
  if (idx >= 0) {
    const updated = [...config.servers];
    updated[idx] = server;
    return { ...config, servers: updated };
  }
  return { ...config, servers: [...config.servers, server] };
}

/** Remove a server config by name */
export function removeServer(config: MCPConfig, name: string): MCPConfig {
  return {
    ...config,
    servers: config.servers.filter((s) => s.name !== name),
  };
}

/** Toggle a server's enabled state */
export function toggleServer(config: MCPConfig, name: string): MCPConfig {
  return {
    ...config,
    servers: config.servers.map((s) =>
      s.name === name ? { ...s, enabled: !s.enabled } : s
    ),
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/** Normalize raw parsed config into well-typed MCPConfig */
export function normalizeConfig(raw: any): MCPConfig {
  const servers: MCPServerConfig[] = (raw.servers ?? []).map(normalizeServer);
  return {
    servers,
    importClaudeDesktop: raw.importClaudeDesktop ?? false,
  };
}

/** Normalize a single server entry (handles both old and new format) */
function normalizeServer(raw: any): MCPServerConfig {
  if (!raw || !raw.name || typeof raw.name !== "string") {
    throw new Error(`Server entry must have a non-empty 'name' field. Got: ${JSON.stringify(raw)}`);
  }

  const name = raw.name as string;

  // Validate mutual exclusivity of allowedTools/deniedTools
  if (raw.allowedTools && raw.deniedTools) {
    throw new Error(
      `Server '${name}' cannot have both 'allowedTools' and 'deniedTools'. Use one or the other.`
    );
  }

  const shared = {
    name,
    enabled: raw.enabled ?? false,
    autoReconnect: raw.autoReconnect ?? true,
    maxReconnectAttempts: raw.maxReconnectAttempts,
    reconnectDelayMs: raw.reconnectDelayMs,
    allowedTools: raw.allowedTools,
    deniedTools: raw.deniedTools,
  };

  // Old format: { name, command?, args?, env?, enabled }
  if (raw.command && !raw.transport) {
    return {
      ...shared,
      transport: {
        type: "stdio",
        command: raw.command,
        args: raw.args,
        env: raw.env,
      },
    };
  }

  // Old format: { name, url } (HTTP/WebSocket server without transport block)
  if (raw.url && !raw.transport && !raw.command) {
    const url = String(raw.url);
    const isWebSocket = url.startsWith("ws://") || url.startsWith("wss://");
    return {
      ...shared,
      transport: isWebSocket
        ? { type: "websocket", url }
        : { type: "streamable-http", url, headers: raw.headers },
    };
  }

  // New format: { name, transport: { type, ... }, enabled }
  if (!raw.transport) {
    throw new Error(
      `Server '${name}' must have either 'command' (stdio), 'url' (http), or 'transport' config. Got: ${JSON.stringify(raw)}`
    );
  }

  return {
    ...shared,
    transport: normalizeTransport(raw.transport),
  };
}

function normalizeTransport(raw: any): ServerTransportConfig {
  if (!raw || !raw.type) {
    throw new Error("Transport config must have a 'type' field");
  }

  switch (raw.type) {
    case "stdio":
      return {
        type: "stdio",
        command: raw.command ?? "npx",
        args: raw.args,
        env: raw.env,
        cwd: raw.cwd,
      };
    case "sse":
      return {
        type: "sse",
        url: raw.url,
        headers: raw.headers,
      };
    case "streamable-http":
      return {
        type: "streamable-http",
        url: raw.url,
        headers: raw.headers,
        sessionId: raw.sessionId,
      };
    case "websocket":
      return {
        type: "websocket",
        url: raw.url,
      };
    default:
      throw new Error(`Unknown transport type: ${raw.type}`);
  }
}