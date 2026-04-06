/**
 * Depth Tracking Utilities
 * 
 * Tracks subagent nesting depth to prevent runaway spawning.
 * Enforces depth limits per agent type.
 */

import type { AgentType } from "../core/types.js";
import { DEFAULT_DEPTH_LIMITS } from "../core/types.js";

/**
 * Global depth tracker for the current session
 */
class DepthTracker {
  private currentDepth = 0;
  private maxAllowedDepth: number = Infinity;

  /**
   * Get current depth
   */
  getDepth(): number {
    return this.currentDepth;
  }

  /**
   * Increment depth and return new value
   */
  increment(): number {
    this.currentDepth++;
    return this.currentDepth;
  }

  /**
   * Decrement depth and return new value
   */
  decrement(): number {
    this.currentDepth = Math.max(0, this.currentDepth - 1);
    return this.currentDepth;
  }

  /**
   * Reset depth to zero
   */
  reset(): void {
    this.currentDepth = 0;
  }

  /**
   * Set maximum allowed depth
   */
  setMaxDepth(depth: number): void {
    this.maxAllowedDepth = depth;
  }

  /**
   * Get maximum allowed depth
   */
  getMaxDepth(): number {
    return this.maxAllowedDepth;
  }

  /**
   * Check if we can spawn at current depth for given agent type
   */
  canSpawn(agentType: AgentType): boolean {
    const agentLimit = DEFAULT_DEPTH_LIMITS[agentType];
    
    // Agent type has no limit (coordinator)
    if (agentLimit === Infinity) return true;
    
    // Check against both agent limit and global max
    const effectiveLimit = Math.min(agentLimit, this.maxAllowedDepth);
    
    return this.currentDepth < effectiveLimit;
  }

  /**
   * Get remaining depth allowance for an agent type
   */
  getRemainingDepth(agentType: AgentType): number {
    const agentLimit = DEFAULT_DEPTH_LIMITS[agentType];
    const effectiveLimit = Math.min(agentLimit, this.maxAllowedDepth);
    
    return Math.max(0, effectiveLimit - this.currentDepth);
  }
}

// Singleton instance
const depthTracker = new DepthTracker();

/**
 * Get the global depth tracker
 */
export function getDepthTracker(): DepthTracker {
  return depthTracker;
}

/**
 * Execute a function within a depth scope
 * Automatically increments before and decrements after
 */
export async function withDepth<T>(
  fn: () => Promise<T>
): Promise<T> {
  depthTracker.increment();
  try {
    return await fn();
  } finally {
    depthTracker.decrement();
  }
}

/**
 * Check if an agent can spawn at current depth
 */
export function canSpawn(agentType: AgentType): boolean {
  return depthTracker.canSpawn(agentType);
}

/**
 * Get current execution depth
 */
export function getCurrentDepth(): number {
  return depthTracker.getDepth();
}

/**
 * Reset depth tracking (for new session)
 */
export function resetDepth(): void {
  depthTracker.reset();
}

/**
 * Set maximum global depth
 */
export function setMaxDepth(depth: number): void {
  depthTracker.setMaxDepth(depth);
}

/**
 * Validation result for depth checks
 */
export interface DepthValidationResult {
  allowed: boolean;
  currentDepth: number;
  agentLimit: number;
  globalLimit: number;
  message?: string;
}

/**
 * Validate if an agent can spawn at current depth
 */
export function validateDepth(agentType: AgentType): DepthValidationResult {
  const currentDepth = depthTracker.getDepth();
  const agentLimit = DEFAULT_DEPTH_LIMITS[agentType];
  const globalLimit = depthTracker.getMaxDepth();
  const effectiveLimit = Math.min(agentLimit, globalLimit);
  
  const allowed = currentDepth < effectiveLimit;
  
  let message: string | undefined;
  if (!allowed) {
    if (agentLimit === 0) {
      message = `${agentType} agents cannot spawn subagents (depth limit: 0)`;
    } else if (currentDepth >= globalLimit) {
      message = `Maximum subagent depth reached (${currentDepth}/${globalLimit}). Complete your task directly.`;
    } else {
      message = `${agentType} has reached its depth limit (${currentDepth}/${agentLimit}).`;
    }
  }
  
  return {
    allowed,
    currentDepth,
    agentLimit,
    globalLimit,
    message,
  };
}

export default depthTracker;
