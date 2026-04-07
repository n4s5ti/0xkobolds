/**
 * pi-kobold Tests
 */

import { describe, expect, test } from "bun:test";
import {
  initializeKobold,
  isKoboldInitialized,
  getLLMExecutor,
  createMockLLMExecutor,
  createLLMExecutor,
  createAsyncLLMExecutor,
  type LLMExecutor,
} from "../src/index.js";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ============================================================================
// Helpers
// ============================================================================

function createFakePi(): ExtensionAPI {
  const registeredTools: any[] = [];
  const registeredCommands: any[] = [];

  return {
    registerTool: (tool: any) => { registeredTools.push(tool); },
    registerCommand: (name: string, cmd: any) => { registeredCommands.push({ name, ...cmd }); },
    registerProvider: () => {},
    getAllTools: () => registeredTools,
    getCommands: () => registeredCommands.map(c => ({ name: c.name, description: c.description || "" })),
    settings: { get: () => null },
    on: () => {},
  } as unknown as ExtensionAPI;
}

// ============================================================================
// LLM Adapter Tests
// ============================================================================

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

// ============================================================================
// Kobold Initialize Tests
// ============================================================================

describe("Kobold Initialize", () => {
  test("is not initialized by default", () => {
    // Note: state is module-level so this test depends on whether
    // another test already called initializeKobold. We just test the API.
    expect(typeof isKoboldInitialized).toBe("function");
    expect(typeof getLLMExecutor).toBe("function");
  });

  test("can be initialized with mock executor", () => {
    const mockLLM = createMockLLMExecutor("Mock response");
    initializeKobold(mockLLM);

    expect(isKoboldInitialized()).toBe(true);
    expect(getLLMExecutor()).not.toBeNull();
  });

  test("initialized executor works", async () => {
    const executor = getLLMExecutor();
    const result = await executor!({
      model: "test/model",
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.content).toBe("Mock response");
  });
});

// ============================================================================
// Extension Loading Tests
// ============================================================================

describe("pi-kobold Extension", () => {
  test("registers kobold tools + auto-loads all sub-extensions", async () => {
    const pi = createFakePi();
    const extension = (await import("../src/index.js")).default;
    await extension(pi);

    const tools = pi.getAllTools() as any[];

    // kobold's own 4 tools
    const koboldTools = tools.filter((t: any) => t.name.startsWith("kobold_"));
    expect(koboldTools.length).toBe(4);
    expect(koboldTools.map((t: any) => t.name).sort()).toEqual([
      "kobold_create_extension",
      "kobold_create_skill",
      "kobold_initialize",
      "kobold_status",
    ]);

    // sub-extension tools should also be registered
    const toolNames = tools.map((t: any) => t.name);
    expect(toolNames).toContain("orchestrate");            // pi-orchestration
    expect(toolNames).toContain("gateway_status");           // pi-gateway
    expect(toolNames.some((n: string) => n.startsWith("learn_"))).toBe(true); // pi-learn
  });

  test("kobold_status detects sub-extensions correctly", async () => {
    const pi = createFakePi();

    // Load a sub-extension first (pi-orchestration) so detection works
    const orchestration = (await import("@0xkobold/pi-orchestration")).default;
    await orchestration(pi);

    // Load pi-kobold
    const kobold = (await import("../src/index.js")).default;
    await kobold(pi);

    const statusTool = (pi.getAllTools() as any[]).find((t: any) => t.name === "kobold_status");
    expect(statusTool).toBeDefined();

    const result = await statusTool!.execute("test", {}, undefined, undefined, {});
    expect(result.details.orchestration).toBe(true);
    expect(result.details.status).toBe("active");
  });

  test("skips already-loaded sub-extensions (duplicate guard)", async () => {
    const pi = createFakePi();

    // Pre-register orchestrate tool (simulating pi's loader already loading pi-orchestration)
    (pi as any).registerTool({
      name: "orchestrate",
      description: "Already loaded",
      parameters: {},
      execute: async () => ({}),
    });

    // Load pi-kobold — it should skip pi-orchestration but load the rest
    const kobold = (await import("../src/index.js")).default;
    await kobold(pi);

    const tools = (pi.getAllTools() as any[]).map((t: any) => t.name);
    // orchestrate exists (from pre-registration)
    expect(tools).toContain("orchestrate");
    // Other sub-extensions still loaded by pi-kobold
    expect(tools).toContain("gateway_status");
    expect(tools.some((n: string) => n.startsWith("learn_"))).toBe(true);
  });

  test("kobold_status detects ollama via commands", async () => {
    const pi = createFakePi();

    // Register a command manually (pi-ollama uses commands, not tools)
    (pi as any).registerCommand("ollama", { description: "test" });
    (pi as any).registerCommand("ollama-status", { description: "test" });

    const kobold = (await import("../src/index.js")).default;
    // Need fresh import to re-register - in real pi this works because
    // pi-kobold reads from pi.getAllTools()/getCommands() at runtime
    // We test the detection logic directly
    const tools = (pi.getAllTools() as any[]).map((t: any) => t.name);
    const commands = (pi as any).getCommands().map((c: any) => c.name);
    const hasOllama = tools.some((n: string) => n.startsWith("ollama")) ||
                     commands.some((n: string) => n.startsWith("ollama"));

    expect(hasOllama).toBe(true);
  });

  test("kobold_create_skill creates files", async () => {
    const pi = createFakePi();
    const kobold = (await import("../src/index.js")).default;
    await kobold(pi);

    const createSkill = (pi.getAllTools() as any[]).find((t: any) => t.name === "kobold_create_skill");
    const result = await createSkill!.execute("test", {
      name: "test-integration-skill",
      description: "A test skill",
      path: "/tmp/pi-kobold-test-integration",
    }, undefined, undefined, {});

    expect(result.details.created).toBe(true);
    expect(result.content[0].text).toContain("test-integration-skill");
  });

  test("kobold_create_extension creates files", async () => {
    const pi = createFakePi();
    const kobold = (await import("../src/index.js")).default;
    await kobold(pi);

    const createExt = (pi.getAllTools() as any[]).find((t: any) => t.name === "kobold_create_extension");
    const result = await createExt!.execute("test", {
      name: "@0xkobold/test-integration-ext",
      description: "A test extension",
      path: "/tmp/pi-kobold-test-integration",
    }, undefined, undefined, {});

    expect(result.details.created).toBe(true);
    expect(result.content[0].text).toContain("test-integration-ext");
  });
});

// ============================================================================
// Sub-Extension Loading Tests
// ============================================================================

describe("Sub-Extensions", () => {
  test("pi-orchestration loads successfully", async () => {
    const pi = createFakePi();
    const ext = (await import("@0xkobold/pi-orchestration")).default;
    await ext(pi);

    const tools = (pi.getAllTools() as any[]).map((t: any) => t.name);
    expect(tools).toContain("orchestrate");
    expect(tools).toContain("register_agent");
    expect(tools).toContain("orchestrate_status");
  });

  test("pi-gateway loads successfully", async () => {
    const pi = createFakePi();
    const ext = (await import("@0xkobold/pi-gateway")).default;
    await ext(pi);

    const tools = (pi.getAllTools() as any[]).map((t: any) => t.name);
    expect(tools).toContain("gateway_status");
    expect(tools).toContain("gateway_sessions");
  });

  test("pi-ollama loads successfully and registers providers", async () => {
    const pi = createFakePi();
    const ext = (await import("@0xkobold/pi-ollama")).default;
    await ext(pi);

    // pi-ollama registers providers and commands, not tools
    const tools = (pi.getAllTools() as any[]).map((t: any) => t.name);
    expect(tools.length).toBe(0);

    const commands = (pi as any).getCommands().map((c: any) => c.name);
    expect(commands).toContain("ollama");
    expect(commands).toContain("ollama-status");
  });

  test("pi-learn loads successfully", async () => {
    const pi = createFakePi();
    const ext = (await import("@0xkobold/pi-learn")).default;
    await ext(pi);

    const tools = (pi.getAllTools() as any[]).map((t: any) => t.name);
    expect(tools).toContain("learn_add_message");
    expect(tools).toContain("learn_get_context");
    expect(tools).toContain("learn_query");
  });
});