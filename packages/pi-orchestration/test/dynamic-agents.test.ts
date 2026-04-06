import { expect, test, describe } from "bun:test";
import { 
  registerAgentType, 
  unregisterAgentType, 
  getAgentDefinition, 
  getAllAgentDefinitions 
} from "../src/core/agents.js";
import type { AgentDefinition } from "../src/core/types.js";

describe("Dynamic Agent Registration", () => {
  const customAgent: AgentDefinition = {
    id: "security-expert",
    name: "Security Expert",
    emoji: "🔒",
    description: "Specialist in security auditing",
    systemPrompt: "You are a security expert.",
    maxIterations: 10,
    thinkLevel: "deep",
    model: "auto",
    modelPreference: "smart",
    tools: ["read", "bash"],
    depthLimit: 1,
  };

  test("should register a new agent type", () => {
    registerAgentType("security-expert", customAgent);
    
    const agent = getAgentDefinition("security-expert");
    expect(agent.id).toBe("security-expert");
    expect(agent.name).toBe("Security Expert");
    expect(agent.emoji).toBe("🔒");
  });

  test("should return all agents including custom ones", () => {
    const agents = getAllAgentDefinitions();
    const hasCustom = agents.some(a => a.id === "security-expert");
    expect(hasCustom).toBe(true);
    expect(agents.length).toBeGreaterThan(5); // 5 defaults + 1 custom
  });

  test("should throw error for unregistered agents", () => {
    expect(() => getAgentDefinition("non-existent-agent")).toThrow(/Unknown agent type/);
  });

  test("should successfully unregister an agent", () => {
    unregisterAgentType("security-expert");
    expect(() => getAgentDefinition("security-expert")).toThrow();
  });

  test("should allow overwriting existing agent definitions", () => {
    const newScout = { 
      ...customAgent, 
      id: "scout", 
      name: "Super Scout" 
    };
    registerAgentType("scout", newScout);
    
    const agent = getAgentDefinition("scout");
    expect(agent.name).toBe("Super Scout");
  });
});
