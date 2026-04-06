# pi-orchestration: Agnostic Subagent Extension

**Status:** Specification  
**Version:** 0.1.0  
**Date:** 2026-04-04

---

## Executive Summary

`pi-orchestration` is an agnostic subagent extension for pi-coding-agent that provides powerful, safe, and flexible multi-agent workflows. It combines the best patterns from pi-subagents (chains, parallel execution), Claude Code fork (prompt cache efficiency, strict output rules), and adds 0xKobold's safety-first philosophy (worktrees, depth limiting, unified logging).

**Key Design Principles:**
1. **Agnostic**: Works with any pi extension ecosystem
2. **Clean**: DRY, KISS, functional programming
3. **Safe**: Worktree isolation, depth limits, resource controls
4. **Efficient**: Prompt cache optimization, async execution

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   pi-orchestration                            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Executor    │  │  Worktree     │  │   Monitor   │         │
│  │              │  │   Manager    │  │              │         │
├──────────────┴──────────────┴──────────────┴─────────────────┤
│                          Execution Modes                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │ Single  │  │ Chain   │  │ Parallel│  │  Fork   │          │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘          │
├─────────────────────────────────────────────────────────────┤
│                      Safety Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │Depth Limiting│  │Resource Quota│  │ Worktrees  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Concepts

### 1. Agent Types

Unlike pi-subagents which uses arbitrary agent names, pi-orchestration uses **typed agents** with model-flexible execution.

**Agent Registry:**
Agents are managed via a dynamic registry. While a set of defaults is provided, new agent types can be registered at runtime using the `register_agent` tool.

| Type | Emoji | Purpose | Default Model Preference | Max Depth |
|------|-------|---------|-------------------------|-----------|
| `scout` | 🔍 | Fast reconnaissance | `fast` (quick, local) | 0 |
| `specialist` | 🧠 | Domain expert | `balanced` (quality + speed) | 1 |
| `worker` | ⚒️ | Implementation | `balanced` | 1 |
| `reviewer` | 👁️ | Quality validation | `smart` (quality focus) | 0 |
| `coordinator` | 🎯 | Task delegation | `smart` | ∞ |


**Model Selection Strategy:**

pi-orchestration uses the **parent agent's model registry** via `ctx.modelRegistry`:

```typescript
// Get all available models from parent agent
const available = ctx.modelRegistry.getAvailable();
// Returns: [{ provider: 'ollama', id: 'qwen2.5-coder:14b' }, ...]

// Select model based on agent type preference
const model = selectModelForAgent(agentType, available);
// scout → prefer fast/light models
// worker → prefer balanced models
// reviewer → prefer smart/quality models
```

**Supported Provider Prefixes:**
- `ollama/` - Local or cloud Ollama models
- `claude/` - Anthropic Claude models
- `anthropic/` - Alias for claude/
- Any custom provider registered via pi-coding-agent

**User can override via:**
- Per-agent config: `{ agent: "worker", model: "ollama/qwen2.5-coder:14b" }`
- Global default in config.json
- Runtime selection via `/model` command

**Example Config:**

```json
{
  "agents": {
    "worker": {
      "model": "auto",    // "auto" = use parent registry
      "modelPreference": "balanced"
    },
    "scout": {
      "model": "auto",
      "modelPreference": "fast"
    }
  }
}
```

### 2. Execution Modes

#### Single Mode
One agent, one task. Simplest execution path.

```typescript
const result = await orchestrate({
  agent: "worker",
  task: "Refactor user-auth.ts to use async/await",
});
```

#### Chain Mode
Sequential pipeline where each step can reference previous output.

```typescript
const result = await orchestrate({
  chain: [
    { agent: "scout", task: "Find auth-related code" },
    { agent: "specialist", task: "Analyze {previous} for security issues" },
    { agent: "worker", task: "Fix {previous}" }
  ]
});
```

**Template Variables:**
- `{task}` - Original task from user
- `{previous}` - Output from previous step
- `{chain_dir}` - Shared directory for chain artifacts
- `{step:N}` - Output from step N

#### Parallel Mode
Multiple tasks executed concurrently.

