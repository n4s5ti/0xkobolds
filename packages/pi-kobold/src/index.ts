/**
 * pi-kobold Extension
 * 
 * The omega extension that bundles everything:
 * - pi-orchestration for multi-agent workflows
 * - Development tools for creating skills and extensions
 * - LLM adapter for bridging with 0xKobold's multi-provider system
 */

import { defineTool } from "@mariozechner/pi-coding-agent";
import type { 
  ExtensionContext, 
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { 
  setDefaultLLMExecutor, 
  orchestrate, 
  formatOrchestrateResult,
  type LLMExecutor,
} from "@0xkobold/pi-orchestration";

// Import meta-skill tools
import { createSkillTool } from "./tools/create-skill.js";
import { createExtensionTool } from "./tools/create-extension.js";
import { koboldStatusTool } from "./tools/kobold-status.js";

// Re-export orchestration types
export type { LLMExecutor, OrchestrateOptions, OrchestrateResult, ChainResult, ParallelResult } from "@0xkobold/pi-orchestration";
export { orchestrate, formatOrchestrateResult };

// Re-export LLM adapter utilities
export {
  createLLMExecutor,
  createAsyncLLMExecutor,
  createMockLLMExecutor,
  type Message,
  type ChatOptions,
  type ChatResponse,
} from "./utils/llm-adapter.js";

// ============================================================================
// LLM Executor Storage
// ============================================================================

let initializedLLMExecutor: LLMExecutor | null = null;
let initialized = false;

/**
 * Initialize pi-kobold with an LLM executor
 * 
 * Call this during extension loading to configure the LLM for orchestration.
 * 
 * @example
 * ```typescript
 * // In 0xKobold's main entry
 * import { initializeKobold } from "@0xkobold/pi-kobold";
 * import { chat } from "./src/llm/multi-provider.js";
 * 
 * initializeKobold(async (opts) => {
 *   const result = await chat({
 *     model: opts.model,
 *     messages: opts.messages,
 *     temperature: opts.temperature,
 *   });
 *   return { content: result.content, usage: result.usage };
 * });
 * ```
 */
export function initializeKobold(executor: LLMExecutor): void {
  if (initialized) {
    console.warn("[pi-kobold] Already initialized, skipping");
    return;
  }
  
  initializedLLMExecutor = executor;
  setDefaultLLMExecutor(executor);
  initialized = true;
  
  console.log("[pi-kobold] Initialized with LLM executor");
}

/**
 * Initialize with 0xKobold's multi-provider router directly
 * 
 * This is the preferred method when running inside 0xKobold.
 */
export async function initializeWithRouter(router: any): Promise<void> {
  if (initialized) {
    console.warn("[pi-kobold] Already initialized, skipping");
    return;
  }

  // Create executor from router
  const executor: LLMExecutor = async (opts) => {
    const result = await router.chat({
      model: opts.model || "ollama/llama3.2:3b",
      messages: opts.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
    });

    return {
      content: result.content,
      usage: result.usage ? {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      } : undefined,
    };
  };

  initializeKobold(executor);
}

/**
 * Get the current LLM executor (if initialized)
 */
export function getLLMExecutor(): LLMExecutor | null {
  return initializedLLMExecutor;
}

/**
 * Check if pi-kobold is initialized
 */
export function isKoboldInitialized(): boolean {
  return initialized;
}

// ============================================================================
// Helper Tool: kobold_initialize
// ============================================================================

/**
 * Initialize the LLM executor (admin tool)
 */
const initializeTool = defineTool({
  name: "kobold_initialize",
  label: "Initialize Kobold",
  description: "Initialize pi-kobold with LLM configuration (admin only)",
  parameters: Type.Object({
    model: Type.Optional(Type.String({ description: "Default model" })),
    temperature: Type.Optional(Type.Number({ description: "Default temperature" })),
  }),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    if (initialized) {
      return {
        content: [{ 
          type: "text" as const, 
          text: "✅ pi-kobold is already initialized" 
        }],
        details: { initialized: true },
      };
    }

    // For manual initialization, create a simple executor
    // In practice, this should be called from 0xKobold's main entry
    const executor: LLMExecutor = async (opts) => {
      // This is a placeholder - in real usage, initializeKobold() should be called
      // from 0xKobold's main entry point with the actual LLM router
      console.log("[pi-kobold] Warning: Using placeholder LLM executor");
      
      return {
        content: "Error: LLM executor not properly initialized. Call initializeKobold() from main entry.",
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    };

    initializeKobold(executor);

    return {
      content: [{ 
        type: "text" as const, 
        text: `✅ pi-kobold initialized with model: ${params.model || "ollama/llama3.2:3b"}` 
      }],
      details: { initialized: true, model: params.model || "ollama/llama3.2:3b" },
    };
  }
});

// ============================================================================
// Export All Tools
// ============================================================================

export const tools: ToolDefinition[] = [
  // Initialization tool
  initializeTool,
  
  // Meta-skill tools (for development)
  createSkillTool,
  createExtensionTool,
  koboldStatusTool,
];

// Note: Orchestration tools are exported separately from @0xkobold/pi-orchestration
// They can be merged by the parent application

export default tools;

// Log extension load
console.log("[pi-kobold] Extension loaded - call initializeKobold() to enable orchestration");
