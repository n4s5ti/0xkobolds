/**
 * Kobold Capability Interfaces
 * 
 * These interfaces define the "contracts" that different extensions in the
 * pi-kobold suite must implement to provide specific capabilities.
 * 
 * This allows components to be developed independently and bridged
 * dynamically at runtime.
 */

// =============================================================================
// Memory Capability
// =============================================================================

export interface MemoryQuery {
  query: string;
  topK?: number;
  minSimilarity?: number;
  scope?: 'project' | 'global' | 'blended';
}

export interface MemoryObservation {
  content: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  sessionId?: string;
  peerId?: string;
  metadata?: Record<string, any>;
}

/**
 * Standard interface for any memory provider (e.g., pi-learn)
 */
export interface IMemoryCapability {
  /** Search memory for relevant information */
  query(options: MemoryQuery): Promise<{ 
    results: Array<{ content: string; similarity: number; metadata: any }>;
    summary?: string;
  }>;

  /** Record a raw observation */
  observe(observation: MemoryObservation): Promise<{ success: boolean; id?: string }>;
  
  /** Retrieve the overall context for a specific peer/project */
  getContext(peerId?: string, scope?: 'project' | 'global'): Promise<string>;
}

// =============================================================================
// Execution Capability
// =============================================================================

import type { 
  OrchestrateOptions, 
  OrchestrateResult 
} from "./types.js";

/**
 * Standard interface for any execution provider (e.g., pi-orchestration)
 */
export interface IExecutionCapability {
  /** Execute a task using the optimal strategy (Adaptive/Auto) */
  orchestrate(options: OrchestrateOptions): Promise<OrchestrateResult>;
  
  /** Spawn a specific agent for a specific task */
  spawn(agent: string, task: string, options?: Partial<OrchestrateOptions>): Promise<OrchestrateResult>;
  
  /** Get the current status of running agents */
  getStatus(): Promise<any>;
}

// =============================================================================
// Capability Registry Types
// =============================================================================

export type CapabilityType = 'MEMORY' | 'EXECUTION' | 'RESEARCH' | 'RESEARCHER';

export interface CapabilityProvider {
  type: CapabilityType;
  instance: any;
  version: string;
}
