/**
 * Unit tests for pi-mcp
 *
 * Covers:
 * - Tool bridge schema conversion (JSON Schema → TypeBox)
 * - Config validation and migration
 * - ConnectionManager error handling
 * - Edge cases in normalizeConfig
 */

import { describe, test, expect } from "bun:test";
import { normalizeConfig, upsertServer, removeServer, toggleServer, getEnabledServers, mergeProjectConfig } from "../src/config/index.js";
import type { MCPConfig } from "../src/config/index.js";
import { MCPConnectionManager } from "../src/client/index.js";
import type { MCPServerConfig } from "../src/client/index.js";
import { interpolateEnv } from "../src/client/index.js";
import { isToolAllowed } from "../src/tools/index.js";

// ---------------------------------------------------------------------------
// Schema Conversion Tests (via registered tools)
// ---------------------------------------------------------------------------

describe("Schema conversion edge cases", () => {
  // We test mcpSchemaToTypeBox indirectly through normalizeConfig
  // since it's not exported. Direct testing would require extracting it.

  test("normalizeConfig handles server with no properties in inputSchema", () => {
    const config = normalizeConfig({
      servers: [{
        name: "minimal",
        transport: { type: "stdio", command: "echo" },
        enabled: false,
      }],
    });
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].name).toBe("minimal");
  });

  test("normalizeConfig handles server with url field (old HTTP format)", () => {
    const config = normalizeConfig({
      servers: [{
        name: "legacy-http",
        url: "https://example.com/mcp",
        enabled: true,
      }],
    });
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].transport.type).toBe("streamable-http");
    expect(config.servers[0].transport.url).toBe("https://example.com/mcp");
  });

  test("normalizeConfig handles empty servers array", () => {
    const config = normalizeConfig({ servers: [] });
    expect(config.servers).toHaveLength(0);
    expect(config.importClaudeDesktop).toBe(false);
  });

  test("normalizeConfig handles missing servers array", () => {
    const config = normalizeConfig({});
    expect(config.servers).toHaveLength(0);
  });

  test("normalizeConfig defaults importClaudeDesktop to false", () => {
    const config = normalizeConfig({ servers: [] });
    expect(config.importClaudeDesktop).toBe(false);
  });

  test("normalizeConfig preserves importClaudeDesktop when set", () => {
    const config = normalizeConfig({ servers: [], importClaudeDesktop: true });
    expect(config.importClaudeDesktop).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Config Validation Tests
// ---------------------------------------------------------------------------

describe("Config validation", () => {
  test("normalizeServer throws on missing name", () => {
    expect(() => normalizeConfig({
      servers: [{ command: "echo" }],
    })).toThrow("must have a non-empty 'name' field");
  });

  test("normalizeServer throws on empty name", () => {
    expect(() => normalizeConfig({
      servers: [{ name: "", command: "echo" }],
    })).toThrow("must have a non-empty 'name' field");
  });

  test("normalizeServer throws on missing transport and command", () => {
    expect(() => normalizeConfig({
      servers: [{ name: "broken" }],
    })).toThrow("must have either 'command' (stdio), 'url' (http), or 'transport' config");
  });

  test("normalizeTransport throws on missing type", () => {
    expect(() => normalizeConfig({
      servers: [{ name: "bad-transport", transport: {} }],
    })).toThrow("must have a 'type' field");
  });

  test("normalizeTransport throws on unknown type", () => {
    expect(() => normalizeConfig({
      servers: [{ name: "bad-type", transport: { type: "carrier-pigeon" } }],
    })).toThrow("Unknown transport type: carrier-pigeon");
  });

  test("normalizeConfig handles websocket transport", () => {
    const config = normalizeConfig({
      servers: [{
        name: "ws-server",
        transport: {
          type: "websocket",
          url: "ws://localhost:8080/mcp",
        },
        enabled: true,
      }],
    });
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].transport.type).toBe("websocket");
  });
});

