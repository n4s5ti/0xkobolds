# pi-orchestration

> Agnostic subagent orchestration for pi-coding-agent

A TypeScript package for orchestrating multi-agent workflows with depth limiting, worktree isolation, and model flexibility.

## Features

- **Single Execution**: Spawn a single typed agent with a task
- **Chain Execution**: Execute agents in sequence, passing output between steps
- **Parallel Execution**: Execute multiple agents concurrently with limits
- **Fork Execution**: Share parent's context for efficiency

## Agent Types

| Type | Emoji | Purpose | Depth Limit |
|------|-------|---------|-------------|
| `scout` | 🔍 | Fast reconnaissance | 0 |
| `specialist` | 🧠 | Domain expert | 1 |
| `worker` | ⚒️ | Implementation | 1 |
| `reviewer` | 👁️ | Quality validation | 0 |
| `coordinator` | 🎯 | Task orchestration | ∞ |

## Model Flexibility

pi-orchestration inherits the parent agent's model registry and selects the best model for each agent type:

```typescript
// "auto" = use parent's ctx.modelRegistry (default)
{ agent: "worker", model: "auto" }

// Explicit model
{ agent: "worker", model: "ollama/qwen2.5-coder:14b" }

// Use parent's current model
{ agent: "reviewer", model: "inherit" }
```

### Supported Providers

- `ollama/*` - Local or cloud Ollama models
- `claude/*` - Anthropic Claude
- `anthropic/*` - Alias for claude/
- Any custom provider registered via pi-coding-agent

## Installation

```bash
npm install @0xkobold/pi-orchestration
```

## Usage

### Single Execution

```typescript
import { orchestrate } from "@0xkobold/pi-orchestration";

const result = await orchestrate({
  agent: "worker",
  task: "Implement user authentication",
}, ctx);

console.log(result.content);
```

### Chain Execution

```typescript
const result = await orchestrate({
  chain: [
    { agent: "scout", task: "Analyze the codebase structure" },
    { agent: "planner", task: "Create implementation plan" },
    { agent: "worker", task: "Implement the feature" },
    { agent: "reviewer", task: "Review the changes" },
  ],
}, ctx);
```

### Parallel Execution

```typescript
const result = await orchestrate({
  parallel: [
    { agent: "scout", task: "Audit frontend security" },
    { agent: "scout", task: "Audit backend security" },
    { agent: "scout", task: "Audit infrastructure" },
  ],
}, ctx);
```

### With Options

```typescript
const result = await orchestrate({
  agent: "worker",
  task: "Refactor authentication module",
  cwd: "/path/to/project",
  timeout: 60000,        // 60 second timeout
  maxOutput: 5000,       // 5000 character max output
  isolation: {
    type: "worktree",
    diffOnComplete: true,
    autoApply: false,
  },
  model: "ollama/qwen2.5-coder:14b",
}, ctx);
```

## API

### `orchestrate(options, ctx)`

Main orchestration function.

**Options:**
- `agent` - Agent type for single execution
- `task` - Task description
- `chain` - Array of steps for chain execution
- `parallel` - Array of tasks for parallel execution
- `cwd` - Working directory
- `timeout` - Timeout in milliseconds
- `maxOutput` - Maximum output length
- `isolation` - Isolation configuration
- `model` - Model override
- `context` - Context mode: `fresh`, `fork`, or `inherit`

**Returns:** `OrchestrateResult | ChainResult | ParallelResult`

### Tools

- `orchestrate` - Main orchestration tool (single, chain, parallel execution)
- `orchestrate_status` - Check engine status and pi CLI availability

## Architecture

```
src/
├── core/           # Types and agent definitions
├── utils/          # Model selection, depth tracking, templates
├── modes/          # Single, chain, parallel, fork execution
├── execution/      # Main orchestration engine
└── tools/          # pi-coding-agent skill definitions
```

## License

MIT
