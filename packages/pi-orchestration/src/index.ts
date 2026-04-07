/**
 * pi-orchestration Extension
 * 
 * Agnostic subagent orchestration for pi-coding-agent.
 * Supports single, chain, parallel, and fork execution modes.
 * 
 * Features:
 * - Native pi subprocess spawning (if pi CLI is available)
 * - LLM-based fallback (for testing/development)
 * - Typed agents: scout, specialist, worker, reviewer, coordinator
 * - Model auto-selection based on agent preferences
 * - Depth limiting to prevent runaway spawning
 * - Parallel and chain execution modes
 */

import { defineTool } from "@mariozechner/pi-coding-agent";
import type { 
  ExtensionAPI,
  ExtensionContext, 
  ToolDefinition,
  AgentToolResult 
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// ============================================================================
// Core Exports
// ============================================================================

// Engine functions
export { 
  orchestrate, 
  formatOrchestrateResult, 
  getOrchestratorState,
  setDefaultLLMExecutor,
  getDefaultLLMExecutor,
  configureEngine,
  getEngineConfig,
  checkPiAvailability,
} from "./execution/index.js";

// Types
export type { 
  OrchestrateOptions, 
  OrchestrateResult,
  ChainResult,
  ParallelResult,
  StepResult,
  LLMExecutor,
  Message,
  ChatOptions,
  ChatResponse,
  AgentType,
  AgentDefinition,
  ChainStep,
  ParallelTask,
  IsolationConfig,
} from "./core/index.js";

// Utils
export { 
  getAgentDefinition, 
  getAllAgentDefinitions,
  buildSystemPrompt,
} from "./core/agents.js";

export { 
  selectModelForAgent, 
  listModelsForPreference,
  normalizeModelId,
} from "./utils/model-selector.js";

export { 
  validateDepth, 
  resetDepth,
  withDepth,
  getCurrentDepth,
} from "./utils/depth.js";

export { 
  renderTemplate,
  extractTemplateVariables,
  validateTemplateContext,
} from "./utils/template.js";

// ============================================================================
// Tool Definitions
// ============================================================================

const OrchestrateParams = Type.Object({
  mode: Type.Optional(Type.Union([
    Type.Literal("single"),
    Type.Literal("chain"),
    Type.Literal("parallel"),
    Type.Literal("review_loop"),
  ])),
  agent: Type.Optional(Type.String()),
  task: Type.Optional(Type.String()),
  chain: Type.Optional(Type.Array(Type.Object({
    agent: Type.String(),
    task: Type.Optional(Type.String()),
    cwd: Type.Optional(Type.String()),
    model: Type.Optional(Type.String()),
    skills: Type.Optional(Type.Array(Type.String())),
  }))),
  parallel: Type.Optional(Type.Array(Type.Object({
    agent: Type.String(),
    task: Type.String(),
    cwd: Type.Optional(Type.String()),
    model: Type.Optional(Type.String()),
    skills: Type.Optional(Type.Array(Type.String())),
    count: Type.Optional(Type.Number()),
  }))),
  cwd: Type.Optional(Type.String()),
  timeout: Type.Optional(Type.Number()),
  maxOutput: Type.Optional(Type.Number()),
  model: Type.Optional(Type.String()),
  context: Type.Optional(Type.Union([
    Type.Literal("fresh"),
    Type.Literal("fork"),
    Type.Literal("inherit"),
  ])),
  skills: Type.Optional(Type.Array(Type.String())),
});

// Main orchestrate tool
const orchestrateTool = defineTool({
  name: "orchestrate",
  label: "Orchestrate",
  description: `Spawn and coordinate subagents for complex tasks.

**Modes:**
- SINGLE: { agent, task } - one task
- CHAIN: { chain: [...] } - sequential with {previous}
- PARALLEL: { parallel: [...] } - concurrent execution

**Agents:**
- scout: Fast reconnaissance (depth=0)
- specialist: Domain expert (depth=1)
- worker: Implementation (depth=1)
- reviewer: Quality check (depth=0)
- coordinator: Orchestration (depth=∞)
- *Custom*: Register new types via \`register_agent\` tool

**Examples:**
{ agent: "scout", task: "Analyze requirements" }
{ chain: [{ agent: "scout", task: "Analyze" }, { agent: "worker", task: "Implement {previous}" }] }
{ parallel: [{ agent: "worker", task: "Feature A" }, { agent: "worker", task: "Feature B" }] }`,
  parameters: OrchestrateParams,
  
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // Lazy import to avoid circular deps
    const { orchestrate, formatOrchestrateResult, setDefaultLLMExecutor } = await import("./execution/engine.js");
    const { getAllAgentDefinitions } = await import("./core/agents.js");
    const { listModelsForPreference } = await import("./utils/model-selector.js");
    
    // Always initialize LLM executor using pi-ollama
    const ollamaModule = await import("@0xkobold/pi-ollama/shared").catch(() => ({}) as any);
    const { chat, loadConfigFromEnv, createClients, DEFAULT_CONFIG } = ollamaModule;
    
    if (chat && createClients) {
      const envConfig = typeof loadConfigFromEnv === 'function' ? loadConfigFromEnv() : {};
      const config = { ...DEFAULT_CONFIG, ...envConfig };
      const ollamaClients = createClients(config);
      if (ollamaClients) {
        const finalConfig = config;
        setDefaultLLMExecutor(async ({ model, messages }) => {
          const result = await chat({ baseUrl: finalConfig.baseUrl, apiKey: finalConfig.apiKey }, { 
            model: model || "minimax-m2.7:cloud", 
            messages 
          });
          return { content: result.content, usage: result.usage };
        });
      }
    }
    
    // List agents if no mode specified
    if (!params.agent && !params.chain && !params.parallel) {
      const agents = getAllAgentDefinitions();
      const lines = [
        "## Available Agents\n",
        "| Type | Purpose | Depth |",
        "|------|---------|-------|"
      ];
      for (const agent of agents) {
        lines.push(`| ${agent.id} | ${agent.description} | ${agent.depthLimit === Infinity ? "∞" : agent.depthLimit} |`);
      }
      
      // Add model suggestions
      lines.push("\n---\n### Suggested Models\n");
      for (const pref of ["fast", "balanced", "smart"] as const) {
        const models = listModelsForPreference(ctx, pref, 3);
        if (models.length > 0) {
          lines.push(`**${pref}**: ${models.map(m => `\`${m.fullId}\``).join(", ")}`);
        }
      }
      
      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { agents },
      };
    }
    
    try {
      const result = await orchestrate(params as any, ctx, onUpdate);
      
      // Format result for display
      let output: string;
      if (result.error) {
        output = `Error: ${result.error}`;
      } else if ((result as any).steps) {
        // Chain mode
        const steps = (result as any).steps;
        output = `Chain completed:\n` + steps.map((s: any, i: number) => 
          `${i+1}. ${s.agent}: ${s.content?.slice(0, 100)}${s.content?.length > 100 ? '...' : ''}`
        ).join('\n');
      } else if ((result as any).tasks) {
        // Parallel mode
        const tasks = (result as any).tasks;
        output = `Parallel completed:\n` + tasks.map((t: any, i: number) =>
          `${i+1}. ${t.agent}: ${t.content?.slice(0, 100)}${t.content?.length > 100 ? '...' : ''}`
        ).join('\n');
      } else {
        // Single mode
        output = `Result: ${result.content?.slice(0, 200)}${result.content?.length > 200 ? '...' : ''}`;
      }
      
      return {
        content: [{ type: "text", text: output }],
        details: result,
      };
    } catch (error) {
      console.error('[pi-orchestration] Tool error:', error);
      return {
        content: [{ 
          type: "text", 
          text: `❌ Orchestration failed: ${error instanceof Error ? error.message : String(error)}` 
        }],
        details: { error: true },
      };
    }
  }
});

// Register agent tool
const registerAgentTool = defineTool({
  name: "register_agent",
  label: "Register Agent",
  description: "Define a new custom agent type for the orchestration system.",
  parameters: Type.Object({
    id: Type.String(),
    name: Type.String(),
    emoji: Type.String(),
    description: Type.String(),
    systemPrompt: Type.String(),
    maxIterations: Type.Optional(Type.Number()),
    thinkLevel: Type.Optional(Type.Union([
      Type.Literal("minimal"),
      Type.Literal("normal"),
      Type.Literal("deep"),
    ])),
    model: Type.Optional(Type.String()),
    modelPreference: Type.Optional(Type.Union([
      Type.Literal("fast"),
      Type.Literal("balanced"),
      Type.Literal("smart"),
    ])),
    tools: Type.Optional(Type.Array(Type.String())),
    depthLimit: Type.Optional(Type.Number()),
  }),
  
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    const { registerAgentType } = await import("./core/agents.js");
    
    try {
      registerAgentType(params.id, {
        id: params.id,
        name: params.name,
        emoji: params.emoji,
        description: params.description,
        systemPrompt: params.systemPrompt,
        maxIterations: params.maxIterations ?? 15,
        thinkLevel: params.thinkLevel ?? "normal",
        model: params.model ?? "auto",
        modelPreference: params.modelPreference ?? "balanced",
        tools: params.tools ?? ["read", "bash"],
        depthLimit: params.depthLimit ?? 1,
      });
      
      return {
        content: [{ type: "text", text: `✅ Agent type '${params.id}' registered successfully!` }],
        details: { agentId: params.id },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `❌ Failed to register agent: ${error}` }],
        details: { error: true },
      };
    }
  }
});

// Status tool
const statusTool = defineTool({
  name: "orchestrate_status",
  label: "Orchestrate Status",
  description: "Check orchestration engine status and pi CLI availability",
  parameters: Type.Object({}),
  
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    const { getEngineConfig, checkPiAvailability } = await import("./execution/engine.js");
    
    const piAvailable = await checkPiAvailability();
    const config = getEngineConfig();
    
    const lines = [
      "## Orchestration Status\n",
      `| Component | Status |`,
      "|-----------|--------|",
      `| pi CLI | ${piAvailable ? "✅ Available" : "❌ Not found"} |`,
      `| Native Spawning | ${config.useNativeSpawning ? "✅ Enabled" : "❌ Disabled"} |`,
      `| LLM Fallback | ${config.fallbackToLLM ? "✅ Enabled" : "❌ Disabled"} |`,
      `| Max Concurrency | ${config.maxConcurrency} |`,
      `| Default Timeout | ${config.defaultTimeout}ms |`,
    ];
    
    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: { piAvailable, config },
    };
  }
});

// ============================================================================
// Extension Export (pi-coding-agent requires factory function)
// ============================================================================

/**
 * pi-orchestration extension factory
 * Registers orchestrate, register_agent, and orchestrate_status tools
 */
export default async function piOrchestrationExtension(pi: ExtensionAPI): Promise<void> {
  // Register orchestrate tool
  pi.registerTool(orchestrateTool);
  
  // Register register_agent tool
  pi.registerTool(registerAgentTool);
  
  // Register status tool
  pi.registerTool(statusTool);
  
  console.log("[pi-orchestration] Loaded - tools: orchestrate, register_agent, orchestrate_status");
}
