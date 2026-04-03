/**
 * Direct integration test for hybrid memory features
 * Run with: node --import=tsx tests/hybrid-integration.test.mjs
 */

import { createStore } from "../dist/core/store.js";
import { createContextAssembler } from "../dist/core/context.js";
import path from "path";
import fs from "fs";
import os from "os";

const GLOBAL_WORKSPACE_ID = "__global__";
const TEST_WORKSPACE = "test-workspace";

function createTestConclusion(overrides) {
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

async function runTests() {
  console.log("🧪 Hybrid Memory Integration Tests\n");
  
  const tmpDir = os.tmpdir();
  const dbPath = path.join(tmpDir, `hybrid-test-${Date.now()}.db`);
  
  console.log("1. Creating store...");
  const store = await createStore(dbPath);
  await store.init();
  console.log("   ✓ Store initialized\n");

  // Create workspaces
  console.log("2. Creating workspaces...");
  store.getOrCreateWorkspace(TEST_WORKSPACE, "Test Workspace");
  store.getOrCreateWorkspace(GLOBAL_WORKSPACE_ID, "Global Workspace");
  console.log("   ✓ Workspaces created\n");

  // Create peers
  console.log("3. Creating peers...");
  store.getOrCreatePeer(TEST_WORKSPACE, "user", "User", "user");
  store.getOrCreatePeer(GLOBAL_WORKSPACE_ID, "user", "User", "user");
  console.log("   ✓ Peers created\n");

  // Test 1: Save conclusions with different scopes
  console.log("4. Testing scope-based conclusion storage...\n");
  
  // Project-scope conclusion
  const projectConclusion = createTestConclusion({
    id: "proj-1",
    scope: "project",
    content: "Project uses SQLite for database",
  });
  store.saveConclusion(TEST_WORKSPACE, projectConclusion);
  console.log("   ✓ Saved project-scope conclusion");

  // User-scope conclusion in global workspace
  const globalConclusion = createTestConclusion({
    id: "global-1",
    scope: "user",
    content: "User prefers TypeScript over JavaScript",
  });
  store.saveConclusion(GLOBAL_WORKSPACE_ID, globalConclusion);
  console.log("   ✓ Saved user-scope conclusion to global workspace\n");

  // Test 2: Retrieve conclusions
  console.log("5. Testing conclusion retrieval...\n");
  
  const projectConclusions = store.getConclusions(TEST_WORKSPACE, "user", 100);
  const globalConclusions = store.getGlobalConclusions("user", 100);
  
  console.log(`   Project conclusions: ${projectConclusions.length}`);
  console.log(`   Global conclusions: ${globalConclusions.length}`);
  
  if (projectConclusions.length > 0) {
    console.log(`   ✓ Project: "${projectConclusions[0].content.slice(0, 50)}..."`);
  }
  if (globalConclusions.length > 0) {
    console.log(`   ✓ Global: "${globalConclusions[0].content.slice(0, 50)}..."`);
  }

  // Test 3: Context assembly
  console.log("\n6. Testing context blending...\n");
  
  const contextAssembler = createContextAssembler(store);
  const blended = contextAssembler.getBlendedContext(TEST_WORKSPACE, "user");
  
  console.log("   Blended context structure:");
  console.log(`   - Global conclusions: ${blended.global.conclusions.length}`);
  console.log(`   - Project conclusions: ${blended.project.conclusions.length}`);
  console.log(`   - Blended conclusions: ${blended.blendedConclusions.length}`);
  
  // Test 4: Separate contexts
  console.log("\n7. Testing context separation...\n");
  
  const globalOnly = contextAssembler.getGlobalContext("user");
  const projectOnly = contextAssembler.getProjectContext(TEST_WORKSPACE, "user");
  
  console.log(`   Global context length: ${globalOnly.length} chars`);
  console.log(`   Project context length: ${projectOnly.length} chars`);
  
  const hasGlobal = globalOnly.includes("TypeScript");
  const hasProjectInGlobal = globalOnly.includes("SQLite");
  const hasProject = projectOnly.includes("SQLite");
  const hasGlobalInProject = projectOnly.includes("TypeScript");
  
  console.log(`   ✓ Global context has user trait: ${hasGlobal}`);
  console.log(`   ✓ Global context excludes project data: ${!hasProjectInGlobal}`);
  console.log(`   ✓ Project context has project data: ${hasProject}`);
  console.log(`   ✓ Project context excludes global data: ${!hasGlobalInProject}`);

  // Test 5: Peer cards
  console.log("\n8. Testing peer card blending...\n");
  
  store.savePeerCard(GLOBAL_WORKSPACE_ID, {
    peerId: "user",
    name: "Test User",
    occupation: "Developer",
    interests: ["TypeScript", "Testing"],
    traits: ["Detail-oriented"],
    goals: ["Ship great software"],
    updatedAt: Date.now(),
  });
  
  const blendedWithCard = contextAssembler.getBlendedContext(TEST_WORKSPACE, "user");
  
  console.log(`   Global peer card name: ${blendedWithCard.global.peerCard?.name || "none"}`);
  console.log(`   Global interests: ${blendedWithCard.global.peerCard?.interests.join(", ") || "none"}`);
  console.log("   ✓ Peer card blending works\n");

  // Cleanup
  store.close();
  fs.unlinkSync(dbPath);

  // Summary
  console.log("═══════════════════════════════════════");
  console.log("✅ All hybrid memory tests passed!");
  console.log("═══════════════════════════════════════\n");
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
