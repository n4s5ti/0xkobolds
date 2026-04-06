# pi-learn Compliance Fix Plan

## Overview

Refactor pi-learn to comply with:
- **0xKobold Programming Philosophy** (DRY, KISS, FP, NASA 10 Rules)
- **pi-package standards**

**Status:** ✅ Phase 1, 2, 3, 4 mostly complete
**Build:** ✅ Compiles successfully
**Tests:** ⚠️ 62 pass, 1 fail (unrelated vitest API issue)

---

## Completed Changes

### Phase 1: Decomposed index.ts ✅

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.ts` | ~290 | Main extension (was 474) |
| `src/core/config.ts` | NEW | Configuration loading with assertions |
| `src/core/dream.ts` | NEW | Dream runner + scheduler |
| `src/core/project-detection.ts` | NEW | File-based project detection |
| `src/core/commands.ts` | NEW | `/learn` command handler |
| `src/core/bridge.ts` | REFACTORED | Standalone MemoryProvider |

### Phase 2: Added Assertions ✅

Added `console.assert()` to:
- `store.ts`: `init()`, `getWorkspace()`, `saveWorkspace()`, `getPeer()`, `saveMessage()`, `saveMessagesBatch()`, `getMessages()`, `getRecentMessages()`, `saveConclusion()`, `getConclusions()`, `getAllConclusions()`, `searchObservationsByEmbedding()`, `getRepresentation()`
- `dream.ts`: Factory function, `runDream()`, scheduler
- `project-detection.ts`: Factory function, detection, scheduler
- `config.ts`: `loadConfig()`, `validateConfig()`
- `commands.ts`: Handler, helpers
- `bridge.ts`: All methods

### Phase 3: Encapsulated Mutable State ✅

```typescript
// Before: module-level let
let notifyCallback = null;
let activeWorkspaceId = config.workspaceId;

// After: closure pattern
function createExtensionState(initialId) {
  let workspaceId = initialId;
  let notify = null;
  return {
    get activeWorkspaceId() { return workspaceId; },
    set activeWorkspaceId(id) { workspaceId = id; },
    get notifyCallback() { return notify; },
    set notifyCallback(cb) { notify = cb; },
  };
}
```

### Phase 4: Other Compliance ✅


- Exported `ProjectInfo` from `project-integration.ts`
- Added `DEFAULT_CONCURRENCY` to `shared.ts`
- Removed `pi-orchestration` cross-package dependency (standalone bridge)
- Fixed TypeScript strict type issues

---

## Remaining Work

| Task | Priority | Notes |
|------|----------|-------|
| Add assertions to remaining store.ts functions | LOW | Most critical functions done |
| Add conventional directories | LOW | `skills/`, `prompts/`, `themes/` |
| Enable strict TypeScript | MEDIUM | Add to `tsconfig.json` |
| Fix vitest test setup | LOW | `vi.stubGlobal` API issue |

---

## Build & Test

```bash
bun run build    # ✅ Compiles successfully
bun test        # ⚠️ 62 pass, 1 fail (vitest API issue, not code)
```

### 1.1 Extract Dream Logic

```
Current: runDream() inline (~70 lines)
Target: src/core/dream.ts (new module)
```

```typescript
// src/core/dream.ts
export interface DreamConfig {
  enabled: boolean;
  intervalMs: number;
  minMessagesSinceLastDream: number;
  batchSize: number;
}

export interface DreamContext {
  globalConclusions: Conclusion[];
  localConclusions: Conclusion[];
  globalPeerCard?: PeerCard;
}

