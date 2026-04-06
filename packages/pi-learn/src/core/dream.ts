/**
 * Dream Runner Module for pi-learn
 * Handles periodic reasoning/dream cycles
 */

import type { SQLiteStore } from "./store.js";
import type { ContextAssembler } from "./context.js";
import type { ReasoningEngine } from "./reasoning.js";
import type { Conclusion, PeerCard } from "../shared.js";
import type { Config } from "./config.js";

// ============================================================================
// TYPES
// ============================================================================

export interface DreamResult {
  userScopeCount: number;
  projectScopeCount: number;
  totalConclusions: number;
}

export interface DreamContext {
  globalConclusions: Conclusion[];
  localConclusions: Conclusion[];
  globalPeerCard?: PeerCard;
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createDreamRunner(
  store: SQLiteStore,
  contextAssembler: ContextAssembler,
  reasoningEngine: ReasoningEngine,
  config: Config['dream'],
  defaultWorkspaceId: string,
  getActiveWorkspaceId?: () => string
) {
  // Validate inputs
  console.assert(store !== null, 'store must not be null');
  console.assert(store !== undefined, 'store must not be undefined');
  console.assert(contextAssembler !== null, 'contextAssembler must not be null');
  console.assert(contextAssembler !== undefined, 'contextAssembler must not be undefined');
  console.assert(reasoningEngine !== null, 'reasoningEngine must not be null');
  console.assert(reasoningEngine !== undefined, 'reasoningEngine must not be undefined');
  console.assert(config !== null, 'config must not be null');
  console.assert(config !== undefined, 'config must not be undefined');
  console.assert(typeof defaultWorkspaceId === 'string', 'defaultWorkspaceId must be string');

  // ============================================================================
  // DREAM RUNNER
  // ============================================================================

  return async function runDream(
    scope: "user" | "project" = "project",
    notify?: (message: string, type?: "info" | "warning" | "error") => void
  ): Promise<DreamResult> {
    console.assert(store !== null, 'store must not be null in runDream');
    console.assert(typeof scope === 'string', 'scope must be string');
    console.assert(scope === 'user' || scope === 'project', 'scope must be user or project');

    // Determine workspace ID from callback or default
    const workspaceId = getActiveWorkspaceId ? getActiveWorkspaceId() : defaultWorkspaceId;
    console.assert(workspaceId !== null, 'workspaceId must be determined');
    console.assert(typeof workspaceId === 'string', 'workspaceId must be string');

    // Check if dreaming is enabled
    if (!config.enabled) {
      console.assert(true, 'dreaming disabled, returning early');
      return { userScopeCount: 0, projectScopeCount: 0, totalConclusions: 0 };
    }

    // Validate batch size
    console.assert(config.batchSize > 0, 'batchSize must be positive');
    console.assert(config.batchSize <= 10000, 'batchSize must be reasonable (<10000)');

    // Get recent messages for dreaming
    const messages = store.getRecentMessages(workspaceId, "user", config.batchSize);
    console.assert(Array.isArray(messages), 'messages must be array');

    // Check minimum messages threshold
    const dreamMeta = store.getDreamMetadata(workspaceId);
    const messagesSinceLastDream = dreamMeta.lastDreamedAt > 0
      ? messages.filter((m: any) => m.created_at > dreamMeta.lastDreamedAt).length
      : messages.length;

    if (messagesSinceLastDream < config.minMessagesSinceLastDream) {
      console.assert(true, 'not enough messages since last dream');
      return { userScopeCount: 0, projectScopeCount: 0, totalConclusions: 0 };
    }

    // Get blended context for informed reasoning
    const blended = contextAssembler.getBlendedContext(workspaceId, "user");
    console.assert(blended !== null, 'blended context must not be null');

    // Build reasoning context
    const reasoningContext: DreamContext = {
      globalConclusions: blended.global?.conclusions || [],
      localConclusions: blended.project?.conclusions || [],
      globalPeerCard: blended.global?.peerCard || undefined,
    };

    console.assert(Array.isArray(reasoningContext.globalConclusions), 'globalConclusions must be array');
    console.assert(Array.isArray(reasoningContext.localConclusions), 'localConclusions must be array');

    // Run dream with context and let the model decide scope
    const result = await reasoningEngine.dream(
      messages.map((m: any) => ({ role: m.role, content: m.content })),
      blended.blendedConclusions || [],
      reasoningContext
    );

    console.assert(result !== null, 'dream result must not be null');
    console.assert(Array.isArray(result.newConclusions), 'newConclusions must be array');

    // Process conclusions
    let userScopeCount = 0;
    let projectScopeCount = 0;

    for (const c of result.newConclusions) {
      // Validate conclusion
      console.assert(c.content !== null, 'conclusion content must not be null');
      console.assert(typeof c.content === 'string', 'conclusion content must be string');
      console.assert(c.type !== null, 'conclusion type must not be null');

      // Use the scope assigned by the reasoning model
      const conclusionScope = c.scope || scope;
      console.assert(conclusionScope === 'user' || conclusionScope === 'project', 'conclusionScope must be valid');

      // Determine which workspace to save to based on scope
      const conclusionWorkspaceId = conclusionScope === "user" 
        ? "__global__" 
        : workspaceId;

      // Validate confidence if provided
      if (c.confidence !== undefined) {
        console.assert(c.confidence >= 0 && c.confidence <= 1, 'confidence must be 0-1');
      }

      // Save conclusion
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

      // Track scope distribution
      if (conclusionScope === "user") {
        userScopeCount++;
      } else {
        projectScopeCount++;
      }
    }

    // Track dream metadata
    store.updateDreamMetadata(workspaceId, messages.length, result.newConclusions.length);

    // Notify about dream completion
    if (result.newConclusions.length > 0 && notify) {
      notify(
        `Dream complete: ${userScopeCount} user-scope, ${projectScopeCount} project-scope conclusions`,
        "info"
      );
    }

    return {
      userScopeCount,
      projectScopeCount,
      totalConclusions: result.newConclusions.length,
    };
  };
}

// ============================================================================
// DREAM SCHEDULER
// ============================================================================

export interface DreamScheduler {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

export function createDreamScheduler(
  runDream: (
    scope?: "user" | "project",
    notify?: (message: string, type?: "info" | "warning" | "error") => void
  ) => Promise<DreamResult>,
  config: Config['dream'],
  notify?: (message: string, type?: "info" | "warning" | "error") => void
): DreamScheduler {
  // Validate inputs
  console.assert(runDream !== null, 'runDream must not be null');
  console.assert(config !== null, 'config must not be null');
  console.assert(typeof config.enabled === 'boolean', 'config.enabled must be boolean');
  console.assert(config.intervalMs > 0, 'intervalMs must be positive');

  let running = false;
  let intervalId: NodeJS.Timeout | null = null;

  return {
    start() {
      console.assert(!running, 'scheduler should not already be running');

      if (!config.enabled) {
        console.assert(true, 'dreaming disabled, not starting scheduler');
        return;
      }

      running = true;

      // Initial dream after startup delay
      setTimeout(() => {
        if (running) {
          runDream("project", notify).catch(console.error);
        }
      }, 30000);

      // Recurring dreams
      intervalId = setInterval(() => {
        if (running) {
          runDream("project", notify).catch(console.error);
        }
      }, config.intervalMs);

      console.assert(running === true, 'scheduler should be running after start');
    },

    stop() {
      console.assert(running === true, 'scheduler should be running when stopping');

      running = false;

      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      console.assert(running === false, 'scheduler should not be running after stop');
    },

    isRunning() {
      return running;
    },
  };
}
