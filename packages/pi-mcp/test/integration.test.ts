/**
 * Integration test for pi-mcp package
 *
 * Tests:
 * 1. Extension module loads without error
 * 2. Config loading works (old + new format)
 * 3. MCPConnectionManager can be instantiated
 * 4. Old-format config migration
 * 5. Client can connect to MCP server
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  loadConfig,
  saveConfig,
  createDefaultConfig,
  importClaudeDesktopServers,
  getEnabledServers,
  upsertServer,
  removeServer,
  toggleServer,
  normalizeConfig,
  type MCPConfig,
} from "../src/config/index.js";
import { MCPConnectionManager, type MCPServerConfig } from "../src/client/index.js";
import * as fs from "node:fs";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Config Loading Tests
// ---------------------------------------------------------------------------

describe("MCP Config", () => {
  const tmpDir = join(os.tmpdir(), `mcp-test-${Date.now()}`);
  const configFile = join(tmpDir, "mcp.json");

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("createDefaultConfig returns valid config", () => {
    const config = createDefaultConfig();
    expect(config.servers).toBeInstanceOf(Array);
    expect(config.servers.length).toBeGreaterThan(0);
    expect(config.importClaudeDesktop).toBeDefined();
  });

  test("default config servers have transport configs", () => {
    const config = createDefaultConfig();
    for (const server of config.servers) {
      expect(server.name).toBeTruthy();
      expect(server.transport).toBeDefined();
      expect(server.transport.type).toMatch(/^(stdio|sse|streamable-http)$/);
    }
  });

  test("normalizeConfig handles old flat format", () => {
    const oldFormat = {
      servers: [
        {
          name: "test-server",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
          enabled: false,
        },
      ],
    };

    const config = normalizeConfig(oldFormat);
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].name).toBe("test-server");
    expect(config.servers[0].transport.type).toBe("stdio");
    expect(config.servers[0].transport.command).toBe("npx");
    expect(config.servers[0].transport.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]);
  });

  test("normalizeConfig handles new transport format", () => {
    const newFormat = {
      servers: [
        {
          name: "test-http",
          transport: {
            type: "streamable-http",
            url: "https://example.com/mcp",
          },
          enabled: true,
        },
      ],
    };

    const config = normalizeConfig(newFormat);
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0].transport.type).toBe("streamable-http");
  });

  test("normalizeConfig handles existing mcp.json flat format", () => {
    // This matches the actual ~/.0xkobold/mcp.json format
    const existingFormat = [
      {
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/moika"],
        enabled: false,
      },
      {
        name: "github",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_TOKEN: "" },
        enabled: false,
      },
    ];

    const config = normalizeConfig({ servers: existingFormat });
    expect(config.servers).toHaveLength(2);

    const fs_server = config.servers[0];
    expect(fs_server.name).toBe("filesystem");
    expect(fs_server.transport.type).toBe("stdio");
    expect(fs_server.transport.command).toBe("npx");

    const gh_server = config.servers[1];
    expect(gh_server.name).toBe("github");
    expect(gh_server.transport.type).toBe("stdio");
    expect(gh_server.transport.env).toEqual({ GITHUB_TOKEN: "" });
  });

  test("upsertServer adds new server", () => {
    const config = createDefaultConfig();
    const initialCount = config.servers.length;

    const newServer: MCPServerConfig = {
      name: "test-new",
      transport: { type: "stdio", command: "echo" },
      enabled: false,
    };

    const updated = upsertServer(config, newServer);
    expect(updated.servers).toHaveLength(initialCount + 1);
    expect(updated.servers[updated.servers.length - 1].name).toBe("test-new");
  });

  test("upsertServer updates existing server", () => {
    const config = createDefaultConfig();
    const firstServer = config.servers[0];

    const updated = upsertServer(config, {
      ...firstServer,
      enabled: true,
    });

    expect(updated.servers).toHaveLength(config.servers.length);
    const updatedServer = updated.servers.find((s) => s.name === firstServer.name);
    expect(updatedServer?.enabled).toBe(true);
  });

  test("removeServer removes by name", () => {
    const config = createDefaultConfig();
    const name = config.servers[0].name;

    const updated = removeServer(config, name);
    expect(updated.servers.find((s) => s.name === name)).toBeUndefined();
  });

  test("toggleServer flips enabled state", () => {
    const config = createDefaultConfig();
    const name = config.servers[0].name;
    const wasEnabled = config.servers[0].enabled;

    const toggled = toggleServer(config, name);
    const server = toggled.servers.find((s) => s.name === name);
    expect(server?.enabled).toBe(!wasEnabled);
  });

  test("getEnabledServers returns only enabled", () => {
    const config: MCPConfig = {
      servers: [
        { name: "a", transport: { type: "stdio", command: "echo" }, enabled: false },
        { name: "b", transport: { type: "stdio", command: "echo" }, enabled: true },
        { name: "c", transport: { type: "sse", url: "http://example.com" }, enabled: true },
      ],
      importClaudeDesktop: false,
    };

    const enabled = getEnabledServers(config);
    expect(enabled).toHaveLength(2);
    expect(enabled.every((s) => s.enabled)).toBe(true);
  });

  test("saveConfig and loadConfig roundtrip", () => {
    // Use temp file
    const originalFile = join(homedir(), ".0xkobold", "mcp.json");
    const backupFile = join(tmpDir, "mcp-backup.json");

    // Backup existing config if present
    if (fs.existsSync(originalFile)) {
      fs.copyFileSync(originalFile, backupFile);
    }

    try {
      const config = createDefaultConfig();
      saveConfig(config);

      const loaded = loadConfig();
      expect(loaded.servers.length).toBeGreaterThanOrEqual(config.servers.length);
    } finally {
      // Restore backup
      if (fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, originalFile);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ConnectionManager Tests
// ---------------------------------------------------------------------------

describe("MCPConnectionManager", () => {
  test("can be instantiated", () => {
    const manager = new MCPConnectionManager();
    expect(manager).toBeDefined();
    expect(manager.getAllConnectionInfo()).toEqual([]);
  });

  test("getConnectionInfo returns undefined for unknown server", () => {
    const manager = new MCPConnectionManager();
    expect(manager.getConnectionInfo("nonexistent")).toBeUndefined();
  });

  test("onChange callback registration returns unsubscribe", () => {
    const manager = new MCPConnectionManager();
    const calls: Array<[string, any]> = [];
    const unsubscribe = manager.onChange((name, info) => {
      calls.push([name, info]);
    });
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  test("disconnectAll on empty manager is no-op", async () => {
    const manager = new MCPConnectionManager();
    await manager.disconnectAll(); // Should not throw
  });

  test("refresh on unknown server returns null", async () => {
    const manager = new MCPConnectionManager();
    const result = await manager.refresh("nonexistent");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Live Connection Test (requires npx)
// ---------------------------------------------------------------------------

describe("MCP Live Connection", () => {
  // Skip if npx is not available
  const hasNpx = Bun.which("npx") !== null;

  test.skipIf(!hasNpx)("connect to @modelcontextprotocol/server-filesystem via stdio", async () => {
    const manager = new MCPConnectionManager();

    try {
      const info = await manager.connect({
        name: "test-fs",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", import.meta.dir],
        },
        enabled: true,
        autoReconnect: false,
        maxReconnectAttempts: 0,
      });

      expect(info.status).toBe("ready");
      expect(info.name).toBe("test-fs");
      expect(info.tools.length).toBeGreaterThan(0);

      // Filesystem server typically provides: read_file, write_file, list_directory, etc.
      const toolNames = info.tools.map((t) => t.name);
      console.log("[Live Test] Discovered tools:", toolNames.join(", "));

      // Try calling a tool
      const listResult = await manager.callTool("test-fs", "list_directory", {
        path: import.meta.dir,
      });
      expect(listResult).toBeDefined();

      console.log("[Live Test] list_directory result:", JSON.stringify(listResult).slice(0, 200));
    } finally {
      await manager.disconnectAll();
    }
  });

  test.skipIf(!hasNpx)("call read_file tool on filesystem server", async () => {
    const manager = new MCPConnectionManager();
    const testDir = import.meta.dir; // test file's directory

    try {
      // Write a temp file in the test directory (which is within allowed dirs)
      const tmpFile = join(testDir, `mcp-test-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, "hello from mcp test");

      await manager.connect({
        name: "test-fs-read",
        transport: {
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", testDir],
        },
        enabled: true,
        autoReconnect: false,
        maxReconnectAttempts: 0,
      });

      // Read file via MCP
      const result = await manager.callTool("test-fs-read", "read_text_file", {
        path: tmpFile,
      });

      expect(result).toBeDefined();
      const text = (result as any)?.content?.[0]?.text ?? "";
      expect(text).toContain("hello from mcp test");

      // Cleanup
      fs.unlinkSync(tmpFile);
    } finally {
      await manager.disconnectAll();
    }
  });
});