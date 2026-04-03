/**
 * Fast E2E Tests - Core functionality only
 * Optimized for speed: no real Ollama calls, proper mocks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { createStore, type SQLiteStore } from "../src/core/store.js";
import { createContextAssembler } from "../src/core/context.js";
import { createReasoningEngine, type ReasoningEngineConfig } from "../src/core/reasoning.js";
import { createToolExecutors, type ToolsConfig } from "../src/tools/index.js";

// ============================================================================
// TEST SETUP
// ============================================================================

const testDir = path.join(os.tmpdir(), `pi-learn-fast-${Date.now()}`);
const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");

beforeEach(() => {
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
});

// Mock fetch - instant responses, no retries
vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify({ explicit: [], deductive: [], inductive: [], abductive: [] }) } }]
  })
})));

// ============================================================================
// HELPERS
// ============================================================================

async function createTestStore(): Promise<SQLiteStore> {
  const dbPath = path.join(testDir, `test-${Math.random().toString(36).slice(2, 9)}.db`);
  const store = await createStore(dbPath);
  await store.init();
  return store;
}

function createMockCtx() {
  return {
    sessionManager: { getSessionFile: () => "test-session" },
    ui: { setStatus: vi.fn(), notify: vi.fn() },
  };
}

// ============================================================================
// CORE TESTS (Fast)
// ============================================================================

describe("Store Operations", () => {
  it("creates and retrieves workspaces", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws1", "Workspace 1");
    store.getOrCreateWorkspace("ws2", "Workspace 2");
    
    expect(store.getWorkspace("ws1")?.name).toBe("Workspace 1");
    expect(store.getWorkspace("ws2")?.name).toBe("Workspace 2");
    store.close();
  });

  it("saves and retrieves conclusions", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    
    store.saveConclusion("ws", {
      id: "c1", peerId: "user", type: "deductive", content: "User loves TypeScript",
      premises: [], confidence: 0.9, createdAt: Date.now(), sourceSessionId: "s1",
    });
    
    const conclusions = store.getConclusions("ws", "user", 10);
    expect(conclusions.length).toBe(1);
    expect(conclusions[0].content).toContain("TypeScript");
    store.close();
  });

  it("handles peer cards", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    
    store.savePeerCard("ws", {
      peerId: "user", name: "Alice", occupation: "Developer",
      interests: ["AI", "TypeScript"], traits: ["analytical"], goals: ["Build AGI"], updatedAt: Date.now(),
    });
    
    const card = store.getPeerCard("ws", "user");
    expect(card?.name).toBe("Alice");
    expect(card?.interests).toContain("AI");
    store.close();
  });

  it("saves and retrieves sessions", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    store.getOrCreateSession("ws", "session-1", ["user"]);
    store.getOrCreateSession("ws", "session-2", ["user"]);
    
    const sessions = store.getAllSessions("ws");
    expect(sessions.length).toBe(2);
    store.close();
  });

  it("searches sessions by keyword", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    store.getOrCreateSession("ws", "typescript-session", ["user"]);
    store.saveMessage("ws", {
      id: "m1", sessionId: "typescript-session", peerId: "user", role: "user",
      content: "I love TypeScript's type system", createdAt: Date.now(),
    });
    
    const results = store.searchSessions("ws", "TypeScript", 10);
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe("typescript-session");
    store.close();
  });

  it("prunes old data", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    store.getOrCreateSession("ws", "old-session", ["user"]);
    store.saveMessage("ws", {
      id: "old", sessionId: "old-session", peerId: "user", role: "user",
      content: "Old", createdAt: Date.now() - 100 * 24 * 60 * 60 * 1000,
    });
    
    const result = store.prune(30, 30, 90);
    expect(result.deleted).toBeGreaterThan(0);
    store.close();
  });
});

describe("Context Assembly", () => {
  it("assembles context from conclusions", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    
    store.saveConclusion("ws", {
      id: "c1", peerId: "user", type: "deductive", content: "User prefers dark mode",
      premises: [], confidence: 0.9, createdAt: Date.now(), sourceSessionId: "s1",
    });
    
    const assembler = createContextAssembler(store);
    const ctx = assembler.assembleContext("ws", "user");
    
    expect(ctx).toContain("dark mode");
    store.close();
  });

  it("returns default message for empty workspace", async () => {
    const store = await createTestStore();
    const assembler = createContextAssembler(store);
    const ctx = assembler.assembleContext("nonexistent", "user");
    
    expect(ctx).toBe("No memory context available.");
    store.close();
  });

  it("searches similar conclusions", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    
    store.saveConclusion("ws", {
      id: "c1", peerId: "user", type: "inductive", content: "User likes Python programming",
      premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1",
    });
    
    const assembler = createContextAssembler(store);
    const results = await assembler.searchSimilar("ws", "user", "Python", 5);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("Python");
    store.close();
  });

  it("aggregates memory stats", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    
    store.saveConclusion("ws", { id: "c1", peerId: "user", type: "deductive", content: "Test", premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1" });
    store.savePeerCard("ws", { peerId: "user", interests: ["AI"], traits: [], goals: [], updatedAt: Date.now() });
    
    const assembler = createContextAssembler(store);
    const stats = assembler.getMemoryStats("ws", "user");
    
    expect(stats.conclusionCount).toBe(1);
    expect(stats.hasPeerCard).toBe(true);
    expect(stats.topInterests).toContain("AI");
    store.close();
  });
});

describe("Tool Execution", () => {
  let store: SQLiteStore;
  let assembler: ReturnType<typeof createContextAssembler>;
  let engine: ReturnType<typeof createReasoningEngine>;
  let mockCtx: ReturnType<typeof createMockCtx>;

  beforeEach(async () => {
    vi.mocked(fetch).mockClear();
    store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    assembler = createContextAssembler(store);
    
    const config: ReasoningEngineConfig = {
      ollamaBaseUrl: "http://localhost:11434", ollamaApiKey: "", reasoningModel: "llama3.1",
      embeddingModel: "nomic-embed-text-v2-moe", tokenBatchSize: 100,
    };
    engine = createReasoningEngine(config);
    mockCtx = createMockCtx();
  });

  afterEach(() => store.close());

  const toolsConfig: ToolsConfig = {
    workspaceId: "ws", retention: { retentionDays: 30, summaryRetentionDays: 30, conclusionRetentionDays: 90 },
    dream: { enabled: false, intervalMs: 60000, batchSize: 50, minMessagesSinceLastDream: 5 },
  };

  it("learn_add_message queues message", async () => {
    const executors = createToolExecutors({ store, contextAssembler: assembler, reasoningEngine: engine, config: toolsConfig, runDream: async () => {} });
    const result = await executors.learn_add_message.execute("tool", { content: "Hello", role: "user" }, undefined, undefined, mockCtx);
    expect(result.details.queued).toBe(true);
  });

  it("learn_get_context retrieves assembled context", async () => {
    store.saveConclusion("ws", { id: "c1", peerId: "user", type: "deductive", content: "User is a developer", premises: [], confidence: 0.9, createdAt: Date.now(), sourceSessionId: "s1" });
    
    const executors = createToolExecutors({ store, contextAssembler: assembler, reasoningEngine: engine, config: toolsConfig, runDream: async () => {} });
    const result = await executors.learn_get_context.execute("tool", { peerId: "user" }, undefined, undefined, mockCtx);
    
    expect(result.details.found).toBe(true);
    expect(result.content[0].text).toContain("developer");
  });

  it("learn_query searches conclusions", async () => {
    store.saveConclusion("ws", { id: "c1", peerId: "user", type: "deductive", content: "User prefers TypeScript", premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1" });
    
    const executors = createToolExecutors({ store, contextAssembler: assembler, reasoningEngine: engine, config: toolsConfig, runDream: async () => {} });
    const result = await executors.learn_query.execute("tool", { query: "TypeScript", topK: 5 }, undefined, undefined, mockCtx);
    
    expect(result.details.found).toBe(true);
    expect(result.content[0].text).toContain("TypeScript");
  });

  it("learn_get_peer_card retrieves info", async () => {
    store.savePeerCard("ws", { peerId: "user", name: "Alice", occupation: "Engineer", interests: ["AI"], traits: [], goals: [], updatedAt: Date.now() });
    
    const executors = createToolExecutors({ store, contextAssembler: assembler, reasoningEngine: engine, config: toolsConfig, runDream: async () => {} });
    const result = await executors.learn_get_peer_card.execute("tool", { peerId: "user" }, undefined, undefined, mockCtx);
    
    expect(result.details.found).toBe(true);
    expect(result.details.card.name).toBe("Alice");
  });

  it("learn_update_peer_card modifies info", async () => {
    store.savePeerCard("ws", { peerId: "user", name: "Bob", occupation: "Dev", interests: [], traits: [], goals: [], updatedAt: Date.now() });
    
    const executors = createToolExecutors({ store, contextAssembler: assembler, reasoningEngine: engine, config: toolsConfig, runDream: async () => {} });
    await executors.learn_update_peer_card.execute("tool", { peerId: "user", occupation: "Senior Dev", interests: ["TypeScript"] }, undefined, undefined, mockCtx);
    
    const updated = store.getPeerCard("ws", "user");
    expect(updated?.occupation).toBe("Senior Dev");
    expect(updated?.interests).toContain("TypeScript");
  });

  it("learn_list_peers returns peers", async () => {
    store.getOrCreatePeer("ws", "user", "User", "user");
    store.getOrCreatePeer("ws", "agent", "Agent", "agent");
    
    const executors = createToolExecutors({ store, contextAssembler: assembler, reasoningEngine: engine, config: toolsConfig, runDream: async () => {} });
    const result = await executors.learn_list_peers.execute("tool", {}, undefined, undefined, mockCtx);
    
    expect(result.details.count).toBeGreaterThanOrEqual(2);
  });

  it("learn_prune removes old records", async () => {
    store.getOrCreateSession("ws", "old-session", ["user"]);
    store.saveMessage("ws", { id: "old", sessionId: "old-session", peerId: "user", role: "user", content: "Old", createdAt: Date.now() - 100 * 24 * 60 * 60 * 1000 });
    
    const executors = createToolExecutors({ store, contextAssembler: assembler, reasoningEngine: engine, config: toolsConfig, runDream: async () => {} });
    const result = await executors.learn_prune.execute("tool", {}, undefined, undefined, mockCtx);
    
    expect(result.content[0].text).toContain("Pruned");
    expect(result.details.deleted).toBeGreaterThanOrEqual(1);
  });

  it("learn_export exports data", async () => {
    store.saveConclusion("ws", { id: "c1", peerId: "user", type: "deductive", content: "Test", premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1" });
    
    const executors = createToolExecutors({ store, contextAssembler: assembler, reasoningEngine: engine, config: toolsConfig, runDream: async () => {} });
    const result = await executors.learn_export.execute("tool", {}, undefined, undefined, mockCtx);
    
    expect(result.content[0].text).toContain("conclusions");
    expect(result.details.workspace).toBeDefined();
  });

  it("learn_import imports data", async () => {
    const importData = {
      version: "1.0.0", exportedAt: Date.now(),
      workspace: { id: "ws", name: "Test", createdAt: Date.now(), config: {} },
      peers: [], conclusions: [{ id: "imported", peerId: "user", type: "inductive" as const, content: "Imported", premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1" }],
      summaries: [], observations: [], peerCards: [],
    };
    
    const executors = createToolExecutors({ store, contextAssembler: assembler, reasoningEngine: engine, config: toolsConfig, runDream: async () => {} });
    await executors.learn_import.execute("tool", { data: JSON.stringify(importData), merge: true }, undefined, undefined, mockCtx);
    
    const conclusions = store.getConclusions("ws", "user", 10);
    expect(conclusions.some(c => c.id === "imported")).toBe(true);
  });

  it("learn_tag_session adds tags", async () => {
    store.getOrCreateSession("ws", "tagged-session", ["user"]);
    
    const executors = createToolExecutors({ store, contextAssembler: assembler, reasoningEngine: engine, config: toolsConfig, runDream: async () => {} });
    await executors.learn_tag_session.execute("tool", { sessionId: "tagged-session", addTags: ["important", "project-a"] }, undefined, undefined, mockCtx);
    
    const session = store.getSession("ws", "tagged-session");
    expect(session?.tags).toContain("important");
    expect(session?.tags).toContain("project-a");
  });

  it("learn_list_tags returns all tags", async () => {
    store.getOrCreateSession("ws", "s1", ["user"]);
    store.getOrCreateSession("ws", "s2", ["user"]);
    store.tagSession("ws", "s1", ["typescript", "project"]);
    store.tagSession("ws", "s2", ["rust", "project"]);
    
    const executors = createToolExecutors({ store, contextAssembler: assembler, reasoningEngine: engine, config: toolsConfig, runDream: async () => {} });
    const result = await executors.learn_list_tags.execute("tool", {}, undefined, undefined, mockCtx);
    
    expect(result.details.count).toBe(3);
    expect(result.details.tags.some((t: any) => t.tag === "project")).toBe(true);
  });
});

describe("Reasoning Engine", () => {
  beforeEach(() => vi.mocked(fetch).mockClear());

  it("queues messages", () => {
    const config: ReasoningEngineConfig = {
      ollamaBaseUrl: "http://localhost:11434", ollamaApiKey: "", reasoningModel: "llama3.1",
      embeddingModel: "nomic-embed-text-v2-moe", tokenBatchSize: 100,
    };
    const engine = createReasoningEngine(config);
    
    engine.queue({ sessionFile: "test", peerId: "user", messages: [{ role: "user", content: "Test" }], queuedAt: Date.now() });
    expect(engine.getQueueSize()).toBe(1);
  });

  it("tracks reasoning state", () => {
    const config: ReasoningEngineConfig = {
      ollamaBaseUrl: "http://localhost:11434", ollamaApiKey: "", reasoningModel: "llama3.1",
      embeddingModel: "nomic-embed-text-v2-moe", tokenBatchSize: 100,
    };
    const engine = createReasoningEngine(config);
    expect(engine.isReasoning()).toBe(false);
  });
});

describe("Hybrid Memory", () => {
  it("stores conclusions with scope", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    
    // Project scope
    store.saveConclusion("ws", { id: "c1", peerId: "user", type: "deductive", content: "Uses SQLite", premises: [], confidence: 0.9, createdAt: Date.now(), sourceSessionId: "s1", scope: "project" });
    
    const projectConclusions = store.getConclusions("ws", "user", 10, "project");
    expect(projectConclusions.length).toBe(1);
    expect(projectConclusions[0].content).toContain("SQLite");
    
    store.close();
  });

  it("blends global and project contexts", async () => {
    const store = await createTestStore();
    store.ensureGlobalWorkspace();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    store.ensureGlobalPeer("user", "User");
    
    // Global (user) scope
    store.saveConclusion("__global__", { id: "c1", peerId: "user", type: "deductive", content: "Prefers TypeScript", premises: [], confidence: 0.9, createdAt: Date.now(), sourceSessionId: "s1", scope: "user" });
    
    // Project scope
    store.saveConclusion("ws", { id: "c2", peerId: "user", type: "deductive", content: "Uses SQLite", premises: [], confidence: 0.9, createdAt: Date.now(), sourceSessionId: "s1", scope: "project" });
    
    const assembler = createContextAssembler(store);
    const blended = assembler.getBlendedContext("ws", "user");
    
    expect(blended.blendedConclusions.length).toBe(2);
    expect(blended.global.conclusions[0].content).toContain("TypeScript");
    expect(blended.project.conclusions[0].content).toContain("SQLite");
    
    store.close();
  });
});

describe("Error Handling", () => {
  it("handles empty workspace", async () => {
    const store = await createTestStore();
    const assembler = createContextAssembler(store);
    const ctx = assembler.assembleContext("nonexistent", "user");
    expect(ctx).toBe("No memory context available.");
    store.close();
  });

  it("handles non-existent peer card", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    const card = store.getPeerCard("ws", "nonexistent");
    expect(card).toBeNull();
    store.close();
  });

  it("handles invalid import JSON", async () => {
    const store = await createTestStore();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    
    const assembler = createContextAssembler(store);
    const executors = createToolExecutors({
      store, contextAssembler: assembler, reasoningEngine: createReasoningEngine({
        ollamaBaseUrl: "http://localhost:11434", ollamaApiKey: "", reasoningModel: "llama3.1",
        embeddingModel: "nomic-embed-text-v2-moe", tokenBatchSize: 100,
      }),
      config: { workspaceId: "ws", retention: { retentionDays: 30, summaryRetentionDays: 30, conclusionRetentionDays: 90 }, dream: { enabled: false, intervalMs: 60000, batchSize: 50, minMessagesSinceLastDream: 5 } },
      runDream: async () => {},
    });
    
    const result = await executors.learn_import.execute("tool", { data: "not valid json" }, undefined, undefined, createMockCtx());
    expect(result.details.success).toBe(false);
    store.close();
  });
});