```typescript
const result = await orchestrate({
  parallel: [
    { agent: "worker", task: "Refactor component A" },
    { agent: "worker", task: "Refactor component B" },
    { agent: "worker", task: "Refactor component C" }
  ]
});
```

#### Fork Mode
Claude Code-inspired fork with inherited history for prompt cache efficiency.

```typescript
const result = await orchestrate({
  type: "scout",  // Inherits parent's full conversation
  task: "Analyze database schema"
  // No `agent` field = implicit fork
});
```

### 3. Worktree Isolation

Each subagent can optionally run in a **git worktree** for complete filesystem isolation.

```typescript
const result = await orchestrate({
  agent: "worker",
  task: "Refactor critical code",
  isolation: {
    type: "worktree",
    diffOnComplete: true,  // Show diff before applying
    autoApply: false      // Require approval
  }
});
```

**Modes:**
- `none`: Same working directory (default)
- `worktree`: Git worktree with shared object database
- `copy`: Full directory copy (slower, complete isolation)

### 4. Async Execution

Background execution with event-based notification.

```typescript
const jobId = await orchestrate({
  agent: "scout",
  task: "Research codebase",
  async: true,
  onComplete: (result) => {
    console.log(`Job ${result.jobId} complete`);
  }
});

// Check status
const status = await getJobStatus(jobId);
```

---

## API Reference

### Core Function

```typescript
interface OrchestrateOptions {
  // Execution mode selection
  agent?: AgentType;              // Single agent
  chain?: ChainStep[];            // Sequential pipeline
  parallel?: ParallelTask[];      // Concurrent tasks
  
  // Task definition
  task?: string;                  // Task for single/chain mode
  tasks?: string[];               // Tasks for parallel mode
  
  // Execution control
  cwd?: string;                   // Working directory
  isolation?: IsolationConfig;   // Worktree/container
  async?: boolean;                // Background execution
  timeout?: number;               // Max duration (ms)
  maxOutput?: number;             // Max tokens
  depthLimit?: number;            // Override default depth
  
  // Context control
  context?: "fresh" | "fork" | "inherit";  // Conversation context
  skills?: string[];              // Required agent skills
  model?: string;                 // Model override
  
  // Hooks
  onProgress?: (update: ProgressUpdate) => void;
  onComplete?: (result: OrchestrateResult) => void;
  onError?: (error: Error) => void;
}

interface OrchestrateResult {
  success: boolean;
  content: string;
  output?: string;                // Truncated output
  fullPath?: string;              // Path to full output
  metadata: {
    agent: AgentType;
    duration: number;
    tokens: TokenUsage;
    depth: number;
    worktree?: string;            // Path to isolated worktree
  };
  artifacts?: {
    dir: string;
    files: string[];
  };
  diff?: string;                  // Worktree diff summary
}

export async function orchestrate(
  options: OrchestrateOptions
): Promise<OrchestrateResult>;

export async function orchestrate(
  options: OrchestrateOptions & { async: true }
): Promise<string>; // Returns jobId
```

### Status Commands

```typescript
// List all active jobs
export async function listJobs(): Promise<JobSummary[]>;

// Get specific job status
export async function getJobStatus(jobId: string): Promise<JobStatus>;

// Wait for job completion
export async function waitForJob(
  jobId: string, 
  options?: { pollInterval?: number; timeout?: number }
): Promise<OrchestrateResult>;

// Cancel running job
export async function cancelJob(jobId: string): Promise<boolean>;
```

---

## Safety Mechanisms

### 1. Depth Limiting

```typescript
const DEPTH_LIMITS: Record<AgentType, number> = {
  scout: 0,        // Cannot spawn subagents
  specialist: 1,   // Can spawn 1 level deep
  worker: 1,
  reviewer: 0,
  coordinator: ∞,  // Can spawn indefinitely
};
```

### 2. Resource Quotas

```typescript
interface ResourceLimits {
  maxConcurrentSubagents: number;  // Default: 8
  maxParallelTasks: number;          // Default: 16
  maxChainSteps: number;             // Default: 20
  maxOutputTokens: number;           // Default: 100k
  maxRuntimeMs: number;              // Default: 5 min
}
```

### 3. Worktree Safety

- **Diff on complete**: Show changes before applying
- **Auto-apply opt-in**: Changes don't apply by default
- **Cleanup on failure**: Rollback on error
- **Quota tracking**: Don't exceed X simultaneous worktrees