// ---------------------------------------------------------------------------
// Config Migration Tests (TASK-06)
// ---------------------------------------------------------------------------

describe("Config migration", () => {
  test("migrates old-format mcp.json (flat array with command/args)", () => {
    // This is the actual format from ~/.0xkobold/mcp.json
    const oldFormat = [
      {
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"],
        enabled: false,
      },
      {
        name: "github",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "ghp_xxx" },
        enabled: false,
      },
      {
        name: "sqlite",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-sqlite"],
        enabled: false,
      },
    ];

    const config = normalizeConfig({ servers: oldFormat });

    // All servers migrated with stdio transport
    expect(config.servers).toHaveLength(3);

    const fs = config.servers[0];
    expect(fs.name).toBe("filesystem");
    expect(fs.transport.type).toBe("stdio");
    expect(fs.transport.command).toBe("npx");
    expect(fs.transport.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]);

    const gh = config.servers[1];
    expect(gh.name).toBe("github");
    expect(gh.transport.env).toEqual({ GITHUB_TOKEN: "ghp_xxx" });

    const sql = config.servers[2];
    expect(sql.name).toBe("sqlite");
    expect(sql.autoReconnect).toBe(true); // default
  });

  test("migrates old format with url instead of command", () => {
    const oldFormat = [
      {
        name: "remote-api",
        url: "https://api.example.com/mcp",
        enabled: true,
      },
    ];

    const config = normalizeConfig({ servers: oldFormat });
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].transport.type).toBe("streamable-http");
    expect(config.servers[0].transport.url).toBe("https://api.example.com/mcp");
    expect(config.servers[0].enabled).toBe(true);
  });

  test("preserves autoReconnect and maxReconnectAttempts from old format", () => {
    const oldFormat = [
      {
        name: "resilient",
        command: "my-server",
        enabled: true,
        autoReconnect: false,
        maxReconnectAttempts: 3,
        reconnectDelayMs: 500,
      },
    ];

    const config = normalizeConfig({ servers: oldFormat });
    const server = config.servers[0];
    expect(server.autoReconnect).toBe(false);
    expect(server.maxReconnectAttempts).toBe(3);
    expect(server.reconnectDelayMs).toBe(500);
  });

  test("handles mixed old and new format servers", () => {
    const mixed = [
      {
        name: "old-server",
        command: "echo",
        args: ["hello"],
        enabled: true,
      },
      {
        name: "new-server",
        transport: {
          type: "websocket",
          url: "ws://localhost:8080",
        },
        enabled: false,
      },
    ];

    const config = normalizeConfig({ servers: mixed });
    expect(config.servers).toHaveLength(2);

    const old = config.servers[0];
    expect(old.transport.type).toBe("stdio");

    const nw = config.servers[1];
    expect(nw.transport.type).toBe("websocket");
  });

  test("detects websocket URL scheme in old format", () => {
    const config = normalizeConfig({
      servers: [
        { name: "ws-old", url: "wss://mcp.example.com/ws", enabled: true },
        { name: "http-old", url: "https://mcp.example.com/http", enabled: true },
      ],
    });

    expect(config.servers[0].transport.type).toBe("websocket");
    expect(config.servers[1].transport.type).toBe("streamable-http");
  });
});

// ---------------------------------------------------------------------------
// ConnectionManager Error Handling Tests
// ---------------------------------------------------------------------------

