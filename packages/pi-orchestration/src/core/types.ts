/**
 * Core Types for pi-orchestration
 * 
 * Defines all TypeScript interfaces and types used throughout the package.
 */

// =============================================================================
// LLM Types
// =============================================================================

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface ChatOptions {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
  };
}

/**
 * LLM executor function type
 * 
 * This is injected by the parent application (0xKobold or pi-coding-agent)
 * to keep pi-orchestration agnostic to the LLM implementation.
 */
export type LLMExecutor = (options: ChatOptions) => Promise<ChatResponse>;

// =============================================================================
// Agent Types
// =============================================================================

export type AgentType = string;

export type ThinkLevel = "minimal" | "normal" | "deep";
export type ModelPreference = "fast" | "balanced" | "smart";
export type IsolationType = "none" | "worktree" | "copy";
export type ContextMode = "fresh" | "fork" | "inherit";

// =============================================================================
// Agent Definition
// =============================================================================

export interface AgentDefinition {
  id: AgentType;
  name: string;
  emoji: string;
  description: string;
  systemPrompt: string;
  
  // Execution parameters
  maxIterations: number;
  thinkLevel: ThinkLevel;
  
  // Model selection: "auto" inherits from parent, or explicit model ID
  model: "auto" | string;
  modelPreference: ModelPreference;
  
  // Tool access
  tools: string[];
  
  // Depth limit (0 = cannot spawn subagents, Infinity = unlimited)
  depthLimit: number;
  
  // Fork-specific rules
  forkRules?: string[];
}

// =============================================================================
// Task Definitions
// =============================================================================

export interface ChainStep {
  agent: AgentType;
  task?: string;
  cwd?: string;
  isolation?: IsolationConfig;
  model?: string;
  skills?: string[];
  llm?: LLMExecutor;
}

export interface ParallelTask {
  agent: AgentType;
  task: string;
  cwd?: string;
  isolation?: IsolationConfig;
  model?: string;
  skills?: string[];
  count?: number;
  llm?: LLMExecutor;
}

export interface IsolationConfig {
  type: IsolationType;
  diffOnComplete?: boolean;
  autoApply?: boolean;
}

// =============================================================================
// Execution Options
// =============================================================================

export interface OrchestrateOptions {
  // Mode selection (exactly one required)
  agent?: AgentType;
  chain?: ChainStep[];
  parallel?: ParallelTask[];
  mode?: "single" | "chain" | "parallel" | "fork" | "review_loop" | "auto";
  
  // Task definition
  task?: string;
  
  // Execution options
  cwd?: string;
  async?: boolean;
  timeout?: number;
  maxOutput?: number;
  depthLimit?: number;
  
  // Isolation
  isolation?: IsolationConfig;
  
  // Context
  context?: ContextMode;
  
  // Skills
  skills?: string[];
  
  // Model override
  model?: string;
  
  // LLM executor (injected by parent)
  llm?: LLMExecutor;
}

// =============================================================================
// Execution Result
// =============================================================================

export interface TokenUsage {
  input: number;
  output: number;
  total?: number;
}

export interface OrchestrateMetadata {
  agent: AgentType;
  duration: number;
  tokens: TokenUsage;
  depth: number;
  worktree?: string;
  model?: string;
}

export interface ArtifactInfo {
  dir: string;
  files: string[];
}

export interface OrchestrateResult {
  success: boolean;
  content: string;
  output?: string;
  fullPath?: string;
  metadata: OrchestrateMetadata;
  artifacts?: ArtifactInfo;
  diff?: string;
  error?: string;
}

// =============================================================================
// Chain/Parallel Results
// =============================================================================

export interface StepResult {
  agent: AgentType;
  content: string;
  success: boolean;
  duration: number;
  worktree?: string;
}

export interface ChainResult extends OrchestrateResult {
  steps: StepResult[];
}

export interface ParallelResult extends OrchestrateResult {
  tasks: StepResult[];
}

// =============================================================================
// Job/Async Types
// =============================================================================

export interface JobStatus {
  id: string;
  state: "queued" | "running" | "complete" | "failed" | "cancelled";
  mode: "single" | "chain" | "parallel";
  startedAt: number;
  completedAt?: number;
  currentStep?: number;
  totalSteps?: number;
}

export interface JobSummary {
  id: string;
  state: JobStatus["state"];
  mode: string;
  startedAt: number;
}

// =============================================================================
// Validation
// =============================================================================

export interface ValidationError {
  field: string;
  message: string;
}

// =============================================================================
// Extension Config
// =============================================================================

export interface ExtensionConfig {
  agents?: Partial<Record<AgentType, Partial<AgentDefinition>>>;
  limits?: ResourceLimits;
  defaults?: DefaultSettings;
  output?: OutputConfig;
}

export interface ResourceLimits {
  maxConcurrentSubagents: number;
  maxParallelTasks: number;
  maxChainSteps: number;
  maxOutputTokens: number;
  maxRuntimeMs: number;
}

export interface DefaultSettings {
  isolation: IsolationConfig;
  async: boolean;
  timeout: number;
  context: ContextMode;
}

export interface OutputConfig {
  truncateWhenExceeding: number;
  fullOutputToFile: boolean;
  outputDir: string;
}

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_DEPTH_LIMITS: Record<AgentType, number> = {
  scout: 0,
  specialist: 1,
  worker: 1,
  reviewer: 0,
  coordinator: Infinity,
};

export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxConcurrentSubagents: 8,
  maxParallelTasks: 16,
  maxChainSteps: 20,
  maxOutputTokens: 100000,
  maxRuntimeMs: 300000,  // 5 minutes
};

export const DEFAULT_DEFAULTS: DefaultSettings = {
  isolation: {
    type: "none",
    diffOnComplete: true,
    autoApply: false,
  },
  async: false,
  timeout: 300000,
  context: "fresh",
};
