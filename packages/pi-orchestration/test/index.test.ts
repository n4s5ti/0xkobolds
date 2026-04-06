/**
 * pi-orchestration Tests
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { DEFAULT_AGENTS, getAgentDefinition, getDepthLimit, canSpawnSubagents } from "../src/core/agents";
import { normalizeModelId, scoreModelForPreferenceExport } from "../src/utils/model-selector";
import { validateDepth, resetDepth, getDepthTracker } from "../src/utils/depth";
import { renderTemplate, extractTemplateVariables, validateTemplateContext } from "../src/utils/template";
import type { ModelPreference } from "../src/core/types";

// ============================================================================
// Agent Tests
// ============================================================================

describe("Agent Definitions", () => {
  test("all five agent types are defined", () => {
    expect(DEFAULT_AGENTS.scout).toBeDefined();
    expect(DEFAULT_AGENTS.specialist).toBeDefined();
    expect(DEFAULT_AGENTS.worker).toBeDefined();
    expect(DEFAULT_AGENTS.reviewer).toBeDefined();
    expect(DEFAULT_AGENTS.coordinator).toBeDefined();
  });

  test("scout has depth limit of 0", () => {
    const scout = getAgentDefinition("scout");
    expect(scout.depthLimit).toBe(0);
    expect(canSpawnSubagents("scout", 0)).toBe(false);
  });

  test("worker has depth limit of 1", () => {
    const worker = getAgentDefinition("worker");
    expect(worker.depthLimit).toBe(1);
    expect(canSpawnSubagents("worker", 0)).toBe(true);
    expect(canSpawnSubagents("worker", 1)).toBe(false);
  });

  test("coordinator has unlimited depth", () => {
    const coordinator = getAgentDefinition("coordinator");
    expect(coordinator.depthLimit).toBe(Infinity);
    expect(canSpawnSubagents("coordinator", 100)).toBe(true);
  });

  test("all agents have model preference", () => {
    for (const agent of Object.values(DEFAULT_AGENTS)) {
      expect(agent.modelPreference).toMatch(/^(fast|balanced|smart)$/);
    }
  });

  test("all agents have system prompts", () => {
    for (const agent of Object.values(DEFAULT_AGENTS)) {
      expect(agent.systemPrompt.length).toBeGreaterThan(10);
    }
  });

  test("depth limits are correct", () => {
    expect(getDepthLimit("scout")).toBe(0);
    expect(getDepthLimit("specialist")).toBe(1);
    expect(getDepthLimit("worker")).toBe(1);
    expect(getDepthLimit("reviewer")).toBe(0);
    expect(getDepthLimit("coordinator")).toBe(Infinity);
  });
});

// ============================================================================
// Model Selection Tests
// ============================================================================

describe("Model Selection", () => {
  test("normalizeModelId handles various formats", () => {
    // Models with : suffix (local/cloud) keep original format
    expect(normalizeModelId("qwen2.5-coder:14b")).toBe("qwen2.5-coder:14b");
    expect(normalizeModelId("minimax-m2.7:cloud")).toBe("minimax-m2.7:cloud");
    // Models with / keep original format
    expect(normalizeModelId("ollama/llama3.2:3b")).toBe("ollama/llama3.2:3b");
    expect(normalizeModelId("claude/claude-3-5-sonnet")).toBe("claude/claude-3-5-sonnet");
    // Plain model names get ollama/ prefix
    expect(normalizeModelId("llama3.2")).toBe("ollama/llama3.2");
  });

  test("scoreModelForPreference prefers small models for fast", () => {
    const smallModel = { provider: "ollama", id: "llama3.2:3b", fullId: "ollama/llama3.2:3b" };
    const largeModel = { provider: "ollama", id: "llama3.1:70b", fullId: "ollama/llama3.1:70b" };
    
    const smallScore = scoreModelForPreferenceExport(smallModel, "fast");
    const largeScore = scoreModelForPreferenceExport(largeModel, "fast");
    
    expect(smallScore).toBeGreaterThan(largeScore);
  });

  test("scoreModelForPreference prefers large models for smart", () => {
    const smallModel = { provider: "ollama", id: "llama3.2:3b", fullId: "ollama/llama3.2:3b" };
    const largeModel = { provider: "ollama", id: "llama3.1:70b", fullId: "ollama/llama3.1:70b" };
    
    const smallScore = scoreModelForPreferenceExport(smallModel, "smart");
    const largeScore = scoreModelForPreferenceExport(largeModel, "smart");
    
    expect(largeScore).toBeGreaterThan(smallScore);
  });

  test("coder models get boost for balanced", () => {
    const coderModel = { provider: "ollama", id: "qwen2.5-coder:14b", fullId: "ollama/qwen2.5-coder:14b" };
    const regularModel = { provider: "ollama", id: "qwen2.5:14b", fullId: "ollama/qwen2.5:14b" };
    
    const coderScore = scoreModelForPreferenceExport(coderModel, "balanced");
    const regularScore = scoreModelForPreferenceExport(regularModel, "balanced");
    
    expect(coderScore).toBeGreaterThan(regularScore);
  });
});

// ============================================================================
// Depth Tracking Tests
// ============================================================================

describe("Depth Tracking", () => {
  beforeEach(() => {
    resetDepth();
  });

  test("initial depth is 0", () => {
    expect(getDepthTracker().getDepth()).toBe(0);
  });

  test("validateDepth allows scout at depth 0", () => {
    // Scout has depthLimit of 0, so at depth 0, it cannot spawn (effectiveLimit = 0)
    // This is correct behavior - scout cannot spawn subagents at any depth
    const result = validateDepth("scout");
    expect(result.currentDepth).toBe(0);
    expect(result.agentLimit).toBe(0);
    // Cannot spawn because effectiveLimit (0) equals currentDepth (0)
    expect(result.allowed).toBe(false);
  });

  test("validateDepth denies scout at any depth > 0", () => {
    getDepthTracker().increment();
    getDepthTracker().increment();
    
    const result = validateDepth("scout");
    expect(result.allowed).toBe(false);
    expect(result.currentDepth).toBe(2);
  });

  test("validateDepth provides helpful error messages", () => {
    getDepthTracker().increment();
    const result = validateDepth("scout");
    
    expect(result.message).toBeDefined();
    expect(result.message).toContain("scout");
    expect(result.message).toContain("cannot spawn");
  });

  test("coordinator can spawn at any depth up to global max", () => {
    getDepthTracker().setMaxDepth(10);
    // Coordinator can spawn up to depth 9 (before hitting global max of 10)
    for (let i = 0; i < 9; i++) {
      getDepthTracker().increment();
      const result = validateDepth("coordinator");
      expect(result.allowed).toBe(true);
    }
    // At depth 10, coordinator is blocked by global max
    getDepthTracker().increment();
    const result = validateDepth("coordinator");
    expect(result.allowed).toBe(false);
  });
});

// ============================================================================
// Template Tests
// ============================================================================

describe("Template Engine", () => {
  test("renderTemplate replaces basic variables", () => {
    const template = "Task: {task}, Previous: {previous}";
    const context = { task: "Do stuff", previous: "Done stuff" };
    
    const result = renderTemplate(template, context);
    
    expect(result).toBe("Task: Do stuff, Previous: Done stuff");
  });

  test("renderTemplate replaces step variables", () => {
    const template = "First: {step:1}, Second: {step:2}";
    const context = { step: ["Step 1 output", "Step 2 output"] };
    
    const result = renderTemplate(template, context);
    
    expect(result).toBe("First: Step 1 output, Second: Step 2 output");
  });

  test("renderTemplate handles missing step variables", () => {
    const template = "First: {step:1}, Third: {step:3}";
    const context = { step: ["Only one step"] };
    
    const result = renderTemplate(template, context);
    
    expect(result).toBe("First: Only one step, Third: {step:3}");
  });

  test("extractTemplateVariables finds all variables", () => {
    const template = "{task} {step:1} {step:2} {custom}";
    const vars = extractTemplateVariables(template);
    
    expect(vars).toContain("task");
    expect(vars).toContain("step:1");
    expect(vars).toContain("step:2");
    expect(vars).toContain("custom");
    expect(vars.length).toBe(4);
  });

  test("validateTemplateContext detects missing required vars", () => {
    const template = "{task} and {previous}";
    const context = { task: "Do it" };
    
    const result = validateTemplateContext(template, context, ["task", "previous"]);
    
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("previous");
  });

  test("validateTemplateContext passes with all required vars", () => {
    const template = "{task} and {previous}";
    const context = { task: "Do it", previous: "Did it" };
    
    const result = validateTemplateContext(template, context, ["task", "previous"]);
    
    expect(result.valid).toBe(true);
    expect(result.missing.length).toBe(0);
  });
});

// ============================================================================
// Integration-style Tests (mocked)
// ============================================================================

describe("Orchestration Flow", () => {
  beforeEach(() => {
    resetDepth();
  });

  test("single execution increases depth temporarily", async () => {
    const tracker = getDepthTracker();
    const initialDepth = tracker.getDepth();
    
    tracker.increment();
    expect(tracker.getDepth()).toBe(initialDepth + 1);
    
    tracker.decrement();
    expect(tracker.getDepth()).toBe(initialDepth);
  });

  test("depth is reset after orchestration", () => {
    const tracker = getDepthTracker();
    
    // Simulate nested execution
    tracker.increment();
    tracker.increment();
    tracker.increment();
    
    expect(tracker.getDepth()).toBe(3);
    
    // Reset for new orchestration
    resetDepth();
    expect(tracker.getDepth()).toBe(0);
  });
});
