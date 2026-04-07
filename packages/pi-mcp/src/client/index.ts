/**
 * MCP Client - Manages connections to MCP servers using the official SDK
 *
 * Supports:
 * - stdio transport (local process spawning)
 * - SSE transport (legacy HTTP/SSE)
 * - StreamableHTTP transport (modern HTTP)
 * - WebSocket transport (real-time bidirectional)
 *
 * Lifecycle: connect → initialize → discover → ready ↔ disconnected → close
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransportType = "stdio" | "sse" | "streamable-http" | "websocket";

export interface StdioServerConfig {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface SseServerConfig {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
}

export interface StreamableHttpServerConfig {
  type: "streamable-http";
  url: string;
  headers?: Record<string, string>;
  sessionId?: string;
}

export interface WebSocketServerConfig {
  type: "websocket";
  url: string;
}

export type ServerTransportConfig =
  | StdioServerConfig
  | SseServerConfig
  | StreamableHttpServerConfig
  | WebSocketServerConfig;

/** Full config for a single MCP server entry */
export interface MCPServerConfig {
  /** Unique name for this server */
  name: string;
  /** Transport configuration */
  transport: ServerTransportConfig;
  /** Whether to auto-connect on startup */
  enabled: boolean;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Reconnection delay in ms */
  reconnectDelayMs?: number;
  /** Connection timeout in ms (default: 30000) */
  connectTimeoutMs?: number;
  /** Only register tools matching these names (allowlist). Mutually exclusive with deniedTools. */
  allowedTools?: string[];
  /** Register all tools except those matching these names (denylist). Mutually exclusive with allowedTools. */
  deniedTools?: string[];
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "initializing"
  | "ready"
  | "error";

export interface DiscoveredTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface DiscoveredResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface DiscoveredPrompt {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface ConnectionInfo {
  name: string;
  status: ConnectionStatus;
  error?: string;
  tools: DiscoveredTool[];
  resources: DiscoveredResource[];
  prompts: DiscoveredPrompt[];
  serverVersion?: string;
  protocolVersion?: string;
  /** Tool allowlist — only these tools will be registered */
  allowedTools?: string[];
  /** Tool denylist — these tools will be skipped */
  deniedTools?: string[];
  /** Timestamp when connection was established (epoch ms) */
  connectedAt?: number;
  /** Number of successful tool calls */
  toolCallCount?: number;
  /** Number of failed tool calls */
  toolCallErrorCount?: number;
  /** Last error message (even if currently connected) */
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Per-connection state
// ---------------------------------------------------------------------------

interface ConnectionState {
  config: MCPServerConfig;
  client: Client;
  transport: Transport | null;
  status: ConnectionStatus;
  error?: string;
  tools: DiscoveredTool[];
  resources: DiscoveredResource[];
  prompts: DiscoveredPrompt[];
  reconnectAttempts: number;
  serverVersion?: string;
  protocolVersion?: string;
  dispose?: () => void;
  connectedAt?: number;
  toolCallCount: number;
  toolCallErrorCount: number;
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Simple TTL Cache (KISS: bounded Map, no heap allocation after init)
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class ResourceCache {
  private readonly entries: Map<string, CacheEntry> = new Map();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;

  constructor(maxSize: number = 50, defaultTtlMs: number = 300_000) {
    console.assert(maxSize > 0, "maxSize must be positive");
    console.assert(defaultTtlMs > 0, "defaultTtlMs must be positive");
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: string): unknown | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: unknown, ttlMs?: number): void {
    // Evict oldest entries if at capacity
    if (this.entries.size >= this.maxSize && !this.entries.has(key)) {
      const firstKey = this.entries.keys().next().value;
      if (firstKey !== undefined) this.entries.delete(firstKey);
    }
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  invalidate(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

// ---------------------------------------------------------------------------
// MCPConnectionManager
// ---------------------------------------------------------------------------

export class MCPConnectionManager {
  private readonly connections: Map<string, ConnectionState> = new Map();
  private readonly onChangeCallbacks: Set<(name: string, info: ConnectionInfo) => void> = new Set();
  private readonly workspaceRoots: string[];
  readonly resourceCache: ResourceCache;

  constructor(workspaceRoots?: string[], cacheMaxSize: number = 50, cacheTtlMs: number = 300_000) {
    this.workspaceRoots = workspaceRoots ?? [process.cwd()];
    this.resourceCache = new ResourceCache(cacheMaxSize, cacheTtlMs);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Connect to a single MCP server */
  async connect(config: MCPServerConfig): Promise<ConnectionInfo> {
    console.assert(config !== null, "config must not be null");
    console.assert(config.name.length > 0, "config.name must not be empty");

    // Close existing connection if any
    if (this.connections.has(config.name)) {
      await this.disconnect(config.name);
    }

    const client = new Client(
      { name: "0xKobold", version: "0.1.0" },
      {
        capabilities: {
          roots: { listChanged: true },
          sampling: {},
        },
      }
    );

    // Register roots/list handler so MCP servers can discover workspace roots
    client.setRequestHandler(
      ListRootsRequestSchema,
      () => ({
        roots: this.workspaceRoots.map((uri) => ({
          uri: uri.startsWith("/") ? `file://${uri}` : uri,
          name: uri.split("/").pop() ?? uri,
        })),
      })
    );

    const state: ConnectionState = {
      config,
      client,
      transport: null,
      status: "connecting",
      tools: [],
      resources: [],
      prompts: [],
      reconnectAttempts: 0,
      toolCallCount: 0,
      toolCallErrorCount: 0,
    };

    this.connections.set(config.name, state);
    this.emitChange(config.name);

    try {
      // Validate transport config before creating transport
      validateTransportConfig(config.transport);

      // Create transport
      const transport = this.createTransport(config.transport);
      state.transport = transport;
      state.status = "initializing";
      this.emitChange(config.name);

      // Connect and initialize (with timeout)
      const connectPromise = client.connect(transport);
      const timeoutMs = config.connectTimeoutMs ?? 30000;
      await withTimeout(connectPromise, timeoutMs, `Connection to ${config.name} timed out after ${timeoutMs}ms`);

      // Discover capabilities
      await this.discover(state);
      state.status = "ready";
      state.connectedAt = Date.now();
      state.reconnectAttempts = 0;
      state.serverVersion = client.getServerVersion()?.name
        ? `${client.getServerVersion()!.name} v${client.getServerVersion()!.version}`
        : undefined;
      state.protocolVersion = "connected";

      // Set up auto-reconnect
      this.setupReconnect(state);

      console.log(`[MCP] Connected to ${config.name} (${state.tools.length} tools, ${state.resources.length} resources, ${state.prompts.length} prompts)`);
      this.emitChange(config.name);
    } catch (err) {
      state.status = "error";
      state.error = formatConnectionError(err, config);
      state.lastError = state.error;
      console.error(`[MCP] Failed to connect to ${config.name}:`, state.error);
      this.emitChange(config.name);

      // Auto-reconnect if configured
      if (config.autoReconnect) {
        this.scheduleReconnect(state);
      }
    }

    return this.getConnectionInfo(config.name)!;
  }

  /** Disconnect from a server */
  async disconnect(name: string): Promise<void> {
    const state = this.connections.get(name);
    if (!state) return;

    state.dispose?.();
    try {
      await state.client.close();
    } catch {
      // Ignore close errors
    }

    state.status = "disconnected";
    state.transport = null;
    state.tools = [];
    state.resources = [];
    state.prompts = [];
    this.connections.delete(name);
    this.emitChange(name);
  }

  /** Disconnect all servers */
  async disconnectAll(): Promise<void> {
    const names = Array.from(this.connections.keys());
    await Promise.all(names.map((n) => this.disconnect(n)));
  }

  /** Call a tool on a connected server */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number = 60000
  ): Promise<unknown> {
    const state = this.getConnectionOrThrow(serverName);
    this.assertStatus(state, "ready");

    try {
      const result = await withTimeout(
        state.client.callTool({ name: toolName, arguments: args }),
        timeoutMs,
        `Tool call '${toolName}' on '${serverName}' timed out after ${timeoutMs}ms`
      );
      state.toolCallCount++;
      return result;
    } catch (err) {
      state.toolCallErrorCount++;
      state.lastError = String(err);
      state.error = String(err);
      this.emitChange(serverName);
      throw err;
    }
  }

  /** Read a resource from a connected server */
  async readResource(
    serverName: string,
    uri: string,
    timeoutMs: number = 30000
  ): Promise<unknown> {
    const state = this.getConnectionOrThrow(serverName);
    this.assertStatus(state, "ready");

    const cacheKey = `${serverName}:${uri}`;
    const cached = this.resourceCache.get(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const result = await withTimeout(
        state.client.readResource({ uri }),
        timeoutMs,
        `readResource '${uri}' on '${serverName}' timed out after ${timeoutMs}ms`
      );
      this.resourceCache.set(cacheKey, result);
      return result;
    } catch (err) {
      state.lastError = String(err);
      state.error = String(err);
      this.emitChange(serverName);
      throw err;
    }
  }

  /** Get a prompt from a connected server */
  async getPrompt(
    serverName: string,
    promptName: string,
    args?: Record<string, string>,
    timeoutMs: number = 30000
  ): Promise<unknown> {
    const state = this.getConnectionOrThrow(serverName);
    this.assertStatus(state, "ready");

    try {
      const result = await withTimeout(
        state.client.getPrompt({ name: promptName, arguments: args }),
        timeoutMs,
        `getPrompt '${promptName}' on '${serverName}' timed out after ${timeoutMs}ms`
      );
      return result;
    } catch (err) {
      state.error = String(err);
      this.emitChange(serverName);
      throw err;
    }
  }

  /** Re-discover tools/resources/prompts for a server */
  async refresh(name: string): Promise<ConnectionInfo | null> {
    const state = this.connections.get(name);
    if (!state || state.status !== "ready") return null;

    await this.discover(state);
    this.emitChange(name);
    return this.getConnectionInfo(name);
  }

  /** Get connection info for a server */
  getConnectionInfo(name: string): ConnectionInfo | undefined {
    const state = this.connections.get(name);
    if (!state) return undefined;

    return {
      name: state.config.name,
      status: state.status,
      error: state.error,
      tools: state.tools,
      resources: state.resources,
      prompts: state.prompts,
      serverVersion: state.serverVersion,
      protocolVersion: state.protocolVersion,
      allowedTools: state.config.allowedTools,
      deniedTools: state.config.deniedTools,
      connectedAt: state.connectedAt,
      toolCallCount: state.toolCallCount,
      toolCallErrorCount: state.toolCallErrorCount,
      lastError: state.lastError,
    };
  }

  /** Get all connection infos */
  getAllConnectionInfo(): ConnectionInfo[] {
    return Array.from(this.connections.keys())
      .map((name) => this.getConnectionInfo(name)!)
      .filter(Boolean);
  }

  /** Subscribe to connection changes */
  onChange(callback: (name: string, info: ConnectionInfo) => void): () => void {
    this.onChangeCallbacks.add(callback);
    return () => this.onChangeCallbacks.delete(callback);
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private createTransport(config: ServerTransportConfig): Transport {
    switch (config.type) {
      case "stdio":
        return new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: interpolateEnv(config.env),
          cwd: config.cwd,
          stderr: "pipe",
        });

      case "sse":
        return new SSEClientTransport(new URL(config.url), {
          requestInit: config.headers ? { headers: interpolateEnv(config.headers) } : undefined,
        });

      case "streamable-http":
        return new StreamableHTTPClientTransport(new URL(config.url), {
          sessionId: config.sessionId,
          requestInit: config.headers ? { headers: interpolateEnv(config.headers) } : undefined,
        });

      case "websocket":
        return new WebSocketClientTransport(new URL(config.url));

      default:
        throw new Error(`Unknown transport type: ${(config as any).type}`);
    }
  }

  private async discover(state: ConnectionState): Promise<void> {
    const { client } = state;

    // Discover tools
    try {
      const toolsResult = await client.listTools();
      state.tools = (toolsResult.tools as unknown as DiscoveredTool[]) ?? [];
    } catch (err) {
      console.warn(`[MCP:${state.config.name}] Tool discovery failed:`, err);
      state.tools = [];
    }

    // Discover resources (optional capability)
    try {
      const resourcesResult = await client.listResources();
      const resources = (resourcesResult.resources as unknown as DiscoveredResource[]) ?? [];
      state.resources = resources;
      if (resources.length > 0) {
        console.log(`[MCP:${state.config.name}] Discovered ${resources.length} resources`);
      }
    } catch (err: any) {
      // Method not found = server doesn't support resources (normal)
      if (err?.code !== -32601) {
        console.warn(`[MCP:${state.config.name}] Resource discovery failed:`, err);
      }
      state.resources = [];
    }

    // Discover prompts (optional capability)
    try {
      const promptsResult = await client.listPrompts();
      const prompts = (promptsResult.prompts as unknown as DiscoveredPrompt[]) ?? [];
      state.prompts = prompts;
      if (prompts.length > 0) {
        console.log(`[MCP:${state.config.name}] Discovered ${prompts.length} prompts`);
      }
    } catch (err: any) {
      // Method not found = server doesn't support prompts (normal)
      if (err?.code !== -32601) {
        console.warn(`[MCP:${state.config.name}] Prompt discovery failed:`, err);
      }
      state.prompts = [];
    }
  }

  private setupReconnect(state: ConnectionState): void {
    // Listen for transport close events
    const originalOnClose = state.transport?.onclose;
    state.transport!.onclose = () => {
      originalOnClose?.();
      state.status = "disconnected";
      this.emitChange(state.config.name);

      if (state.config.autoReconnect) {
        this.scheduleReconnect(state);
      }
    };
  }

  private scheduleReconnect(state: ConnectionState): void {
    const maxAttempts = state.config.maxReconnectAttempts ?? 5;
    if (state.reconnectAttempts >= maxAttempts) {
      state.status = "error";
      state.error = `Max reconnection attempts (${maxAttempts}) reached`;
      this.emitChange(state.config.name);
      return;
    }

    const delay = state.config.reconnectDelayMs ?? (1000 * (state.reconnectAttempts + 1));
    state.reconnectAttempts++;

    console.log(`[MCP:${state.config.name}] Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts}/${maxAttempts})`);

    setTimeout(async () => {
      try {
        await this.connect(state.config);
      } catch (err) {
        // connect() already handles error state
      }
    }, delay);
  }

  private getConnectionOrThrow(name: string): ConnectionState {
    const state = this.connections.get(name);
    if (!state) {
      throw new Error(`MCP server '${name}' not connected`);
    }
    return state;
  }

  private assertStatus(state: ConnectionState, expected: ConnectionStatus): void {
    if (state.status !== expected) {
      throw new Error(
        `MCP server '${state.config.name}' is ${state.status}, expected ${expected}`
      );
    }
  }

  private emitChange(name: string): void {
    const info = this.getConnectionInfo(name);
    if (info) {
      for (const cb of this.onChangeCallbacks) {
        try {
          cb(name, info);
        } catch {
          // Swallow callback errors
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Validation & Error Formatting
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

function validateTransportConfig(config: ServerTransportConfig): void {
  switch (config.type) {
    case "stdio":
      if (!config.command || config.command.trim().length === 0) {
        throw new Error(
          `stdio server requires a non-empty 'command'. Got: '${config.command}'`
        );
      }
      break;
    case "sse":
    case "streamable-http":
    case "websocket":
      if (!config.url || config.url.trim().length === 0) {
        throw new Error(
          `${config.type} server requires a non-empty 'url'. Got: '${config.url}'`
        );
      }
      // Validate URL format
      try {
        new URL(config.url);
      } catch {
        throw new Error(
          `${config.type} server has invalid URL: '${config.url}'. Must be a valid URL.`
        );
      }
      break;
  }
}

function formatConnectionError(err: unknown, config: MCPServerConfig): string {
  const msg = err instanceof Error ? err.message : String(err);

  // ENOENT — command binary not found
  if (msg.includes("ENOENT") || msg.includes("not found") || msg.includes("spawn")) {
    const cmd = (config.transport as any).command ?? "unknown";
    return `Command not found: '${cmd}'. Is it installed and in PATH?`;
  }

  // ECONNREFUSED — server not listening
  if (msg.includes("ECONNREFUSED") || msg.includes("Connection refused")) {
    const url = (config.transport as any).url ?? "unknown";
    return `Connection refused to ${url}. Is the MCP server running?`;
  }

  // Timeout
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout") || msg.includes("Timeout")) {
    return `Connection timed out to ${config.name}. The server may be slow to start.`;
  }

  // Auth errors
  if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("authentication")) {
    return `Authentication failed for ${config.name}. Check your API keys or tokens.`;
  }

  // MCP protocol errors
  if (msg.includes("-32000") || msg.includes("Connection closed")) {
    return `Server '${config.name}' closed the connection. It may have crashed during startup.`;
  }

  if (msg.includes("-32601") || msg.includes("Method not found")) {
    return `Protocol error with '${config.name}': The server doesn't support this MCP method.`;
  }

  // Generic fallback
  return `Failed to connect to ${config.name}: ${msg}`;
}

// ---------------------------------------------------------------------------
// Env Variable Interpolation
// ---------------------------------------------------------------------------

const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

/**
 * Interpolate `${ENV_VAR}` patterns in string values of a record.
 * Returns a new record with values resolved from process.env.
 * Missing env vars are replaced with an empty string.
 */
export function interpolateEnv(record: Record<string, string> | undefined): Record<string, string> {
  if (!record) return {};

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = value.replace(ENV_VAR_PATTERN, (_, varName: string) => {
      const envValue = process.env[varName];
      if (envValue === undefined) {
        console.warn(`[MCP] Environment variable '${varName}' not set for key '${key}'`);
      }
      return envValue ?? "";
    });
  }

  return result;
}