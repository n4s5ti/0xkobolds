/**
 * AgentTreeStore
 * 
 * Manages the hierarchical agent tree state for orchestration.
 */

import { state } from "@mariozechner/mini-lit";
import type { SerializableAgentNode } from "../shared/api-types";

export class AgentTreeStore {
  @state()
  public tree: SerializableAgentNode[] = [];

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    try {
      this.tree = await window.koboldAPI.agentTree.getTree();
    } catch (err) {
      console.error("[AgentTreeStore] Failed to load agent tree:", err);
    }
  }

  /**
   * Update tree from main process events
   */
  updateTree(newTree: SerializableAgentNode[]): void {
    this.tree = newTree;
  }
}
