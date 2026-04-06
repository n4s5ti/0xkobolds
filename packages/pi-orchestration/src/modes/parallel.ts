/**
 * Parallel Execution Mode
 * 
 * Executes multiple agents concurrently with concurrency limits.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { 
  ParallelTask, 
  ParallelResult, 
  StepResult,
  IsolationConfig,
  LLMExecutor,
  AgentType,
} from "../core/types.js";
import { DEFAULT_RESOURCE_LIMITS } from "../core/types.js";
import { getAgentDefinition } from "../core/agents.js";
import { selectModelForAgent } from "../utils/model-selector.js";
import { withDepth } from "../utils/depth.js";

/**
 * Execute parallel tasks with concurrency limits
 */
export async function executeParallel(
  tasks: ParallelTask[],
  ctx: ExtensionContext,
  options: {
    cwd?: string;
    timeout?: number;
    maxOutput?: number;
    maxConcurrency?: number;
    defaultIsolation?: IsolationConfig;
    llm?: LLMExecutor;
  } = {}
): Promise<ParallelResult> {
  const startTime = Date.now();
  const maxConcurrency = options.maxConcurrency || DEFAULT_RESOURCE_LIMITS.maxConcurrentSubagents;
  
  // Validate task count
  if (tasks.length > DEFAULT_RESOURCE_LIMITS.maxParallelTasks) {
    return {
      success: false,
      content: "",
      tasks: [],
      error: `Too many parallel tasks (${tasks.length}). Maximum: ${DEFAULT_RESOURCE_LIMITS.maxParallelTasks}`,
      metadata: {
        agent: "coordinator" as AgentType,
        duration: Date.now() - startTime,
        tokens: { input: 0, output: 0, total: 0 },
        depth: 0,
      },
    };
  }
  
  // Expand tasks with count > 1
  const expandedTasks: Array<{
    task: ParallelTask;
    index: number;
  }> = [];
  
  tasks.forEach((task, i) => {
    const count = task.count || 1;
    for (let j = 0; j < count; j++) {
      expandedTasks.push({ task, index: i });
    }
  });
  
  // Execute tasks in batches
  const allResults: StepResult[] = [];
  
  for (let i = 0; i < expandedTasks.length; i += maxConcurrency) {
    const batch = expandedTasks.slice(i, i + maxConcurrency);
    
    const batchResults = await Promise.all(
      batch.map(({ task, index }) => executeParallelTask(task, ctx, options))
    );
    
    allResults.push(...batchResults);
  }
  
  // Calculate results
  const success = allResults.every(r => r.success);
  const combinedContent = allResults.map(r => r.content).join("\n\n---\n\n");
  
  // Calculate total tokens
  const totalTokens = allResults.reduce(
    (acc, step) => {
      const tokens = Math.ceil(step.content.length / 4);
      acc.output += tokens;
      return acc;
    },
    { input: 0, output: 0 }
  );
  
  return {
    success,
    content: combinedContent,
    tasks: allResults,
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
 * Execute a single parallel task
 */
async function executeParallelTask(
  task: ParallelTask,
  ctx: ExtensionContext,
  options: {
    cwd?: string;
    timeout?: number;
    maxOutput?: number;
    llm?: LLMExecutor;
  }
): Promise<StepResult> {
  const taskStart = Date.now();
  const effectiveCwd = task.cwd || options.cwd || ctx.cwd;
  const executor = task.llm || options.llm;
  
  // Check for LLM executor
  if (!executor) {
    return {
      agent: task.agent,
      content: "[skipped - no LLM executor]",
      success: false,
      duration: Date.now() - taskStart,
    };
  }
  
  try {
    const agent = getAgentDefinition(task.agent);
    const model = task.model || await selectModelForAgent(task.agent, ctx);
    
    let systemPrompt = agent.systemPrompt;
    if (task.skills?.length) {
      systemPrompt += `\n\n## Skills\n${task.skills.map(s => `- ${s}`).join("\n")}`;
    }
    
    const response = await withDepth(async () => {
      return await executor({
        model,
        messages: [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: task.task }
        ],
        temperature: 0.7,
        maxTokens: options.maxOutput,
        timeout: options.timeout,
      });
    });
    
    return {
      agent: task.agent,
      content: response.content || "",
      success: true,
      duration: Date.now() - taskStart,
    };
    
  } catch (error) {
    return {
      agent: task.agent,
      content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      success: false,
      duration: Date.now() - taskStart,
    };
  }
}

/**
 * Format parallel results for display
 */
export function formatParallelResults(result: ParallelResult): string {
  const lines: string[] = [];
  
  lines.push(`## Parallel Execution Results`);
  lines.push(`Status: ${result.success ? "✅ Success" : "❌ Partial/Failed"}`);
  lines.push(`Duration: ${result.metadata.duration}ms`);
  lines.push(`Tasks: ${result.tasks.length}`);
  lines.push(`\n---\n`);
  
  for (let i = 0; i < result.tasks.length; i++) {
    const task = result.tasks[i];
    const icon = task.success ? "✅" : "❌";
    
    lines.push(`${icon} **Task ${i + 1}: ${task.agent}** (${task.duration}ms)`);
    lines.push(`\`\`\``);
    lines.push(task.content.slice(0, 300));
    if (task.content.length > 300) {
      lines.push(`... (${task.content.length - 300} more characters)`);
    }
    lines.push(`\`\`\``);
    lines.push("");
  }
  
  return lines.join("\n");
}
