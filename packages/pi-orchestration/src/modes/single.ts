/**
 * Single Execution Mode
 * 
 * Executes a single agent with a task using the provided LLM executor.
 * Note: No depth validation here since LLM mode doesn't spawn subagents.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { 
  AgentType, 
  OrchestrateResult, 
  LLMExecutor
} from "../core/types.js";
import { getAgentDefinition } from "../core/agents.js";
import { selectModelForAgent } from "../utils/model-selector.js";

/**
 * Execute a single agent with a task
 * 
 * This is LLM-based execution - no actual subagent spawning,
 * so depth limits don't apply here.
 */
export async function executeSingle(
  agentType: AgentType,
  task: string,
  ctx: ExtensionContext,
  options: {
    cwd?: string;
    maxOutput?: number;
    timeout?: number;
    isolation?: any;
    skills?: string[];
    model?: string;
    llm?: LLMExecutor;
  } = {}
): Promise<OrchestrateResult> {
  const startTime = Date.now();
  
  // Check for LLM executor
  if (!options.llm) {
    return {
      success: false,
      content: "",
      error: "No LLM executor provided. Pass 'llm' option to orchestrate() or configure default.",
      metadata: {
        agent: agentType,
        duration: Date.now() - startTime,
        tokens: { input: 0, output: 0 },
        depth: 0,
      },
    };
  }
  
  const agent = getAgentDefinition(agentType);
  
  // Select model based on agent type and parent registry
  const model = await selectModelForAgent(agentType, ctx, options.model);
  
  // Build system prompt with optional skills
  let systemPrompt = agent.systemPrompt;
  if (options.skills?.length) {
    const skillsText = options.skills.map(s => `- ${s}`).join("\n");
    systemPrompt += `\n\n## Available Skills\n${skillsText}`;
  }
  
  let result: string;
  let success = true;
  let tokenUsage = { input: 0, output: 0, total: 0 };
  
  try {
    // Execute with LLM
    const response = await options.llm({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task }
      ],
      temperature: 0.7,
      maxTokens: options.maxOutput,
      timeout: options.timeout,
    });
    
    // Track token usage
    tokenUsage = {
      input: response.usage?.inputTokens || estimateTokens(systemPrompt + task),
      output: response.usage?.outputTokens || estimateTokens(response.content || ""),
      total: response.usage?.totalTokens || 0,
    };
    
    result = response.content || "";
  } catch (error) {
    success = false;
    result = `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
  
  // Truncate if needed
  if (options.maxOutput && result.length > options.maxOutput) {
    result = result.slice(0, options.maxOutput) + "... [truncated]";
  }
  
  return {
    success,
    content: result,
    metadata: {
      agent: agentType,
      duration: Date.now() - startTime,
      tokens: tokenUsage,
      depth: 0,
      model,
    },
  };
}

/**
 * Estimate token count for a string
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get available tools for an agent type
 */
export function getToolsForAgent(agentType: AgentType): string[] {
  const agent = getAgentDefinition(agentType);
  return agent.tools;
}
