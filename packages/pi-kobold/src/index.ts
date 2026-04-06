/**
 * pi-kobold Extension
 * 
 * The omega extension that bundles everything for 0xKobold:
 * - pi-orchestration for multi-agent workflows
 * - pi-gateway for multi-platform messaging
 * - Development tools for creating skills and extensions
 * - LLM adapter for bridging with 0xKobold's multi-provider system
 */

import { defineTool } from "@mariozechner/pi-coding-agent";
import type { 
  ExtensionAPI, 
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

// Re-export pi-gateway types and functions
export {
  type GatewayConfig,
  type GatewayState,
  type SessionConfig,
  type Platform,
  startGatewayServer,
  stopGatewayServer,
  getGatewayStatus,
  loadGatewayConfig,
  saveGatewayConfig,
  listGatewaySessions,
  listGatewayAdapters,
} from "@0xkobold/pi-gateway";

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

// Import meta-skill tools
import { createSkillTool } from "./tools/create-skill.js";
import { createExtensionTool } from "./tools/create-extension.js";
import { koboldStatusTool } from "./tools/kobold-status.js";

// Import gateway tools
import { gatewayStatusTool, gatewayStartTool, gatewayStopTool } from "./tools/gateway-tools.js";

// ============================================================================
// Gateway Bridge (pi-gateway ↔ desktop app)
// ============================================================================

// Gateway state shared with desktop app's WebSocket server
interface GatewayBridge {
  isRunning: boolean;
  port: number;
  clients: Set<string>;
  adapters: string[];
  sessions: number;
}

let gatewayBridge: GatewayBridge = {
  isRunning: false,
  port: 18789,
  clients: new Set(),
  adapters: [],
  sessions: 0,
};

// ============================================================================
// LLM Executor Storage
// ============================================================================

let initializedLLMExecutor: LLMExecutor | null = null;
let initialized = false;

/**
 * Initialize pi-kobold with an LLM executor
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
 */
export async function initializeWithRouter(router: any): Promise<void> {
  if (initialized) {
    console.warn("[pi-kobold] Already initialized, skipping");
    return;
  }

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
 * Get the current LLM executor
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
// Gateway Bridge API (for desktop app integration)
// ============================================================================

/**
 * Get the gateway bridge state for the desktop app
 */
export function getGatewayBridge(): GatewayBridge {
  return gatewayBridge;
}

/**
 * Update gateway bridge state (called by gateway extension)
 */
export function updateGatewayBridge(update: Partial<GatewayBridge>): void {
  gatewayBridge = { ...gatewayBridge, ...update };
  console.log(`[pi-kobold] Gateway bridge updated: ${JSON.stringify(gatewayBridge)}`);
}

// ============================================================================
// Helper Tools
// ============================================================================

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

    const executor: LLMExecutor = async (opts) => {
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
  
  // Gateway tools (from pi-gateway)
  gatewayStatusTool,
  gatewayStartTool,
  gatewayStopTool,
  
  // Meta-skill tools (for development)
  createSkillTool,
  createExtensionTool,
  koboldStatusTool,
];

export default tools;

// Log extension load
console.log("[pi-kobold] Extension loaded - bundles pi-orchestration, pi-gateway, and dev tools");
console.log("[pi-kobold] Call initializeKobold() to enable orchestration");
