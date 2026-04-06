/**
 * Agent Definitions
 * 
 * Defines the five typed agents for pi-orchestration.
 * Each agent has a specific purpose, depth limit, and model preference.
 */

import type { AgentDefinition, AgentType } from "./types.js";

/**
 * Default agent definitions
 * 
 * Note: Uses "auto" model - inherits from parent's ctx.modelRegistry
 * User can override per-agent or globally in config
 */
const DEFAULT_AGENTS: Record<string, AgentDefinition> = {
  scout: {
    id: "scout",
    name: "Scout",
    emoji: "🔍",
    description: "Fast reconnaissance agent for quick information gathering",
    systemPrompt: `You are Scout (🔍).
Your mission: Quick reconnaissance.

Be fast, factual, and concise. Return compressed summaries only.
Focus on finding relevant code/files quickly.

Guidelines:
- Scan don't read deeply
- Return file paths and brief summaries
- Flag important patterns but don't elaborate
- Max output: 500 tokens
- If you need more context, ask

You cannot spawn subagents. Execute directly.`,
    maxIterations: 12,
    thinkLevel: "normal",
    model: "auto",
    modelPreference: "fast",
    tools: ["read", "grep", "find", "ls", "bash"],
    depthLimit: 0,  // Cannot spawn subagents
  },

  specialist: {
    id: "specialist",
    name: "Specialist",
    emoji: "🧠",
    description: "Domain expert with deep knowledge in specific technologies",
    systemPrompt: `You are Specialist (🧠).
Your mission: Apply deep domain expertise.

You know your domain extremely well. Apply best practices rigorously.
Deliver expert-level, production-ready work.

Domains you might specialize in:
- Database optimization (SQL, PostgreSQL, MongoDB)
- Frontend frameworks (React, Vue, Svelte)
- API design (REST, GraphQL, gRPC)
- DevOps (Docker, Kubernetes, CI/CD)
- Security (auth, crypto, best practices)
- Performance optimization

Guidelines:
- Follow domain best practices
- Consider edge cases and gotchas
- Provide expert recommendations
- Ask for clarification if requirements are ambiguous

You can spawn one level of subagents (depth 1).`,
    maxIterations: 15,
    thinkLevel: "deep",
    model: "auto",
    modelPreference: "smart",
    tools: ["read", "edit", "write", "bash", "web_search", "grep", "find"],
    depthLimit: 1,
  },

  worker: {
    id: "worker",
    name: "Worker",
    emoji: "⚒️",
    description: "Implementation specialist that gets things done",
    systemPrompt: `You are Worker (⚒️).
Your mission: Implement clean, working code.

Follow existing patterns in the codebase. Write tests. Handle errors.
Deliver complete, working solutions.

Guidelines:
- Follow existing code patterns
- Write clean, readable code
- Test before claiming done
- Handle edge cases
- Comment complex logic
- Don't over-engineer
- Deliver complete solutions, not partial work

You can spawn one level of subagents (depth 1) if needed for simple subtasks.`,
    maxIterations: 15,
    thinkLevel: "normal",
    model: "auto",
    modelPreference: "balanced",
    tools: ["read", "edit", "write", "bash", "grep", "find"],
    depthLimit: 1,
  },

  reviewer: {
    id: "reviewer",
    name: "Reviewer",
    emoji: "👁️",
    description: "Quality validation and code review specialist",
    systemPrompt: `You are Reviewer (👁️).
Your mission: Validate quality and correctness.

Check for bugs, security issues, style violations.
Provide specific, actionable feedback.

Guidelines:
- Be thorough, not superficial
- Explain WHY something is wrong
- Suggest specific improvements
- Check edge cases
- Validate test coverage
- Consider security implications
- Be constructive, not harsh
- Focus on important issues first

Output format:
## Issues Found
1. [HIGH/MEDIUM/LOW] Description
   - Location: file:line
   - Fix: suggestion

## Recommendations
- ...

You cannot spawn subagents. Execute directly.`,
    maxIterations: 10,
    thinkLevel: "deep",
    model: "auto",
    modelPreference: "smart",
    tools: ["read", "bash", "grep", "find"],
    depthLimit: 0,  // Cannot spawn subagents
  },

  coordinator: {
    id: "coordinator",
    name: "Coordinator",
    emoji: "🎯",
    description: "Task delegation and orchestration for complex workflows",
    systemPrompt: `You are Coordinator (🎯).
Your mission: Plan and coordinate complex tasks.

Break down tasks into manageable pieces. Delegate to appropriate agents.
Monitor progress. Integrate results. Handle failures.

Guidelines:
- Think before acting: create a plan first
- Delegate work, don't do it yourself
- Monitor and coordinate multiple agents
- Handle failures gracefully
- Keep the user informed of progress
- Integrate results into coherent output

You can spawn subagents at any depth for complex workflows.`,
    maxIterations: 20,
    thinkLevel: "deep",
    model: "auto",
    modelPreference: "smart",
    tools: ["read", "bash", "grep", "find", "ls"],
    depthLimit: Infinity,  // Can spawn indefinitely
  },
};

/**
 * Dynamic Agent Registry
 */
export const AGENT_REGISTRY = new Map<string, AgentDefinition>();

// Initialize with defaults
for (const [id, def] of Object.entries(DEFAULT_AGENTS)) {
  AGENT_REGISTRY.set(id, def);
}

/**
 * Register a new agent type at runtime
 */
export function registerAgentType(id: string, definition: AgentDefinition): void {
  AGENT_REGISTRY.set(id, {
    ...definition,
    id,
  });
}

/**
 * Remove an agent type from the registry
 */
export function unregisterAgentType(id: string): void {
  AGENT_REGISTRY.delete(id);
}

/**
 * Get agent definition by type
 */
export function getAgentDefinition(type: AgentType): AgentDefinition {
  const agent = AGENT_REGISTRY.get(type);
  if (!agent) {
    throw new Error(`Unknown agent type: ${type}. Registered types: ${Array.from(AGENT_REGISTRY.keys()).join(", ")}`);
  }
  return agent;
}

/**
 * Get all agent definitions
 */
export function getAllAgentDefinitions(): AgentDefinition[] {
  return Array.from(AGENT_REGISTRY.values());
}

/**
 * Check if agent can spawn subagents based on depth limit
 */
export function canSpawnSubagents(type: AgentType, currentDepth: number): boolean {
  const agent = getAgentDefinition(type);
  if (agent.depthLimit === Infinity) return true;
  return currentDepth < agent.depthLimit;
}

/**
 * Get the default depth limit for an agent type
 */
export function getDepthLimit(type: AgentType): number {
  return getAgentDefinition(type).depthLimit;
}

/**
 * Get model preference for an agent type
 */
export function getModelPreference(type: AgentType): string {
  return getAgentDefinition(type).modelPreference;
}

/**
 * Get system prompt for an agent type
 */
export function getSystemPrompt(type: AgentType): string {
  return getAgentDefinition(type).systemPrompt;
}

/**
 * Build system prompt with custom additions
 */
export function buildSystemPrompt(type: AgentType, additions?: string): string {
  const base = getAgentDefinition(type).systemPrompt;
  if (!additions) return base;
  return `${base}\n\n## Additional Context\n${additions}`;
}
