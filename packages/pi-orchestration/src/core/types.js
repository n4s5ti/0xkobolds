/**
 * Core Types for pi-orchestration
 *
 * Defines all TypeScript interfaces and types used throughout the package.
 */
// =============================================================================
// Constants
// =============================================================================
export const DEFAULT_DEPTH_LIMITS = {
    scout: 0,
    specialist: 1,
    worker: 1,
    reviewer: 0,
    coordinator: Infinity,
};
export const DEFAULT_RESOURCE_LIMITS = {
    maxConcurrentSubagents: 8,
    maxParallelTasks: 16,
    maxChainSteps: 20,
    maxOutputTokens: 100000,
    maxRuntimeMs: 300000, // 5 minutes
};
export const DEFAULT_DEFAULTS = {
    isolation: {
        type: "none",
        diffOnComplete: true,
        autoApply: false,
    },
    async: false,
    timeout: 300000,
    context: "fresh",
};
//# sourceMappingURL=types.js.map