### 4. Output Validation

Fork mode enforces Claude Code's 500-word limit:

```typescript
const FORK_RULES = [
  "STOP. READ THIS FIRST.",
  "You ARE the fork. Do NOT spawn sub-agents.",
  "Do NOT converse or ask questions.",
  "USE tools directly, silently.",
  "Keep report under 500 words.",
  "Response MUST begin with 'Scope:'."
];
```

---

## Implementation Details

### Extension Registration

```typescript
// packages/pi-orchestration/src/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { orchestrate, listJobs, getJobStatus } from "./orchestrate.js";
import { registerOrchestrateTool } from "./tools/orchestrate-tool.js";
import { registerStatusTool } from "./tools/status-tool.js";

export default async function piOrchestrationExtension(
  pi: ExtensionAPI
): Promise<void> {
  // Register tools
  registerOrchestrateTool(pi);
  registerStatusTool(pi);
  
  // Register slash commands
  pi.registerCommand("orchestrate", {
    description: "Subagent orchestration",
    handler: slashHandler,
  });
  
  // Event subscriptions
  pi.events.on("session_shutdown", cleanupActiveJobs);
}
```

### Tool Definition

```typescript
import { Type } from "@sinclair/typebox";

const AgentType = Type.Union([
  Type.Literal("scout"),
  Type.Literal("specialist"),
  Type.Literal("worker"),
  Type.Literal("reviewer"),
  Type.Literal("coordinator"),
]);

const OrchestrateParams = Type.Object({
  // Mode selection (exactly one required)
  agent: Type.Optional(AgentType),
  chain: Type.Optional(Type.Array(/* ... */)),
  parallel: Type.Optional(Type.Array(/* ... */)),
  
  // Task definition
  task: Type.Optional(Type.String({ maxLength: 10000 })),
  
  // Execution options
  cwd: Type.Optional(Type.String()),
  async: Type.Optional(Type.Boolean({ default: false })),
  timeout: Type.Optional(Type.Number({ default: 300000 })),  // 5 min
  maxOutput: Type.Optional(Type.Number({ default: 100000 })),
  depthLimit: Type.Optional(Type.Number()),
  
  // Isolation
  isolation: Type.Optional(Type.Object({
    type: Type.Union([
      Type.Literal("none"),
      Type.Literal("worktree"),
      Type.Literal("copy"),
    ]),
    diffOnComplete: Type.Boolean(),
    autoApply: Type.Boolean(),
  })),
  
  // Context
  context: Type.Union([
    Type.Literal("fresh"),
    Type.Literal("fork"),
    Type.Literal("inherit"),
  ]),
  
  // Skills
  skills: Type.Optional(Type.Array(Type.String())),
  
  // Model override
  model: Type.Optional(Type.String()),
});

export function registerOrchestrateTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "orchestrate",
    label: "Subagent Orchestration",
    description: `Delegate tasks to typed subagents.

Modes (use exactly one):
• SINGLE: { agent: "worker", task: "..." }
• CHAIN: { chain: [{ agent: "scout" }, { agent: "worker" }] }
• PARALLEL: { parallel: [{ agent: "worker" }, { agent: "worker" }] }

Template variables: {task}, {previous}, {chain_dir}

Agent types:
• scout - Fast reconnaissance (depth 0)
• specialist - Domain expert (depth 1)
• worker - Implementation (depth 1)
• reviewer - Quality validation (depth 0)
• coordinator - Task delegation (depth ∞)`,
    parameters: OrchestrateParams,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return executeOrchestrate(params, ctx);
    },
  });
}
```

### Model Selection in Executor

