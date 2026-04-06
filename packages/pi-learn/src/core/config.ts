/**
 * Configuration Loader for pi-learn
 * Handles loading and merging settings from ~/.pi/agent/settings.json
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { 
  DEFAULT_RETENTION, 
  DEFAULT_DREAM, 
  DEFAULT_REASONING_MODEL, 
  DEFAULT_EMBEDDING_MODEL, 
  DEFAULT_TOKEN_BATCH_SIZE,
  DEFAULT_CONCURRENCY,
} from "../shared.js";
import { DEFAULT_RETRY_CONFIG } from "./reasoning.js";
import { DEFAULT_PROJECT_CONFIG, type ProjectIntegrationConfig } from "./project-integration.js";

// ============================================================================
// CONFIGURATION INTERFACE
// ============================================================================

export interface Config {
  workspaceId: string;
  reasoningEnabled: boolean;
  reasoningModel: string;
  embeddingModel: string;
  tokenBatchSize: number;
  ollamaBaseUrl: string;
  ollamaApiKey: string;
  retention: RetentionConfig;
  dream: DreamConfig;
  retry: RetryConfig;
  concurrency: number;
  project: ProjectIntegrationConfig;
}

export interface RetentionConfig {
  retentionDays: number;
  summaryRetentionDays: number;
  conclusionRetentionDays: number;
  pruneOnStartup: boolean;
  pruneIntervalHours: number;
}

export interface DreamConfig {
  enabled: boolean;
  intervalMs: number;
  minMessagesSinceLastDream: number;
  batchSize: number;
}

export interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  maxBackoffMs?: number;
}

// ============================================================================
// MERGE HELPERS
// ============================================================================

function mergeRetention(base: RetentionConfig, override?: Partial<RetentionConfig>): RetentionConfig {
  console.assert(base !== null, 'base retention config must not be null');
  console.assert(base !== undefined, 'base retention config must not be undefined');
  return { ...base, ...override };
}

function mergeDream(base: DreamConfig, override?: Partial<DreamConfig>): DreamConfig {
  console.assert(base !== null, 'base dream config must not be null');
  console.assert(base !== undefined, 'base dream config must not be undefined');
  return { ...base, ...override };
}

function mergeRetry(base: RetryConfig, override?: Partial<RetryConfig>): RetryConfig {
  console.assert(base !== null, 'base retry config must not be null');
  console.assert(base !== undefined, 'base retry config must not be undefined');
  return { ...base, ...override };
}

// ============================================================================
// CONFIGURATION LOADER
// ============================================================================

export function loadConfig(): Config {
  const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
  
  console.assert(settingsPath !== null, 'settingsPath must not be null');
  console.assert(settingsPath.length > 0, 'settingsPath must not be empty string');
  console.assert(typeof settingsPath === 'string', 'settingsPath must be string type');

  let settings: Record<string, any> = {};
  
  try {
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, "utf-8");
      console.assert(content !== null, 'settings file content must not be null');
      console.assert(typeof content === 'string', 'settings content must be string');
      settings = JSON.parse(content);
      console.assert(typeof settings === 'object', 'parsed settings must be object');
    }
  } catch (e) {
    console.warn("[pi-learn] Failed to load settings:", e);
    // Graceful degradation - use defaults on error
  }

  const learnSettings = settings.learn || {};
  console.assert(typeof learnSettings === 'object', 'learnSettings must be object');

  // Validate dream interval
  const dreamInterval = learnSettings.dream?.intervalMs || DEFAULT_DREAM.intervalMs;
  console.assert(dreamInterval > 0, 'dream intervalMs must be positive');

  return {
    workspaceId: learnSettings.workspaceId || "default",
    reasoningEnabled: learnSettings.reasoningEnabled ?? true,
    reasoningModel: learnSettings.reasoningModel || DEFAULT_REASONING_MODEL,
    embeddingModel: learnSettings.embeddingModel || DEFAULT_EMBEDDING_MODEL,
    tokenBatchSize: learnSettings.tokenBatchSize || DEFAULT_TOKEN_BATCH_SIZE,
    ollamaBaseUrl: settings.ollama?.baseUrl || "http://localhost:11434",
    ollamaApiKey: settings.ollama?.apiKey || "",
    retention: mergeRetention(DEFAULT_RETENTION, learnSettings.retention),
    dream: mergeDream(DEFAULT_DREAM, learnSettings.dream),
    retry: mergeRetry(DEFAULT_RETRY_CONFIG, learnSettings.retry),
    concurrency: learnSettings.concurrency ?? DEFAULT_CONCURRENCY,
    project: { ...DEFAULT_PROJECT_CONFIG, ...learnSettings.project },
  };
}

// ============================================================================
// CONFIGURATION VALIDATION
// ============================================================================

export function validateConfig(config: Config): { valid: boolean; errors: string[] } {
  console.assert(config !== null, 'config must not be null');
  console.assert(typeof config === 'object', 'config must be object');

  const errors: string[] = [];

  // Validate ollamaBaseUrl
  if (typeof config.ollamaBaseUrl !== 'string' || config.ollamaBaseUrl.length === 0) {
    errors.push('ollamaBaseUrl must be a non-empty string');
  }

  // Validate dream interval
  if (config.dream.intervalMs <= 0) {
    errors.push('dream.intervalMs must be positive');
  }

  // Validate batch size
  if (config.dream.batchSize <= 0) {
    errors.push('dream.batchSize must be positive');
  }

  // Validate retention days
  if (config.retention.retentionDays < 0) {
    errors.push('retention.retentionDays cannot be negative');
  }

  // Validate concurrency
  if (config.concurrency < 1) {
    errors.push('concurrency must be at least 1');
  }

  console.assert(Array.isArray(errors), 'errors must be array');

  return {
    valid: errors.length === 0,
    errors,
  };
}
