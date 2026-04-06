/**
 * pi-kobold Tests
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { 
  tools, 
  initializeKobold, 
  isKoboldInitialized,
  getLLMExecutor,
  createMockLLMExecutor,
  type LLMExecutor,
} from "../src/index.js";

describe("pi-kobold Extension", () => {
  test("has required tools", () => {
    expect(tools.length).toBeGreaterThan(0);
    
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain("kobold_initialize");
    expect(toolNames).toContain("kobold_create_skill");
    expect(toolNames).toContain("kobold_create_extension");
    expect(toolNames).toContain("kobold_status");
  });

  test("is not initialized by default", () => {
    expect(isKoboldInitialized()).toBe(false);
    expect(getLLMExecutor()).toBeNull();
  });
});

describe("LLM Adapter", () => {
  test("can create mock executor", () => {
    const executor = createMockLLMExecutor("Hello from mock!");
    expect(executor).toBeDefined();
    expect(typeof executor).toBe("function");
  });

  test("mock executor returns response", async () => {
    const executor = createMockLLMExecutor("Test response");
    
    const result = await executor({
      model: "test/model",
      messages: [{ role: "user", content: "Hello" }],
    });
    
    expect(result.content).toBe("Test response");
    expect(result.usage).toBeDefined();
    expect(result.usage!.outputTokens).toBeGreaterThan(0);
  });

  test("mock executor with dynamic response", async () => {
    const executor = createMockLLMExecutor((opts) => {
      return `Echo: ${opts.messages[0].content}`;
    });
    
    const result = await executor({
      model: "test/model",
      messages: [{ role: "user", content: "test message" }],
    });
    
    expect(result.content).toBe("Echo: test message");
  });
});

describe("Initialize with Mock", () => {
  test("can be initialized with mock executor", () => {
    const mockLLM = createMockLLMExecutor("Mock response");
    initializeKobold(mockLLM);
    
    expect(isKoboldInitialized()).toBe(true);
    expect(getLLMExecutor()).not.toBeNull();
  });

  test("initialized executor works", async () => {
    // Use the same mock that was initialized in previous test
    const executor = getLLMExecutor();
    const result = await executor!({
      model: "test/model",
      messages: [{ role: "user", content: "test" }],
    });
    
    expect(result.content).toBe("Mock response");
  });
});