```typescript
/**
 * Select model based on agent type and parent registry
 * Uses ctx.modelRegistry from parent agent context
 */
async function selectModelForAgent(
  agentType: AgentType,
  ctx: ExtensionContext,
  override?: string
): Promise<string> {
  // Use explicit override if provided
  if (override && override !== "auto") {
    return normalizeModelId(override);
  }

  const definition = DEFAULT_AGENTS[agentType];
  const preference = definition.modelPreference || "balanced";

  // Get all available models from parent
  const available = ctx.modelRegistry.getAvailable();

  // Score each model by how well it matches preference
  const scored = available.map(model => ({
    model,
    score: scoreModelForPreference(model, preference),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    // Fallback to default
    return preference === "fast" 
      ? "ollama/llama3.2:3b" 
      : "ollama/qwen2.5-coder:14b";
  }

  // Return best match
  return normalizeModelId(scored[0].model.id);
}

function scoreModelForPreference(
  model: { provider: string; id: string },
  preference: "fast" | "balanced" | "smart"
): number {
  let score = 50; // Base score

  const id = model.id.toLowerCase();
  const isLocal = model.provider === "ollama" && !id.includes(":cloud");

  if (preference === "fast") {
    // Prefer smaller, local models
    if (id.includes("3b") || id.includes("7b")) score += 30;
    if (id.includes("14b")) score += 10;
    if (id.includes("70b")) score -= 20;
    if (isLocal) score += 20;
    if (id.includes(":cloud")) score -= 30;
  }

  if (preference === "smart") {
    // Prefer larger, cloud models
    if (id.includes("70b") || id.includes("405b")) score += 30;
    if (id.includes("14b") || id.includes("32b")) score += 10;
    if (id.includes("3b") || id.includes("7b")) score -= 10;
    if (id.includes(":cloud") && model.provider !== "ollama") score += 20;
  }

  if (preference === "balanced") {
    // Middle ground
    if (id.includes("14b") || id.includes("32b")) score += 20;
    if (id.includes("coder")) score += 10;
    if (isLocal) score += 10;
  }

  // Boost known good models
  const goodModels = ["qwen2.5-coder", "llama3.1", "claude-3-5-sonnet"];
  for (const good of goodModels) {
    if (id.includes(good)) score += 15;
  }

  return score;
}

function normalizeModelId(model: string): string {
  // Ensure provider prefix
  if (!model.includes("/")) {
    return `ollama/${model}`;
  }
  return model;
}
```

### Executor Implementation

```typescript
// Core functional execution flow

export async function executeOrchestrate(
  params: OrchestrateParams,
  ctx: ExtensionContext
): Promise<OrchestrateResult> {
  // 1. Validate mode selection
  throwIfInvalidMode(params);
  
  // 2. Check depth limits
  checkDepthLimit(params.agent);
  
  // 3. Select model based on agent type and parent registry
  const model = await selectModelForAgent(
    params.agent,
    ctx,
    params.model
  );

  // 4. Determine execution mode
  if (params.chain) return executeChain(params, ctx, model);
  if (params.parallel) return executeParallel(params, ctx, model);
  return executeSingle(params, ctx, model);
}

// Single execution (simplest path)
async function executeSingle(
  params: { agent: AgentType; task: string },
  ctx: ExtensionContext,
  model: string
): Promise<OrchestrateResult> {
  const agent = getAgentDefinition(params.agent);
  
  const messages = [
    { role: "system", content: buildSystemPrompt(agent) },
    { role: "user", content: params.task },
  ];
  
  // Use selected model (inherited from parent registry)
  const result = await pi.sendMessage(
    { role: "user", content: params.task },
    { 
      model,  // This will use the parent's ctx.modelRegistry
      systemPrompt: buildSystemPrompt(agent),
    }
  );
  
  return processResult(result);
}
```

---

## Configuration

### Extension Config

File: `~/.pi/agent/extensions/orchestrate/config.json`

```json
{
  // Agent definitions (optional override)
  "agents": {
    "worker": {
      "model": "ollama/qwen2.5-coder:14b",
      "maxIterations": 15,
      "thinkLevel": "normal"
    }
  },
  
  // Resource limits
  "limits": {
    "maxConcurrentSubagents": 8,
    "maxParallelTasks": 16,
    "maxChainSteps": 20,
    "maxOutputTokens": 100000,
    "maxRuntimeMs": 300000
  },
  
  // Default settings
  "defaults": {
    "isolation": {
      "type": "worktree",
      "diffOnComplete": true,
      "autoApply": false
    },
    "async": false,
    "timeout": 300000,
    "context": "fresh"
  },
  
  // Output behavior
  "output": {
    "truncateWhenExceeding": 10000,
    "fullOutputToFile": true,
    "outputDir": "~/.pi/agent/orchestrate/outputs"
  }
}
```

