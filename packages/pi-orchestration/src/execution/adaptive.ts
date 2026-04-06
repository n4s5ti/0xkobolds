/**
 * Adaptive Orchestration Strategy
 * 
 * This module implements the "Coordinator" logic that converts a high-level 
 * user request into a concrete orchestration plan.
 */

import type { 
  LLMExecutor, 
  OrchestrateOptions, 
  AgentType, 
  ChainStep, 
  ParallelTask 
} from "../core/types.js";

export interface OrchestrationPlan {
  mode: "single" | "chain" | "parallel" | "review_loop";
  reasoning: string;
  options: Partial<OrchestrateOptions>;
}

export async function resolveAdaptivePlan(
  task: string,
  llm: LLMExecutor,
  availableAgents: string[],
  contextMemory: string = ""
): Promise<OrchestrationPlan> {
  const systemPrompt = `
You are the Master Coordinator. Your goal is to decompose a user task into the most efficient orchestration strategy.
You have access to the following agent types: ${availableAgents.join(", ")}.

${contextMemory ? `\nRELEVANT PROJECT HISTORY:\n${contextMemory}\n\nUse this history to avoid past mistakes or repeat successful patterns.` : ""}

STRATEGY GUIDE:
1. SINGLE: Use for simple requests, quick answers, or specific small tasks.
2. CHAIN: Use when steps depend on each other (e.g., Research -> Plan -> Implement).
3. PARALLEL: Use when a task can be split into independent sub-tasks (e.g., "Analyze 3 different files").
4. REVIEW_LOOP: Use for critical code changes, bug fixes, or refactoring where quality assurance is mandatory.

RESPONSE FORMAT:
You must respond ONLY with a JSON object following this schema:
{
  "mode": "single" | "chain" | "parallel" | "review_loop",
  "reasoning": "Brief explanation of why this mode was chosen",
  "options": {
    "agent": "agent_type", // Required for single/review_loop
    "chain": [{ "agent": "agent_type", "task": "step description" }], // Required for chain
    "parallel": [{ "agent": "agent_type", "task": "task description" }], // Required for parallel
    "isolation": { "type": "worktree", "diffOnComplete": true, "autoApply": false } // Recommended for code changes
  }
}

TASK:
${task}
  `.trim();

  const response = await llm({
    model: "smart",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Plan the following task: ${task}` }
    ],
  });

  try {
    // Clean JSON from potential markdown wrappers
    const cleaned = response.content.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as OrchestrationPlan;
  } catch (e) {
    console.error("[pi-orchestration] Failed to parse adaptive plan, falling back to single specialist:", e);
    return {
      mode: "single",
      reasoning: "Fallback due to parsing error",
      options: {
        agent: "specialist",
      }
    };
  }
}
