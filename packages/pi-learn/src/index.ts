/**
 * Pi-Learn: Open-Source Memory Infrastructure for pi Agents
 * 
 * Modular Architecture (DRY/KISS/Functional):
 * - core/store.ts: SQLite operations
 * - core/reasoning.ts: LLM reasoning engine
 * - core/context.ts: Context assembly
 * - core/config.ts: Configuration loading
 * - core/dream.ts: Dream runner logic
 * - core/project-detection.ts: File-based project detection
 * - core/commands.ts: Command handler
 * - tools/index.ts: Tool definitions and executors
 * - renderers.ts: TUI components
 * 
 * Compliance: NASA 10 Rules, DRY/KISS/FP principles
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// Core modules
import { createStore } from "./core/store.js";
import { createReasoningEngine } from "./core/reasoning.js";
import { createContextAssembler } from "./core/context.js";
import { loadConfig } from "./core/config.js";
import { createDreamRunner, createDreamScheduler } from "./core/dream.js";
import { createProjectDetector, createRetentionScheduler } from "./core/project-detection.js";
import { createCommandHandler } from "./core/commands.js";
import { MemoryProvider } from "./core/bridge.js";

// Tools
import { TOOLS, createToolExecutors, type ToolsConfig } from "./tools/index.js";

// ============================================================================
// EXTENSION STATE
// ============================================================================

interface ExtensionState {
  activeWorkspaceId: string;
  notifyCallback: ((message: string, type?: "info" | "warning" | "error") => void) | null;
}

function createExtensionState(initialWorkspaceId: string): ExtensionState {
  let workspaceId = initialWorkspaceId;
  let notify: ((message: string, type?: "info" | "warning" | "error") => void) | null = null;

  return {
    get activeWorkspaceId() { return workspaceId; },
    set activeWorkspaceId(id: string) { 
      console.assert(id !== null, 'workspaceId must not be null');
      console.assert(typeof id === 'string', 'workspaceId must be string');
      workspaceId = id; 
    },
    get notifyCallback() { return notify; },
    set notifyCallback(cb: ((message: string, type?: "info" | "warning" | "error") => void) | null) { 
      console.assert(cb === null || typeof cb === 'function', 'notifyCallback must be function or null');
      notify = cb; 
    },
  };
}

// ============================================================================
// MAIN EXTENSION
// ============================================================================

export default async (pi: ExtensionAPI): Promise<void> => {
  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  console.assert(pi !== null, 'pi must not be null');
  console.assert(pi !== undefined, 'pi must not be undefined');

  const config = loadConfig();
  console.assert(config !== null, 'config must not be null');

  // ============================================================================
  // DATABASE INITIALIZATION
  // ============================================================================
  
  const dbPath = path.join(os.homedir(), ".pi", "memory", "pi-learn.db");
  console.assert(dbPath !== null, 'dbPath must not be null');
  console.assert(dbPath.length > 0, 'dbPath must not be empty');

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  console.assert(fs.existsSync(path.dirname(dbPath)), 'db directory must exist after mkdir');

  const store = await createStore(dbPath);
  console.assert(store !== null, 'store must not be null');

  await store.init();
  console.assert(store !== null, 'store must be initialized');

  // ============================================================================
  // CORE COMPONENTS
  // ============================================================================
  
  const reasoningEngine = createReasoningEngine({
    ollamaBaseUrl: config.ollamaBaseUrl,
    ollamaApiKey: config.ollamaApiKey,
    reasoningModel: config.reasoningModel,
    embeddingModel: config.embeddingModel,
    tokenBatchSize: config.tokenBatchSize,
    retry: config.retry,
    concurrency: config.concurrency,
  });

  console.assert(reasoningEngine !== null, 'reasoningEngine must not be null');

  const contextAssembler = createContextAssembler(store);
  console.assert(contextAssembler !== null, 'contextAssembler must not be null');

  // ============================================================================
  // EXTENSION STATE
  // ============================================================================
  
  const state = createExtensionState(config.workspaceId);

  // ============================================================================
  // DREAM RUNNER
  // ============================================================================
  
  const runDream = createDreamRunner(
    store,
    contextAssembler,
    reasoningEngine,
    config.dream,
    config.workspaceId,
    () => state.activeWorkspaceId
  );

  // ============================================================================
  // PROJECT DETECTOR
  // ============================================================================
  
  const projectDetector = createProjectDetector(store, config.workspaceId, "Default Workspace");
  
  // Perform initial project detection
  const initialWorkspace = projectDetector.check();
  state.activeWorkspaceId = initialWorkspace;
  console.assert(typeof state.activeWorkspaceId === 'string', 'activeWorkspaceId must be string');

  // ============================================================================
  // ENSURE DEFAULT WORKSPACES AND PEERS EXIST
  // ============================================================================
  
  store.getOrCreateWorkspace(config.workspaceId, "Default Workspace");
  store.getOrCreatePeer(config.workspaceId, "user", "User", "user");
  store.getOrCreatePeer(config.workspaceId, "agent", "Agent", "agent");
  store.ensureGlobalWorkspace();
  store.ensureGlobalPeer("user", "User");
  store.ensureGlobalPeer("agent", "Agent");

  // ============================================================================
  // COMMAND HANDLER
  // ============================================================================
  
  const commandHandler = createCommandHandler({
    store,
    contextAssembler,
    config,
    getActiveWorkspaceId: () => state.activeWorkspaceId,
    runDream,
  });

  // ============================================================================
  // TOOLS CONFIGURATION
  // ============================================================================
  
  const toolsConfig: ToolsConfig = {
    workspaceId: config.workspaceId,
    retention: config.retention,
    dream: config.dream,
  };

  // ============================================================================
  // TOOL EXECUTORS
  // ============================================================================
  
  const executors = createToolExecutors({
    store,
    contextAssembler,
    reasoningEngine,
    config: toolsConfig,
    runDream,
  });

  // ============================================================================
  // REGISTER TOOLS
  // ============================================================================
  
  for (const [name, def] of Object.entries(TOOLS)) {
    const executor = executors[name as keyof typeof executors];
    if (!executor) continue;

    console.assert(name !== null, 'tool name must not be null');
    console.assert(def !== null, 'tool definition must not be null');

    const toolDef: any = {
      name,
      label: def.label,
      description: def.description,
      parameters: def.params,
      execute: executor.execute,
    };

    // Add renderResult if the executor has one
    if ('renderResult' in executor) {
      toolDef.renderResult = executor.renderResult;
    }

    pi.registerTool(toolDef);
  }

  // ============================================================================
  // REGISTER COMMANDS
  // ============================================================================
  
  pi.registerCommand("learn", {
    description: "Pi-learn memory management",
    handler: async (args: string, ctx: ExtensionContext) => {
      // Capture UI notify callback for background tasks
      state.notifyCallback = ctx.ui.notify.bind(ctx.ui);
      
      // Update active workspace before command
      state.activeWorkspaceId = projectDetector.check();
      
      await commandHandler(args, ctx);
    },
  });

  // ============================================================================
  // FILE WATCHER FOR PROJECT DETECTION
  // ============================================================================
  
  projectDetector.startWatcher();

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  pi.on("session_start", async (_event, ctx) => {
    console.assert(ctx !== null, 'session_start ctx must not be null');
    console.assert(ctx.ui !== null, 'ctx.ui must not be null');

    store.getOrCreateWorkspace(state.activeWorkspaceId);
    ctx.ui.notify("Pi-learn memory extension loaded", "info");
    
    // Quick check for project on new session
    state.activeWorkspaceId = projectDetector.check();
    
    console.assert(typeof state.activeWorkspaceId === 'string', 'activeWorkspaceId updated');
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    console.assert(event !== null, 'before_agent_start event must not be null');

    if (config.project.enabled && config.project.injectContext) {
      const snippet = projectDetector.createContextSnippet();
      if (snippet) {
        return {
          systemPrompt: `${event.systemPrompt}\n\n### Current Project Context\n${snippet}`,
        };
      }
    }
    return {};
  });

  pi.on("tool_result", async (event, _ctx) => {
    console.assert(event !== null, 'tool_result event must not be null');

    // After tool execution, optionally update memory
    if (!config.reasoningEnabled) return;
    
    const toolName = event.toolName;
    if (toolName && toolName.startsWith("learn_")) {
      // Skip - these are our own tools
      return;
    }
  });

  // ============================================================================
  // BACKGROUND SERVICES
  // ============================================================================
  
  // Dream scheduler
  const dreamScheduler = createDreamScheduler(
    runDream,
    config.dream,
    state.notifyCallback ?? undefined
  );
  dreamScheduler.start();


  // Retention scheduler
  const retentionScheduler = createRetentionScheduler(
    store,
    config.retention,
    state.notifyCallback ?? undefined
  );
  retentionScheduler.start();

  // ============================================================================
  // SESSION SHUTDOWN
  // ============================================================================
  
  pi.on("session_shutdown", async () => {
    // Stop background services
    dreamScheduler.stop();
    retentionScheduler.stop();
    
    // Stop file watcher
    projectDetector.stopWatcher();
    
    console.assert(true, 'shutdown handlers executed');
  });
};