### Agent Definition

```typescript
interface AgentDefinition {
  id: AgentType;
  name: string;
  emoji: string;
  description: string;
  systemPrompt: string;
  
  // Execution parameters
  maxIterations: number;
  thinkLevel: "minimal" | "normal" | "deep";
  
  // Model selection
  // "auto" = use ctx.modelRegistry from parent agent
  // Or explicit model ID: "ollama/qwen2.5-coder:14b"
  model: "auto" | string;
  modelPreference: "fast" | "balanced" | "smart";
  
  // Tool access
  tools: string[];
  
  // Depth limit (0 = cannot spawn subagents)
  depthLimit: number;
  
  // Fork-specific (for cached child execution)
  forkRules?: string[];
}

// Default definitions
// Note: Uses "auto" model - inherits from parent's ctx.modelRegistry
// User can override per-agent or globally in config

export const DEFAULT_AGENTS: Record<AgentType, AgentDefinition> = {
  scout: {
    id: "scout",
    name: "Scout",
    emoji: "🔍",
    description: "Fast reconnaissance agent",
    systemPrompt: `You are Scout (🔍).
Your mission: Quick reconnaissance.
Be fast, factual, concise.
Max output: 500 tokens.
Return compressed summaries only.`,
    maxIterations: 12,
    thinkLevel: "normal",
    model: "auto",                    // Inherits from parent registry
    modelPreference: "fast",           // Prefer lightweight models
    tools: ["read", "search", "list", "bash"],
    depthLimit: 0,  // Cannot spawn subagents
  },
  
  specialist: {
    id: "specialist",
    name: "Specialist",
    emoji: "🧠",
    description: "Domain expert with deep knowledge",
    systemPrompt: `You are Specialist (🧠).
Your mission: Apply deep domain expertise.
Follow best practices for your domain.
Deliver expert-level, production-ready work.`,
    maxIterations: 15,
    thinkLevel: "deep",
    model: "auto",
    modelPreference: "smart",
    tools: ["read", "edit", "write", "bash", "web_search"],
    depthLimit: 1,
  },
  
  worker: {
    id: "worker",
    name: "Worker",
    emoji: "⚒️",
    description: "Implementation specialist",
    systemPrompt: `You are Worker (⚒️).
Your mission: Implement clean, working code.
Follow existing patterns in the codebase.
Test your changes before reporting done.`,
    maxIterations: 15,
    thinkLevel: "normal",
    model: "auto",
    modelPreference: "balanced",
    tools: ["read", "edit", "write", "bash", "perennial_save"],
    depthLimit: 1,
  },
  
  reviewer: {
    id: "reviewer",
    name: "Reviewer",
    emoji: "👁️",
    description: "Quality validation and review",
    systemPrompt: `You are Reviewer (👁️).
Your mission: Validate quality and correctness.
Check for bugs, security issues, style.
Provide specific, actionable feedback.`,
    maxIterations: 10,
    thinkLevel: "deep",
    model: "auto",
    modelPreference: "smart",
    tools: ["read", "bash", "perennial_search", "web_search", "security_scan"],
    depthLimit: 0,
  },
  
  coordinator: {
    id: "coordinator",
    name: "Coordinator",
    emoji: "🎯",
    description: "Task delegation and orchestration",
    systemPrompt: `You are Coordinator (🎯).
Your mission: Plan and coordinate complex tasks.
Delegate to appropriate agents.
Monitor progress and integrate results.`,
    maxIterations: 20,
    thinkLevel: "deep",
    model: "auto",
    modelPreference: "smart",
    tools: ["orchestrate", "task_breakdown", "perennial_search", "read", "bash"],
    depthLimit: Infinity,  // Can spawn indefinitely
  },
};
```

---

## Commands

### Slash Commands

```typescript
// In TUI:

// Single agent
/orchestrate worker "Refactor auth.ts"

// Chain
/orchestrate chain "scout,worker,reviewer" "Analyze codebase"

// Parallel
/orchestrate parallel "worker,worker,worker" "Refactor components"

// With isolation
/orchestrate worker "Refactor critical code" --isolation=worktree --no-auto-apply

// Background
/orchestrate scout "Research codebase" --async
```