export function createDreamRunner(
  store: SQLiteStore,
  contextAssembler: ContextAssembler,
  reasoningEngine: ReasoningEngine,
  config: DreamConfig
) {
  console.assert(store !== null, 'store must not be null');
  console.assert(contextAssembler !== null, 'contextAssembler must not be null');
  console.assert(reasoningEngine !== null, 'reasoningEngine must not be null');
  console.assert(config !== null, 'config must not be null');
  console.assert(config.intervalMs > 0, 'intervalMs must be positive');

  return async function runDream(
    workspaceId: string,
    scope: "user" | "project" = "project"
  ): Promise<{ userScopeCount: number; projectScopeCount: number }> {
    if (!config.enabled) return { userScopeCount: 0, projectScopeCount: 0 };

    const messages = store.getRecentMessages(workspaceId, "user", config.batchSize);
    console.assert(Array.isArray(messages), 'messages must be array');
    
    if (messages.length < config.minMessagesSinceLastDream) {
      return { userScopeCount: 0, projectScopeCount: 0 };
    }

    const blended = contextAssembler.getBlendedContext(workspaceId, "user");
    const result = await reasoningEngine.dream(
      messages.map((m: any) => ({ role: m.role, content: m.content })),
      blended.blendedConclusions,
      {
        globalConclusions: blended.global.conclusions,
        localConclusions: blended.project.conclusions,
        globalPeerCard: blended.global.peerCard || undefined,
      }
    );

    let userScopeCount = 0;
    let projectScopeCount = 0;

    for (const c of result.newConclusions) {
      console.assert(c.content !== null, 'conclusion content must not be null');
      console.assert(c.type !== null, 'conclusion type must not be null');
      
      const conclusionScope = c.scope || scope;
      const conclusionWorkspaceId = conclusionScope === "user" 
        ? "__global__" 
        : workspaceId;

      store.saveConclusion(conclusionWorkspaceId, {
        id: crypto.randomUUID(),
        peerId: "user",
        type: c.type,
        content: c.content,
        premises: c.premises,
        confidence: c.confidence,
        createdAt: Date.now(),
        sourceSessionId: messages[0]?.session_id || "dream",
        scope: conclusionScope,
      });

      conclusionScope === "user" ? userScopeCount++ : projectScopeCount++;
    }

    store.updateDreamMetadata(workspaceId, messages.length, result.newConclusions.length);
    return { userScopeCount, projectScopeCount };
  };
}
```

### 1.2 Extract Project Detection

```
Current: detectProjectFromFiles(), checkAndSwitchProject() inline (~50 lines)
Target: src/core/project-detection.ts (new module)
```

### 1.3 Extract Configuration Loader

```
Current: loadConfig() inline (~50 lines)
Target: src/core/config.ts (new module)
```

```typescript
// src/core/config.ts
import * as fs from "fs";
import * as os from "os";
import { DEFAULT_RETENTION, DEFAULT_DREAM, DEFAULT_REASONING_MODEL, DEFAULT_EMBEDDING_MODEL, DEFAULT_TOKEN_BATCH_SIZE } from "../shared.js";
import { DEFAULT_RETRY_CONFIG } from "./reasoning.js";
import { DEFAULT_PROJECT_CONFIG, type ProjectIntegrationConfig } from "./project-integration.js";

export interface Config {
  workspaceId: string;
  reasoningEnabled: boolean;
  reasoningModel: string;
  embeddingModel: string;
  tokenBatchSize: number;
  ollamaBaseUrl: string;
  ollamaApiKey: string;
  retention: ReturnType<typeof mergeRetention>;
  dream: ReturnType<typeof mergeDream>;
  retry: ReturnType<typeof mergeRetry>;
  concurrency: number;
  project: ProjectIntegrationConfig;
}

function mergeRetention(base: any, override: any) {
  console.assert(base !== null, 'base retention must not be null');
  return { ...base, ...override };
}

export function loadConfig(): Config {
  const settingsPath = path.join(os.homedir(), ".pi", "agent", "settings.json");
  
  console.assert(settingsPath !== null, 'settingsPath must not be null');
  console.assert(settingsPath.length > 0, 'settingsPath must not be empty');

  let settings: Record<string, any> = {};
  try {
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, "utf-8");
      console.assert(content !== null, 'settings file must be readable');
      settings = JSON.parse(content);
    }
  } catch (e) {
    console.warn("[pi-learn] Failed to load settings:", e);
    // Return defaults on error - graceful degradation
  }

  const learnSettings = settings.learn || {};
  console.assert(typeof learnSettings === 'object', 'learnSettings must be object');

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
    concurrency: learnSettings.concurrency ?? 1,
    project: { ...DEFAULT_PROJECT_CONFIG, ...learnSettings.project },
  };
}
```

### 1.4 Extract Command Handler

```
Current: Command handler inline (~60 lines)
Target: src/core/commands.ts (new module)
```

### 1.5 Resulting index.ts Structure

After extraction, `src/index.ts` should be ~150 lines:

```typescript
// src/index.ts (~150 lines)
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

