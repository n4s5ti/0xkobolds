/**
 * Chain Execution Mode
 * 
 * Executes agents in sequence, passing output from each step to the next.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { 
  ChainStep, 
  ChainResult, 
  StepResult,
  IsolationConfig,
  LLMExecutor,
  AgentType,
} from "../core/types.js";
import { getAgentDefinition } from "../core/agents.js";
import { selectModelForAgent } from "../utils/model-selector.js";
import { withDepth } from "../utils/depth.js";
import { mkdir } from "fs/promises";
import { join } from "path";

/**
 * Execute a chain of agents
 */
export async function executeChain(
  steps: ChainStep[],
  ctx: ExtensionContext,
  options: {
    task?: string;
    cwd?: string;
    timeout?: number;
    maxOutput?: number;
    defaultIsolation?: IsolationConfig;
    llm?: LLMExecutor;
  } = {}
): Promise<ChainResult> {
  const startTime = Date.now();
  const stepResults: StepResult[] = [];
  
  let previousOutput = options.task || "";
  let success = true;
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepStart = Date.now();
    
    // Determine task for this step
    const stepTask = step.task || previousOutput;
    
    // Skip empty steps
    if (!stepTask.trim()) {
      stepResults.push({
        agent: step.agent,
        content: "[skipped - no input]",
        success: true,
        duration: 0,
      });
      continue;
    }
    
    // Skip step without LLM executor
    if (!step.llm && !options.llm) {
      stepResults.push({
        agent: step.agent,
        content: "[skipped - no LLM executor]",
        success: false,
        duration: 0,
      });
      success = false;
      continue;
    }
    
    const executor = step.llm || options.llm!;
    
    // Get agent definition
    const agent = getAgentDefinition(step.agent);
    
    // Select model
    const model = step.model || await selectModelForAgent(step.agent, ctx);
    
    // Build system prompt
    let systemPrompt = agent.systemPrompt;
    if (step.skills?.length) {
      systemPrompt += `\n\n## Skills\n${step.skills.map(s => `- ${s}`).join("\n")}`;
    }
    
    let stepResult: StepResult;
    
    try {
      const execResult = await withDepth(async () => {
        const response = await executor({
          model,
          messages: [
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: stepTask }
          ],
          temperature: 0.7,
          maxTokens: options.maxOutput,
          timeout: options.timeout,
        });
        
        return {
          content: response.content || "",
          success: true,
          usage: response.usage,
        };
      });
      
      stepResult = {
        agent: step.agent,
        content: execResult.content,
        success: execResult.success,
        duration: Date.now() - stepStart,
      };
      
      if (!execResult.success) {
        success = false;
      }
      
      // Update previous output
      previousOutput = execResult.content;
      
    } catch (error) {
      stepResult = {
        agent: step.agent,
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        success: false,
        duration: Date.now() - stepStart,
      };
      success = false;
    }
    
    stepResults.push(stepResult);
  }
  
  // Calculate total tokens
  const totalTokens = stepResults.reduce(
    (acc, step) => {
      const tokens = Math.ceil(step.content.length / 4);
      acc.output += tokens;
      return acc;
    },
    { input: 0, output: 0 }
  );
  
  return {
    success,
    content: previousOutput,
    steps: stepResults,
    metadata: {
      agent: "coordinator" as AgentType,
      duration: Date.now() - startTime,
      tokens: {
        ...totalTokens,
        total: totalTokens.input + totalTokens.output,
      },
      depth: 0,
    },
  };
}

/**
 * Format chain results for display
 */
export function formatChainResults(result: ChainResult): string {
  const lines: string[] = [];
  
  lines.push(`## Chain Execution Results`);
  lines.push(`Status: ${result.success ? "✅ Success" : "❌ Failed"}`);
  lines.push(`Duration: ${result.metadata.duration}ms`);
  lines.push(`\n---\n`);
  
  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i];
    const icon = step.success ? "✅" : "❌";
    
    lines.push(`${icon} **Step ${i + 1}: ${step.agent}** (${step.duration}ms)`);
    lines.push(`\`\`\``);
    lines.push(step.content.slice(0, 500));
    if (step.content.length > 500) {
      lines.push(`... (${step.content.length - 500} more characters)`);
    }
    lines.push(`\`\`\``);
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Combine chain results
 */
export function combineChainResults(
  results: StepResult[],
  startTime: number
): ChainResult {
  const lastResult = results[results.length - 1];
  
  return {
    success: results.every(r => r.success),
    content: lastResult?.content || "",
    steps: results,
    metadata: {
      agent: "coordinator" as AgentType,
      duration: Date.now() - startTime,
      tokens: { input: 0, output: 0, total: 0 },
      depth: 0,
    },
  };
}
