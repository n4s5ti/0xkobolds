/**
 * Pi Process Spawner
 * 
 * Spawns real pi subagents as child processes.
 * Pattern based on pi-subagents/execution.ts
 */

import { spawn, ChildProcess } from "node:child_process";
import { join } from "path";
import type { AgentType, OrchestrateResult, OrchestrateMetadata, StepResult } from "../core/types.js";
import { getAgentDefinition, buildSystemPrompt } from "../core/agents.js";
import { selectModelForAgent } from "../utils/model-selector.js";
import { validateDepth, withDepth } from "../utils/depth.js";
import { mkdir } from "fs/promises";
import { tmpdir } from "os";

// ============================================================================
// Types
// ============================================================================

export interface SpawnOptions {
  /** Agent type to spawn */
  agentType: AgentType;
  
  /** Task/prompt for the agent */
  task: string;
  
  /** Working directory */
  cwd: string;
  
  /** Model to use */
  model?: string;
  
  /** Skills to load */
  skills?: string[];
  
  /** Timeout in ms */
  timeout?: number;
  
  /** Max output length */
  maxOutput?: number;
  
  /** Abort signal */
  signal?: AbortSignal;
  
  /** Progress callback */
  onProgress?: (progress: SpawnProgress) => void;
}

export interface SpawnProgress {
  status: "running" | "complete" | "error";
  output: string;
  tokens: number;
  durationMs: number;
}

export interface SpawnResult {
  success: boolean;
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  metadata: OrchestrateMetadata;
  error?: string;
}

