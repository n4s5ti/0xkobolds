/**
 * Orchestration Engine
 * 
 * Main orchestration engine that routes to appropriate execution modes.
 * Supports both LLM-based simulation and native pi subagent spawning.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { 
  OrchestrateOptions, 
  OrchestrateResult,
  ChainResult,
  ParallelResult,
  OrchestrateMetadata,
  LLMExecutor,
  AgentType,
} from "../core/types.js";
import { DEFAULT_DEFAULTS, DEFAULT_RESOURCE_LIMITS } from "../core/types.js";
import { validateDepth, resetDepth } from "../utils/depth.js";
import { formatChainResults } from "../modes/chain.js";
import { formatParallelResults } from "../modes/parallel.js";

// LLM-based imports (for when pi spawning isn't available)
import { executeSingle as llmExecuteSingle } from "../modes/single.js";

// Native pi-spawner imports
import { 
  spawnPiSubagent,
  spawnParallelPiSubagents, 
  spawnChainPiSubagents,
  killAllProcesses,
  type SpawnOptions,
} from "./pi-spawner.js";
import { createWorktree, removeWorktree, getWorktreeDiff } from "../utils/worktree.js";
import { resolveAdaptivePlan } from "./adaptive.js";
import { registry } from "../core/registry.js";
import type { IMemoryCapability } from "../core/capabilities.js";

// ============================================================================
// Engine Configuration
// ============================================================================

export interface EngineConfig {
  /** Use native pi subprocess spawning (default: true if pi is available) */
  useNativeSpawning: boolean;
  
  /** Fallback to LLM-only mode if native spawning fails */
  fallbackToLLM: boolean;
  
  /** Default timeout for subagents */
  defaultTimeout: number;
  
  /** Max concurrent subagents */
  maxConcurrency: number;
}

const DEFAULT_CONFIG: EngineConfig = {
  useNativeSpawning: true,
  fallbackToLLM: true,
  defaultTimeout: 300000, // 5 minutes
  maxConcurrency: DEFAULT_RESOURCE_LIMITS.maxConcurrentSubagents,
};

// ============================================================================
// Engine State
// ============================================================================

let config: EngineConfig = { ...DEFAULT_CONFIG };
let defaultLLMExecutor: LLMExecutor | undefined;
let piAvailable: boolean | null = null;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configure the orchestration engine
 */