import { createStore } from "./core/store.js";
import { createReasoningEngine } from "./core/reasoning.js";
import { createContextAssembler } from "./core/context.js";
import { loadConfig } from "./core/config.js";
import { createDreamRunner } from "./core/dream.js";
import { createProjectDetector } from "./core/project-detection.js";
import { createCommandHandler } from "./core/commands.js";
import { TOOLS, createToolExecutors } from "./tools/index.js";

export default async (pi: ExtensionAPI): Promise<void> => {
  // Load configuration
  const config = loadConfig();
  console.assert(config !== null, 'config must be loaded');

  // Initialize database
  const dbPath = path.join(os.homedir(), ".pi", "memory", "pi-learn.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = await createStore(dbPath);
  await store.init();

  // Initialize core components
  const reasoningEngine = createReasoningEngine(config);
  const contextAssembler = createContextAssembler(store);
  const runDream = createDreamRunner(store, contextAssembler, reasoningEngine, config.dream);
  const projectDetector = createProjectDetector(store, config.workspaceId);
  const commandHandler = createCommandHandler(store, contextAssembler, config, runDream);

  // Ensure default workspace and peers
  store.getOrCreateWorkspace(config.workspaceId, "Default Workspace");
  store.getOrCreatePeer(config.workspaceId, "user", "User", "user");
  store.getOrCreatePeer(config.workspaceId, "agent", "Agent", "agent");
  store.ensureGlobalWorkspace();
  store.ensureGlobalPeer("user", "User");
  store.ensureGlobalPeer("agent", "Agent");

  // Create tool executors
  const toolsConfig = { workspaceId: config.workspaceId, retention: config.retention, dream: config.dream };
  const executors = createToolExecutors({ store, contextAssembler, reasoningEngine, config: toolsConfig, runDream });

  // Register tools
  for (const [name, def] of Object.entries(TOOLS)) {
    const executor = executors[name as keyof typeof executors];
    if (!executor) continue;
    pi.registerTool({ name, label: def.label, description: def.description, parameters: def.params, execute: executor.execute });
  }

  // Register command
  pi.registerCommand("learn", { description: "Pi-learn memory management", handler: commandHandler });

  // Project detection
  let activeWorkspaceId = projectDetector.check();

  // Event handlers
  pi.on("session_start", async (_event, ctx) => {
    store.getOrCreateWorkspace(activeWorkspaceId);
    ctx.ui.notify("Pi-learn memory extension loaded", "info");
    activeWorkspaceId = projectDetector.check();
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (config.project.enabled && config.project.injectContext) {
      const snippet = projectDetector.createContextSnippet();
      return snippet ? { systemPrompt: `${event.systemPrompt}\n\n### Current Project Context\n${snippet}` } : {};
    }
    return {};
  });

  // Background services
  if (config.dream.enabled) {
    setTimeout(() => runDream(activeWorkspaceId).catch(console.error), 30000);
    setInterval(() => runDream(activeWorkspaceId).catch(console.error), config.dream.intervalMs);
  }

  // Retention scheduler
  setupRetentionScheduler(store, config.retention);
};
```

---

## Phase 2: Add Assertions (Priority: HIGH)

**Problem:** No `console.assert()` calls, violates NASA #5 (≥2 assertions/function).

### 2.1 Assertion Strategy

Add assertions to **every exported function**:

```typescript
// In each function:
console.assert(input !== null, 'input must not be null');
console.assert(Array.isArray(input), 'input must be array');
// ... more specific assertions
```

### 2.2 High-Priority Functions

| File | Function | Assertions Needed |
|------|----------|-------------------|
| `core/store.ts` | `init()` | 3 |
| `core/store.ts` | `saveMessage()` | 3 |
| `core/store.ts` | `saveConclusion()` | 4 |
| `core/reasoning.ts` | `dream()` | 3 |
| `core/reasoning.ts` | `reason()` | 3 |
| `core/context.ts` | `assembleContext()` | 3 |
| `core/project-detection.ts` | `detectProjectFromFiles()` | 2 |

### 2.3 Example: store.ts assertions

```typescript
async init(): Promise<void> {
  console.assert(this.dbPath !== null, 'dbPath must not be null');
  console.assert(typeof this.dbPath === 'string', 'dbPath must be string');
  console.assert(this.db === null, 'db should not be initialized twice');

  const SQL = await initSqlJs();
  console.assert(SQL !== null, 'SQL.js initialization failed');

  if (existsSync(this.dbPath)) {
    const buffer = readFileSync(this.dbPath);
    console.assert(buffer !== null, 'failed to read database file');
    this.db = new SQL.Database(buffer);
  } else {
    this.db = new SQL.Database();
  }
  // ...
}
```

---

## Phase 3: Encapsulate Mutable State (Priority: MEDIUM)

**Problem:** Module-level `let` variables violate NASA #6 and FP principles.

### 3.1 Current Issues

```typescript
// BAD - Module-level mutable state
let notifyCallback: NotifyCallback | null = null;
let activeWorkspaceId = config.workspaceId;
let lastDetectedProject: ... = null;
```

### 3.2 Solution: Closure/Context Pattern

```typescript
// GOOD - Encapsulated state
interface ExtensionState {
  activeWorkspaceId: string;
  notifyCallback: NotifyCallback | null;
}

function createExtensionState(initialWorkspaceId: string): ExtensionState {
  let workspaceId = initialWorkspaceId;
  let notify: NotifyCallback | null = null;

  return {
    get workspaceId() { return workspaceId; },
    set workspaceId(id: string) { 
      console.assert(id !== null, 'workspaceId must not be null');
      workspaceId = id; 
    },
    get notifyCallback() { return notify; },
    set notifyCallback(cb: NotifyCallback | null) { notify = cb; },
  };
}

// Usage:
const state = createExtensionState(config.workspaceId);

// In command handler:
state.notifyCallback = ctx.ui.notify.bind(ctx.ui);

// In event handlers:
const currentWorkspace = state.workspaceId;
```

### 3.3 Notify Callback Fix

Current:
```typescript
let notifyCallback: NotifyCallback | null = null;
const notify = (message: string, ...) => {
  if (notifyCallback) notifyCallback(message, type);
};
```

Better - use context callback directly:
```typescript
// In runDream, accept notify as parameter
async function runDream(workspaceId: string, notify: NotifyCallback): Promise<void> {
  // Use notify directly, no module-level state
}
```

---

## Phase 4: Other Compliance Fixes (Priority: LOW)

### 4.1 Conventional Directory Structure

Add empty conventional directories for future-proofing:

```bash
mkdir -p src/skills src/prompts src/themes
```

Or update `pi` manifest to explicitly declare paths:
```json
{
  "pi": {
    "extensions": ["./dist/index.mjs"],
    "skills": ["./skills"]
  }
}
```

### 4.2 Dynamic Memory Concerns

For `SQLiteStore`, acknowledge this is unavoidable with sql.js. Consider:

```typescript
// Pre-allocate buffer pool for frequent operations
const QUERY_CACHE_SIZE = 32;
const queryCache: Map<string, PreparedStatement> = new Map();
```

### 4.3 TypeScript Strict Mode

Recommend adding to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

---

## Implementation Order

| Phase | Task | Effort | Impact |
|-------|------|--------|--------|
| **1** | Extract `config.ts` | 1h | NASA #4 |
| **1** | Extract `dream.ts` | 2h | NASA #4 |
| **1** | Extract `project-detection.ts` | 1h | NASA #4 |
| **1** | Extract `commands.ts` | 1h | NASA #4 |
| **2** | Add assertions to store.ts | 2h | NASA #5 |
| **2** | Add assertions to reasoning.ts | 1h | NASA #5 |
| **2** | Add assertions to context.ts | 1h | NASA #5 |
| **3** | Encapsulate state in index.ts | 1h | FP/NASA #6 |
| **4** | Add conventional directories | 15min | pi-package |
| **4** | Strict TypeScript | 2h | NASA #10 |

**Total estimated: ~12-15 hours**

---

## Testing

After each phase:

```bash
bun run build                    # Verify compilation
bun test tests/fast-e2e.test.ts  # Run tests
```

Check for:
- No TypeScript errors
- No runtime errors
- All assertions pass
- Tests green
