/**
 * Command Handler Module for pi-learn
 * Handles /learn commands and UI notifications
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { SQLiteStore } from "./store.js";
import type { ContextAssembler } from "./context.js";
import type { Config } from "./config.js";
import { getCurrentProjectInfo } from "./project-integration.js";

// ============================================================================
// TYPES
// ============================================================================

export interface CommandContext {
  store: SQLiteStore;
  contextAssembler: ContextAssembler;
  config: Config;
  getActiveWorkspaceId: () => string;
  runDream: (
    scope?: "user" | "project",
    notify?: (message: string, type?: "info" | "warning" | "error") => void
  ) => Promise<{ userScopeCount: number; projectScopeCount: number; totalConclusions: number }>;
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createCommandHandler(context: CommandContext) {
  // Validate inputs
  console.assert(context !== null, 'context must not be null');
  console.assert(context.store !== null, 'store must not be null');
  console.assert(context.contextAssembler !== null, 'contextAssembler must not be null');
  console.assert(context.config !== null, 'config must not be null');
  console.assert(typeof context.getActiveWorkspaceId === 'function', 'getActiveWorkspaceId must be function');
  console.assert(typeof context.runDream === 'function', 'runDream must be function');

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  function getMemoryStats(workspaceId: string) {
    console.assert(context.contextAssembler !== null, 'contextAssembler must not be null');
    console.assert(typeof workspaceId === 'string', 'workspaceId must be string');
    return context.contextAssembler.getMemoryStats(workspaceId, "user");
  }

  function assembleContext(workspaceId: string) {
    console.assert(context.contextAssembler !== null, 'contextAssembler must not be null');
    console.assert(typeof workspaceId === 'string', 'workspaceId must be string');
    return context.contextAssembler.assembleContext(workspaceId, "user");
  }

  function pruneData() {
    console.assert(context.store !== null, 'store must not be null');
    console.assert(context.config !== null, 'config must not be null');
    return context.store.prune(
      context.config.retention.retentionDays,
      context.config.retention.summaryRetentionDays,
      context.config.retention.conclusionRetentionDays
    );
  }

  // ============================================================================
  // COMMAND HANDLER
  // ============================================================================

  return async function handleLearnCommand(
    args: string,
    ctx: ExtensionContext
  ): Promise<void> {
    console.assert(typeof args === 'string', 'args must be string');
    console.assert(ctx !== null, 'ctx must not be null');
    console.assert(ctx.ui !== null, 'ctx.ui must not be null');

    const trimmedArgs = args.trim();
    if (!trimmedArgs) {
      ctx.ui.notify(
        "Commands: status, project, context, dream, dream-status, prune, search <query>, sessions",
        "info"
      );
      return;
    }

    const [sub, ...rest] = trimmedArgs.split(/\s+/);
    const subArgs = rest.join(" ");
    const workspaceId = context.getActiveWorkspaceId();

    console.assert(typeof workspaceId === 'string', 'workspaceId must be string');

    switch (sub) {
      case "status": {
        const stats = getMemoryStats(workspaceId);
        ctx.ui.notify(
          `Memory Status: ${stats.conclusionCount} conclusions, ${stats.summaryCount} summaries`,
          "info"
        );
        return;
      }

      case "project": {
        const project = getCurrentProjectInfo();
        if (project) {
          ctx.ui.notify(
            `Active Project\nName: ${project.name}\nID: ${project.id}\nPath: ${project.path}`,
            "info"
          );
        } else {
          ctx.ui.notify(`No active project detected`, "info");
        }
        return;
      }

      case "context": {
        const assembledCtx = assembleContext(workspaceId);
        ctx.ui.notify(assembledCtx || "No context available", "info");
        return;
      }

      case "dream": {
        const scope = subArgs === "user" ? "user" : "project";
        
        ctx.ui.setStatus("learn", "Dreaming...");
        const result = await context.runDream(scope, ctx.ui.notify.bind(ctx.ui));
        ctx.ui.notify(
          `Dream complete: ${result.userScopeCount} user, ${result.projectScopeCount} project`,
          "info"
        );
        return;
      }

      case "dream-status": {
        const dreamMeta = context.store.getDreamMetadata(workspaceId);
        const messages = context.store.getRecentMessages(workspaceId, "user", 1000);
        const messagesSinceLastDream = messages.filter((m: any) => m.created_at > dreamMeta.lastDreamedAt).length;
        const lastDreamFormatted = dreamMeta.lastDreamedAt > 0
          ? new Date(dreamMeta.lastDreamedAt).toLocaleString()
          : "Never";
        const nextDreamMs = dreamMeta.lastDreamedAt > 0
          ? Math.max(0, (dreamMeta.lastDreamedAt + context.config.dream.intervalMs) - Date.now())
          : 0;

        ctx.ui.notify(
          `Dream Status\nEnabled: ${context.config.dream.enabled}\nLast Dream: ${lastDreamFormatted}\nTotal Dreams: ${dreamMeta.dreamCount}\nMessages Since: ${messagesSinceLastDream}\nNext In: ${nextDreamMs > 0 ? Math.ceil(nextDreamMs / 60000) + " min" : "Ready now"}`,
          "info"
        );
        return;
      }

      case "prune": {
        const result = pruneData();
        ctx.ui.notify(`Pruned ${result.deleted} records`, "info");
        return;
      }

      case "search": {
        if (!subArgs) {
          ctx.ui.notify("Usage: /learn search <query>", "info");
          return;
        }

        const results = context.store.searchSessions(workspaceId, subArgs, 5);
        if (results.length === 0) {
          ctx.ui.notify("No results found", "info");
          return;
        }

        const formatted = results.map((r: any, i: number) => `${i + 1}. ${r.snippet}`).join("\n");
        ctx.ui.notify(formatted, "info");
        return;
      }

      case "sessions": {
        const sessions = context.store.getAllSessions(workspaceId);
        if (sessions.length === 0) {
          ctx.ui.notify("No sessions", "info");
          return;
        }

        const formatted = sessions.slice(0, 10).map((s: any, i: number) => `${i + 1}. ${s.id}`).join("\n");
        ctx.ui.notify(formatted, "info");
        return;
      }

      default: {
        ctx.ui.notify(
          "Commands: status, project, context, dream, dream-status, prune, search <query>, sessions",
          "info"
        );
        return;
      }
    }
  };
}
