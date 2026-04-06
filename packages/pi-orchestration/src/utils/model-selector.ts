/**
 * Model Selection Utilities
 * 
 * Selects the best model based on agent type preference and available models.
 * Uses the parent agent's model registry for flexibility.
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AgentType, ModelPreference } from "../core/types.js";
import { getModelPreference } from "../core/agents.js";

/**
 * Model info from model registry
 */
export interface ModelInfo {
  provider: string;
  id: string;
  fullId: string;
}

/**
 * Score a model for a given preference
 */
function scoreModelForPreference(
  model: ModelInfo,
  preference: ModelPreference
): number {
  let score = 50; // Base score

  const id = model.id.toLowerCase();
  const provider = model.provider.toLowerCase();
  
  // Check if local (Ollama without :cloud)
  const isLocal = provider === "ollama" && !id.includes(":cloud");
  const isCloud = id.includes(":cloud") || (provider !== "ollama");

  if (preference === "fast") {
    // Prefer smaller, local models
    if (id.includes("3b")) score += 35;
    else if (id.includes("7b")) score += 25;
    else if (id.includes("14b")) score += 10;
    else if (id.includes("32b")) score -= 5;
    else if (id.includes("70b") || id.includes("405b")) score -= 20;
    
    if (isLocal) score += 20;
    if (isCloud) score -= 30;
  }

  if (preference === "smart") {
    // Prefer larger, smarter models
    if (id.includes("70b") || id.includes("405b")) score += 35;
    else if (id.includes("32b")) score += 20;
    else if (id.includes("14b")) score += 5;
    else if (id.includes("7b")) score -= 10;
    else if (id.includes("3b")) score -= 20;
    
    // Cloud models often have better reasoning
    if (isCloud) score += 15;
  }

  if (preference === "balanced") {
    // Middle ground - prefer 14b-32b range
    if (id.includes("14b") || id.includes("32b")) score += 25;
    else if (id.includes("7b")) score += 10;
    else if (id.includes("70b")) score -= 5;
    else if (id.includes("3b")) score -= 5;
    
    // Coder models are good for balanced work
    if (id.includes("coder")) score += 15;
    
    // Local is often fast enough
    if (isLocal) score += 10;
  }

  // Boost known good models
  const goodModels: Record<string, number> = {
    "qwen2.5-coder": 15,
    "qwen2.5": 10,
    "llama3.1": 10,
    "llama3.2": 8,
    "claude-3-5-sonnet": 20,
    "claude-3-5-haiku": 10,
    "mistral": 5,
    "gemma2": 5,
    "phi4": 5,
  };
  
  for (const [modelName, boost] of Object.entries(goodModels)) {
    if (id.includes(modelName.toLowerCase())) {
      score += boost;
    }
  }

  // Penalize embedding models
  const embeddingPatterns = [
    "embedding", "embed", "nomic", "all-minilm", 
    "bge-", "e5-", "sentence-", "uae-"
  ];
  for (const pattern of embeddingPatterns) {
    if (id.includes(pattern)) {
      score -= 100; // Strong penalty
    }
  }

  return score;
}

/**
 * Normalize model ID to include provider prefix
 * Only adds prefix if model doesn't already have one and isn't a cloud/local model name
 */
export function normalizeModelId(model: string): string {
  // Don't add prefix if:
  // - Already has a slash (provider prefix)
  // - Has :cloud suffix (Ollama Cloud models use full name directly)
  // - Has :latest suffix (local models use full name directly)
  if (model.includes("/") || model.includes(":")) {
    return model;
  }
  return `ollama/${model}`;
}

/**
 * Get available models from parent context
 */
export function getAvailableModels(ctx: ExtensionContext): ModelInfo[] {
  try {
    const available = ctx.modelRegistry.getAvailable();
    return available.map((m: any) => ({
      provider: m.provider,
      id: m.id,
      fullId: `${m.provider}/${m.id}`,
    }));
  } catch (error) {
    console.warn("[ModelSelector] Failed to get available models:", error);
    return [];
  }
}

/**
 * Select the best model for an agent type
 */
export async function selectModelForAgent(
  agentType: AgentType,
  ctx: ExtensionContext,
  override?: string
): Promise<string> {
  // Use explicit override if provided
  if (override && override !== "auto" && override !== "inherit") {
    return normalizeModelId(override);
  }

  // Use parent's current model if "inherit"
  if (override === "inherit") {
    try {
      const current = ctx.model;
      if (current) {
        // Model has provider and id properties based on pi-ai types
        const modelId = `${current.provider}/${current.id}`;
        return normalizeModelId(modelId);
      }
    } catch {
      // Fall through to auto selection
    }
  }

  // Auto-select based on preference
  const preference = getModelPreference(agentType) as ModelPreference;
  const available = getAvailableModels(ctx);

  if (available.length === 0) {
    // Fallback to defaults
    return getDefaultModel(preference);
  }

  // Score each model
  const scored = available.map(model => ({
    model,
    score: scoreModelForPreference(model, preference),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return best match
  return normalizeModelId(scored[0].model.fullId);
}

/**
 * Get default model for a preference when none available
 * Uses actual available cloud models from Ollama
 */
function getDefaultModel(preference: ModelPreference): string {
  // These are actual cloud models available on ollama.com
  const defaults: Record<ModelPreference, string> = {
    fast: "ollama/kimi-k2.5:cloud",
    balanced: "ollama/minimax-m2.7:cloud",
    smart: "ollama/qwen3.5:cloud",
  };
  return defaults[preference];
}

/**
 * List available models for a preference, sorted by suitability
 */
export function listModelsForPreference(
  ctx: ExtensionContext,
  preference: ModelPreference,
  limit = 5
): ModelInfo[] {
  const available = getAvailableModels(ctx);
  
  if (available.length === 0) {
    return [];
  }

  const scored = available.map(model => ({
    model,
    score: scoreModelForPreference(model, preference),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(s => s.model);
}

/**
 * Get model info for a specific model ID
 */
export function getModelInfo(
  ctx: ExtensionContext,
  modelId: string
): ModelInfo | undefined {
  const normalized = normalizeModelId(modelId);
  const [provider, id] = normalized.split("/");
  
  const available = ctx.modelRegistry.getAvailable();
  const found = available.find((m: any) => 
    m.provider === provider && m.id === id
  );
  
  if (found) {
    return {
      provider: found.provider,
      id: found.id,
      fullId: normalized,
    };
  }
  
  return undefined;
}

/**
 * Export for testing
 */
export function scoreModelForPreferenceExport(
  model: ModelInfo,
  preference: ModelPreference
): number {
  return scoreModelForPreference(model, preference);
}
