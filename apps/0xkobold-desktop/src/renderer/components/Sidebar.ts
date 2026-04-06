/**
 * Sidebar Component
 * 
 * Contains:
 * - Agent tree panel (hierarchical view)
 * - Skills browser
 * - Session management
 * - Navigation
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "@mariozechner/mini-lit";
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
    }

    .header {
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--sidebar-border);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      font-weight: 600;
      font-size: 1.125rem;
      color: var(--color-accent);
    }

    .logo-emoji {
      font-size: 1.25rem;
    }

    .nav {
      display: flex;
      gap: var(--spacing-xs);
      padding: var(--spacing-sm);
      border-bottom: 1px solid var(--sidebar-border);
    }

    .nav-btn {
      flex: 1;
      padding: var(--spacing-sm);
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      color: var(--color-text-secondary);
      cursor: pointer;
      font-size: 0.75rem;
      text-align: center;
      transition: all var(--transition-fast);
    }

    .nav-btn:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
    }

    .nav-btn.active {
      background: var(--color-accent);
      color: var(--color-bg-primary);
      border-color: var(--color-accent);
    }

    .content {
      flex: 1;
      overflow: hidden;
    }

    .sessions-list {
      padding: var(--spacing-sm);
    }

    .session-item {
      padding: var(--spacing-md);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      margin-bottom: var(--spacing-sm);
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .session-item:hover {
      background: var(--color-bg-tertiary);
      border-color: var(--color-accent);
    }

    .session-name {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--color-text-primary);
      margin-bottom: 2px;
    }

    .session-meta {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .footer {
      padding: var(--spacing-md);
      border-top: 1px solid var(--sidebar-border);
      display: flex;
      gap: var(--spacing-sm);
    }

    .footer-btn {
      flex: 1;
      padding: var(--spacing-sm);
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      color: var(--color-text-secondary);
      cursor: pointer;
      font-size: 0.875rem;
      transition: all var(--transition-fast);
    }

    .footer-btn:hover {
      background: var(--color-border-hover);
      color: var(--color-text-primary);
    }
  `;

  @state()
  private activeTab: 'agents' | 'skills' | 'sessions' = 'agents';

  @state()
  private sessions: any[] = [];

  @state()
  private compact = false;

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
    // Clear current session and start fresh
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

  private handleHelp() {
    console.log('[Sidebar] Help clicked');
  }

  render() {
    return html`
      <div class="header">
        <div class="logo">
          <span class="logo-emoji">🐉</span>
          <span>0xKobold</span>
        </div>
      </div>

      <nav class="nav">
        <button
          class="nav-btn ${this.activeTab === 'agents' ? 'active' : ''}"
          @click=${() => (this.activeTab = 'agents')}
        >
          🤖 Agents
        </button>
        <button
          class="nav-btn ${this.activeTab === 'skills' ? 'active' : ''}"
          @click=${() => (this.activeTab = 'skills')}
        >
          🛠️ Skills
        </button>
        <button
          class="nav-btn ${this.activeTab === 'sessions' ? 'active' : ''}"
          @click=${() => (this.activeTab = 'sessions')}
        >
          💬 Sessions
        </button>
      </nav>

      <div class="content">
        ${this.activeTab === 'agents' ? html`
          <agent-tree-panel></agent-tree-panel>
        ` : this.activeTab === 'skills' ? html`
          <skill-panel></skill-panel>
        ` : html`
          <div class="sessions-list">
            ${this.sessions.length === 0 ? html`
              <div style="padding: var(--spacing-lg); text-align: center; color: var(--color-text-muted);">
                <div style="font-size: 2rem; opacity: 0.3;">💬</div>
                <div style="margin-top: var(--spacing-sm);">No saved sessions</div>
              </div>
            ` : this.sessions.map(session => html`
              <div class="session-item" @click=${() => this.loadSession(session)}>
                <div class="session-name">${session.title}</div>
                <div class="session-meta">${session.messageCount} messages</div>
              </div>
            `)}
          </div>
        `}
      </div>

      <div class="footer">
        <button class="footer-btn" @click=${this.handleNewSession}>➕ New Chat</button>
        <button class="footer-btn" @click=${this.handleSettings}>⚙️</button>
      </div>
    `;
  }

  private async loadSession(session: any) {
    try {
      const messages = await window.koboldAPI.sessions.load(session.id);
      // TODO: Display loaded session
      console.log('[Sidebar] Loaded session:', session.id, messages.length, 'messages');
    } catch (err) {
      console.error('[Sidebar] Failed to load session:', err);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'kobold-sidebar': Sidebar;
  }
}