interface PiJsonOutput {
  type: string;
  content?: string;
  message?: {
    role: string;
    content: string;
  };
  tool_calls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  tool_call_id?: string;
  tool_result?: {
    tool_call_id: string;
    content: string;
    is_error?: boolean;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  error?: string;
}

// ============================================================================
// Process Management
// ============================================================================

const activeProcesses = new Map<string, ChildProcess>();

/**
 * Spawn a real pi subagent process
 */
export async function spawnPiSubagent(
  options: SpawnOptions,
  ctx: any
): Promise<SpawnResult> {
  const startTime = Date.now();
  const runId = `${options.agentType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  
  // Validate depth
  const depthValidation = validateDepth(options.agentType);
  if (!depthValidation.allowed) {
    return {
      success: false,
      content: "",
      error: depthValidation.message,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      metadata: {
        agent: options.agentType,
        duration: 0,
        tokens: { input: 0, output: 0 },
        depth: depthValidation.currentDepth,
      },
    };
  }
  
  const agent = getAgentDefinition(options.agentType);
  
  // Ensure working directory exists
  await mkdir(options.cwd, { recursive: true });
  
  // Select model
  const model = options.model || await selectModelForAgent(options.agentType, ctx);
  
  // Build system prompt
  const skillsText = options.skills?.length ? options.skills.map(s => `- ${s}`).join("\n") : undefined;
  const systemPrompt = buildSystemPrompt(options.agentType, skillsText);
  
  // Create a temporary file for session (optional persistence)
  const sessionDir = join(tmpdir(), `pi-orchestration-${runId}`);
  
  return new Promise(async (resolve) => {
    let fullOutput = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let exitCode = 0;
    let errorMessage: string | undefined;
    
    // Build pi CLI arguments
    const args = buildPiArgs({
      mode: "json",
      task: options.task,
      systemPrompt,
      model,
      agent: options.agentType,
      skills: options.skills,
      sessionDir,
      cwd: options.cwd,
    });
    
    // Spawn the pi process
    const proc = spawn("pi", args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PI_ORCHESTRATION_DEPTH: String(depthValidation.currentDepth + 1),
        PI_ORCHESTRATION_RUN_ID: runId,
      },
    });
    
    activeProcesses.set(runId, proc);
    
    let isRunning = true;
    let buffer = "";
    
    // Handle stdout (JSON output)
    proc.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      
      // Process complete JSON lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const json = JSON.parse(line) as PiJsonOutput;
          handleJsonOutput(json);
        } catch {
          // Not valid JSON, might be partial - accumulate in buffer
        }
      }
    });
    
    // Handle stderr (errors)
    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        console.error(`[pi-subagent ${runId}] stderr:`, text);
        if (text.toLowerCase().includes("error")) {
          errorMessage = text;
        }
      }
    });
    
    // Handle completion
    proc.on("close", (code) => {
      isRunning = false;
      exitCode = code ?? 0;
      activeProcesses.delete(runId);
      
      // Clean up session dir
      cleanupSessionDir(sessionDir).catch(() => {});
      
      resolve({
        success: exitCode === 0 && !errorMessage,
        content: fullOutput || (errorMessage ? `Error: ${errorMessage}` : ""),
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
        metadata: {
          agent: options.agentType,
          duration: Date.now() - startTime,
          tokens: { input: inputTokens, output: outputTokens },
          depth: depthValidation.currentDepth,
          model,
          worktree: options.cwd !== ctx.cwd ? options.cwd : undefined,
        },
        error: errorMessage,
      });
    });
    
    // Handle errors
    proc.on("error", (err) => {
      isRunning = false;
      activeProcesses.delete(runId);
      errorMessage = err.message;
      
      resolve({
        success: false,
        content: "",
        usage: { inputTokens, outputTokens, totalTokens: 0 },
        metadata: {
          agent: options.agentType,
          duration: Date.now() - startTime,
          tokens: { input: 0, output: 0 },
          depth: depthValidation.currentDepth,
          model,
        },
        error: `Failed to spawn: ${err.message}`,
      });
    });
    
    // Handle abort signal
    if (options.signal) {
      options.signal.addEventListener("abort", () => {
        if (isRunning) {
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (isRunning) proc.kill("SIGKILL");
          }, 5000);
        }
      });
    }
    
    // Handle timeout
    if (options.timeout) {
      setTimeout(() => {
        if (isRunning) {
          proc.kill("SIGTERM");
          setTimeout(() => {
            if (isRunning) proc.kill("SIGKILL");
          }, 5000);
        }
      }, options.timeout);
    }
    
    // Process JSON output
    function handleJsonOutput(json: PiJsonOutput) {
      switch (json.type) {
        case "message":
        case "content":
          if (json.message?.content) {
            fullOutput += json.message.content;
          } else if (json.content) {
            fullOutput += json.content;
          }
          break;
          
        case "tool_call":
          // Tool was called - log it
          if (json.tool_calls?.[0]) {
            const tool = json.tool_calls[0];
            fullOutput += `\n[Using tool: ${tool.name}]\n`;
          }
          break;
          
        case "tool_result":
          // Tool result
          if (json.tool_result?.content) {
            fullOutput += json.tool_result.content + "\n";
          }
          break;
          
        case "usage":
          // Token usage
          if (json.usage) {
            inputTokens = json.usage.input_tokens || inputTokens;
            outputTokens = json.usage.output_tokens || outputTokens;
          }
          break;
          
        case "error":
          errorMessage = json.error || "Unknown error";
          break;
          
        case "progress":
          // Progress update - could call onProgress callback
          options.onProgress?.({
            status: "running",
            output: fullOutput,
            tokens: inputTokens + outputTokens,
            durationMs: Date.now() - startTime,
          });
          break;
      }
      
      // Truncate if needed
      if (options.maxOutput && fullOutput.length > options.maxOutput) {
        fullOutput = fullOutput.slice(0, options.maxOutput) + "\n...[truncated]";
      }
    }
  });
}

/**
 * Build pi CLI arguments
 */
function buildPiArgs(opts: {
  mode: string;
  task: string;
  systemPrompt: string;
  model: string;
  agent?: AgentType;
  skills?: string[];
  sessionDir?: string;
  cwd?: string;
}): string[] {
  const args: string[] = [
    "--mode", opts.mode,
    "-p",                        // Non-interactive
    "--task", opts.task,
    "--model", opts.model,
  ];
  
  // Add system prompt via file to avoid escaping issues
  // The prompt file will be created and passed via stdin or temp file
  
  // Session directory for persistence
  if (opts.sessionDir) {
    args.push("--session-dir", opts.sessionDir);
  }
  
  // Agent type
  if (opts.agent) {
    args.push("--agent", opts.agent);
  }
  
  // Skills
  if (opts.skills?.length) {
    args.push("--skills", opts.skills.join(","));
  }
  
  return args;
}

/**
 * Clean up session directory
 */
async function cleanupSessionDir(dir: string): Promise<void> {
  try {
    const { rm } = await import("node:fs/promises");
    await rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get count of active subagent processes
 */
export function getActiveProcessCount(): number {
  return activeProcesses.size;
}

/**
 * Kill all active subagent processes
 */
export function killAllProcesses(): void {
  for (const [runId, proc] of activeProcesses) {
    console.log(`[pi-orchestration] Killing subagent ${runId}`);
    proc.kill("SIGTERM");
  }
  activeProcesses.clear();
}

/**
 * Spawn parallel subagents
 */
export async function spawnParallelPiSubagents(
  tasks: Array<{
    agentType: AgentType;
    task: string;
    cwd: string;
    model?: string;
    skills?: string[];
  }>,
  ctx: any,
  options: {
    maxConcurrency?: number;
    timeout?: number;
    signal?: AbortSignal;
    onProgress?: (taskIndex: number, progress: SpawnProgress) => void;
  } = {}
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  const concurrency = options.maxConcurrency || 4;
  
  // Process in batches
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((task, batchIndex) => 
        spawnPiSubagent(
          {
            agentType: task.agentType,
            task: task.task,
            cwd: task.cwd || ctx.cwd,
            model: task.model,
            skills: task.skills,
            timeout: options.timeout,
            signal: options.signal,
            onProgress: (progress) => options.onProgress?.(i + batchIndex, progress),
          },
          ctx
        ).then(result => ({
          agent: task.agentType,
          content: result.content,
          success: result.success,
          duration: result.metadata.duration,
          worktree: result.metadata.worktree,
        }))
      )
    );
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Spawn chain of subagents
 */
export async function spawnChainPiSubagents(
  steps: Array<{
    agentType: AgentType;
    task: string;
    cwd?: string;
    model?: string;
    skills?: string[];
  }>,
  ctx: any,
  options: {
    timeout?: number;
    signal?: AbortSignal;
  } = {}
): Promise<{ results: StepResult[]; finalOutput: string }> {
  const results: StepResult[] = [];
  let previousOutput = "";
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    // Replace {previous} in task
    const task = step.task
      .replace(/\{previous\}/g, previousOutput)
      .replace(/\{step_num\}/g, String(i + 1))
      .replace(/\{step_total\}/g, String(steps.length));
    
    const result = await spawnPiSubagent(
      {
        agentType: step.agentType,
        task,
        cwd: step.cwd || ctx.cwd,
        model: step.model,
        skills: step.skills,
        timeout: options.timeout,
        signal: options.signal,
      },
      ctx
    );
    
    results.push({
      agent: step.agentType,
      content: result.content,
      success: result.success,
      duration: result.metadata.duration,
      worktree: result.metadata.worktree,
    });
    
    previousOutput = result.content;
    
    // Stop on failure
    if (!result.success) {
      break;
    }
  }
  
  return { results, finalOutput: previousOutput };
}

export default {
  spawnPiSubagent,
  spawnParallelPiSubagents,
  spawnChainPiSubagents,
  getActiveProcessCount,
  killAllProcesses,
};
