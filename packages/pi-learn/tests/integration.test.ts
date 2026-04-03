/**
 * Integration Tests - Test modules working together
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createStore } from "../src/core/store.js";
import { createContextAssembler } from "../src/core/context.js";
import { createReasoningEngine, type ReasoningEngineConfig } from "../src/core/reasoning.js";

const testDir = path.join(os.tmpdir(), `pi-learn-integration-${Date.now()}`);

beforeEach(() => {
  fs.mkdirSync(testDir, { recursive: true });
});

// Mock fetch for Ollama API
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Integration: Store + Context Assembler", () => {
  it("assembles context from multiple data types", async () => {
    const store = await createStore(path.join(testDir, "ctx1.db"));
    await store.init();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");

    // Add conclusion
    store.saveConclusion("ws", {
      id: "c1", peerId: "user", type: "deductive", content: "User prefers dark mode",
      premises: [], confidence: 0.9, createdAt: Date.now(), sourceSessionId: "s1",
    });

    // Add peer card
    store.savePeerCard("ws", {
      peerId: "user", name: "Test User", occupation: "Developer",
      interests: ["AI"], traits: [], goals: [], updatedAt: Date.now(),
    });

    const contextAssembler = createContextAssembler(store);
    const context = contextAssembler.assembleContext("ws", "user");

    expect(context).toContain("deductive");
    expect(context).toContain("dark mode");
    expect(context).toContain("Test User");
    store.close();
  });

  it("searches similar conclusions with keyword matching", async () => {
    const store = await createStore(path.join(testDir, "ctx2.db"));
    await store.init();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");

    store.saveConclusion("ws", {
      id: "c1", peerId: "user", type: "inductive", content: "User likes Python programming",
      premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1",
    });
    store.saveConclusion("ws", {
      id: "c2", peerId: "user", type: "deductive", content: "User uses VS Code for editing",
      premises: [], confidence: 0.7, createdAt: Date.now(), sourceSessionId: "s1",
    });

    const contextAssembler = createContextAssembler(store);
    const results = await contextAssembler.searchSimilar("ws", "user", "Python", 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain("Python");
    store.close();
  });

  it("aggregates memory stats correctly", async () => {
    const store = await createStore(path.join(testDir, "ctx3.db"));
    await store.init();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");

    store.saveConclusion("ws", {
      id: "c1", peerId: "user", type: "deductive", content: "Test 1",
      premises: [], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1",
    });
    store.saveConclusion("ws", {
      id: "c2", peerId: "user", type: "inductive", content: "Test 2",
      premises: [], confidence: 0.9, createdAt: Date.now(), sourceSessionId: "s1",
    });
    store.savePeerCard("ws", {
      peerId: "user", name: "Test", occupation: "Dev",
      interests: ["AI", "Testing"], traits: [], goals: [], updatedAt: Date.now(),
    });

    const contextAssembler = createContextAssembler(store);
    const stats = contextAssembler.getMemoryStats("ws", "user");

    expect(stats.conclusionCount).toBe(2);
    expect(stats.hasPeerCard).toBe(true);
    expect(stats.topInterests).toContain("AI");
    store.close();
  });

  it("handles workspace isolation", async () => {
    const store = await createStore(path.join(testDir, "ctx4.db"));
    await store.init();
    store.getOrCreateWorkspace("ws1");
    store.getOrCreateWorkspace("ws2");
    store.getOrCreatePeer("ws1", "user", "User 1", "user");
    store.getOrCreatePeer("ws2", "user", "User 2", "user");

    store.savePeerCard("ws1", {
      peerId: "user", name: "Workspace 1 User", occupation: "Dev",
      interests: [], traits: [], goals: [], updatedAt: Date.now(),
    });

    const card1 = store.getPeerCard("ws1", "user");
    const card2 = store.getPeerCard("ws2", "user");

    expect(card1?.name).toBe("Workspace 1 User");
    expect(card2).toBeNull();
    store.close();
  });
});

describe("Integration: Reasoning Engine + Store", () => {
  const config: ReasoningEngineConfig = {
    ollamaBaseUrl: "http://localhost:11434",
    ollamaApiKey: "",
    reasoningModel: "llama3.1",
    embeddingModel: "nomic-embed-text-v2-moe",
    tokenBatchSize: 100,
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("generates reasoning output format correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: `CONCLUSION:
Type: deductive
Content: User prefers TypeScript over JavaScript
Premises: Multiple project decisions
Confidence: 0.9`,
          },
        }],
      }),
    });

    const engine = createReasoningEngine(config);
    const result = await engine.reason(
      [{ role: "user", content: "I always choose TypeScript for my projects" }],
      "user"
    );

    expect(result.deductive).toBeDefined();
    expect(result.deductive.length).toBeGreaterThan(0);
    expect(result.deductive[0].conclusion).toContain("TypeScript");
  });

  it("handles dream consolidation output", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: `NEW_CONCLUSIONS:
- inductive: User is learning functional programming
- abductive: User wants to improve code quality

UPDATED_CONCLUSIONS:
- Previous conclusion: Updated understanding`,
          },
        }],
      }),
    });

    const engine = createReasoningEngine(config);
    const result = await engine.dream(
      [{ role: "user", content: "I'm exploring Haskell and Elm" }],
      []
    );

    expect(result.newConclusions.length).toBe(2);
    expect(result.newConclusions[0].type).toBe("inductive");
  });

  it("queues messages for batch processing", () => {
    const engine = createReasoningEngine(config);
    engine.queue({
      sessionFile: "test-session",
      peerId: "user",
      messages: [{ role: "user", content: "Test message" }],
      queuedAt: Date.now(),
    });

    expect(engine.getQueueSize()).toBe(1);
  });

  it("handles API errors gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const engine = createReasoningEngine(config);
    await expect(engine.reason([], "user")).rejects.toThrow(/All 3 attempts failed/);
  });
});

describe("Integration: Export/Import Workflow", () => {
  it("preserves all data types during round-trip", async () => {
    const store1 = await createStore(path.join(testDir, "export1.db"));
    await store1.init();
    store1.getOrCreateWorkspace("ws");
    store1.getOrCreatePeer("ws", "user", "User", "user");
    store1.getOrCreateSession("ws", "session1", ["user"]);

    store1.saveConclusion("ws", {
      id: "c1", peerId: "user", type: "deductive", content: "Test conclusion",
      premises: ["test"], confidence: 0.9, createdAt: Date.now(), sourceSessionId: "session1",
    });
    store1.savePeerCard("ws", {
      peerId: "user", name: "Original", occupation: "Dev",
      interests: ["Testing"], traits: ["thorough"], goals: ["Quality"], updatedAt: Date.now(),
    });
    store1.saveMessage("ws", {
      id: "m1", sessionId: "session1", peerId: "user", role: "user",
      content: "Test message", createdAt: Date.now(),
    });

    const exported = store1.exportAll("ws");
    store1.close();

    const store2 = await createStore(path.join(testDir, "export2.db"));
    await store2.init();
    store2.importAll("ws", exported, true);

    const card = store2.getPeerCard("ws", "user");
    expect(card?.name).toBe("Original");
    expect(card?.traits).toContain("thorough");

    const conclusions = store2.getConclusions("ws", "user", 10);
    expect(conclusions.length).toBe(1);
    expect(conclusions[0].content).toBe("Test conclusion");
    store2.close();
  });

  it("replaces data when merge is false", async () => {
    const store1 = await createStore(path.join(testDir, "merge1.db"));
    await store1.init();
    store1.getOrCreateWorkspace("ws");
    store1.getOrCreatePeer("ws", "user", "User", "user");
    store1.savePeerCard("ws", {
      peerId: "user", name: "Original", occupation: "Dev",
      interests: [], traits: [], goals: [], updatedAt: Date.now(),
    });

    const exported = store1.exportAll("ws");
    store1.close();

    const store2 = await createStore(path.join(testDir, "merge2.db"));
    await store2.init();
    store2.getOrCreateWorkspace("ws");
    store2.getOrCreatePeer("ws", "user", "User", "user");
    store2.savePeerCard("ws", {
      peerId: "user", name: "Old Data", occupation: "Other",
      interests: [], traits: [], goals: [], updatedAt: Date.now(),
    });

    store2.importAll("ws", exported, false);

    const card = store2.getPeerCard("ws", "user");
    expect(card?.name).toBe("Original");
    expect(card?.occupation).toBe("Dev");
    store2.close();
  });
});

describe("Integration: Retention Policies", () => {
  it("prunes messages but keeps conclusions", async () => {
    const store = await createStore(path.join(testDir, "retention1.db"));
    await store.init();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    store.getOrCreateSession("ws", "s1", ["user"]);

    // Old message (100 days ago)
    store.saveMessage("ws", {
      id: "m-old", sessionId: "s1", peerId: "user", role: "user",
      content: "Old message", createdAt: Date.now() - 100 * 24 * 60 * 60 * 1000,
    });

    // Recent conclusion (10 days ago)
    store.saveConclusion("ws", {
      id: "c1", peerId: "user", type: "deductive", content: "Recent insight",
      premises: [], confidence: 0.8, createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000, sourceSessionId: "s1",
    });

    // Prune with: messages=30 days, summaries=30 days, conclusions=90 days
    store.prune(30, 30, 90);

    // Old message should be gone
    const messages = store.getMessages("ws", "s1", 100);
    expect(messages.length).toBe(0);

    // Recent conclusion should remain
    const conclusions = store.getConclusions("ws", "user", 10);
    expect(conclusions.length).toBe(1);
    expect(conclusions[0].content).toBe("Recent insight");
    store.close();
  });

  it("prunes based on all retention parameters", async () => {
    const store = await createStore(path.join(testDir, "retention2.db"));
    await store.init();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");

    const now = Date.now();
    store.saveSummary("ws", {
      id: "s-old", sessionId: "s1", peerId: "user", type: "short",
      content: "Old summary", messageCount: 5, createdAt: now - 60 * 24 * 60 * 60 * 1000,
    });
    store.saveConclusion("ws", {
      id: "c-old", peerId: "user", type: "inductive", content: "Old conclusion",
      premises: [], confidence: 0.5, createdAt: now - 100 * 24 * 60 * 60 * 1000, sourceSessionId: "s1",
    });

    // Only prune summaries older than 30 days, keep conclusions forever
    const result = store.prune(0, 30, 0);

    expect(result.deleted).toBe(1); // Only summary deleted
    const conclusions = store.getConclusions("ws", "user", 10);
    expect(conclusions.length).toBe(1); // Conclusion still there
    store.close();
  });
});

describe("Integration: Session Search", () => {
  it("finds sessions by keyword in messages", async () => {
    const store = await createStore(path.join(testDir, "search1.db"));
    await store.init();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    store.getOrCreateSession("ws", "session-typescript", ["user"]);
    store.getOrCreateSession("ws", "session-python", ["user"]);

    store.saveMessage("ws", {
      id: "m1", sessionId: "session-typescript", peerId: "user", role: "user",
      content: "I love TypeScript's type system", createdAt: Date.now(),
    });
    store.saveMessage("ws", {
      id: "m2", sessionId: "session-python", peerId: "user", role: "user",
      content: "Python is great for data science", createdAt: Date.now(),
    });

    const results = store.searchSessions("ws", "TypeScript", 10);
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe("session-typescript");
    expect(results[0].snippet).toContain("TypeScript");
    store.close();
  });

  it("returns multiple sessions for common terms", async () => {
    const store = await createStore(path.join(testDir, "search2.db"));
    await store.init();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    store.getOrCreateSession("ws", "s1", ["user"]);
    store.getOrCreateSession("ws", "s2", ["user"]);

    store.saveMessage("ws", {
      id: "m1", sessionId: "s1", peerId: "user", role: "user",
      content: "Working on AI project", createdAt: Date.now(),
    });
    store.saveMessage("ws", {
      id: "m2", sessionId: "s2", peerId: "user", role: "user",
      content: "AI is the future", createdAt: Date.now(),
    });

    const results = store.searchSessions("ws", "AI", 10);
    expect(results.length).toBe(2);
    store.close();
  });
});

describe("Integration: Cross-Peer Observations", () => {
  it("saves and retrieves cross-peer observations", async () => {
    const store = await createStore(path.join(testDir, "xpeer1.db"));
    await store.init();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    store.getOrCreatePeer("ws", "agent", "Agent", "agent");
    
    store.saveObservation({
      id: "obs1",
      workspaceId: "ws",
      peerId: "user",
      aboutPeerId: "agent",
      sessionId: "s1",
      role: "user",
      content: "The agent responds quickly",
      createdAt: Date.now(),
      processed: false,
    });
    
    // Get observations made BY user ABOUT agent
    const observations = store.getObservationsAboutPeer("ws", "agent", 10);
    expect(observations.length).toBe(1);
    expect(observations[0].content).toBe("The agent responds quickly");
    expect(observations[0].peerId).toBe("user");
    
    // Get observations made BY user (should include cross-peer)
    const userObs = store.getObservationsForPeer("ws", "user", 10);
    expect(userObs.length).toBe(1);
    expect(userObs[0].aboutPeerId).toBe("agent");
    
    store.close();
  });

  it("builds perspective context between peers", async () => {
    const store = await createStore(path.join(testDir, "xpeer2.db"));
    await store.init();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    store.getOrCreatePeer("ws", "agent", "Agent", "agent");
    
    store.saveObservation({
      id: "obs1",
      workspaceId: "ws",
      peerId: "user",
      aboutPeerId: "agent",
      sessionId: "s1",
      role: "user",
      content: "Agent prefers TypeScript",
      createdAt: Date.now(),
      processed: false,
    });
    
    store.savePeerCard("ws", {
      peerId: "agent",
      name: "Coding Agent",
      occupation: "Developer",
      interests: ["TypeScript"],
      traits: [],
      goals: [],
      updatedAt: Date.now(),
    });
    
    const contextAssembler = createContextAssembler(store);
    const perspective = contextAssembler.getPerspective("ws", "user", "agent");
    
    expect(perspective).toContain("user on agent");
    expect(perspective).toContain("Agent prefers TypeScript");
    expect(perspective).toContain("Coding Agent");
    
    store.close();
  });
});

describe("Integration: Message Metadata", () => {
  it("saves and retrieves message with metadata", async () => {
    const store = await createStore(path.join(testDir, "msg-meta.db"));
    await store.init();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    store.getOrCreateSession("ws", "s1", ["user"]);
    
    store.saveMessage("ws", {
      id: "m1",
      sessionId: "s1",
      peerId: "user",
      role: "user",
      content: "Test message",
      createdAt: Date.now(),
      metadata: { source: "api", priority: "high" },
    });
    
    const messages = store.getMessages("ws", "s1", 10);
    expect(messages.length).toBe(1);
    expect(messages[0].metadata).toBeDefined();
    
    store.close();
  });
});

describe("Integration: Batch Operations", () => {
  it("batch inserts multiple messages efficiently", async () => {
    const store = await createStore(path.join(testDir, "batch.db"));
    await store.init();
    store.getOrCreateWorkspace("ws");
    store.getOrCreatePeer("ws", "user", "User", "user");
    store.getOrCreateSession("ws", "s1", ["user"]);
    
    const messages = [
      { id: "m1", sessionId: "s1", peerId: "user", role: "user", content: "Hello", createdAt: Date.now(), metadata: {} },
      { id: "m2", sessionId: "s1", peerId: "user", role: "user", content: "World", createdAt: Date.now() + 1, metadata: {} },
      { id: "m3", sessionId: "s1", peerId: "user", role: "user", content: "Test", createdAt: Date.now() + 2, metadata: {} },
    ];
    
    const count = store.saveMessagesBatch("ws", messages);
    expect(count).toBe(3);
    
    const retrieved = store.getMessages("ws", "s1", 10);
    expect(retrieved.length).toBe(3);
    
    store.close();
  });
});
