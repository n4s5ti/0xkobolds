/**
 * LLM Adapter for pi-kobold
 * 
 * Bridges 0xKobold's multi-provider LLM system to pi-orchestration's simpler interface.
 * 
 * Usage (inside 0xKobold):
 * ```typescript
 * import { createLLMExecutor } from "./packages/pi-kobold/src/utils/llm-adapter";
 * import { getMultiProviderRouter } from "./src/llm/multi-provider";
 * 
 * const router = await getMultiProviderRouter();
 * const executor = createLLMExecutor(router);
 * initializeKobold(executor);
 * ```
 */

import type { Message, ChatOptions, ChatResponse, LLMExecutor } from "@0xkobold/pi-orchestration";

// Re-export the LLMExecutor type for consumers
export type { Message, ChatOptions, ChatResponse, LLMExecutor } from "@0xkobold/pi-orchestration";

/**
 * Convert pi-orchestration Message to 0xKobold Message format
 */
function toKoboldMessage(msg: Message): { role: string; content: string } {
  return {
    role: msg.role,
    content: msg.content,
  };
}

/**
 * Convert 0xKobold ChatResponse to pi-orchestration ChatResponse
 */
function fromKoboldResponse(response: any): ChatResponse {
  return {
    content: response.content,
    usage: response.usage ? {
      inputTokens: response.usage.inputTokens || 0,
      outputTokens: response.usage.outputTokens || 0,
      totalTokens: response.usage.totalTokens,
    } : undefined,
  };
}

/**
 * Create an LLM executor from a 0xKobold router
 * 
 * @param router - The MultiProviderRouter from 0xKobold
 * @param defaultModel - Default model to use (optional)
 * @param defaultTemperature - Default temperature (optional)
 */
export function createLLMExecutor(
  router: any,
  defaultModel?: string,
  defaultTemperature?: number
): LLMExecutor {
  return async (options: ChatOptions): Promise<ChatResponse> => {
    // Convert messages to 0xKobold format
    const koboldMessages = options.messages.map(toKoboldMessage);

    // Create 0xKobold chat options
    const koboldOptions = {
      model: options.model || defaultModel || "ollama/glm-5.1:cloud",
      messages: koboldMessages,
      temperature: options.temperature ?? defaultTemperature,
      maxTokens: options.maxTokens,
      signal: options.signal,
    };

    // Call 0xKobold's multi-provider
    const response = await router.chat(koboldOptions);

    // Convert back to pi-orchestration format
    return fromKoboldResponse(response);
  };
}

/**
 * Create an async LLM executor that initializes the router lazily
 * 
 * Use this if you need to defer router initialization.
 */
export async function createAsyncLLMExecutor(
  getRouter: () => Promise<any>,
  defaultModel?: string,
  defaultTemperature?: number
): Promise<LLMExecutor> {
  let router: any = null;

  return async (options: ChatOptions): Promise<ChatResponse> => {
    // Lazy initialization
    if (!router) {
      router = await getRouter();
    }

    const koboldMessages = options.messages.map(toKoboldMessage);

    const koboldOptions = {
      model: options.model || defaultModel || "ollama/glm-5.1:cloud",
      messages: koboldMessages,
      temperature: options.temperature ?? defaultTemperature,
      maxTokens: options.maxTokens,
      signal: options.signal,
    };

    const response = await router.chat(koboldOptions);
    return fromKoboldResponse(response);
  };
}

/**
 * Create a simple mock LLM executor for testing
 */
export function createMockLLMExecutor(responses?: string | ((opts: ChatOptions) => string)): LLMExecutor {
  return async (options: ChatOptions): Promise<ChatResponse> => {
    const content = typeof responses === "function" 
      ? responses(options) 
      : responses || "Mock response";

    return {
      content,
      usage: {
        inputTokens: options.messages.reduce((acc, m) => acc + m.content.length, 0),
        outputTokens: content.length,
      },
    };
  };
}

export default {
  createLLMExecutor,
  createAsyncLLMExecutor,
  createMockLLMExecutor,
};
