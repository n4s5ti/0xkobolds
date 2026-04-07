# AGENT.md — pi-kobold

> Meta-extension for [pi-coding-agent](https://github.com/badlogic/pi-mono) that bundles the 0xKobold ecosystem into a single install.

## What This Package Does

`@0xkobold/pi-kobold` is a **meta-extension**: it loads and wires together four sub-extensions so that `pi install @0xkobold/pi-kobold` activates the entire 0xKobold stack in one step. It also provides dev-tooling tools (skill/extension scaffolding, status checks) and a shared LLM executor bridge.

## Architecture

```
pi-kobold (meta-extension)
├── Sub-extensions (loaded via factory pattern, duplicate-guarded)
│   ├── pi-orchestration  → multi-agent workflows (orchestrate, register_agent, orchestrate_status)
│   ├── pi-gateway        → Hermes-style WebSocket gateway (gateway_status, gateway_sessions, gateway_pairing, gateway_background_tasks)
│   ├── pi-ollama         → Ollama provider (registers providers + /ollama commands, NOT tools)
│   └── pi-learn          → persistent memory & reasoning (learn_add_message, learn_get_context, learn_query, learn_reason_now, learn_trigger_dream, …)
├── Kobold tools (4 registered)
│   ├── kobold_initialize      → Set up the shared LLM executor
│   ├── kobold_create_skill     → Scaffold a new skill (SKILL.md + index.ts + test.ts)
│   ├── kobold_create_extension → Scaffold a new extension (package.json + src/index.ts + tsconfig + README)
│   └── kobold_status          → Report which sub-extensions are loaded
└── LLM Adapter (src/utils/llm-adapter.ts)
    ├── createLLMExecutor(router, model?, temp?)       → Sync executor from a MultiProviderRouter
    ├── createAsyncLLMExecutor(getRouter, model?, temp?) → Lazy-init executor
    └── createMockLLMExecutor(responses?)              → Test stub
```

**Key design decision**: pi's extension loader does NOT auto-discover sub-extensions from `node_modules`. This meta-extension explicitly imports each sub-extension factory and calls it with the same `ExtensionAPI`, making a single `pi install` sufficient. If a sub-extension was already loaded (e.g., listed separately in `pi-config.ts`), pi-kobold skips it — duplicate registration is guarded, but side effects (DB connections, event handlers) are not idempotent.

## Source Map

| File | Purpose |
|------|---------|
| `src/index.ts` | Extension entry point: loads sub-extensions, registers 4 kobold tools, exports `initializeKobold`/`getLLMExecutor`/`isKoboldInitialized` |
| `src/utils/llm-adapter.ts` | Bridges 0xKobold's `MultiProviderRouter` → pi-orchestration's `LLMExecutor` interface. Also re-exports types. |
| `test/pi-kobold.test.ts` | Full test suite: LLM adapter, init, extension loading, sub-extension loading, duplicate guard, status detection |

## Public API

### Re-exports (for library consumers)

```typescript
// From pi-orchestration
export { orchestrate, formatOrchestrateResult } from "@0xkobold/pi-orchestration";
export type { OrchestrateOptions, OrchestrateResult, ChainResult, ParallelResult } from "@0xkobold/pi-orchestration";

// From llm-adapter
export { createLLMExecutor, createAsyncLLMExecutor, createMockLLMExecutor } from "./utils/llm-adapter.js";
export type { Message, ChatOptions, ChatResponse } from "./utils/llm-adapter.js";
```

### Module-level functions

```typescript
initializeKobold(executor: LLMExecutor): void   // Set the shared executor (idempotent guard)
getLLMExecutor(): LLMExecutor | null            // Get the current executor
isKoboldInitialized(): boolean                   // Check initialization state
```

## Commands

```bash
bun run build      # TypeScript compile (tsc)
bun run dev        # Watch mode (tsc --watch)
bun test           # Run test suite
```

## Default Model

`ollama/glm-5.1:cloud` — hardcoded as fallback in `llm-adapter.ts`. If you change the default model, update **all 5 locations** listed in the monorepo root CLAUDE.md.

## Bundled Skills

This package ships skills in `.pi/skills/`:

| Skill | Description |
|-------|-------------|
| `agent-skills-registry` | Curated registry of high-quality agent skills |
| `create-pi-package` | Scaffolding for new pi packages |
| `electron` | Electron app automation via CDP |
| `mission-control-ui` | Standardized UI components for Mission Control |
| `modern-frontend-design` | Production-grade frontend design principles |
| `pi-package-manager` | Monorepo package management |
| `programming-philosophy` | DRY, KISS, FP, NASA 10 rules |
| `tailwind-v4` | Tailwind CSS v4 best practices |
| `vite` | Vite build tool config and plugins |

Symlinked skills (`nextjs-best-practices`, `sql-optimization-patterns`) point to `../../.agents/skills/`.

## Peer Dependencies

| Package | Version | Required By |
|---------|---------|-------------|
| `@0xkobold/pi-learn` | ^0.3.0 | Both peer and runtime dep |
| `@0xkobold/pi-ollama` | ^0.4.0 | Both peer and runtime dep |
| `@0xkobold/pi-orchestration` | ^0.3.0 | Both peer and runtime dep |
| `@0xkobold/pi-gateway` | ^0.5.0 | Runtime dep only |
| `@mariozechner/pi-coding-agent` | >=0.65.0 | Extension API types |
| `@sinclair/typebox` | >=0.32.0 | Schema definitions |

## Storage Locations (at runtime)

| Path | Purpose |
|------|---------|
| `~/.0xkobold/gateway-sessions.db` | Gateway session data |
| `~/.0xkobold/gateway-security.db` | Allowlists and pairing codes |
| `~/.0xkobold/gateway-background-tasks.db` | Background task records |
| `~/.pi/memory/pi-learn.db` | Learn memory and reasoning |

## Testing Notes

- Uses `bun:test` — not Jest or Vitest
- Tests create a `createFakePi()` stub that implements the `ExtensionAPI` surface (`registerTool`, `registerCommand`, `registerProvider`, `getAllTools`, `getCommands`, `settings`, `on`)
- Module-level state (`initialized`, `initializedLLMExecutor`) is shared across tests in the same import — order matters for `isKoboldInitialized()` checks
- Skill/extension creation tests write to `/tmp/pi-kobold-test-integration/`

## Common Workflows

### Add a new kobold tool
1. Add a `pi.registerTool({...})` block in `src/index.ts`
2. Add a test in `test/pi-kobold.test.ts` using `createFakePi()`
3. Run `bun test` to verify

### Modify the LLM adapter
1. Edit `src/utils/llm-adapter.ts`
2. The adapter converts between 0xKobold's `MultiProviderRouter` format and pi-orchestration's `LLMExecutor` interface
3. Default model fallback: `"ollama/glm-5.1:cloud"`
4. Run `bun test` to verify

### Add a new bundled skill
1. Create directory `.pi/skills/<skill-name>/`
2. Add `SKILL.md` with description, usage, parameters
3. Optionally symlink from `.agents/skills/` if shared across packages

### Change a sub-extension version
1. Update both `peerDependencies` and `dependencies` in `package.json`
2. Run `bun install` to update lockfile
3. Verify loading with `bun test`