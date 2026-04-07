/**
 * Sidebar Component — t3.chat inspired
 * 
 * Contains:
 * - Model selector at top
 * - Session/conversation list (scrollable)
 * - New Chat button prominently placed
 * - Settings at bottom
 *
 * Darker than the main area, warm muted text colors.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "../utils/safe-custom-element";
import "./AgentTreePanel";
import "./SkillPanel";

@customElement("kobold-sidebar")
export class Sidebar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--sidebar-bg);
      color: var(--color-text-secondary);
    }

    /* ---- Model Selector ---- */
    .model-selector {
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--sidebar-border);
    }

    .model-select {
      width: 100%;
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--color-bg-tertiary);
      border: 1px solid var(--sidebar-border);
      border-radius: var(--radius-lg);
      color: var(--color-text-primary);
      font-size: 0.8125rem;
      font-family: inherit;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%237a6b7e' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      padding-right: 28px;
      transition: border-color var(--transition-fast);
    }

    .model-select:hover {
      border-color: var(--color-border-hover);
    }

    .model-select:focus {
      outline: none;
      border-color: var(--color-accent);
    }

    /* ---- Navigation Tabs ---- */
    .nav {
      display: flex;
      padding: var(--spacing-sm) var(--spacing-sm) 0;
      gap: 2px;
    }

    .nav-btn {
      flex: 1;
      padding: 6px 0;
      background: transparent;
      border: none;
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: 0.7rem;
      font-weight: 500;
      text-align: center;
      transition: all var(--transition-fast);
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .nav-btn:hover {
      color: var(--color-text-secondary);
      background: var(--color-bg-tertiary);
    }

    .nav-btn.active {
      color: var(--color-text-primary);
      background: var(--color-bg-tertiary);
    }

    /* ---- Session List ---- */
    .sessions-list {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-sm);
      scrollbar-width: thin;
      scrollbar-color: var(--color-bg-tertiary) transparent;
    }

    .session-item {
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: background var(--transition-fast);
      margin-bottom: 2px;
      border-left: 2px solid transparent;
    }

    .session-item:hover {
      background: var(--color-bg-tertiary);
    }

    .session-item.selected {
      background: var(--color-bg-tertiary);
      border-left-color: var(--color-accent);
    }

    .session-name {
      font-size: 0.8125rem;
      font-weight: 450;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .session-meta {
      font-size: 0.6875rem;
      color: var(--color-text-muted);
      margin-top: 2px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-xl);
      color: var(--color-text-muted);
      text-align: center;
      gap: var(--spacing-sm);
    }

    .empty-state-icon {
      font-size: 2rem;
      opacity: 0.25;
    }

    .empty-state-text {
      font-size: 0.8125rem;
    }

    /* ---- Footer — New Chat + Settings ---- */
    .footer {
      padding: var(--spacing-sm) var(--spacing-md);
      border-top: 1px solid var(--sidebar-border);
      display: flex;
      gap: var(--spacing-sm);
    }

    .new-chat-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: 8px var(--spacing-md);
      background: var(--color-accent);
      color: var(--color-bg-primary);
      border: none;
      border-radius: var(--radius-md);
      font-weight: 600;
      font-size: 0.8125rem;
      cursor: pointer;
      transition: all var(--transition-fast);
      font-family: inherit;
    }

    .new-chat-btn:hover {
      background: var(--color-accent-light);
      transform: translateY(-1px);
    }

    .new-chat-btn:active {
      transform: translateY(0);
    }

    .settings-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--sidebar-border);
      border-radius: var(--radius-md);
      color: var(--color-text-muted);
      cursor: pointer;
      transition: all var(--transition-fast);
      font-size: 1rem;
    }

    .settings-btn:hover {
      background: var(--color-border-hover);
      color: var(--color-text-primary);
    }
  `;

  @state()
  private declare activeTab: 'sessions' | 'agents' | 'skills';

  @state()
  private declare sessions: any[];

  @state()
  private declare compact: boolean;

  /** The currently active session ID, set by parent app */
  @state()
  private declare selectedId: string | null;

  constructor() {
    super();
    this.activeTab = 'sessions';
    this.sessions = [];
    this.compact = false;
    this.selectedId = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.loadSessions();
  }

  private async loadSessions() {
    try {
      this.sessions = await window.koboldAPI.sessions.list();
    } catch (err) {
      console.error('[Sidebar] Failed to load sessions:', err);
    }
  }

  private async handleNewSession() {
    try {
      await window.koboldAPI.agent.clear();
      this.dispatchEvent(new CustomEvent('action', {
        detail: 'new-chat',
        bubbles: true,
        composed: true,
      }));
    } catch (err) {
      console.error('[Sidebar] Failed to start new session:', err);
    }
  }

  private handleSettings() {
    console.log('[Sidebar] Settings clicked');
  }

  render() {
    return html`
      <!-- Model Selector -->
      <div class="model-selector">
        <select class="model-select" aria-label="Select model">
          <option>🧠 glm-5.1:cloud</option>
        </select>
      </div>

      <!-- Tab Navigation -->
      <nav class="nav">
        <button
          class="nav-btn ${this.activeTab === 'sessions' ? 'active' : ''}"
          @click=${() => (this.activeTab = 'sessions')}
        >Chats</button>
        <button
          class="nav-btn ${this.activeTab === 'agents' ? 'active' : ''}"
          @click=${() => (this.activeTab = 'agents')}
        >Agents</button>
        <button
          class="nav-btn ${this.activeTab === 'skills' ? 'active' : ''}"
          @click=${() => (this.activeTab = 'skills')}
        >Skills</button>
      </nav>

      <!-- Content -->
      <div class="sessions-list">
        ${this.activeTab === 'agents' ? html`
          <agent-tree-panel></agent-tree-panel>
        ` : this.activeTab === 'skills' ? html`
          <skill-panel></skill-panel>
        ` : this.sessions.length === 0 ? html`
          <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <div class="empty-state-text">No conversations yet</div>
          </div>
        ` : this.sessions.map(session => html`
          <div class="session-item ${session.id === this.selectedId ? 'selected' : ''}" @click=${() => this.loadSession(session)}>
            <div class="session-name">${session.title}</div>
            <div class="session-meta">${session.messageCount} messages</div>
          </div>
        `)}
      </div>

      <!-- Footer -->
      <div class="footer">
        <button class="new-chat-btn" @click=${this.handleNewSession}>
          <span>✨</span> New Chat
        </button>
        <button class="settings-btn" @click=${this.handleSettings} title="Settings">
          ⚙️
        </button>
      </div>
    `;
  }

  private async loadSession(session: any) {
    this.selectedId = session.id;
    this.dispatchEvent(new CustomEvent('select-session', {
      detail: { id: session.id, title: session.title },
      bubbles: true,
      composed: true,
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'kobold-sidebar': Sidebar;
  }
}