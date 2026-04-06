/**
 * Fork Execution Mode
 * 
 * Executes a subagent with inherited context for efficiency.
 * Fork mode uses parent's conversation context without spawning a new session.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { 
  AgentType, 
  OrchestrateResult, 
  LLMExecutor
} from "../core/types.js";
import { getAgentDefinition } from "../core/agents.js";
import { selectModelForAgent } from "../utils/model-selector.js";
import { validateDepth } from "../utils/depth.js";

// Maximum words for fork output (Claude Code style)
const FORK_MAX_WORDS = 500;

/**
 * Estimate token count for a string
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Execute a fork subagent with inherited context
 * 
 * Fork mode is more efficient because:
 * 1. Uses parent's conversation context directly
 * 2. No context transfer overhead
 * 3. Shared prompt cache potential
 * 
 * Limitations:
 * 1. Strict output limit (500 words)
 * 2. Cannot spawn further subagents
 * 3. Single-turn execution
 */
export async function executeFork(
  agentType: AgentType,
  task: string,
  ctx: ExtensionContext,
  options: {
    cwd?: string;
    maxOutput?: number;
    timeout?: number;
    skills?: string[];
    model?: string;
    llm?: LLMExecutor;
  } = {}
): Promise<OrchestrateResult> {
  const startTime = Date.now();
  
  // Validate depth - fork only allowed at depth 0 (root level)
  const depthValidation = validateDepth(agentType);
  if (!depthValidation.allowed) {
    return {
      success: false,
      content: "",
      error: depthValidation.message,
      metadata: {
        agent: agentType,
        duration: Date.now() - startTime,
        tokens: { input: 0, output: 0 },
        depth: depthValidation.currentDepth,
      },
    };
  }
  
  // Require LLM executor
  if (!options.llm) {
    return {
      success: false,
      content: "",
      error: "No LLM executor provided. Pass 'llm' option to orchestrate() or configure default.",
      metadata: {
        agent: agentType,
        duration: Date.now() - startTime,
        tokens: { input: 0, output: 0 },
        depth: depthValidation.currentDepth,
      },
    };
  }
  
  const agent = getAgentDefinition(agentType);
  
  // Fork mode: inherit parent's model or use specified model
  const model = options.model === "inherit" || !options.model
    ? await selectModelForAgent(agentType, ctx, "inherit")
    : await selectModelForAgent(agentType, ctx, options.model);
  
  // Build system prompt for fork - stricter limits per Claude Code style
  let systemPrompt = agent.systemPrompt;
  systemPrompt += `\n\n## Fork Execution Rules
- Output limit: ${FORK_MAX_WORDS} words maximum
- No subagent spawning allowed
- Return compressed results only
- Focus on your specific task
- Do not ask clarifying questions - act directly
`;
  
  if (options.skills?.length) {
    const skillsText = options.skills.map(s => `- ${s}`).join("\n");
    systemPrompt += `\n## Available Skills\n${skillsText}`;
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
      maxTokens: options.maxOutput || FORK_MAX_WORDS * 4, // ~4 chars per token
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
  
  // Truncate to word limit
  const maxWords = options.maxOutput 
    ? Math.floor(options.maxOutput / 5) 
    : FORK_MAX_WORDS;
  
  const words = result.split(/\s+/);
  if (words.length > maxWords) {
    result = words.slice(0, maxWords).join(" ") + "... [truncated]";
  }
  
  return {
    success,
    content: result,
    metadata: {
      agent: agentType,
      duration: Date.now() - startTime,
      tokens: tokenUsage,
      depth: depthValidation.currentDepth,
      model,
    },
  };
}