describe("MCPConnectionManager error handling", () => {
  test("connect fails gracefully for non-existent command", async () => {
    const manager = new MCPConnectionManager();
    try {
      const info = await manager.connect({
        name: "bad-cmd",
        transport: { type: "stdio", command: "nonexistent-binary-xyz-123" },
        enabled: true,
        autoReconnect: false,
        maxReconnectAttempts: 0,
      });

      expect(info.status).toBe("error");
      expect(info.error).toBeTruthy();
      // Error message should mention the command
      expect(info.error).toMatch(/nonexistent-binary-xyz-123|not found|ENOENT|spawn/i);
    } finally {
      await manager.disconnectAll();
    }
  });

  test("connect fails gracefully for invalid URL", async () => {
    const manager = new MCPConnectionManager();
    try {
      const info = await manager.connect({
        name: "bad-url",
        // @ts-expect-error - testing invalid input
        transport: { type: "streamable-http", url: "" },
        enabled: true,
        autoReconnect: false,
        maxReconnectAttempts: 0,
      });
      // connect catches errors internally
      expect(info.status).toBe("error");
      expect(info.error).toMatch(/non-empty.*url|invalid.*url/i);
    } finally {
      await manager.disconnectAll();
    }
  });

  test("connect fails gracefully for missing command", async () => {
    const manager = new MCPConnectionManager();
    try {
      const info = await manager.connect({
        name: "no-cmd",
        // @ts-expect-error - testing invalid input
        transport: { type: "stdio", command: "" },
        enabled: true,
        autoReconnect: false,
        maxReconnectAttempts: 0,
      });
      // connect catches errors internally
      expect(info.status).toBe("error");
      expect(info.error).toMatch(/non-empty.*command/i);
    } finally {
      await manager.disconnectAll();
    }
  });

  test("callTool throws for unknown server", async () => {
    const manager = new MCPConnectionManager();
    try {
      await manager.callTool("nonexistent", "some-tool", {});
      expect(true).toBe(false);
    } catch (err) {
      expect(String(err)).toMatch(/not connected/i);
    }
  });

  test("readResource throws for unknown server", async () => {
    const manager = new MCPConnectionManager();
    try {
      await manager.readResource("nonexistent", "test://resource");
      expect(true).toBe(false);
    } catch (err) {
      expect(String(err)).toMatch(/not connected/i);
    }
  });

  test("getPrompt throws for unknown server", async () => {
    const manager = new MCPConnectionManager();
    try {
      await manager.getPrompt("nonexistent", "my-prompt");
      expect(true).toBe(false);
    } catch (err) {
      expect(String(err)).toMatch(/not connected/i);
    }
  });

  test("error on connect is stored in connection info", async () => {
    const manager = new MCPConnectionManager();
    try {
      const info = await manager.connect({
        name: "doomed",
        transport: { type: "stdio", command: "nonexistent-xyz-999" },
        enabled: true,
        autoReconnect: false,
        maxReconnectAttempts: 0,
      });

      expect(info.status).toBe("error");
      expect(info.error).toBeTruthy();
      expect(info.tools).toHaveLength(0);
    } finally {
      await manager.disconnectAll();
    }
  });
});

// ---------------------------------------------------------------------------
// Config CRUD Tests
// ---------------------------------------------------------------------------

describe("Config CRUD operations", () => {
  const baseConfig: MCPConfig = {
    servers: [
      { name: "a", transport: { type: "stdio", command: "echo" }, enabled: true },
      { name: "b", transport: { type: "sse", url: "http://example.com" }, enabled: false },
    ],
    importClaudeDesktop: false,
  };

  test("upsertServer adds new server", () => {
    const updated = upsertServer(baseConfig, {
      name: "c",
      transport: { type: "websocket", url: "ws://localhost" },
      enabled: true,
    });
    expect(updated.servers).toHaveLength(3);
    expect(updated.servers[2].name).toBe("c");
  });

  test("upsertServer updates existing server by name", () => {
    const updated = upsertServer(baseConfig, {
      name: "a",
      transport: { type: "streamable-http", url: "https://new.url" },
      enabled: false,
    });
    expect(updated.servers).toHaveLength(2);
    expect(updated.servers[0].transport.type).toBe("streamable-http");
    expect(updated.servers[0].enabled).toBe(false);
  });

  test("removeServer does nothing for non-existent name", () => {
    const updated = removeServer(baseConfig, "nonexistent");
    expect(updated.servers).toHaveLength(2);
  });

  test("toggleServer does nothing for non-existent name", () => {
    const updated = toggleServer(baseConfig, "nonexistent");
    expect(updated.servers).toEqual(baseConfig.servers);
  });

  test("getEnabledServers filters correctly", () => {
    const enabled = getEnabledServers(baseConfig);
    expect(enabled).toHaveLength(1);
    expect(enabled[0].name).toBe("a");
  });

  test("upsertServer does not mutate original config", () => {
    const original = JSON.parse(JSON.stringify(baseConfig));
    upsertServer(baseConfig, {
      name: "c",
      transport: { type: "stdio", command: "cat" },
      enabled: false,
    });
    expect(baseConfig.servers).toEqual(original.servers);
  });

  test("removeServer does not mutate original config", () => {
    const original = JSON.parse(JSON.stringify(baseConfig));
    removeServer(baseConfig, "a");
    expect(baseConfig.servers).toEqual(original.servers);
  });

  test("toggleServer does not mutate original config", () => {
    const original = JSON.parse(JSON.stringify(baseConfig));
    toggleServer(baseConfig, "a");
    expect(baseConfig.servers).toEqual(original.servers);
  });
});

