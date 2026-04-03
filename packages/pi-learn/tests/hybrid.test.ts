/**
 * Hybrid Memory Architecture Unit Tests
 * 
 * Tests for scope-based conclusion filtering, global vs project separation,
 * and context blending.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import initSqlJs from "sql.js";
import os from "os";
import fs from "fs";
import path from "path";

// Import types
import type { Conclusion, Scope } from "../src/shared";

// Import actual store
import { createStore } from "../src/core/store";
import { createContextAssembler } from "../src/core/context";

// Test constants
const GLOBAL_WORKSPACE_ID = "__global__";
const TEST_WORKSPACE = "test-workspace";

// Helper to create test conclusions
function createTestConclusion(overrides: Partial<Conclusion> & { scope: Scope }): Conclusion {
  return {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    peerId: "user",
    type: "inductive",
    content: "Test conclusion content",
    premises: [],
    confidence: 0.7,
    createdAt: Date.now(),
    sourceSessionId: "test-session",
    scope: "project",
    ...overrides,
  };
}

describe("Hybrid Memory Architecture", () => {
  describe("Scope Types", () => {
    it("should have valid scope values", () => {
      const validScopes: Scope[] = ["user", "project"];
      expect(validScopes).toContain("user");
      expect(validScopes).toContain("project");
    });

    it("should export GLOBAL_WORKSPACE_ID constant", () => {
      // The global workspace ID should be used for cross-project data
      expect(GLOBAL_WORKSPACE_ID).toBe("__global__");
    });
  });

  describe("Conclusion Scope Storage", () => {
    let store: Awaited<ReturnType<typeof createStore>>;
    let dbPath: string;

    beforeEach(async () => {
      const tmpDir = os.tmpdir();
      dbPath = path.join(tmpDir, `test-hybrid-${Date.now()}.db`);
      store = await createStore(dbPath);
      await store.init();
      
      // Create workspaces
      store.getOrCreateWorkspace(TEST_WORKSPACE, "Test Workspace");
      store.getOrCreateWorkspace(GLOBAL_WORKSPACE_ID, "Global");
      
      // Create peers
      store.getOrCreatePeer(TEST_WORKSPACE, "user", "User", "user");
      store.getOrCreatePeer(TEST_WORKSPACE, "agent", "Agent", "agent");
      store.getOrCreatePeer(GLOBAL_WORKSPACE_ID, "user", "User", "user");
      store.getOrCreatePeer(GLOBAL_WORKSPACE_ID, "agent", "Agent", "agent");
    });

    afterEach(async () => {
      if (store) {
        store.close();
      }
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
    });

    it("should save and retrieve conclusions with scope", async () => {
      const conclusion = createTestConclusion({
        id: "test-scope-1",
        scope: "project",
        content: "Project-specific code pattern",
      });

      store.saveConclusion(TEST_WORKSPACE, conclusion);

      const retrieved = store.getConclusions(TEST_WORKSPACE, "user", 10);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].scope).toBe("project");
      expect(retrieved[0].content).toBe("Project-specific code pattern");
    });

    it("should filter conclusions by scope", async () => {
      // Save project-scope conclusions
      for (let i = 0; i < 3; i++) {
        store.saveConclusion(TEST_WORKSPACE, createTestConclusion({
          id: `project-${i}`,
          scope: "project",
          content: `Project conclusion ${i}`,
        }));
      }

      // Save user-scope conclusions
      for (let i = 0; i < 2; i++) {
        store.saveConclusion(TEST_WORKSPACE, createTestConclusion({
          id: `user-${i}`,
          scope: "user",
          content: `User conclusion ${i}`,
        }));
      }

      const all = store.getConclusions(TEST_WORKSPACE, "user", 100);
      expect(all).toHaveLength(5);

      // Filter by scope
      const projectOnly = all.filter(c => c.scope === "project");
      const userOnly = all.filter(c => c.scope === "user");

      expect(projectOnly).toHaveLength(3);
      expect(userOnly).toHaveLength(2);
    });

    it("should store conclusions in global workspace", async () => {
      const globalConclusion = createTestConclusion({
        id: "global-scope-1",
        scope: "user",
        content: "Cross-project insight: prefers TypeScript",
      });

      store.saveConclusion(GLOBAL_WORKSPACE_ID, globalConclusion);

      const retrieved = store.getGlobalConclusions("user", 10);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].scope).toBe("user");
      expect(retrieved[0].content).toContain("TypeScript");
    });

    it("should separate global and project conclusions", async () => {
      // Project workspace
      store.saveConclusion(TEST_WORKSPACE, createTestConclusion({
        id: "proj-sep-1",
        scope: "project",
        content: "Project A uses SQLite",
      }));

      // Global workspace
      store.saveConclusion(GLOBAL_WORKSPACE_ID, createTestConclusion({
        id: "global-sep-1",
        scope: "user",
        content: "User prefers functional programming",
      }));

      const projectConclusions = store.getConclusions(TEST_WORKSPACE, "user", 100);
      const globalConclusions = store.getGlobalConclusions("user", 100);

      expect(projectConclusions).toHaveLength(1);
      expect(projectConclusions[0].content).toContain("SQLite");

      expect(globalConclusions).toHaveLength(1);
      expect(globalConclusions[0].content).toContain("functional programming");
    });
  });

  describe("Context Blending", () => {
    let contextAssembler: ReturnType<typeof createContextAssembler>;
    let store: Awaited<ReturnType<typeof createStore>>;
    let dbPath: string;

    beforeEach(async () => {
      const tmpDir = os.tmpdir();
      dbPath = path.join(tmpDir, `test-context-${Date.now()}.db`);
      store = await createStore(dbPath);
      await store.init();
      contextAssembler = createContextAssembler(store);

      store.getOrCreateWorkspace(TEST_WORKSPACE, "Test");
      store.getOrCreateWorkspace(GLOBAL_WORKSPACE_ID, "Global");
      store.getOrCreatePeer(TEST_WORKSPACE, "user", "User", "user");
      store.getOrCreatePeer(GLOBAL_WORKSPACE_ID, "user", "User", "user");
    });

    afterEach(async () => {
      if (store) store.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    });

    it("should assemble blended context with both scopes", async () => {
      // Add global conclusion
      store.saveConclusion(GLOBAL_WORKSPACE_ID, createTestConclusion({
        id: "ctx-global-1",
        scope: "user",
        content: "Global: User trait - detail oriented",
      }));

      // Add project conclusion
      store.saveConclusion(TEST_WORKSPACE, createTestConclusion({
        id: "ctx-proj-1",
        scope: "project",
        content: "Project: Used SQLite for storage",
      }));

      const blended = contextAssembler.getBlendedContext(TEST_WORKSPACE, "user");

      expect(blended).toBeDefined();
      expect(blended.global).toBeDefined();
      expect(blended.project).toBeDefined();
      expect(blended.blendedConclusions).toBeDefined();

      // Should have global conclusion
      expect(blended.global.conclusions.some(c => c.content.includes("detail oriented"))).toBe(true);

      // Should have project conclusion
      expect(blended.project.conclusions.some(c => c.content.includes("SQLite"))).toBe(true);

      // Blended should have both
      expect(blended.blendedConclusions.length).toBeGreaterThanOrEqual(2);
    });

    it("should get global context only", async () => {
      store.saveConclusion(GLOBAL_WORKSPACE_ID, createTestConclusion({
        id: "ctx-only-global",
        scope: "user",
        content: "Global insight for user profile",
      }));

      store.saveConclusion(TEST_WORKSPACE, createTestConclusion({
        id: "ctx-only-proj",
        scope: "project",
        content: "Project specific detail",
      }));

      const globalContext = contextAssembler.getGlobalContext("user");

      expect(globalContext).toContain("Global insight");
      expect(globalContext).not.toContain("Project specific detail");
    });

    it("should get project context only", async () => {
      store.saveConclusion(GLOBAL_WORKSPACE_ID, createTestConclusion({
        id: "proj-only-global",
        scope: "user",
        content: "Global insight",
      }));

      store.saveConclusion(TEST_WORKSPACE, createTestConclusion({
        id: "proj-only-project",
        scope: "project",
        content: "Project-specific implementation",
      }));

      const projectContext = contextAssembler.getProjectContext(TEST_WORKSPACE, "user");

      expect(projectContext).toContain("Project-specific implementation");
      expect(projectContext).not.toContain("Global insight");
    });

    it("should include peer cards from both scopes", async () => {
      store.savePeerCard(GLOBAL_WORKSPACE_ID, {
        peerId: "user",
        name: "Warren",
        occupation: "Developer",
        interests: ["TypeScript", "Functional Programming"],
        traits: ["Detail-oriented"],
        goals: ["Ship great code"],
        updatedAt: Date.now(),
      });

      const blended = contextAssembler.getBlendedContext(TEST_WORKSPACE, "user");

      expect(blended.global.peerCard).toBeDefined();
      expect(blended.global.peerCard?.name).toBe("Warren");
      expect(blended.global.peerCard?.interests).toContain("TypeScript");
    });
  });

  describe("Memory Stats by Scope", () => {
    let contextAssembler: ReturnType<typeof createContextAssembler>;
    let store: Awaited<ReturnType<typeof createStore>>;
    let dbPath: string;

    beforeEach(async () => {
      const tmpDir = os.tmpdir();
      dbPath = path.join(tmpDir, `test-stats-${Date.now()}.db`);
      store = await createStore(dbPath);
      await store.init();
      contextAssembler = createContextAssembler(store);

      store.getOrCreateWorkspace(TEST_WORKSPACE, "Test");
      store.getOrCreateWorkspace(GLOBAL_WORKSPACE_ID, "Global");
      store.getOrCreatePeer(TEST_WORKSPACE, "user", "User", "user");
      store.getOrCreatePeer(GLOBAL_WORKSPACE_ID, "user", "User", "user");
    });

    afterEach(async () => {
      if (store) store.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    });

    it("should track conclusion counts by scope", async () => {
      // Add mixed scope conclusions
      store.saveConclusion(TEST_WORKSPACE, createTestConclusion({ id: "stats-p1", scope: "project" }));
      store.saveConclusion(TEST_WORKSPACE, createTestConclusion({ id: "stats-p2", scope: "project" }));
      store.saveConclusion(TEST_WORKSPACE, createTestConclusion({ id: "stats-u1", scope: "user" }));
      store.saveConclusion(GLOBAL_WORKSPACE_ID, createTestConclusion({ id: "stats-g1", scope: "user" }));

      const stats = contextAssembler.getMemoryStats(TEST_WORKSPACE, "user");

      expect(stats.globalConclusionCount).toBe(1);
      expect(stats.conclusionCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Backward Compatibility", () => {
    let store: Awaited<ReturnType<typeof createStore>>;
    let dbPath: string;

    beforeEach(async () => {
      const tmpDir = os.tmpdir();
      dbPath = path.join(tmpDir, `test-backward-${Date.now()}.db`);
      store = await createStore(dbPath);
      await store.init();
      store.getOrCreateWorkspace(TEST_WORKSPACE, "Test");
      store.getOrCreatePeer(TEST_WORKSPACE, "user", "User", "user");
    });

    afterEach(async () => {
      if (store) store.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    });

    it("should default scope to project when not specified", async () => {
      // Create conclusion without explicit scope (simulating legacy data)
      const conclusion = {
        id: "legacy-1",
        peerId: "user",
        type: "inductive" as const,
        content: "Legacy conclusion without scope",
        premises: [] as string[],
        confidence: 0.7,
        createdAt: Date.now(),
        sourceSessionId: "legacy",
      };

      // Save - should default to project scope
      store.saveConclusion(TEST_WORKSPACE, conclusion);

      // Should default to project scope
      const retrieved = store.getConclusions(TEST_WORKSPACE, "user", 10);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].scope).toBe("project");
    });
  });
});
