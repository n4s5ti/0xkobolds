/**
 * SkillPanel Component
 * 
 * Browse and manage hot-reloaded skills.
 * Shows skill description, risk level, and allows execution.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "@mariozechner/mini-lit";
import type { SerializableSkill } from "../../shared/api-types";

@customElement("skill-panel")
export class SkillPanel extends LitElement {
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

    .filter-input {
      width: 100%;
      padding: var(--spacing-sm);
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      color: var(--color-text-primary);
      font-size: 0.875rem;
      margin: var(--spacing-sm);
    }

    .filter-input:focus {
      outline: none;
      border-color: var(--color-accent);
    }

    .filter-input::placeholder {
      color: var(--color-text-muted);
    }

    .tabs {
      display: flex;
      padding: 0 var(--spacing-sm);
      gap: var(--spacing-xs);
    }

    .tab {
      flex: 1;
      padding: var(--spacing-sm);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--color-text-secondary);
      font-size: 0.75rem;
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .tab:hover {
      color: var(--color-text-primary);
    }

    .tab.active {
      color: var(--color-accent);
      border-bottom-color: var(--color-accent);
    }

    .skills-list {
      flex: 1;
      overflow: auto;
      padding: var(--spacing-sm);
    }

    .skill-item {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      margin-bottom: var(--spacing-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .skill-item:hover {
      border-color: var(--color-accent);
      background: var(--color-bg-tertiary);
    }

    .skill-icon {
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .skill-info {
      flex: 1;
      min-width: 0;
    }

    .skill-name {
      font-weight: 600;
      color: var(--color-text-primary);
      font-size: 0.875rem;
      margin-bottom: 2px;
    }

    .skill-desc {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .skill-risk {
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      flex-shrink: 0;
    }

    .skill-risk.safe {
      background: rgba(34, 197, 94, 0.2);
      color: var(--color-success);
    }

    .skill-risk.medium {
      background: rgba(245, 158, 11, 0.2);
      color: var(--color-warning);
    }

    .skill-risk.high {
      background: rgba(239, 68, 68, 0.2);
      color: var(--color-error);
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-xl);
      text-align: center;
    }

    .empty-icon {
      font-size: 2rem;
      margin-bottom: var(--spacing-sm);
      opacity: 0.3;
    }

    .empty-text {
      color: var(--color-text-muted);
      font-size: 0.875rem;
    }

    .section-title {
      font-size: 0.625rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
      padding: var(--spacing-sm) var(--spacing-md);
    }
  `;

  @state()
  private skills: SerializableSkill[] = [];

  @state()
  private filter = '';

  @state()
  private activeTab: 'all' | 'safe' | 'medium' | 'high' = 'all';

  @state()
  private isLoading = true;

  private unsubscribe?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.loadSkills();
    this.subscribeToReload();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
  }

  private async loadSkills() {
    try {
      this.isLoading = true;
      this.skills = await window.koboldAPI.skills.list();
    } catch (err) {
      console.error('[SkillPanel] Failed to load skills:', err);
      // Fallback to demo skills
      this.skills = [
        { name: 'file_operations', description: 'Read and write files to the filesystem', risk: 'medium' },
        { name: 'shell', description: 'Execute shell commands', risk: 'high' },
        { name: 'web_search', description: 'Search the web for information', risk: 'safe' },
        { name: 'spawn_subagent', description: 'Spawn a subagent to handle a task', risk: 'medium' },
      ];
    } finally {
      this.isLoading = false;
    }
  }

  private subscribeToReload() {
    this.unsubscribe = window.koboldAPI.skills.onReload((newSkills) => {
      this.skills = newSkills;
    });
  }

  private get filteredSkills(): SerializableSkill[] {
    let result = this.skills;

    // Filter by tab
    if (this.activeTab !== 'all') {
      result = result.filter(s => s.risk === this.activeTab);
    }

    // Filter by search
    if (this.filter) {
      const lower = this.filter.toLowerCase();
      result = result.filter(s => 
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower)
      );
    }

    return result;
  }

  private getRiskIcon(risk: string): string {
    switch (risk) {
      case 'safe': return '✅';
      case 'medium': return '⚠️';
      case 'high': return '🚨';
      default: return '❓';
    }
  }

  private async executeSkill(skill: SerializableSkill) {
    console.log('[SkillPanel] Execute skill:', skill.name);
    
    // Open skill execution dialog
    // For now, just log it
    try {
      const result = await window.koboldAPI.skills.execute(skill.name, {});
      console.log('[SkillPanel] Result:', result);
    } catch (err) {
      console.error('[SkillPanel] Execution failed:', err);
    }
  }

  render() {
    return html`
      <div class="header">
        <span class="title">Skills (${this.skills.length})</span>
      </div>

      <input 
        class="filter-input"
        type="text"
        placeholder="Filter skills..."
        .value=${this.filter}
        @input=${(e: InputEvent) => this.filter = (e.target as HTMLInputElement).value}
      />

      <div class="tabs">
        <button 
          class="tab ${this.activeTab === 'all' ? 'active' : ''}"
          @click=${() => this.activeTab = 'all'}
        >
          All
        </button>
        <button 
          class="tab ${this.activeTab === 'safe' ? 'active' : ''}"
          @click=${() => this.activeTab = 'safe'}
        >
          ✅ Safe
        </button>
        <button 
          class="tab ${this.activeTab === 'medium' ? 'active' : ''}"
          @click=${() => this.activeTab = 'medium'}
        >
          ⚠️ Medium
        </button>
        <button 
          class="tab ${this.activeTab === 'high' ? 'active' : ''}"
          @click=${() => this.activeTab = 'high'}
        >
          🚨 High
        </button>
      </div>

      <div class="skills-list">
        ${this.isLoading ? html`
          <div class="empty">
            <div class="empty-icon">⏳</div>
            <div class="empty-text">Loading skills...</div>
          </div>
        ` : this.filteredSkills.length === 0 ? html`
          <div class="empty">
            <div class="empty-icon">🔍</div>
            <div class="empty-text">No skills found</div>
          </div>
        ` : this.filteredSkills.map(skill => html`
          <div class="skill-item" @click=${() => this.executeSkill(skill)}>
            <div class="skill-icon">${this.getRiskIcon(skill.risk)}</div>
            <div class="skill-info">
              <div class="skill-name">${skill.name}</div>
              <div class="skill-desc">${skill.description}</div>
            </div>
            <div class="skill-risk ${skill.risk}">${skill.risk}</div>
          </div>
        `)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'skill-panel': SkillPanel;
  }
}
