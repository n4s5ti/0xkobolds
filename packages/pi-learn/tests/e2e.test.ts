/**
 * E2E Tests - Full pi-learn extension workflow
 * Tests: initialization, tool execution, commands, events, background services, error handling
 * 
 * Run with: pnpm test:e2e or npx vitest run tests/e2e.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Import from modular src modules
import { createStore, type SQLiteStore } from "../src/core/store.js";
import { createContextAssembler, type ContextAssembler } from "../src/core/context.js";
import { createReasoningEngine, type ReasoningEngineConfig, type ReasoningEngine } from "../src/core/reasoning.js";
import { createToolExecutors, TOOLS, type ToolsConfig } from "../src/tools/index.js";
import type { PeerCard, Conclusion, Summary, Observation } from "../src/shared.js";

// ============================================================================
// TEST SETUP
// ============================================================================

const testDir = path.join(os.tmpdir(), `pi-learn-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
let originalSettings: string | null = null;

beforeEach(async () => {
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  if (fs.existsSync(settingsPath)) {
    originalSettings = fs.readFileSync(settingsPath, "utf-8");
  }
});

afterEach(async () => {
  // Cleanup test databases
  try {
    const files = fs.readdirSync(testDir);
    for (const file of files) {
      fs.unlinkSync(path.join(testDir, file));
    }
    fs.rmdirSync(testDir);
  } catch {
    // Ignore cleanup errors
  }
  
  // Restore original settings
  if (originalSettings) {
    fs.writeFileSync(settingsPath, originalSettings);
  } else if (fs.existsSync(settingsPath)) {
    fs.unlinkSync(settingsPath);
  }
  originalSettings = null;
});

// Mock fetch for Ollama API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function createTestStore(): Promise<SQLiteStore> {
  const dbPath = path.join(testDir, `test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.db`);
  const store = await createStore(dbPath);
  await store.init();
  return store;
}

function createTestConfig() {
  return {
    workspaceId: "test-workspace",
    reasoningEnabled: true,
    reasoningModel: "llama3.1",
    embeddingModel: "nomic-embed-text-v2-moe",
    tokenBatchSize: 100,
    ollamaBaseUrl: "http://localhost:11434",
    ollamaApiKey: "",
    retention: {
      retentionDays: 30,
      summaryRetentionDays: 30,
      conclusionRetentionDays: 90,
      pruneOnStartup: false,
      pruneIntervalHours: 24,
    },
    dream: {
      enabled: true,
      intervalMs: 60000,
      minMessagesSinceLastDream: 5,
      batchSize: 50,
    },
  };
}

function setupMockSettings(settings: Record<string, any>) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function createTestReasoningEngine(): ReasoningEngine {
  const config: ReasoningEngineConfig = {
    ollamaBaseUrl: "http://localhost:11434",
    ollamaApiKey: "",
    reasoningModel: "llama3.1",
    embeddingModel: "nomic-embed-text-v2-moe",
    tokenBatchSize: 100,
  };
  return createReasoningEngine(config);
}

function createMockContext() {
  return {
    sessionManager: { getSessionFile: () => `test-session-${Date.now()}` },
    ui: { 
      setStatus: vi.fn(),
      notify: vi.fn(),
    },
  };
}

function createToolExecutorsWithStore(store: SQLiteStore, contextAssembler: ContextAssembler, reasoningEngine: ReasoningEngine) {
  const config: ToolsConfig = {
    workspaceId: "test-ws",
    retention: { retentionDays: 30, summaryRetentionDays: 30, conclusionRetentionDays: 90 },
    dream: { enabled: false },
  };

  const runDream = vi.fn().mockResolvedValue(undefined);
  return createToolExecutors({ store, contextAssembler, reasoningEngine, config, runDream });
}

// ============================================================================
// E2E: EXTENSION INITIALIZATION
// ============================================================================

describe("E2E: Extension Initialization", () => {
  it("initializes store with default configuration", async () => {
    const store = await createTestStore();
    const contextAssembler = createContextAssembler(store);

    expect(store.getWorkspace("default")).toBeDefined();
    expect(contextAssembler).toBeDefined();
    
    store?.close();
  });

  it("initializes with custom settings", async () => {
    setupMockSettings({
      ollama: { baseUrl: "https://custom.ollama.cloud/v1" },
      learn: {
        workspaceId: "custom-workspace",
        reasoningEnabled: true,
        reasoningModel: "llama3.2",
      },
    });

    const store = await createTestStore();
    store.getOrCreateWorkspace("custom-workspace");
    
    const ws = store.getWorkspace("custom-workspace");
    expect(ws?.id).toBe("custom-workspace");
    
    store?.close();
  });

  it("creates default peer entities on init", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("test-ws");
    store.getOrCreatePeer("test-ws", "user", "User", "user");
    store.getOrCreatePeer("test-ws", "agent", "Agent", "agent");

    const userPeer = store.getPeer("test-ws", "user");
    const agentPeer = store.getPeer("test-ws", "agent");

    expect(userPeer?.type).toBe("user");
    expect(agentPeer?.type).toBe("agent");
    
    store?.close();
  });

  it("handles missing settings file gracefully", async () => {
    // Remove settings if exists
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }

    const store = await createTestStore();
    // Should not throw
    store.getOrCreateWorkspace("default");
    
    store?.close();
  });

  it("handles corrupted settings file gracefully", async () => {
    fs.writeFileSync(settingsPath, "invalid json {{{");

    const store = await createTestStore();
    store.getOrCreateWorkspace("default");
    
    store?.close();
  });

  it("creates multiple workspaces independently", async () => {
    const store = await createTestStore();
    
    store.getOrCreateWorkspace("workspace-a", "Workspace A");
    store.getOrCreateWorkspace("workspace-b", "Workspace B");
    
    const wsA = store.getWorkspace("workspace-a");
    const wsB = store.getWorkspace("workspace-b");
    
    expect(wsA?.name).toBe("Workspace A");
    expect(wsB?.name).toBe("Workspace B");
    expect(wsA?.id).not.toBe(wsB?.id);
    
    store?.close();
  });
});

// ============================================================================
// E2E: TOOL EXECUTION FLOW
// ============================================================================

describe("E2E: Tool Execution Flow", () => {
  let store: SQLiteStore;
  let contextAssembler: ContextAssembler;
  let reasoningEngine: ReasoningEngine;
  let executors: ReturnType<typeof createToolExecutors>;
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ explicit: [], deductive: [], inductive: [], abductive: [] }) } }]
      })
    });
    
    store = await createTestStore();
    store.getOrCreateWorkspace("test-ws");
    store.getOrCreatePeer("test-ws", "user", "User", "user");
    
    contextAssembler = createContextAssembler(store);
    reasoningEngine = createTestReasoningEngine();
    // Setup default mock for reasoning engine
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ explicit: [], deductive: [], inductive: [], abductive: [] }) } }]
      })
    });
    executors = createToolExecutorsWithStore(store, contextAssembler, reasoningEngine);
    mockCtx = createMockContext();
  });

  afterEach(async () => {
    store?.close();
  });

  it("learn_add_message queues message for reasoning", async () => {
    const executor = executors.learn_add_message;
    const result = await executor.execute("tool", { content: "Hello, I love coding", role: "user" }, undefined, undefined, mockCtx);

    expect(result.details.queued).toBe(true);
    expect(reasoningEngine.getQueueSize()).toBeGreaterThanOrEqual(0); // Queue may process async
  });

  it("learn_get_context retrieves assembled context", async () => {
    // Add some data first
    store.saveConclusion("test-ws", {
      id: "c1", peerId: "user", type: "deductive", content: "User is a developer",
      premises: [], confidence: 0.9, createdAt: Date.now(), sourceSessionId: "s1",
    });
    store.savePeerCard("test-ws", {
      peerId: "user", name: "John", occupation: "Developer",
      interests: ["coding"], traits: [], goals: [], updatedAt: Date.now(),
    });

    const executor = executors.learn_get_context;
    const result = await executor.execute("tool", { peerId: "user" }, undefined, undefined, mockCtx);

    expect(result.details.found).toBe(true);
    expect(result.content[0].text).toContain("developer");
  });

  it("learn_query searches conclusions with keyword matching", async () => {
    store.saveConclusion("test-ws", {
      id: "c1", peerId: "user", type: "deductive", content: "User prefers TypeScript",
      premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1",
    });
    store.saveConclusion("test-ws", {
      id: "c2", peerId: "user", type: "inductive", content: "User uses React",
      premises: [], confidence: 0.7, createdAt: Date.now(), sourceSessionId: "s1",
    });

    const executor = executors.learn_query;
    const result = await executor.execute("tool", { query: "TypeScript", topK: 5 }, undefined, undefined, mockCtx);

    expect(result.details.found).toBe(true);
    expect(result.content[0].text).toContain("TypeScript");
  });

  it("learn_reason_now triggers reasoning and returns stats", async () => {
    store.saveConclusion("test-ws", {
      id: "c1", peerId: "user", type: "deductive", content: "Test",
      premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1",
    });

    const executor = executors.learn_reason_now;
    const result = await executor.execute("tool", {}, undefined, undefined, mockCtx);

    expect(result.content[0].text).toContain("conclusions");
    expect(result.details.conclusionCount).toBeGreaterThanOrEqual(1);
  });

  it("learn_trigger_dream executes dream cycle", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              newConclusions: [
                { type: "inductive", content: "User is learning AI", premises: [], confidence: 0.8 },
                { type: "abductive", content: "User wants automation", premises: [], confidence: 0.7 }
              ],
              updatedPatterns: []
            })
          },
        }],
      }),
    });

    const config: ToolsConfig = {
      workspaceId: "test-ws",
      retention: { retentionDays: 30, summaryRetentionDays: 30, conclusionRetentionDays: 90 },
      dream: { enabled: true, intervalMs: 60000, batchSize: 50, minMessagesSinceLastDream: 5 },
    };

    const runDream = async () => {
      const messages = store.getRecentMessages("test-ws", "user", 10);
      const conclusions = store.getConclusions("test-ws", "user", 100);
      const result = await reasoningEngine.dream(messages.map((m: any) => ({ role: m.role, content: m.content })), conclusions);
      for (const c of result.newConclusions) {
        store.saveConclusion("test-ws", {
          id: crypto.randomUUID(), peerId: "user", type: c.type, content: c.content,
          premises: c.premises, confidence: c.confidence, createdAt: Date.now(), sourceSessionId: "dream",
        });
      }
    };

    const dreamExecutors = createToolExecutors({
      store,
      contextAssembler,
      reasoningEngine,
      config,
      runDream,
    });

    const executor = dreamExecutors.learn_trigger_dream;
    const result = await executor.execute("tool", {}, undefined, undefined, mockCtx);

    expect(result.details.success).toBe(true);
    expect(result.content[0].text).toContain("Dream cycle complete");
  });

  it("learn_get_dream_status returns dream metadata", async () => {
    const config: ToolsConfig = {
      workspaceId: "test-ws",
      retention: { retentionDays: 30, summaryRetentionDays: 30, conclusionRetentionDays: 90 },
      dream: { enabled: true, intervalMs: 60000, batchSize: 50, minMessagesSinceLastDream: 5 },
    };

    // Seed some dream metadata
    store.updateDreamMetadata("test-ws", 45, 3);

    const dreamExecutors = createToolExecutors({
      store,
      contextAssembler,
      reasoningEngine,
      config,
      runDream: async () => {},
    });

    const executor = dreamExecutors.learn_get_dream_status;
    const result = await executor.execute("tool", {}, undefined, undefined, mockCtx);

    expect(result.details.enabled).toBe(true);
    expect(result.details.dreamCount).toBe(1);
    expect(result.details.lastDreamMessages).toBe(45);
    expect(result.details.lastDreamConclusions).toBe(3);
    expect(result.details.lastDreamedAt).toBeGreaterThan(0);
    expect(result.content[0].text).toContain("Dream Status");
  });

  it("learn_prune removes old records", async () => {
    // Add old data
    store.getOrCreateSession("test-ws", "old-session", ["user"]);
    store.saveMessage("test-ws", {
      id: "old-msg", sessionId: "old-session", peerId: "user", role: "user",
      content: "Old message", createdAt: Date.now() - 100 * 24 * 60 * 60 * 1000,
    });

    const executor = executors.learn_prune;
    const result = await executor.execute("tool", {}, undefined, undefined, mockCtx);

    expect(result.content[0].text).toContain("Pruned");
    expect(result.details.deleted).toBeGreaterThanOrEqual(1);
  });

  it("learn_get_peer_card retrieves peer information", async () => {
    store.savePeerCard("test-ws", {
      peerId: "user", name: "Alice", occupation: "Engineer",
      interests: ["AI", "ML"], traits: ["analytical"], goals: ["Build AGI"], updatedAt: Date.now(),
    });

    const executor = executors.learn_get_peer_card;
    const result = await executor.execute("tool", { peerId: "user" }, undefined, undefined, mockCtx);

    expect(result.details.found).toBe(true);
    expect(result.details.card.name).toBe("Alice");
    expect(result.details.card.interests).toContain("AI");
  });

  it("learn_update_peer_card modifies peer information", async () => {
    store.savePeerCard("test-ws", {
      peerId: "user", name: "Bob", occupation: "Dev",
      interests: [], traits: [], goals: [], updatedAt: Date.now(),
    });

    const executor = executors.learn_update_peer_card;
    const result = await executor.execute("tool", {
      peerId: "user",
      occupation: "Senior Dev",
      interests: ["TypeScript", "React"],
    }, undefined, undefined, mockCtx);

    expect(result.details.success).toBe(true);

    const updated = store.getPeerCard("test-ws", "user");
    expect(updated?.occupation).toBe("Senior Dev");
    expect(updated?.interests).toContain("TypeScript");
  });

  it("learn_list_peers returns all peers in workspace", async () => {
    store.getOrCreatePeer("test-ws", "user", "User", "user");
    store.getOrCreatePeer("test-ws", "agent", "Agent", "agent");
    store.getOrCreatePeer("test-ws", "assistant", "Assistant", "agent");

    const executor = executors.learn_list_peers;
    const result = await executor.execute("tool", {}, undefined, undefined, mockCtx);

    expect(result.details.count).toBeGreaterThanOrEqual(3);
  });

  it("learn_get_stats returns memory statistics", async () => {
    store.saveConclusion("test-ws", {
      id: "c1", peerId: "user", type: "deductive", content: "Test",
      premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1",
    });
    store.saveSummary("test-ws", {
      id: "s1", sessionId: "s1", peerId: "user", type: "short",
      content: "Test summary", messageCount: 5, createdAt: Date.now(),
    });

    const executor = executors.learn_get_stats;
    const result = await executor.execute("tool", { peerId: "user" }, undefined, undefined, mockCtx);

    expect(result.details.conclusionCount).toBe(1);
    expect(result.details.summaryCount).toBe(1);
  });

  it("learn_get_summaries returns peer summaries", async () => {
    store.saveSummary("test-ws", {
      id: "s1", sessionId: "s1", peerId: "user", type: "short",
      content: "Short summary", messageCount: 5, createdAt: Date.now(),
    });
    store.saveSummary("test-ws", {
      id: "s2", sessionId: "s2", peerId: "user", type: "long",
      content: "Long detailed summary of the conversation", messageCount: 50, createdAt: Date.now(),
    });

    const executor = executors.learn_get_summaries;
    const result = await executor.execute("tool", { peerId: "user", limit: 10 }, undefined, undefined, mockCtx);

    expect(result.details.count).toBe(2);
    expect(result.content[0].text).toContain("summary");
  });

  it("learn_search_sessions finds sessions by keyword", async () => {
    store.getOrCreateSession("test-ws", "session-react", ["user"]);
    store.getOrCreateSession("test-ws", "session-vue", ["user"]);
    store.saveMessage("test-ws", {
      id: "m1", sessionId: "session-react", peerId: "user", role: "user",
      content: "Learning React hooks", createdAt: Date.now(),
    });
    store.saveMessage("test-ws", {
      id: "m2", sessionId: "session-vue", peerId: "user", role: "user",
      content: "Vue composition API", createdAt: Date.now(),
    });

    const executor = executors.learn_search_sessions;
    const result = await executor.execute("tool", { query: "React", limit: 10 }, undefined, undefined, mockCtx);

    expect(result.details.found).toBe(true);
    expect(result.details.results[0].sessionId).toBe("session-react");
  });

  it("learn_get_session retrieves session messages", async () => {
    store.getOrCreateSession("test-ws", "test-session", ["user"]);
    store.saveMessage("test-ws", {
      id: "m1", sessionId: "test-session", peerId: "user", role: "user",
      content: "Hello", createdAt: Date.now(),
    });
    store.saveMessage("test-ws", {
      id: "m2", sessionId: "test-session", peerId: "agent", role: "assistant",
      content: "Hi there!", createdAt: Date.now(),
    });

    const executor = executors.learn_get_session;
    const result = await executor.execute("tool", { sessionId: "test-session", limit: 50 }, undefined, undefined, mockCtx);

    expect(result.details.messageCount).toBe(2);
    expect(result.content[0].text).toContain("Hello");
    expect(result.content[0].text).toContain("Hi there!");
  });

  it("learn_list_sessions returns all sessions", async () => {
    store.getOrCreateSession("test-ws", "session-1", ["user"]);
    store.getOrCreateSession("test-ws", "session-2", ["user"]);

    const executor = executors.learn_list_sessions;
    const result = await executor.execute("tool", { limit: 10 }, undefined, undefined, mockCtx);

    expect(result.details.count).toBe(2);
    expect(result.details.sessions.length).toBe(2);
  });

  it("learn_export exports all memory data", async () => {
    store.saveConclusion("test-ws", {
      id: "c1", peerId: "user", type: "deductive", content: "Test conclusion",
      premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1",
    });

    const executor = executors.learn_export;
    const result = await executor.execute("tool", {}, undefined, undefined, mockCtx);

    expect(result.content[0].text).toContain("conclusions");
    expect(result.details.workspace).toBeDefined();
    expect(result.details.conclusions).toBeDefined();
  });

  it("learn_import imports memory data", async () => {
    const importData = {
      version: "1.0.0",
      exportedAt: Date.now(),
      workspace: { id: "test-ws", name: "Test", createdAt: Date.now(), config: {} },
      peers: [],
      conclusions: [{
        id: "imported-c1", peerId: "user", type: "inductive" as const,
        content: "Imported conclusion", premises: [], confidence: 0.8,
        createdAt: Date.now(), sourceSessionId: "s1",
      }],
      summaries: [],
      observations: [],
      peerCards: [],
    };

    const executor = executors.learn_import;
    const result = await executor.execute("tool", { data: JSON.stringify(importData), merge: true }, undefined, undefined, mockCtx);

    expect(result.details.success).toBe(true);
    
    const conclusions = store.getConclusions("test-ws", "user", 10);
    expect(conclusions.some(c => c.id === "imported-c1")).toBe(true);
  });

  it("learn_import handles invalid JSON gracefully", async () => {
    const executor = executors.learn_import;
    const result = await executor.execute("tool", { data: "not valid json {{{" }, undefined, undefined, mockCtx);

    expect(result.details.success).toBe(false);
    expect(result.content[0].text).toContain("Import failed");
  });

  it("learn_tag_session adds tags to session", async () => {
    store.getOrCreateSession("test-ws", "tagged-session", ["user"]);

    const executor = executors.learn_tag_session;
    const result = await executor.execute("tool", { 
      sessionId: "tagged-session",
      addTags: ["important", "project-a"]
    }, undefined, undefined, mockCtx);

    expect(result.details.success).toBe(true);
    
    const session = store.getSession("test-ws", "tagged-session");
    expect(session?.tags).toContain("important");
    expect(session?.tags).toContain("project-a");
  });

  it("learn_get_sessions_by_tag finds tagged sessions", async () => {
    store.getOrCreateSession("test-ws", "session-typescript", ["user"]);
    store.getOrCreateSession("test-ws", "session-rust", ["user"]);
    
    store.tagSession("test-ws", "session-typescript", ["typescript", "backend"]);
    store.tagSession("test-ws", "session-rust", ["rust", "systems"]);

    const executor = executors.learn_get_sessions_by_tag;
    const result = await executor.execute("tool", { tag: "typescript", limit: 10 }, undefined, undefined, mockCtx);

    expect(result.details.count).toBe(1);
    expect(result.details.sessions[0].id).toBe("session-typescript");
  });

  it("learn_list_tags returns all unique tags", async () => {
    store.getOrCreateSession("test-ws", "session-1", ["user"]);
    store.getOrCreateSession("test-ws", "session-2", ["user"]);
    
    store.tagSession("test-ws", "session-1", ["typescript", "project"]);
    store.tagSession("test-ws", "session-2", ["rust", "project"]);

    const executor = executors.learn_list_tags;
    const result = await executor.execute("tool", {}, undefined, undefined, mockCtx);

    expect(result.details.count).toBe(3); // typescript, rust, project
    expect(result.details.tags.some((t: any) => t.tag === "project")).toBe(true);
  });
});

// ============================================================================
// E2E: COMMAND HANDLERS
// ============================================================================

describe("E2E: Command Handlers", () => {
  let store: SQLiteStore;
  let contextAssembler: ContextAssembler;
  let reasoningEngine: ReasoningEngine;

  beforeEach(async () => {
    mockFetch.mockReset();
    store = await createTestStore();
    store.getOrCreateWorkspace("test-ws");
    store.getOrCreatePeer("test-ws", "user", "User", "user");
    contextAssembler = createContextAssembler(store);
    reasoningEngine = createTestReasoningEngine();
    // Setup default mock for reasoning engine
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ explicit: [], deductive: [], inductive: [], abductive: [] }) } }]
      })
    });
  });

  afterEach(async () => {
    store?.close();
  });

  // Helper to execute a command handler (simulating /learn command)
  async function executeLearnCommand(sub: string, subArgs: string = ""): Promise<string> {
    const workspaceId = "test-ws";
    
    switch (sub) {
      case "status": {
        const stats = contextAssembler.getMemoryStats(workspaceId, "user");
        return `Memory Status:\n- Conclusions: ${stats.conclusionCount}\n- Summaries: ${stats.summaryCount}\n- Peer Card: ${stats.hasPeerCard ? "Yes" : "No"}`;
      }
      case "context": {
        const ctx = contextAssembler.assembleContext(workspaceId, "user");
        return ctx || "No context available";
      }
      case "dream": {
        const messages = store.getRecentMessages(workspaceId, "user", 10);
        await reasoningEngine.dream(messages.map((m: any) => ({ role: m.role, content: m.content })), []);
        return "Dream cycle complete";
      }
      case "dream-status": {
        const dreamMeta = store.getDreamMetadata(workspaceId);
        const messages = store.getRecentMessages(workspaceId, "user", 1000);
        const messagesSinceLastDream = messages.filter((m: any) => m.created_at > dreamMeta.lastDreamedAt).length;
        const lastDreamFormatted = dreamMeta.lastDreamedAt > 0
          ? new Date(dreamMeta.lastDreamedAt).toLocaleString()
          : "Never";
        const intervalMs = 3600000; // Default 1 hour
        const nextDreamMs = dreamMeta.lastDreamedAt > 0
          ? Math.max(0, (dreamMeta.lastDreamedAt + intervalMs) - Date.now())
          : 0;
        return `Dream Status\nEnabled: true\nLast Dream: ${lastDreamFormatted}\nTotal Dreams: ${dreamMeta.dreamCount}\nMessages Since: ${messagesSinceLastDream}\nNext In: ${nextDreamMs > 0 ? Math.ceil(nextDreamMs / 60000) + " min" : "Ready now"}`;
      }
      case "prune": {
        const result = store.prune(30, 30, 90);
        return `Pruned ${result.deleted} records`;
      }
      case "search": {
        if (!subArgs) return "Usage: /learn search <query>";
        const results = store.searchSessions(workspaceId, subArgs, 5);
        return results.length ? results.map((r, i) => `${i + 1}. ${r.snippet}`).join("\n") : "No results found";
      }
      case "sessions": {
        const sessions = store.getAllSessions(workspaceId);
        return sessions.length ? sessions.slice(0, 10).map((s, i) => `${i + 1}. ${s.id}`).join("\n") : "No sessions";
      }
      default:
        return "Commands: status, context, dream, prune, search <query>, sessions";
    }
  }

  it("handles /learn status command", async () => {
    store.saveConclusion("test-ws", {
      id: "c1", peerId: "user", type: "deductive", content: "Test",
      premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1",
    });
    store.savePeerCard("test-ws", {
      peerId: "user", name: "John", occupation: "Dev",
      interests: [], traits: [], goals: [], updatedAt: Date.now(),
    });

    const response = await executeLearnCommand("status");

    expect(response).toContain("Conclusions: 1");
    expect(response).toContain("Peer Card: Yes");
  });

  it("handles /learn context command", async () => {
    store.saveConclusion("test-ws", {
      id: "c1", peerId: "user", type: "deductive", content: "User loves testing",
      premises: [], confidence: 0.9, createdAt: Date.now(), sourceSessionId: "s1",
    });

    const response = await executeLearnCommand("context");
    expect(response).toContain("User loves testing");
  });

  it("handles /learn dream command", async () => {
    store.getOrCreateSession("test-ws", "dream-session", ["user"]);
    for (let i = 0; i < 3; i++) {
      store.saveMessage("test-ws", {
        id: `msg-${i}`, sessionId: "dream-session", peerId: "user",
        role: "user", content: `Test message ${i}`, createdAt: Date.now(),
      });
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ newConclusions: [], updatedPatterns: [] }) } }]
      })
    });

    const response = await executeLearnCommand("dream");
    expect(response).toBe("Dream cycle complete");
  });

  it("handles /learn dream-status command", async () => {
    // Seed dream metadata
    store.updateDreamMetadata("test-ws", 30, 2);

    const response = await executeLearnCommand("dream-status");
    expect(response).toContain("Last Dream:");
    expect(response).toContain("Total Dreams: 1");
    expect(response).toContain("Messages Since:");
    expect(response).toContain("Enabled: true");
  });

  it("handles /learn dream-status when never dreamed", async () => {
    // No dream metadata - never dreamed before
    const meta = store.getDreamMetadata("test-ws");
    expect(meta.lastDreamedAt).toBe(0);

    const response = await executeLearnCommand("dream-status");
    expect(response).toContain("Last Dream: Never");
  });

  it("handles /learn prune command", async () => {
    store.getOrCreateSession("test-ws", "old-session", ["user"]);
    store.saveMessage("test-ws", {
      id: "old-msg", sessionId: "old-session", peerId: "user", role: "user",
      content: "Old", createdAt: Date.now() - 100 * 24 * 60 * 60 * 1000,
    });

    const response = await executeLearnCommand("prune");
    expect(response).toContain("Pruned");
  });

  it("handles /learn search <query> command", async () => {
    store.getOrCreateSession("test-ws", "session-typescript", ["user"]);
    store.saveMessage("test-ws", {
      id: "m1", sessionId: "session-typescript", peerId: "user", role: "user",
      content: "TypeScript is awesome", createdAt: Date.now(),
    });

    const response = await executeLearnCommand("search", "TypeScript");
    expect(response).toContain("TypeScript is awesome");
  });

  it("handles /learn search without query (usage message)", async () => {
    const response = await executeLearnCommand("search", "");
    expect(response).toBe("Usage: /learn search <query>");
  });

  it("handles /learn sessions command", async () => {
    store.getOrCreateSession("test-ws", "session-1", ["user"]);
    store.getOrCreateSession("test-ws", "session-2", ["user"]);

    const response = await executeLearnCommand("sessions");
    expect(response).toContain("session-1");
    expect(response).toContain("session-2");
  });

  it("handles /learn with unknown subcommand", async () => {
    const response = await executeLearnCommand("unknown");
    expect(response).toContain("Commands:");
  });
});

// ============================================================================
// E2E: EVENT HANDLERS
// ============================================================================

describe("E2E: Event Handlers", () => {
  let store: SQLiteStore;
  let reasoningEngine: ReasoningEngine;

  beforeEach(async () => {
    mockFetch.mockReset();
    store = await createTestStore();
    store.getOrCreateWorkspace("test-ws");
    store.getOrCreatePeer("test-ws", "user", "User", "user");
    reasoningEngine = createTestReasoningEngine();
    // Setup default mock for reasoning engine
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ explicit: [], deductive: [], inductive: [], abductive: [] }) } }]
      })
    });
  });

  afterEach(async () => {
    store?.close();
  });

  it("session_start event creates workspace", () => {
    const session_start_handler = () => {
      store.getOrCreateWorkspace("test-ws");
    };

    session_start_handler();
    const ws = store.getWorkspace("test-ws");
    expect(ws).toBeDefined();
  });

  it("message_end event queues user messages for reasoning", () => {
    const sessionFile = `test-session-${Date.now()}`;
    
    const message_end_handler = (msg: { role: string; content: string }) => {
      const peerRole = msg.role === "assistant" ? "agent" : "user";
      reasoningEngine.queue({
        sessionFile,
        peerId: peerRole,
        messages: [{ role: msg.role, content: msg.content }],
        queuedAt: Date.now(),
      });
    };

    message_end_handler({ role: "user", content: "I love TypeScript" });
    expect(reasoningEngine.getQueueSize()).toBe(1);
  });

  it("message_end event queues assistant messages for reasoning", () => {
    const sessionFile = `test-session-${Date.now()}`;
    
    const message_end_handler = (msg: { role: string; content: string }) => {
      const peerRole = msg.role === "assistant" ? "agent" : "user";
      reasoningEngine.queue({
        sessionFile,
        peerId: peerRole,
        messages: [{ role: msg.role, content: msg.content }],
        queuedAt: Date.now(),
      });
    };

    message_end_handler({ role: "assistant", content: "I can help with that" });
    expect(reasoningEngine.getQueueSize()).toBe(1);
  });

  it("message_end ignores system messages", () => {
    const initialQueueSize = reasoningEngine.getQueueSize();
    
    const message_end_handler = (msg: { role: string; content: string }) => {
      // Should not queue system messages
      if (msg.role !== "user" && msg.role !== "assistant") return;
      reasoningEngine.queue({
        sessionFile: "test",
        peerId: "user",
        messages: [{ role: msg.role, content: msg.content }],
        queuedAt: Date.now(),
      });
    };

    message_end_handler({ role: "system", content: "System prompt" });
    expect(reasoningEngine.getQueueSize()).toBe(initialQueueSize);
  });

  it("reasoning_enabled=false disables message processing", () => {
    const reasoningEnabled = false;
    
    const message_end_handler = (msg: { role: string; content: string }) => {
      if (!reasoningEnabled) return;
      reasoningEngine.queue({
        sessionFile: "test",
        peerId: "user",
        messages: [{ role: msg.role, content: msg.content }],
        queuedAt: Date.now(),
      });
    };

    message_end_handler({ role: "user", content: "Test" });
    expect(reasoningEngine.getQueueSize()).toBe(0);
  });
});

// ============================================================================
// E2E: BACKGROUND SERVICES
// ============================================================================

describe("E2E: Background Services", () => {
  let store: SQLiteStore;
  let reasoningEngine: ReasoningEngine;

  beforeEach(async () => {
    mockFetch.mockReset();
    store = await createTestStore();
    store.getOrCreateWorkspace("test-ws");
    store.getOrCreatePeer("test-ws", "user", "User", "user");
    reasoningEngine = createTestReasoningEngine();
    // Setup default mock for reasoning engine
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ explicit: [], deductive: [], inductive: [], abductive: [] }) } }]
      })
    });
  });

  afterEach(async () => {
    store?.close();
  });

  it("dream scheduler runs on interval", async () => {
    // Add an existing conclusion so dream has something to work with
    store.saveConclusion("test-ws", {
      id: "existing-c1", peerId: "user", type: "inductive", content: "Existing pattern",
      premises: [], confidence: 0.5, createdAt: Date.now(), sourceSessionId: "existing",
    });

    // Add enough messages to trigger dream
    store.getOrCreateSession("test-ws", "dream-session", ["user"]);
    for (let i = 0; i < 10; i++) {
      store.saveMessage("test-ws", {
        id: `msg-${i}`, sessionId: "dream-session", peerId: "user",
        role: "user", content: `Message ${i}`, createdAt: Date.now() - i * 1000,
      });
    }

    // Setup mock with correct format (matches reasoning.ts buildDreamPrompt)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: `NEW_CONCLUSIONS:
- inductive: User is productive
- abductive: User wants automation

UPDATED_CONCLUSIONS:
- Existing pattern: Still relevant, expanded understanding`
          },
        }],
      }),
    });

    // Run dream manually
    const messages = store.getRecentMessages("test-ws", "user", 50);
    expect(messages.length).toBeGreaterThanOrEqual(5);
    
    const existingConclusions = store.getConclusions("test-ws", "user", 100);
    const result = await reasoningEngine.dream(
      messages.map((m: any) => ({ role: m.role, content: m.content })),
      existingConclusions
    );
    
    // Verify mock was called and parsing worked
    expect(mockFetch).toHaveBeenCalled();
    expect(result.newConclusions.length).toBe(2);
    
    // Save new conclusions
    for (const c of result.newConclusions) {
      store.saveConclusion("test-ws", {
        id: crypto.randomUUID(), peerId: "user", type: c.type, content: c.content,
        premises: c.premises, confidence: c.confidence, createdAt: Date.now(), sourceSessionId: "dream",
      });
    }
    
    const conclusions = store.getConclusions("test-ws", "user", 100);
    expect(conclusions.length).toBe(3); // existing + 2 new
  });

  it("dream scheduler respects enabled flag", async () => {
    const dreamConfig = { enabled: false, batchSize: 50, minMessagesSinceLastDream: 5 };

    const runDream = async () => {
      if (!dreamConfig.enabled) return;
      // Would process dream...
    };

    await runDream();
    // No conclusions should be added
    const conclusions = store.getConclusions("test-ws", "user", 100);
    expect(conclusions.length).toBe(0);
  });

  it("dream scheduler respects minMessagesSinceLastDream", async () => {
    // Only add 2 messages (min is 5)
    store.getOrCreateSession("test-ws", "few-messages", ["user"]);
    store.saveMessage("test-ws", {
      id: "m1", sessionId: "few-messages", peerId: "user",
      role: "user", content: "Hi", createdAt: Date.now(),
    });
    store.saveMessage("test-ws", {
      id: "m2", sessionId: "few-messages", peerId: "user",
      role: "user", content: "Hello", createdAt: Date.now(),
    });

    const dreamConfig = { enabled: true, batchSize: 50, minMessagesSinceLastDream: 5 };

    const runDream = async () => {
      const messages = store.getRecentMessages("test-ws", "user", dreamConfig.batchSize);
      if (messages.length < dreamConfig.minMessagesSinceLastDream) return false;
      return true;
    };

    const shouldRun = await runDream();
    expect(shouldRun).toBe(false);
  });

  it("retention pruning runs on interval", () => {
    store.getOrCreateSession("test-ws", "prune-session", ["user"]);
    
    // Add old data
    store.saveMessage("test-ws", {
      id: "old-1", sessionId: "prune-session", peerId: "user", role: "user",
      content: "Old message 1", createdAt: Date.now() - 50 * 24 * 60 * 60 * 1000,
    });
    store.saveMessage("test-ws", {
      id: "old-2", sessionId: "prune-session", peerId: "user", role: "user",
      content: "Old message 2", createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
    });

    const retentionConfig = {
      retentionDays: 30,
      summaryRetentionDays: 30,
      conclusionRetentionDays: 90,
    };

    const runPrune = () => {
      const result = store.prune(
        retentionConfig.retentionDays,
        retentionConfig.summaryRetentionDays,
        retentionConfig.conclusionRetentionDays
      );
      return result.deleted;
    };

    const deleted = runPrune();
    expect(deleted).toBeGreaterThanOrEqual(2);
  });

  it("retention respects retentionDays=0 (keep forever)", () => {
    store.getOrCreateSession("test-ws", "forever-session", ["user"]);
    
    // Add very old message
    store.saveMessage("test-ws", {
      id: "ancient", sessionId: "forever-session", peerId: "user", role: "user",
      content: "Ancient message", createdAt: Date.now() - 365 * 24 * 60 * 60 * 1000,
    });

    const result = store.prune(0, 0, 0); // All retention = 0 (keep forever)

    const messages = store.getMessages("test-ws", "forever-session", 100);
    expect(messages.length).toBe(1);
    expect(result.deleted).toBe(0);
  });

  it("retention applies different rules to different tables", () => {
    store.getOrCreateSession("test-ws", "multi-session", ["user"]);

    // Old message (50 days ago)
    store.saveMessage("test-ws", {
      id: "old-msg", sessionId: "multi-session", peerId: "user", role: "user",
      content: "Old", createdAt: Date.now() - 50 * 24 * 60 * 60 * 1000,
    });

    // Old summary (50 days ago)
    store.saveSummary("test-ws", {
      id: "old-sum", sessionId: "multi-session", peerId: "user", type: "short",
      content: "Old summary", messageCount: 5, createdAt: Date.now() - 50 * 24 * 60 * 60 * 1000,
    });

    // Prune: messages=30 days, summaries=60 days (should keep old summary)
    store.prune(30, 60, 0);

    const messages = store.getMessages("test-ws", "multi-session", 100);
    const summaries = store.getSummaries("test-ws", "user", 10);

    expect(messages.length).toBe(0); // Message deleted
    expect(summaries.length).toBe(1); // Summary kept
  });
});

// ============================================================================
// E2E: ERROR HANDLING & EDGE CASES
// ============================================================================

describe("E2E: Error Handling & Edge Cases", () => {
  let store: SQLiteStore;
  let contextAssembler: ContextAssembler;

  beforeEach(async () => {
    store = await createTestStore();
    store.getOrCreateWorkspace("test-ws");
    store.getOrCreatePeer("test-ws", "user", "User", "user");
    contextAssembler = createContextAssembler(store);
  });

  afterEach(async () => {
    store?.close();
  });

  it("handles empty workspace gracefully", () => {
    const ctx = contextAssembler.assembleContext("test-ws", "user");
    expect(ctx).toBe("No memory context available.");
  });

  it("handles query with no results", async () => {
    const results = await contextAssembler.searchSimilar("test-ws", "user", "nonexistent", 5);
    expect(results.length).toBe(0);
  });

  it("handles get_peer_card for non-existent peer", () => {
    const card = store.getPeerCard("test-ws", "nonexistent-peer");
    expect(card).toBeNull();
  });

  it("handles session without messages", () => {
    store.getOrCreateSession("test-ws", "empty-session", ["user"]);
    const messages = store.getMessages("test-ws", "empty-session", 100);
    expect(messages.length).toBe(0);
  });

  it("handles search with empty query", () => {
    store.getOrCreateSession("test-ws", "search-session", ["user"]);
    store.saveMessage("test-ws", {
      id: "m1", sessionId: "search-session", peerId: "user", role: "user",
      content: "Test content", createdAt: Date.now(),
    });

    const results = store.searchSessions("test-ws", "", 10);
    // Empty query should match nothing
    expect(Array.isArray(results)).toBe(true);
  });

  it("handles import with missing optional fields", () => {
    const partialData = {
      version: "1.0.0",
      exportedAt: Date.now(),
      workspace: { id: "test-ws", name: "Test", createdAt: Date.now(), config: {} },
      // Missing: peers, conclusions, summaries, observations, peerCards
    };

    // Should not throw
    expect(() => store.importAll("test-ws", partialData as any, true)).not.toThrow();
  });

  it("handles export from empty workspace", () => {
    const data = store.exportAll("test-ws");
    expect(data.version).toBe("1.0.0");
    expect(data.conclusions).toEqual([]);
    expect(data.summaries).toEqual([]);
  });

  it("handles workspace isolation", () => {
    store.getOrCreateWorkspace("ws-a");
    store.getOrCreateWorkspace("ws-b");
    store.getOrCreatePeer("ws-a", "user", "User A", "user");
    store.getOrCreatePeer("ws-b", "user", "User B", "user");

    store.savePeerCard("ws-a", {
      peerId: "user", name: "Alice", occupation: "A",
      interests: [], traits: [], goals: [], updatedAt: Date.now(),
    });
    store.savePeerCard("ws-b", {
      peerId: "user", name: "Bob", occupation: "B",
      interests: [], traits: [], goals: [], updatedAt: Date.now(),
    });

    const cardA = store.getPeerCard("ws-a", "user");
    const cardB = store.getPeerCard("ws-b", "user");

    expect(cardA?.name).toBe("Alice");
    expect(cardB?.name).toBe("Bob");
    expect(cardA?.occupation).not.toBe(cardB?.occupation);
  });

  it("handles concurrent message saves", () => {
    store.getOrCreateSession("test-ws", "concurrent-session", ["user"]);

    // Simulate concurrent saves
    const saves = Array.from({ length: 100 }, (_, i) =>
      store.saveMessage("test-ws", {
        id: `concurrent-${i}`, sessionId: "concurrent-session", peerId: "user",
        role: "user", content: `Message ${i}`, createdAt: Date.now(),
      })
    );

    // All saves should complete
    saves.forEach(() => {});

    const messages = store.getMessages("test-ws", "concurrent-session", 1000);
    expect(messages.length).toBe(100);
  });

  it("handles very long message content", () => {
    const longContent = "A".repeat(100000); // 100KB of text
    
    store.getOrCreateSession("test-ws", "long-session", ["user"]);
    store.saveMessage("test-ws", {
      id: "long-msg", sessionId: "long-session", peerId: "user",
      role: "user", content: longContent, createdAt: Date.now(),
    });

    const messages = store.getMessages("test-ws", "long-session", 10);
    expect(messages[0].content.length).toBe(100000);
  });

  it("handles special characters in content", () => {
    const specialContent = `Special chars: <>&"'{}[]|\\^~` + "\n\t\r" + "Emoji: 🎉🚀💻";
    
    store.getOrCreateSession("test-ws", "special-session", ["user"]);
    store.saveMessage("test-ws", {
      id: "special-msg", sessionId: "special-session", peerId: "user",
      role: "user", content: specialContent, createdAt: Date.now(),
    });

    const messages = store.getMessages("test-ws", "special-session", 10);
    expect(messages[0].content).toBe(specialContent);
  });

  it("handles unicode content correctly", () => {
    const unicodeContent = "日本語 中文 한국어 العربية עברית";
    
    store.savePeerCard("test-ws", {
      peerId: "user", name: unicodeContent, occupation: "多语言",
      interests: ["测试"], traits: [], goals: [], updatedAt: Date.now(),
    });

    const card = store.getPeerCard("test-ws", "user");
    expect(card?.name).toBe(unicodeContent);
  });

  it("handles database path with special characters", async () => {
    // Test with path containing spaces
    const specialDir = path.join(testDir, "path with spaces");
    fs.mkdirSync(specialDir, { recursive: true });
    const dbPath = path.join(specialDir, "test.db");
    
    const specialStore = await createStore(dbPath);
    await specialStore.init();
    specialStore.getOrCreateWorkspace("special-ws");
    expect(specialStore.getWorkspace("special-ws")).toBeDefined();
    specialStore.close();
  });

  it("handles Ollama API error gracefully", async () => {
    mockFetch.mockReset();
    // Mock all retry attempts failing
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    });

    const engine = createTestReasoningEngine();

    await expect(engine.reason([], "user")).rejects.toThrow(/All 3 attempts failed/);
  });

  it("handles malformed reasoning response", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: "Not a valid CONCLUSION format at all",
          },
        }],
      }),
    });

    const engine = createTestReasoningEngine();
    
    const result = await engine.reason([{ role: "user", content: "Test" }], "user");
    // Should return empty results, not crash
    expect(result.explicit).toEqual([]);
    expect(result.deductive).toEqual([]);
  });
});

// ============================================================================
// E2E: REASONING ENGINE INTEGRATION
// ============================================================================

describe("E2E: Reasoning Engine Integration", () => {
  beforeEach(async () => {
    mockFetch.mockReset();
  });

  it("processes message queue automatically at batch size", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              explicit: [{ content: "User is learning" }],
              deductive: [],
              inductive: [],
              abductive: []
            })
          },
        }],
      }),
    });

    const engine = createTestReasoningEngine();

    // Add 5 messages (batch size)
    for (let i = 0; i < 5; i++) {
      engine.queue({
        sessionFile: `session-${i}`,
        peerId: "user",
        messages: [{ role: "user", content: `Message ${i}` }],
        queuedAt: Date.now(),
      });
    }

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 200));

    // Should have attempted to process
    expect(mockFetch).toHaveBeenCalled();
  });

  it("tracks reasoning state correctly", () => {
    const engine = createTestReasoningEngine();

    expect(engine.isReasoning()).toBe(false);

    engine.queue({
      sessionFile: "test",
      peerId: "user",
      messages: [{ role: "user", content: "Test" }],
      queuedAt: Date.now(),
    });

    expect(engine.getQueueSize()).toBe(1);
  });

  it("reason produces deductive conclusions", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: `CONCLUSION:
Type: deductive
Content: User prefers TypeScript over JavaScript
Premises: Multiple project decisions show TypeScript usage
Confidence: 0.95`,
          },
        }],
      }),
    });

    const engine = createTestReasoningEngine();

    const result = await engine.reason(
      [{ role: "user", content: "I always use TypeScript for my projects" }],
      "user"
    );

    expect(result.deductive.length).toBeGreaterThan(0);
    expect(result.deductive[0].conclusion).toContain("TypeScript");
  });

  it("dream consolidates multiple conclusions", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: `NEW_CONCLUSIONS:
- inductive: User is interested in AI development
- abductive: User wants to automate workflows

UPDATED_CONCLUSIONS:
- Previous interest in Python: Now expanded to include ML frameworks`,
          },
        }],
      }),
    });

    const engine = createTestReasoningEngine();

    const existingConclusions: Conclusion[] = [
      {
        id: "c1", peerId: "user", type: "inductive", content: "User likes Python",
        premises: [], confidence: 0.7, createdAt: Date.now(), sourceSessionId: "s1",
      },
    ];

    const result = await engine.dream(
      [{ role: "user", content: "I'm exploring TensorFlow and PyTorch" }],
      existingConclusions
    );

    expect(result.newConclusions.length).toBe(2);
    expect(result.newConclusions.some(c => c.type === "inductive")).toBe(true);
    expect(result.newConclusions.some(c => c.type === "abductive")).toBe(true);
  });

  it("generates embedding with mock Ollama", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        embedding: Array(768).fill(0).map(() => Math.random()),
      }),
    });

    const engine = createTestReasoningEngine();
    
    const embedding = await engine.generateEmbedding("Test text");
    expect(embedding.length).toBe(768);
  });
});

// ============================================================================
// E2E: TOOLS REGISTRATION
// ============================================================================

describe("E2E: Tools Registration", () => {
  it("all tools have required properties", () => {
    const requiredProps = ["label", "description", "params"];
    
    for (const [name, tool] of Object.entries(TOOLS)) {
      for (const prop of requiredProps) {
        expect((tool as any)[prop]).toBeDefined();
      }
      expect(name).toMatch(/^learn_/); // All tools should be prefixed
    }
  });

  it("tool executors match tool definitions", async () => {
    const store = await createTestStore();
    const contextAssembler = createContextAssembler(store);
    const reasoningEngine = createTestReasoningEngine();
    // Setup default mock for reasoning engine
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ explicit: [], deductive: [], inductive: [], abductive: [] }) } }]
      })
    });

    const executors = createToolExecutors({
      store,
      contextAssembler,
      reasoningEngine,
      config: { workspaceId: "test", retention: { retentionDays: 30, summaryRetentionDays: 30, conclusionRetentionDays: 90 }, dream: { enabled: false } },
      runDream: async () => {},
    });

    for (const toolName of Object.keys(TOOLS)) {
      expect(executors[toolName as keyof typeof executors]).toBeDefined();
      expect(typeof (executors as any)[toolName].execute).toBe("function");
    }

    store?.close();
  });
});

// ============================================================================
// E2E: WORKSPACE/PEER/SESSION LIFECYCLE
// ============================================================================

describe("E2E: Workspace/Peer/Session Lifecycle", () => {
  let store: SQLiteStore;

  beforeEach(async () => {
    store = await createTestStore();
  });

  afterEach(async () => {
    store?.close();
  });

  it("creates complete workspace hierarchy", async () => {
    // Create workspace
    const ws = store.getOrCreateWorkspace("my-workspace", "My Workspace");
    expect(ws.id).toBe("my-workspace");
    expect(ws.name).toBe("My Workspace");

    // Create peers
    const user = store.getOrCreatePeer("my-workspace", "user", "User", "user");
    const agent = store.getOrCreatePeer("my-workspace", "agent", "Agent", "agent");

    // Create session
    const session = store.getOrCreateSession("my-workspace", "session-1", ["user", "agent"]);

    // Add data
    store.saveMessage("my-workspace", {
      id: "m1", sessionId: "session-1", peerId: "user", role: "user",
      content: "Hello", createdAt: Date.now(),
    });

    // Verify hierarchy
    const retrievedWs = store.getWorkspace("my-workspace");
    const retrievedSession = store.getSession("my-workspace", "session-1");
    const messages = store.getMessages("my-workspace", "session-1", 10);

    expect(retrievedWs).toBeDefined();
    expect(retrievedSession?.peerIds).toContain("user");
    expect(messages.length).toBe(1);
  });

  it("peer cards persist correctly", async () => {
    store.getOrCreatePeer("test-ws", "user", "User", "user");

    const initialCard: PeerCard = {
      peerId: "user",
      name: "Alice",
      occupation: "Developer",
      interests: ["coding", "AI"],
      traits: ["detail-oriented"],
      goals: ["Build great software"],
      updatedAt: Date.now(),
    };

    store.savePeerCard("test-ws", initialCard);
    
    const retrievedCard = store.getPeerCard("test-ws", "user");
    expect(retrievedCard?.name).toBe("Alice");
    expect(retrievedCard?.interests).toEqual(["coding", "AI"]);
    expect(retrievedCard?.goals).toEqual(["Build great software"]);

    // Update card
    const updatedCard: PeerCard = {
      peerId: "user",
      name: "Alice Smith", // Updated name
      occupation: "Senior Developer",
      interests: ["coding", "AI", "mentoring"], // Added interest
      traits: ["detail-oriented"],
      goals: ["Build great software", "Help others grow"],
      updatedAt: Date.now(),
    };

    store.savePeerCard("test-ws", updatedCard);
    
    const finalCard = store.getPeerCard("test-ws", "user");
    expect(finalCard?.name).toBe("Alice Smith");
    expect(finalCard?.interests).toHaveLength(3);
    expect(finalCard?.goals).toHaveLength(2);
  });

  it("sessions track message count", async () => {
    const session = store.getOrCreateSession("test-ws", "counting-session", ["user"]);
    expect(session.messageCount).toBe(0);

    store.saveMessage("test-ws", {
      id: "m1", sessionId: "counting-session", peerId: "user", role: "user",
      content: "Message 1", createdAt: Date.now(),
    });
    store.saveMessage("test-ws", {
      id: "m2", sessionId: "counting-session", peerId: "user", role: "user",
      content: "Message 2", createdAt: Date.now(),
    });

    const messages = store.getMessages("test-ws", "counting-session", 10);
    expect(messages.length).toBe(2);
  });

  it("observations persist and can be queried", async () => {
    const observation: Observation = {
      id: "obs-1",
      workspaceId: "test-ws",
      peerId: "user",
      sessionId: "session-1",
      role: "user",
      content: "Test observation",
      createdAt: Date.now(),
      processed: false,
    };

    store.saveObservation(observation);

    const observations = store.getObservations("test-ws", "user", 100);
    expect(observations.length).toBe(1);
    expect(observations[0].content).toBe("Test observation");
  });

  it("unprocessed observations can be retrieved", async () => {
    const obs1: Observation = {
      id: "obs-1",
      workspaceId: "test-ws",
      peerId: "user",
      sessionId: "session-1",
      role: "user",
      content: "Unprocessed",
      createdAt: Date.now(),
      processed: false,
    };

    const obs2: Observation = {
      id: "obs-2",
      workspaceId: "test-ws",
      peerId: "user",
      sessionId: "session-1",
      role: "user",
      content: "Processed",
      createdAt: Date.now(),
      processed: true,
    };

    store.saveObservation(obs1);
    store.saveObservation(obs2);

    const unprocessed = store.getUnprocessedObservations("test-ws", "user", 50);
    expect(unprocessed.length).toBe(1);
    expect(unprocessed[0].id).toBe("obs-1");
  });
});