### Status Commands

```typescript
/orchestrate-status           // List all jobs
/orchestrate-status <jobId>  // Detail for specific job
```

---

## Error Handling

```typescript
enum OrchestrateError {
  DEPTH_EXCEEDED = "depth_exceeded",
  TIMEOUT = "timeout",
  RESOURCE_EXHAUSTED = "resource_exhausted",
  WORKTREE_FAILED = "worktree_failed",
  AGENT_FAILED = "agent_failed",
  VALIDATION_FAILED = "validation_failed",
}

interface OrchestrateErrorResult {
  error: OrchestrateError;
  message: string;
  details: {
    depth?: { current: number; max: number };
    resource?: { type: string; limit: number };
    agent?: { type: AgentType; exitCode: number };
  };
}
```

### Recovery Strategies

| Error Type | Strategy |
|------------|----------|
| `DEPTH_EXCEEDED` | Fail fast, suggest coordinator agent |
| `TIMEOUT` | Return partial output, mark incomplete |
| `RESOURCE_EXHAUSTED` | Queue for retry, notify user |
| `WORKTREE_FAILED` | Fallback to no isolation |
| `AGENT_FAILED` | Retry once, then escalate |
| `VALIDATION_FAILED` | Return specific error message |

---

## Comparison: pi-subagents vs pi-orchestration

| Feature | pi-subagents | pi-orchestration |
|---------|-------------|------------------|
| Agent names | Arbitrary strings | Typed (scout, worker, etc.) |
| Depth limits | No built-in | Enforced (scout=0, coordinator=∞) |
| Worktrees | Supported | First-class with diff/apply |
| Fork mode | No | Yes (prompt cache optimization) |
| Chain templates | {previous}, {task} | + {step:N}, {chain_dir} |
| Async execution | Yes | Yes |
| Skills system | agentskills.io | Compatible |
| Output handling | Truncation | Truncation + full file |
| Resource quotas | No | Built-in |
| Logging | Extension logs | Unified with pi-kobold |

---

## Migration from pi-subagents

### Before (pi-subagents)

```typescript
{
  tool: "subagent",
  params: {
    agent: "refactor-expert",
    task: "Refactor auth.ts",
    async: true
  }
}
```

### After (pi-orchestration)

```typescript
{
  tool: "orchestrate",
  params: {
    agent: "worker",
    task: "Refactor auth.ts",
    isolation: {
      type: "worktree",
      diffOnComplete: true,
      autoApply: false
    },
    async: true
  }
}
```

### Chain Migration

```typescript
// pi-subagents
{
  tool: "subagent",
  params: {
    chain: [
      { agent: "scout", task: "Analyze {task}" },
      { agent: "planner", task: "Plan based on {previous}" }
    ]
  }
}

// pi-orchestration (identical syntax)
{
  tool: "orchestrate",
  params: {
    chain: [
      { agent: "scout", task: "Analyze {task}" },
      { agent: "specialist", task: "Plan based on {previous}" }
    ]
  }
}
```

---

## Open Questions

1. **Agent definitions**: Store in ~/.pi/agent/agents/ or in extension config?
2. **Worktree auto-apply**: Default to true or false for safety?
3. **Fork mode**: Require explicit opt-in or allow implicit?
4. **Skills compatibility**: Full agentskills.io spec or subset?
5. **Rate limiting**: Global across all pi instances or per-session?
6. **Persistence**: Store job history in SQLite or JSON?

---

## Appendix: Code Philosophy Alignment

### NASA 10 Rules Compliance

| Rule | Implementation |
|------|----------------|
| No complex control flow | Flat async/await, minimal recursion |
| Fixed loop bounds | MAX_CHAIN_STEPS, MAX_PARALLEL constants |
| No dynamic memory | Pre-allocated worktree pool |
| ≤60 lines per function | Core functions split into helpers |
| ≥2 assertions per function | Schema validation, depth checks |
| Minimal scope | Functional composition |
| Check all returns | All async results validated |
| Simple macros | No preprocessor tricks |
| Single-level pointers | Type-safe TypeScript |
| Warnings as errors | Strict TS config |

### DRY Principle

- Shared worktree management
- Reusable template engine
- Common result processing
- Unified error handling

