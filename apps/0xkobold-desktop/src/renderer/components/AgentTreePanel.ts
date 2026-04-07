/**
 * AgentTreePanel Component
 * 
 * Displays the hierarchical agent tree from pi-orchestration.
 * Real-time updates via IPC from main process.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "../utils/safe-custom-element";
import type { SerializableAgentNode } from "../../shared/api-types";

@customElement("agent-tree-panel")
export class AgentTreePanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-sm) var(--spacing-md);
      border-bottom: 1px solid var(--sidebar-border);
    }

    .title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .spawn-btn {
      background: transparent;
      border: 1px solid var(--color-accent);
      color: var(--color-accent);
      border-radius: var(--radius-sm);
      padding: 2px 8px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .spawn-btn:hover {
      background: var(--color-accent);
      color: var(--color-bg-primary);
    }

    .tree {
      flex: 1;
      overflow: auto;
      padding: var(--spacing-sm);
    }

    .node {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .node:hover {
      background: var(--color-bg-tertiary);
    }

    .node-indent {
      display: inline-block;
      width: 16px;
    }

    .node-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .node-status.running {
      background: var(--color-success);
      box-shadow: 0 0 6px var(--color-success);
    }

    .node-status.idle {
      background: var(--color-text-muted);
    }

    .node-status.completed {
      background: var(--color-accent);
    }

    .node-status.error {
      background: var(--color-error);
    }

    .node-status.compacting {
      background: var(--color-warning);
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .node-info {
      flex: 1;
      min-width: 0;
    }

    .node-name {
      font-size: 0.875rem;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .node-task {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .node-meta {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      font-size: 0.625rem;
      color: var(--color-text-muted);
    }

    .node-type {
      padding: 1px 4px;
      background: var(--color-bg-tertiary);
      border-radius: 2px;
      text-transform: uppercase;
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: var(--spacing-xl);
      text-align: center;
    }

    .empty-icon {
      font-size: 3rem;
      margin-bottom: var(--spacing-md);
      opacity: 0.3;
    }

    .empty-text {
      color: var(--color-text-muted);
      font-size: 0.875rem;
    }

    .children {
      margin-left: var(--spacing-md);
      border-left: 1px solid var(--sidebar-border);
      padding-left: var(--spacing-sm);
    }
  `;

  @state()
  private declare tree: SerializableAgentNode[];

  @state()
  private declare expandedNodes: Set<string>;

  private unsubscribe?: () => void;

  constructor() {
    super();
    this.tree = [];
    this.expandedNodes = new Set();
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadTree();
    this.subscribeToUpdates();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  private async loadTree() {
    try {
      this.tree = await window.koboldAPI.agentTree.getTree();
    } catch (err) {
      console.error("[AgentTreePanel] Failed to load tree:", err);
    }
  }

  private subscribeToUpdates() {
    this.unsubscribe = window.koboldAPI.agentTree.onUpdate((newTree) => {
      this.tree = newTree;
    });
  }

  private toggleNode(id: string) {
    if (this.expandedNodes.has(id)) {
      this.expandedNodes.delete(id);
    } else {
      this.expandedNodes.add(id);
    }
    this.requestUpdate();
  }

  private async spawnAgent() {
    // TODO: Open spawn dialog
    const task = prompt("Enter task for new agent:");
    if (task) {
      try {
        await window.koboldAPI.agentTree.spawn(task);
        await this.loadTree();
      } catch (err) {
        console.error("[AgentTreePanel] Spawn failed:", err);
      }
    }
  }

  private async killAgent(id: string) {
    if (confirm("Kill this agent?")) {
      try {
        await window.koboldAPI.agentTree.kill(id);
        await this.loadTree();
      } catch (err) {
        console.error("[AgentTreePanel] Kill failed:", err);
      }
    }
  }

  private formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  render() {
    if (this.tree.length === 0) {
      return html`
        <div class="header">
          <span class="title">Agents</span>
          <button class="spawn-btn" @click=${this.spawnAgent}>+ Spawn</button>
        </div>
        <div class="empty">
          <div class="empty-icon">🤖</div>
          <div class="empty-text">No active agents</div>
        </div>
      `;
    }

    return html`
      <div class="header">
        <span class="title">Agents (${this.tree.length})</span>
        <button class="spawn-btn" @click=${this.spawnAgent}>+ Spawn</button>
      </div>
      <div class="tree">
        ${this.tree.map(node => this.renderNode(node))}
      </div>
    `;
  }

  private renderNode(node: SerializableAgentNode) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = this.expandedNodes.has(node.id);

    return html`
      <div 
        class="node" 
        @click=${() => this.toggleNode(node.id)}
        @contextmenu=${(e: MouseEvent) => {
          e.preventDefault();
          this.killAgent(node.id);
        }}
      >
        ${hasChildren ? html`
          <span class="node-indent">
            ${isExpanded ? '▼' : '▶'}
          </span>
        ` : html`<span class="node-indent"></span>`}
        
        <div class="node-status ${node.status}"></div>
        
        <div class="node-info">
          <div class="node-name">${node.name}</div>
          ${node.task ? html`<div class="node-task">${node.task}</div>` : ''}
        </div>
        
        <div class="node-meta">
          <span class="node-type">${node.type}</span>
          <span>${this.formatTime(node.spawnedAt)}</span>
        </div>
      </div>
      
      ${hasChildren && isExpanded ? html`
        <div class="children">
          ${node.children.map(childId => {
            const child = this.tree.find(n => n.id === childId);
            return child ? this.renderNode(child) : '';
          })}
        </div>
      ` : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'agent-tree-panel': AgentTreePanel;
  }
}
