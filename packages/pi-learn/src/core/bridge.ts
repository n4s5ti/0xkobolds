/**
 * Memory Provider Interface
 * 
 * This defines the interface for memory capabilities that can be
 * registered in external systems. This standalone version doesn't
 * depend on pi-orchestration.
 */

import type { SQLiteStore } from "./store.js";
import type { ReasoningEngine } from "./reasoning.js";

export interface MemoryQuery {
  query: string;
  scope?: 'project' | 'global';
  topK?: number;
  peerId?: string;
}

export interface MemoryObservation {
  peerId?: string;
  aboutPeerId?: string;
  sessionId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface IMemoryCapability {
  query(options: MemoryQuery): Promise<{ 
    results: Array<{ content: string; similarity: number; metadata: unknown }>;
    summary?: string;
  }>;
  observe(obs: MemoryObservation): Promise<{ success: boolean; id?: string }>;
  getContext(peerId?: string, scope?: 'project' | 'global'): Promise<string>;
}

export class MemoryProvider implements IMemoryCapability {
  constructor(
    private store: SQLiteStore,
    private _reasoning: ReasoningEngine,
    private activeWorkspaceId: string
  ) {
    console.assert(store !== null, 'store must not be null');
    console.assert(activeWorkspaceId !== null, 'activeWorkspaceId must not be null');
  }

  /**
   * Search memory for relevant information using
   * a blend of keyword and semantic search.
   */
  async query(options: MemoryQuery): Promise<{ 
    results: Array<{ content: string; similarity: number; metadata: unknown }>;
    summary?: string;
  }> {
    console.assert(options !== null, 'options must not be null');
    console.assert(typeof options.query === 'string', 'query must be string');

    const workspaceId = options.scope === 'global' 
      ? '__global__' 
      : this.activeWorkspaceId;

    console.assert(workspaceId !== null, 'workspaceId must be determined');

    // 1. Get relevant conclusions (High-value insights)
    const conclusions = this.store.getAllConclusions(workspaceId);
    
    // 2. Get relevant observations (Raw data)
    const observations = this.store.getObservations(workspaceId, 'agent', 100);

    // Simple keyword filtering for this bridge implementation
    const queryLower = options.query.toLowerCase();
    const topK = options.topK || 10;
    console.assert(topK > 0, 'topK must be positive');

    const allMatches = [
      ...conclusions.map(c => ({ content: c.content, similarity: 1.0, metadata: c })),
      ...observations.map(o => ({ content: o.content, similarity: 0.8, metadata: o }))
    ].filter(item => item.content.toLowerCase().includes(queryLower))
     .sort((a, b) => b.similarity - a.similarity)
     .slice(0, topK);

    return {
      results: allMatches,
      summary: allMatches.length > 0 
        ? `Found ${allMatches.length} relevant memories regarding "${options.query}".` 
        : "No direct memories found for this task."
    };
  }

  /**
   * Record a raw observation into the store.
   */
  async observe(obs: MemoryObservation): Promise<{ success: boolean; id?: string }> {
    console.assert(obs !== null, 'obs must not be null');
    console.assert(typeof obs.content === 'string', 'obs.content must be string');
    console.assert(obs.role !== null, 'obs.role must not be null');

    const id = crypto.randomUUID();
    console.assert(id !== null, 'id must be generated');

    this.store.saveObservation({
      id,
      peerId: obs.peerId || 'agent',
      aboutPeerId: obs.metadata?.aboutPeerId as string | undefined,
      sessionId: obs.sessionId || 'system',
      workspaceId: this.activeWorkspaceId,
      role: obs.role,
      content: obs.content,
      createdAt: Date.now(),
      embedding: undefined,
      processed: false
    });

    return { success: true, id };
  }

  /**
   * Retrieve the general context for the current project.
   */
  async getContext(peerId?: string, scope?: 'project' | 'global'): Promise<string> {
    const workspaceId = scope === 'global' ? '__global__' : this.activeWorkspaceId;
    
    console.assert(workspaceId !== null, 'workspaceId must be determined');

    const conclusions = this.store.getAllConclusions(workspaceId, peerId || 'agent');
    
    if (conclusions.length === 0) return "No significant project context available.";
    
    return "Current Project Insights:\n" + 
      conclusions.map(c => `- ${c.content}`).join("\n");
  }
}