export function configureEngine(newConfig: Partial<EngineConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current engine configuration
 */
export function getEngineConfig(): EngineConfig {
  return { ...config };
}

/**
 * Set the default LLM executor
 */
export function setDefaultLLMExecutor(executor: LLMExecutor): void {
  defaultLLMExecutor = executor;
}

/**
 * Get the default LLM executor
 */
export function getDefaultLLMExecutor(): LLMExecutor | undefined {
  return defaultLLMExecutor;
}

/**
 * Check if pi CLI is available
 */
export async function checkPiAvailability(): Promise<boolean> {
  if (piAvailable !== null) return piAvailable;
  
  try {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    
    await execAsync("pi --version");
    piAvailable = true;
    console.log("[pi-orchestration] pi CLI is available - using native spawning");
  } catch {
    piAvailable = false;
    console.log("[pi-orchestration] pi CLI not available - using LLM simulation");
  }
  
  return piAvailable;
}

// ============================================================================
// Main Orchestration
// ============================================================================

/**
 * Main orchestrate function - routes to appropriate execution mode
 */
export async function orchestrate(
  options: OrchestrateOptions,
  ctx: ExtensionContext,
  onUpdate?: (update: any) => void
): Promise<OrchestrateResult | ChainResult | ParallelResult> {
  const startTime = Date.now();
  
  // Reset depth tracking for new orchestration
  resetDepth();
  
  // Determine execution mode
  const mode = getExecutionMode(options);
  
  if (!mode) {
    return {
      success: false,
      content: "",
      error: "Must specify agent, chain, or parallel execution mode",
      metadata: createMetadata("coordinator", startTime),
    };
  }
  
  // Validate options
  const validation = validateOptions(options, mode);
  if (!validation.valid) {
    return {
      success: false,
      content: "",
      error: validation.error,
      metadata: createMetadata("coordinator", startTime),
    };
  }
  
  try {
    // Execute based on mode and config
    switch (mode) {
      case "auto":
        return await executeAutoMode(options, ctx, startTime, onUpdate);
      
      case "single":
        return await executeSingleMode(options, ctx, startTime, onUpdate);
      
      case "chain":
        return await executeChainMode(options, ctx, startTime, onUpdate);
      
      case "parallel":
        return await executeParallelMode(options, ctx, startTime, onUpdate);
      
      case "fork":
        return await executeForkMode(options, ctx, startTime, onUpdate);

      case "review_loop":
        return await executeReviewLoopMode(options, ctx, startTime, onUpdate);
      
      default:
        return {
          success: false,
          content: "",
          error: `Unknown execution mode: ${mode}`,
          metadata: createMetadata("coordinator", startTime),
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      content: "",
      error: `Orchestration failed: ${errorMessage}`,
      metadata: createMetadata("coordinator", startTime),
    };
  } finally {
    // Cleanup any remaining processes
    killAllProcesses();
  }
}

// ============================================================================
// Execution Modes
// ============================================================================

async function executeAutoMode(
  options: OrchestrateOptions,
  ctx: ExtensionContext,
  startTime: number,
  onUpdate?: (update: { content: Array<{type: 'text', text: string}> }) => void
): Promise<OrchestrateResult | ChainResult | ParallelResult> {
  if (!options.task) {
    return {
      success: false,
      content: "",
      error: "Adaptive mode requires a task description",
      metadata: createMetadata("coordinator", startTime),
    };
  }

  const llm = defaultLLMExecutor || options.llm;
  if (!llm) {
    return {
      success: false,
      content: "",
      error: "No LLM executor available for adaptive routing",
      metadata: createMetadata("coordinator", startTime),
    };
  }

  if (onUpdate) {
    onUpdate({ content: [{ type: 'text', text: `🧠 Analyzing task to determine optimal orchestration strategy...` }] });
  }

  try {
    // 🌟 BRIDGE: Try to retrieve context from the Memory Capability if available
    let contextMemory = "";
    const memory = registry.getCapability<IMemoryCapability>('MEMORY');
    
    if (memory) {
      if (onUpdate) {
        onUpdate({ content: [{ type: 'text', text: `🔍 Querying project memories for similar patterns...` }] });
      }
      const memoryResult = await memory.query({ 
        query: options.task,
        scope: 'project'
      });
      contextMemory = memoryResult.summary || 
        memoryResult.results.map(r => r.content).join("\n---\n");
    }

    const plan = await resolveAdaptivePlan(
      options.task, 
      llm, 
      ["scout", "specialist", "worker", "reviewer", "coordinator"],
      contextMemory // Pass retrieved memory to the coordinator
    );
    
    if (onUpdate) {
      onUpdate({ content: [{ type: 'text', text: `🎯 Strategy: ${plan.mode.toUpperCase()} - ${plan.reasoning}` }] });
    }

    // Merge the plan options into the original options
    const optimizedOptions: OrchestrateOptions = {
      ...options,
      ...plan.options,
      mode: plan.mode as any,
    };

    // Recurse into the engine with the optimized options
    return orchestrate(optimizedOptions, ctx, onUpdate);
  } catch (e) {
    console.error("[pi-orchestration] Adaptive routing failed:", e);
    return {
      success: false,
      content: "",
      error: `Adaptive orchestration failed: ${e instanceof Error ? e.message : String(e)}`,
      metadata: createMetadata("coordinator", startTime),
    };
  }
}

async function executeSingleMode(
  options: OrchestrateOptions,
  ctx: ExtensionContext,
  startTime: number,
  onUpdate?: (update: { content: Array<{type: 'text', text: string}> }) => void
): Promise<OrchestrateResult> {
  if (!options.agent || !options.task) {
    return {
      success: false,
      content: "",
      error: "Missing agent or task",
      metadata: createMetadata("coordinator", startTime),
    };
  }
  
  let effectiveCwd = options.cwd || ctx.cwd;
  let worktreeHandle: any = null;

  if (options.isolation?.type === "worktree") {
    if (onUpdate) {
      onUpdate({ content: [{ type: 'text', text: `🏗️ Creating isolated worktree for ${options.agent}...` }] });
    }
    try {
      worktreeHandle = await createWorktree(ctx.cwd);
      effectiveCwd = worktreeHandle.path;
    } catch (e) {
      console.error("[pi-orchestration] Failed to create worktree, falling back to shared cwd:", e);
    }
  }

  if (onUpdate) {
    onUpdate({ content: [{ type: 'text', text: `🚀 Spawning ${options.agent} to handle the task...` }] });
  }
  
  // Try native spawning if available AND no LLM executor configured
  if (config.useNativeSpawning && !defaultLLMExecutor) {
    const piReady = await checkPiAvailability();
    
    if (piReady) {
      const depthValidation = validateDepth(options.agent);
      if (depthValidation.allowed) {
        try {
          const result = await spawnPiSubagent(
            {
              agentType: options.agent,
              task: options.task,
              cwd: effectiveCwd,
              model: options.model,
              skills: options.skills,
              timeout: options.timeout || config.defaultTimeout,
              maxOutput: options.maxOutput,
              onProgress: (progress) => {
                if (onUpdate && progress.status === 'running') {
                  onUpdate({ content: [{ type: 'text', text: `[${options.agent}] ${progress.output.slice(-100)}...` }] });
                }
              }
            },
            ctx
          );
          
          let finalDiff = undefined;
          if (worktreeHandle && options.isolation?.diffOnComplete) {
            const diff = await getWorktreeDiff(worktreeHandle.path);
            finalDiff = diff.patch;
          }

          if (worktreeHandle && !options.isolation?.autoApply) {
            await removeWorktree(worktreeHandle, false);
          } else if (worktreeHandle && options.isolation?.autoApply) {
            await removeWorktree(worktreeHandle, true);
          }

          return {
            success: result.success,
            content: result.content,
            metadata: { ...result.metadata, worktree: worktreeHandle?.path },
            error: result.error,
            diff: finalDiff,
          };
        } catch (e) {
          if (worktreeHandle) await removeWorktree(worktreeHandle, false);
          throw e;
        }
      }
    }
  }
  
  // LLM simulation
  if (config.fallbackToLLM && defaultLLMExecutor) {
    const result = await llmExecuteSingle(options.agent, options.task, ctx, {
      cwd: effectiveCwd,
      maxOutput: options.maxOutput,
      timeout: options.timeout,
      isolation: options.isolation,
      skills: options.skills,
      model: options.model,
      llm: defaultLLMExecutor,
    });

    if (worktreeHandle) await removeWorktree(worktreeHandle, false);
    return {
      ...result,
      metadata: { ...result.metadata, worktree: worktreeHandle?.path }
    };
  }
  
  if (worktreeHandle) await removeWorktree(worktreeHandle, false);
  return {
    success: false,
    content: "",
    error: "No execution backend available. Configure LLM executor or install pi CLI.",
    metadata: createMetadata(options.agent, startTime),
  };
}

async function executeChainMode(
  options: OrchestrateOptions,
  ctx: ExtensionContext,
  startTime: number,
  onUpdate?: (update: { content: Array<{type: 'text', text: string}> }) => void
): Promise<ChainResult> {
  if (!options.chain?.length) {
    return {
      success: false,
      content: "",
      steps: [],
      error: "Chain has no steps",
      metadata: createMetadata("coordinator", startTime),
    };
  }
  
  // Try native spawning if available (only if LLM executor not configured)
  if (config.useNativeSpawning && !defaultLLMExecutor) {
    const piReady = await checkPiAvailability();
    
    if (piReady) {
      if (onUpdate) {
        onUpdate({ content: [{ type: 'text', text: `⛓️ Starting chain of ${options.chain.length} steps...` }] });
      }
      const { results, finalOutput } = await spawnChainPiSubagents(
        options.chain.map(step => ({
          agentType: step.agent,
          task: step.task || "",
          cwd: step.cwd,
          model: step.model,
          skills: step.skills,
        })),
        ctx,
        {
          timeout: options.timeout || config.defaultTimeout,
        }
      );
      
      return {
        success: results.every(r => r.success),
        content: finalOutput,
        steps: results,
        metadata: createMetadata("coordinator", startTime),
      };
    }
  }
  
  // Fallback to LLM-based chain
  return await executeLLMChain(options, ctx, startTime, onUpdate);
}

async function executeLLMChain(
  options: OrchestrateOptions,
  ctx: ExtensionContext,
  startTime: number,
  onUpdate?: (update: { content: Array<{type: 'text', text: string}> }) => void
): Promise<ChainResult> {
  const steps = options.chain!;
  const results: Array<{
    agent: AgentType;
    content: string;
    success: boolean;
    duration: number;
    worktree?: string;
  }> = [];
  
  let previousOutput = options.task || "";
  let success = true;
  
  if (onUpdate) {
    onUpdate({ content: [{ type: 'text', text: `⛓️ Starting LLM-simulated chain of ${steps.length} steps...` }] });
  }
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    // Resolve task template
    const task = (step.task || previousOutput)
      .replace(/\{previous\}/g, previousOutput)
      .replace(/\{task\}/g, options.task || "")
      .replace(/\{step_num\}/g, String(i + 1))
      .replace(/\{step_total\}/g, String(steps.length));
    
    if (onUpdate) {
      onUpdate({ content: [{ type: 'text', text: `Step ${i+1}/${steps.length}: Spawning ${step.agent}...` }] });
    }
    
    const stepStart = Date.now();
    
    if (!task.trim()) {
      results.push({
        agent: step.agent,
        content: "[skipped - no input]",
        success: true,
        duration: 0,
      });
      continue;
    }
    
    const result = await llmExecuteSingle(step.agent, task, ctx, {
      cwd: step.cwd || options.cwd,
      maxOutput: options.maxOutput,
      timeout: options.timeout,
      isolation: step.isolation,
      skills: step.skills,
      model: step.model,
      llm: defaultLLMExecutor,
    });
    
    results.push({
      agent: step.agent,
      content: result.content,
      success: result.success,
      duration: Date.now() - stepStart,
      worktree: result.metadata.worktree,
    });
    
    if (!result.success) {
      success = false;
    }
    
    previousOutput = result.content;
  }
  
  return {
    success,
    content: previousOutput,
    steps: results,
    metadata: createMetadata("coordinator", startTime),
  };
}

async function executeParallelMode(
  options: OrchestrateOptions,
  ctx: ExtensionContext,
  startTime: number,
  onUpdate?: (update: { content: Array<{type: 'text', text: string}> }) => void
): Promise<ParallelResult> {
  if (!options.parallel?.length) {
    return {
      success: false,
      content: "",
      tasks: [],
      error: "Parallel has no tasks",
      metadata: createMetadata("coordinator", startTime),
    };
  }
  
  if (onUpdate) {
    onUpdate({ content: [{ type: 'text', text: `⚡ Starting parallel execution of ${options.parallel.length} tasks...` }] });
  }
  
  // Try native spawning if available AND no LLM executor configured
  if (config.useNativeSpawning && !defaultLLMExecutor) {
    const piReady = await checkPiAvailability();
    
    if (piReady) {
      const tasks = await spawnParallelPiSubagents(
        options.parallel.map(task => ({
          agentType: task.agent,
          task: task.task,
          cwd: task.cwd || options.cwd || ctx.cwd,
          model: task.model,
          skills: task.skills,
        })),
        ctx,
        {
          maxConcurrency: config.maxConcurrency,
          timeout: options.timeout || config.defaultTimeout,
          onProgress: (taskIndex, progress) => {
            if (onUpdate) {
              const taskAgent = options.parallel![taskIndex].agent;
              onUpdate({ content: [{ type: 'text', text: `[Task ${taskIndex+1}] ${taskAgent}: ${progress.status === 'complete' ? '✅ Finished' : '⌛ Running'}` }] });
            }
          }
        }
      );
      
      return {
        success: tasks.every(r => r.success),
        content: tasks.map(r => r.content).join("\n\n---\n\n"),
        tasks,
        metadata: createMetadata("coordinator", startTime),
      };
    }
  }
  
  // Fallback to LLM-based parallel
  return await executeLLMParallel(options, ctx, startTime, onUpdate);
}

async function executeLLMParallel(
  options: OrchestrateOptions,
  ctx: ExtensionContext,
  startTime: number,
  onUpdate?: (update: { content: Array<{type: 'text', text: string}> }) => void
): Promise<ParallelResult> {
  const tasks = options.parallel!;
  
  // Process in batches
  const results: Array<{
    agent: AgentType;
    content: string;
    success: boolean;
    duration: number;
    worktree?: string;
  }> = [];
  
  for (let i = 0; i < tasks.length; i += config.maxConcurrency) {
    const batch = tasks.slice(i, i + config.maxConcurrency);
    
    if (onUpdate) {
      onUpdate({ content: [{ type: 'text', text: `Processing batch of ${batch.length} tasks...` }] });
    }
    
    const batchResults = await Promise.all(
      batch.map(task => 
        llmExecuteSingle(task.agent, task.task, ctx, {
          cwd: task.cwd || options.cwd,
          maxOutput: options.maxOutput,
          timeout: options.timeout,
          isolation: task.isolation,
          skills: task.skills,
          model: task.model,
          llm: defaultLLMExecutor,
        }).then(result => ({
          agent: task.agent,
          content: result.content,
          success: result.success,
          duration: result.metadata.duration,
          worktree: result.metadata.worktree,
        }))
      )
    );
    
    results.push(...batchResults);
  }
  
  return {
    success: results.every(r => r.success),
    content: results.map(r => r.content).join("\n\n---\n\n"),
    tasks: results,
    metadata: createMetadata("coordinator", startTime),
  };
}

async function executeForkMode(
  options: OrchestrateOptions,
  ctx: ExtensionContext,
  startTime: number,
  onUpdate?: (update: { content: Array<{type: 'text', text: string}> }) => void
): Promise<OrchestrateResult> {
  // Fork is like single but with inherited context
  // For now, just use single mode
  return executeSingleMode(options, ctx, startTime, onUpdate);
}

async function executeReviewLoopMode(
  options: OrchestrateOptions,
  ctx: ExtensionContext,
  startTime: number,
  onUpdate?: (update: { content: Array<{type: 'text', text: string}> }) => void
): Promise<OrchestrateResult> {
  if (!options.agent || !options.task) {
    return {
      success: false,
      content: "",
      error: "Missing agent or task for review loop",
      metadata: createMetadata("coordinator", startTime),
    };
  }

  let currentIteration = 0;
  const maxIterations = 3;
  let currentTask = options.task;
  let latestResult: OrchestrateResult | null = null;
  let worktreeHandle: any = null;

  // Initial worktree for the implementation agent
  if (onUpdate) {
    onUpdate({ content: [{ type: 'text', text: `🔄 Starting Review Loop: Implementation Phase...` }] });
  }
  
  worktreeHandle = await createWorktree(ctx.cwd);
  
  while (currentIteration < maxIterations) {
    currentIteration++;
    
    if (onUpdate) {
      onUpdate({ content: [{ type: 'text', text: `Iteration ${currentIteration}/${maxIterations}: Implementing...` }] });
    }

    // 1. Implementation Step
    const implementation = await executeSingleMode({
      ...options,
      task: currentTask,
      cwd: worktreeHandle.path,
      isolation: { type: "none" } // Use the already created worktree
    }, ctx, startTime, onUpdate);

    // Get the diff of what was just implemented
    const diff = await getWorktreeDiff(worktreeHandle.path);
    
    if (onUpdate) {
      onUpdate({ content: [{ type: 'text', text: `Iteration ${currentIteration}: Reviewing changes...` }] });
    }

    // 2. Review Step
    const reviewResult = await executeSingleMode({
      agent: "reviewer",
      task: `Review the following changes against the original requirement: "${options.task}"\n\nDIFF:\n${diff.patch || "No changes detected"}\n\nRespond with 'APPROVED' if the changes are correct, or provide a detailed list of required fixes.`,
      isolation: { type: "none" }
    }, ctx, startTime, onUpdate);

    if (reviewResult.content.includes("APPROVED")) {
      if (onUpdate) {
        onUpdate({ content: [{ type: 'text', text: `✅ Reviewer APPROVED changes in iteration ${currentIteration}.` }] });
      }
      
      // Apply changes and merge
      await removeWorktree(worktreeHandle, true);
      
      return {
        success: true,
        content: `Review loop completed successfully in ${currentIteration} iterations.\n\n${implementation.content}`,
        metadata: { ...implementation.metadata, worktree: worktreeHandle.path },
        diff: diff.patch,
      };
    }

    // 3. Feedback Step: Update the task for the next iteration
    currentTask = `The reviewer requested the following changes:\n\n${reviewResult.content}\n\nPlease implement these fixes while keeping the original goal: ${options.task}`;
    latestResult = implementation;
  }

  // Max iterations reached without approval
  if (onUpdate) {
    onUpdate({ content: [{ type: 'text', text: `❌ Review loop reached max iterations (${maxIterations}) without approval.` }] });
  }
  
  await removeWorktree(worktreeHandle, false);
  
  return {
    success: false,
    content: latestResult?.content || "",
    error: `Review loop failed to reach approval after ${maxIterations} iterations. Last feedback: ${latestResult ? "see content" : "N/A"}`,
    metadata: createMetadata("coordinator", startTime),
    diff: latestResult ? (await getWorktreeDiff(worktreeHandle.path)).patch : undefined,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function getExecutionMode(options: OrchestrateOptions): "single" | "chain" | "parallel" | "fork" | "review_loop" | "auto" | null {
  if (options.mode === "auto") return "auto";
  if (options.mode === "review_loop") return "review_loop";
  if (options.context === "fork" || options.context === "inherit") {
    return "fork";
  }
  if (options.chain?.length) {
    return "chain";
  }
  if (options.parallel?.length) {
    return "parallel";
  }
  if (options.agent) {
    return "single";
  }
  return null;
}

function validateOptions(
  options: OrchestrateOptions,
  mode: string
): { valid: boolean; error?: string } {
  switch (mode) {
    case "single":
      if (!options.agent) return { valid: false, error: "Missing agent type" };
      if (!options.task) return { valid: false, error: "Missing task description" };
      break;
    
    case "chain":
      if (!options.chain?.length) return { valid: false, error: "Chain has no steps" };
      if (options.chain.length > DEFAULT_RESOURCE_LIMITS.maxChainSteps) {
        return { valid: false, error: `Chain too long (${options.chain.length}). Max: ${DEFAULT_RESOURCE_LIMITS.maxChainSteps}` };
      }
      break;
    
    case "parallel":
      if (!options.parallel?.length) return { valid: false, error: "Parallel has no tasks" };
      if (options.parallel.length > DEFAULT_RESOURCE_LIMITS.maxParallelTasks) {
        return { valid: false, error: `Too many parallel tasks (${options.parallel.length}). Max: ${DEFAULT_RESOURCE_LIMITS.maxParallelTasks}` };
      }
      break;
  }
  
  return { valid: true };
}

function createMetadata(agent: string, startTime: number): OrchestrateMetadata {
  return {
    agent: agent as AgentType,
    duration: Date.now() - startTime,
    tokens: { input: 0, output: 0, total: 0 },
    depth: 0,
  };
}

// ============================================================================
// Formatting
// ============================================================================

export function formatOrchestrateResult(
  result: OrchestrateResult | ChainResult | ParallelResult
): string {
  if ("steps" in result) {
    return formatChainResults(result as ChainResult);
  }
  if ("tasks" in result) {
    return formatParallelResults(result as ParallelResult);
  }
  
  // Single result
  const r = result as OrchestrateResult;
  const status = r.success ? "✅" : "❌";
  return `${status} **${r.metadata.agent}** (${r.metadata.duration}ms)\n\n${r.content}${r.error ? `\n\n❌ Error: ${r.error}` : ""}`;
}

/**
 * Get orchestrator state for debugging
 */
export function getOrchestratorState() {
  return {
    config,
    piAvailable,
    hasLLMExecutor: !!defaultLLMExecutor,
    maxConcurrency: config.maxConcurrency,
  };
}