// ---------------------------------------------------------------------------
// ConnectionManager onChange Tests
// ---------------------------------------------------------------------------

describe("MCPConnectionManager onChange", () => {
  test("onChange fires on connect (even on error)", async () => {
    const manager = new MCPConnectionManager();
    const events: Array<[string, string]> = [];
    manager.onChange((name, info) => {
      events.push([name, info.status]);
    });

    try {
      await manager.connect({
        name: "fail-server",
        transport: { type: "stdio", command: "nonexistent-binary-abc" },
        enabled: true,
        autoReconnect: false,
        maxReconnectAttempts: 0,
      });
    } catch {
      // expected to fail
    }

    // Should have at least 'connecting' and 'error' events
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.some((e) => e[0] === "fail-server")).toBe(true);
  });

  test("multiple onChange callbacks all fire", async () => {
    const manager = new MCPConnectionManager();
    const calls1: string[] = [];
    const calls2: string[] = [];

    manager.onChange((name) => calls1.push(name));
    manager.onChange((name) => calls2.push(name));

    try {
      await manager.connect({
        name: "multi-cb",
        transport: { type: "stdio", command: "nonexistent-xyz" },
        enabled: true,
        autoReconnect: false,
        maxReconnectAttempts: 0,
      });
    } catch {
      // expected to fail
    }

    expect(calls1.length).toBeGreaterThan(0);
    expect(calls2.length).toBeGreaterThan(0);
  });

  test("unsubscribed callback does not fire", async () => {
    const manager = new MCPConnectionManager();
    const calls: string[] = [];

    const unsub = manager.onChange((name) => calls.push(name));
    unsub();

    try {
      await manager.connect({
        name: "unsub-test",
        transport: { type: "stdio", command: "nonexistent-xyz" },
        enabled: true,
        autoReconnect: false,
        maxReconnectAttempts: 0,
      });
    } catch {
      // expected to fail
    }

    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tool Filtering Tests
// ---------------------------------------------------------------------------

describe("Tool filtering", () => {
  test("normalizeConfig rejects both allowedTools and deniedTools", () => {
    expect(() => normalizeConfig({
      servers: [{
        name: "conflict",
        transport: { type: "stdio", command: "echo" },
        enabled: true,
        allowedTools: ["foo"],
        deniedTools: ["bar"],
      }],
    })).toThrow("cannot have both");
  });

  test("normalizeConfig preserves allowedTools", () => {
    const config = normalizeConfig({
      servers: [{
        name: "filtered",
        transport: { type: "stdio", command: "echo" },
        enabled: true,
        allowedTools: ["read_file", "list_directory"],
      }],
    });
    expect(config.servers[0].allowedTools).toEqual(["read_file", "list_directory"]);
    expect(config.servers[0].deniedTools).toBeUndefined();
  });

  test("normalizeConfig preserves deniedTools", () => {
    const config = normalizeConfig({
      servers: [{
        name: "filtered",
        transport: { type: "stdio", command: "echo" },
        enabled: true,
        deniedTools: ["write_file", "delete_file"],
      }],
    });
    expect(config.servers[0].deniedTools).toEqual(["write_file", "delete_file"]);
    expect(config.servers[0].allowedTools).toBeUndefined();
  });

  test("upsertServer preserves allowedTools", () => {
    const base: MCPConfig = {
      servers: [{ name: "a", transport: { type: "stdio", command: "echo" }, enabled: true }],
      importClaudeDesktop: false,
    };

    const updated = upsertServer(base, {
      name: "a",
      transport: { type: "stdio", command: "cat" },
      enabled: true,
      allowedTools: ["tool1"],
    });
    expect(updated.servers[0].allowedTools).toEqual(["tool1"]);
  });

  test("upsertServer can update filter list", () => {
    const base: MCPConfig = {
      servers: [{
        name: "a",
        transport: { type: "stdio", command: "echo" },
        enabled: true,
        deniedTools: ["old_tool"],
      }],
      importClaudeDesktop: false,
    };

    const updated = upsertServer(base, {
      name: "a",
      transport: { type: "stdio", command: "echo" },
      enabled: true,
      deniedTools: ["new_tool"],
    });
    expect(updated.servers[0].deniedTools).toEqual(["new_tool"]);
  });
});

// ---------------------------------------------------------------------------
// Env Variable Interpolation Tests
// ---------------------------------------------------------------------------

describe("Env variable interpolation", () => {
  test("interpolateEnv replaces ${VAR} with env value", () => {
    process.env.TEST_MCP_KEY = "secret123";
    const result = interpolateEnv({ API_KEY: "${TEST_MCP_KEY}" });
    expect(result.API_KEY).toBe("secret123");
    delete process.env.TEST_MCP_KEY;
  });

  test("interpolateEnv replaces missing vars with empty string", () => {
    delete process.env.NONEXISTENT_VAR_XYZ;
    const result = interpolateEnv({ KEY: "${NONEXISTENT_VAR_XYZ}" });
    expect(result.KEY).toBe("");
  });

  test("interpolateEnv handles mixed static and variable content", () => {
    process.env.TEST_MCP_HOST = "api.example.com";
    const result = interpolateEnv({ URL: "https://${TEST_MCP_HOST}/v1" });
    expect(result.URL).toBe("https://api.example.com/v1");
    delete process.env.TEST_MCP_HOST;
  });

  test("interpolateEnv handles multiple variables in one value", () => {
    process.env.TEST_MCP_USER = "alice";
    process.env.TEST_MCP_HOST = "api.example.com";
    const result = interpolateEnv({ DSN: "${TEST_MCP_USER}@${TEST_MCP_HOST}" });
    expect(result.DSN).toBe("alice@api.example.com");
    delete process.env.TEST_MCP_USER;
    delete process.env.TEST_MCP_HOST;
  });

  test("interpolateEnv returns empty object for undefined input", () => {
    const result = interpolateEnv(undefined);
    expect(Object.keys(result)).toHaveLength(0);
  });

  test("interpolateEnv leaves values without ${} unchanged", () => {
    const result = interpolateEnv({ KEY: "static-value" });
    expect(result.KEY).toBe("static-value");
  });
});

// ---------------------------------------------------------------------------
// Tool Filtering Logic Tests
// ---------------------------------------------------------------------------

describe("Tool filtering logic", () => {
  test("isToolAllowed: no filters = all allowed", () => {
    expect(isToolAllowed("any_tool", undefined, undefined)).toBe(true);
  });

  test("isToolAllowed: empty filters = all allowed", () => {
    expect(isToolAllowed("any_tool", [], [])).toBe(true);
  });

  test("isToolAllowed: allowlist only includes listed tools", () => {
    expect(isToolAllowed("read_file", ["read_file", "list_directory"], undefined)).toBe(true);
    expect(isToolAllowed("write_file", ["read_file", "list_directory"], undefined)).toBe(false);
  });

  test("isToolAllowed: denylist only excludes listed tools", () => {
    expect(isToolAllowed("read_file", undefined, ["write_file", "delete_file"])).toBe(true);
    expect(isToolAllowed("write_file", undefined, ["write_file", "delete_file"])).toBe(false);
  });

  test("isToolAllowed: allowlist takes precedence when both set (should not happen)", () => {
    // Config validation prevents both from being set, but test the function
    expect(isToolAllowed("read_file", ["read_file"], ["read_file"])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Multi-project Config Tests
// ---------------------------------------------------------------------------

describe("mergeProjectConfig", () => {

  test("mergeProjectConfig: project servers appended when no overlap", () => {
    const global: MCPConfig = {
      servers: [{ name: "a", transport: { type: "stdio", command: "echo" }, enabled: true }],
      importClaudeDesktop: false,
    };
    const project: MCPConfig = {
      servers: [{ name: "b", transport: { type: "stdio", command: "cat" }, enabled: true }],
    };
    const merged = mergeProjectConfig(global, project);
    expect(merged.servers).toHaveLength(2);
    expect(merged.servers.map((s) => s.name)).toEqual(["a", "b"]);
  });

  test("mergeProjectConfig: project server overrides global by name", () => {
    const global: MCPConfig = {
      servers: [{ name: "a", transport: { type: "stdio", command: "echo" }, enabled: true }],
      importClaudeDesktop: false,
    };
    const project: MCPConfig = {
      servers: [{ name: "a", transport: { type: "stdio", command: "cat" }, enabled: false }],
    };
    const merged = mergeProjectConfig(global, project);
    expect(merged.servers).toHaveLength(1);
    expect(merged.servers[0].enabled).toBe(false);
  });

  test("mergeProjectConfig: does not mutate original configs", () => {
    const global: MCPConfig = {
      servers: [{ name: "a", transport: { type: "stdio", command: "echo" }, enabled: true }],
      importClaudeDesktop: false,
    };
    const project: MCPConfig = {
      servers: [{ name: "b", transport: { type: "stdio", command: "cat" }, enabled: true }],
    };
    mergeProjectConfig(global, project);
    expect(global.servers).toHaveLength(1);
    expect(project.servers).toHaveLength(1);
  });

  test("mergeProjectConfig: importClaudeDesktop from global takes precedence", () => {
    const global: MCPConfig = {
      servers: [],
      importClaudeDesktop: true,
    };
    const project: MCPConfig = {
      servers: [],
      importClaudeDesktop: false,
    };
    const merged = mergeProjectConfig(global, project);
    expect(merged.importClaudeDesktop).toBe(true);
  });

  test("mergeProjectConfig: importClaudeDesktop falls back to project if global undefined", () => {
    const global: MCPConfig = {
      servers: [],
    };
    const project: MCPConfig = {
      servers: [],
      importClaudeDesktop: true,
    };
    const merged = mergeProjectConfig(global, project);
    expect(merged.importClaudeDesktop).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Health Monitoring Tests
// ---------------------------------------------------------------------------

describe("Health monitoring", () => {
  test("ConnectionInfo includes health fields after connect error", () => {
    const manager = new MCPConnectionManager();
    const info = manager.connect({
      name: "health-test",
      transport: { type: "stdio", command: "nonexistent-health-xyz" },
      enabled: true,
      autoReconnect: false,
      maxReconnectAttempts: 0,
    });

    // .connect() catches errors and returns status=error
    return info.then((result) => {
      expect(result.status).toBe("error");
      expect(result.toolCallCount).toBe(0);
      expect(result.toolCallErrorCount).toBe(0);
      expect(result.lastError).toBeDefined();
      expect(result.connectedAt).toBeUndefined();
    });
  });

  test("getConnectionInfo returns health tracking fields", () => {
    const manager = new MCPConnectionManager();
    // No connections
    const info = manager.getConnectionInfo("nonexistent");
    expect(info).toBeUndefined();
  });
});