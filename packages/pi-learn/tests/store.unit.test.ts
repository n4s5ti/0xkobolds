/**
 * Unit Tests for Modular SQLiteStore
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createStore } from "../src/core/store.js";

const testDir = path.join(os.tmpdir(), `pi-learn-test-unit`);

beforeEach(() => {
  fs.mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  try {
    const files = fs.readdirSync(testDir);
    for (const file of files) {
      fs.unlinkSync(path.join(testDir, file));
    }
  } catch {}
});

describe("SQLiteStore Unit Tests", () => {
  describe("Workspace Operations", () => {
    it("creates and retrieves workspace", async () => {
      const store = await createStore(path.join(testDir, "ws.db"));
      await store.init();
      const ws = store.getOrCreateWorkspace("test-ws", "Test Workspace");
      expect(ws.id).toBe("test-ws");
      expect(ws.name).toBe("Test Workspace");
      store.close();
    });

    it("returns null for missing workspace", async () => {
      const store = await createStore(path.join(testDir, "ws2.db"));
      await store.init();
      expect(store.getWorkspace("missing")).toBeNull();
      store.close();
    });
  });

  describe("Peer Operations", () => {
    it("creates and retrieves peer", async () => {
      const store = await createStore(path.join(testDir, "peer.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      const peer = store.getOrCreatePeer("ws", "user", "Test User", "user");
      expect(peer.id).toBe("user");
      expect(peer.type).toBe("user");
      store.close();
    });

    it("lists all peers", async () => {
      const store = await createStore(path.join(testDir, "peers.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      store.getOrCreatePeer("ws", "u1", "User 1", "user");
      store.getOrCreatePeer("ws", "u2", "User 2", "user");
      const peers = store.getAllPeers("ws");
      expect(peers.length).toBeGreaterThanOrEqual(2);
      store.close();
    });
  });

  describe("Conclusion Operations", () => {
    it("saves and retrieves conclusions", async () => {
      const store = await createStore(path.join(testDir, "conc.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      store.getOrCreatePeer("ws", "user", "User", "user");
      store.saveConclusion("ws", {
        id: "c1", peerId: "user", type: "deductive", content: "Test conclusion",
        premises: ["test"], confidence: 0.8, createdAt: Date.now(), sourceSessionId: "s1",
      });
      const results = store.getConclusions("ws", "user", 10);
      expect(results.length).toBe(1);
      expect(results[0].content).toBe("Test conclusion");
      store.close();
    });
  });

  describe("PeerCard Operations", () => {
    it("saves and retrieves peer card", async () => {
      const store = await createStore(path.join(testDir, "card.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      store.getOrCreatePeer("ws", "user", "User", "user");
      store.savePeerCard("ws", {
        peerId: "user", name: "Warren", occupation: "Dev",
        interests: ["AI"], traits: ["detail"], goals: ["build"], updatedAt: Date.now(),
      });
      const retrieved = store.getPeerCard("ws", "user");
      expect(retrieved?.name).toBe("Warren");
      expect(retrieved?.interests).toContain("AI");
      store.close();
    });
  });

  describe("Retention", () => {
    it("prunes old data based on retention config", async () => {
      const store = await createStore(path.join(testDir, "prune.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      store.getOrCreatePeer("ws", "user", "User", "user");
      store.saveSummary("ws", {
        id: "old", sessionId: "s1", peerId: "user", type: "short",
        content: "Old", messageCount: 5, createdAt: Date.now() - 50 * 24 * 60 * 60 * 1000,
      });
      const result = store.prune(0, 30, 0);
      expect(result.deleted).toBe(1);
      store.close();
    });
  });

  describe("Search", () => {
    it("searches sessions by keyword", async () => {
      const store = await createStore(path.join(testDir, "search.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      store.getOrCreatePeer("ws", "user", "User", "user");
      store.getOrCreateSession("ws", "s1", ["user"]);
      store.saveMessage("ws", {
        id: "m1", sessionId: "s1", peerId: "user", role: "user",
        content: "Testing search functionality", createdAt: Date.now(),
      });
      const results = store.searchSessions("ws", "search", 10);
      expect(results.length).toBe(1);
      store.close();
    });
  });

  describe("Export/Import", () => {
    it("exports all data", async () => {
      const store = await createStore(path.join(testDir, "export.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      store.getOrCreatePeer("ws", "user", "User", "user");
      store.savePeerCard("ws", {
        peerId: "user", name: "Test", occupation: "Dev",
        interests: [], traits: [], goals: [], updatedAt: Date.now(),
      });
      const data = store.exportAll("ws");
      expect(data.version).toBe("1.0.0");
      expect(data.peerCards.length).toBeGreaterThan(0);
      store.close();
    });

    it("imports data with merge", async () => {
      const store = await createStore(path.join(testDir, "import.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      const data = {
        version: "1.0.0", exportedAt: Date.now(), workspace: { id: "ws", name: "Test", createdAt: Date.now(), config: {} },
        peers: [], conclusions: [], summaries: [], observations: [],
        peerCards: [{ peerId: "restored", name: "Restored", occupation: "Tester", interests: [], traits: [], goals: [], updatedAt: Date.now() }],
      };
      store.importAll("ws", data, true);
      const card = store.getPeerCard("ws", "restored");
      expect(card?.name).toBe("Restored");
      store.close();
    });
  });

  describe("Dream Metadata", () => {
    it("returns empty metadata for new workspace", async () => {
      const store = await createStore(path.join(testDir, "dream1.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      const meta = store.getDreamMetadata("ws");
      expect(meta.lastDreamedAt).toBe(0);
      expect(meta.dreamCount).toBe(0);
      expect(meta.lastDreamMessages).toBe(0);
      expect(meta.lastDreamConclusions).toBe(0);
      store.close();
    });

    it("updates dream metadata after dreaming", async () => {
      const store = await createStore(path.join(testDir, "dream2.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      store.getOrCreatePeer("ws", "user", "User", "user");
      
      // Simulate first dream
      store.updateDreamMetadata("ws", 50, 3);
      
      const meta = store.getDreamMetadata("ws");
      expect(meta.dreamCount).toBe(1);
      expect(meta.lastDreamMessages).toBe(50);
      expect(meta.lastDreamConclusions).toBe(3);
      expect(meta.lastDreamedAt).toBeGreaterThan(0);
      store.close();
    });

    it("increments dream count on subsequent dreams", async () => {
      const store = await createStore(path.join(testDir, "dream3.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      
      store.updateDreamMetadata("ws", 30, 2);
      store.updateDreamMetadata("ws", 45, 4);
      
      const meta = store.getDreamMetadata("ws");
      expect(meta.dreamCount).toBe(2);
      expect(meta.lastDreamMessages).toBe(45);
      expect(meta.lastDreamConclusions).toBe(4);
      store.close();
    });

    it("preserves previous dream data on update", async () => {
      const store = await createStore(path.join(testDir, "dream4.db"));
      await store.init();
      store.getOrCreateWorkspace("ws");
      
      const before = Date.now();
      store.updateDreamMetadata("ws", 20, 1);
      
      // Wait a bit to ensure timestamp difference
      await new Promise(r => setTimeout(r, 10));
      
      store.updateDreamMetadata("ws", 40, 5);
      
      const meta = store.getDreamMetadata("ws");
      expect(meta.dreamCount).toBe(2);
      expect(meta.lastDreamedAt).toBeGreaterThanOrEqual(before);
      store.close();
    });
  });
});