### KISS Principle

- Three execution modes: single, chain, parallel
- Clear agent type taxonomy
- Simple fork mode
- Explicit over implicit

### Functional Programming

- Pure template functions
- Immutable agent definitions
- Composable execution modes
- No shared state

---

## Appendix C: Model Flexibility

### Philosophy

pi-orchestration is **model-agnostic**. It inherits the parent's model registry and selects the best model for each agent type based on user preferences and model availability.

### How It Works

1. **At Extension Load**
   - Gets `ctx.modelRegistry` from parent pi-coding-agent
   - This contains all models the user has configured

2. **At Execution Time**
   - For each subagent, selects the best model based on:
     - Agent type preference (`fast`, `balanced`, `smart`)
     - Available models in registry
     - User overrides

3. **Model Selection Heuristics**

```
Agent Type    │ Preference │ Selection Heuristics
──────────────┼────────────┼───────────────────────────────────────
scout         │ fast       │ Smaller models (3b-7b), local preferred
specialist    │ balanced   │ 14b-32b, coder-focused if available
worker        │ balanced   │ 14b-32b, coder-focused if available
reviewer      │ smart      │ Larger models (70b+), cloud preferred
coordinator   │ smart      │ Largest model available
```

### User Override Options

```typescript
// Option 1: Per-agent in config
{
  "agents": {
    "worker": {
      "model": "ollama/qwen2.5-coder:14b"  // Explicit model
    }
  }
}

// Option 2: Per-call in tool params
{
  "tool": "orchestrate",
  "params": {
    "agent": "worker",
    "task": "Implement feature X",
    "model": "ollama/mistral:7b"  // Override just this call
  }
}

// Option 3: Use parent's current model
{
  "tool": "orchestrate",
  "params": {
    "agent": "reviewer",
    "task": "Review changes",
    "model": "inherit"  // Use same model as parent
  }
}
```

### Provider Support

pi-orchestration works with any provider registered in pi-coding-agent:

| Provider | Example Models | Notes |
|----------|---------------|-------|
| `ollama/` | `qwen2.5-coder:14b`, `llama3.1:8b` | Local or cloud |
| `claude/` | `claude-3-5-sonnet-20241022` | Anthropic API |
| `anthropic/` | `claude-3-5-sonnet-20241022` | Alias |
| Custom | Any registered provider | Via pi-coding-agent |

### Best Practices

1. **For Speed**: Use `scout` with local models (3b-7b)
2. **For Quality**: Use `reviewer` with largest available model
3. **For Coding**: Prefer `coder`-suffixed Ollama models
4. **For Cost**: Set `model: "inherit"` to reuse parent's model

---

## Appendix D: Research Sources

### pi-subagents (nicobailon)
- **GitHub**: https://github.com/nicobailon/pi-subagents
- **Stars**: 643
- **Key Features**:
  - Single/Chain/Parallel execution modes
  - TUI clarification for parameter selection
  - Worktree isolation
  - Async execution with background jobs
  - Skills compatibility (agentskills.io)
  - Slash commands: `/run`, `/chain`, `/parallel`, `/agents`

### Hermes-Agent (Nous Research)
- **GitHub**: https://github.com/NousResearch/hermes-agent
- **Stars**: 24.6k
- **Key Features**:
  - Self-improving with skill creation
  - Persistent memory with FTS5
  - Multi-platform gateway (Telegram, Discord, Slack, WhatsApp)
  - Cron scheduling
  - Parallel subagents with RPC
  - Compatible with OpenClaw migration

### Claude Code Fork
- **Location**: `~/code/claude-code/`
- **Key Features**:
  - Fork subagent with inherited context
  - Prompt cache optimization
  - Strict 500-word output limit for forks
  - Worktree isolation with diff
  - Recursive fork detection

### 0xKobold Integration
- **Current**: Agent types defined in `src/agent/types/definitions.ts`
- **Router**: Multi-provider router in `src/llm/multi-provider.ts`
- **Model Registry**: Via `ctx.modelRegistry` in pi-coding-agent

---

*Specification for pi-orchestration v0.1.0*
*Incorporates research from pi-subagents, Hermes-Agent, Claude Code fork, and 0xKobold*
