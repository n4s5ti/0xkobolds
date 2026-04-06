/**
 * WelcomePanel Component
 * 
 * Shown when no conversation is active.
 * Provides quick actions and onboarding.
 */

import { LitElement, html, css } from "lit";
import { customElement } from "@mariozechner/mini-lit";

@customElement("kobold-welcome-panel")
export class WelcomePanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      padding: var(--spacing-xl);
      text-align: center;
    }

    .hero {
      margin-bottom: var(--spacing-xl);
    }

    .logo {
      font-size: 5rem;
      margin-bottom: var(--spacing-md);
      animation: float 3s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-10px);
      }
    }

    .title {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0 0 var(--spacing-sm);
      background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-light) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .tagline {
      font-size: 1.25rem;
      color: var(--color-text-secondary);
      margin: 0;
    }

    .quick-actions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-md);
      max-width: 600px;
      width: 100%;
      margin-bottom: var(--spacing-xl);
    }

    .action-card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: var(--spacing-lg);
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all var(--transition-normal);
      text-align: left;
    }

    .action-card:hover {
      background: var(--color-bg-tertiary);
      border-color: var(--color-accent);
      transform: translateY(-2px);
    }

    .action-icon {
      font-size: 1.5rem;
      margin-bottom: var(--spacing-sm);
    }

    .action-title {
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--spacing-xs);
    }

    .action-desc {
      font-size: 0.875rem;
      color: var(--color-text-muted);
      margin: 0;
    }

    .tips {
      max-width: 600px;
      width: 100%;
    }

    .tips-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--color-text-secondary);
      margin-bottom: var(--spacing-md);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .tip {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) 0;
      color: var(--color-text-muted);
      font-size: 0.875rem;
    }

    .tip-key {
      padding: var(--spacing-xs) var(--spacing-sm);
      background: var(--color-bg-tertiary);
      border-radius: var(--radius-sm);
      font-family: monospace;
      font-size: 0.75rem;
      color: var(--color-text-secondary);
    }

    @media (max-width: 600px) {
      .quick-actions {
        grid-template-columns: 1fr;
      }
    }
  `;

  render() {
    return html`
      <div class="hero">
        <div class="logo">🐉</div>
        <h1 class="title">0xKobold</h1>
        <p class="tagline">Your Digital Familiar</p>
      </div>

      <div class="quick-actions">
        <div class="action-card" @click=${this.handleNewChat}>
          <div class="action-icon">💬</div>
          <div class="action-title">New Chat</div>
          <p class="action-desc">Start a conversation with your AI assistant</p>
        </div>

        <div class="action-card" @click=${this.handleSpawnAgent}>
          <div class="action-icon">🤖</div>
          <div class="action-title">Spawn Agent</div>
          <p class="action-desc">Create a specialized subagent for a task</p>
        </div>

        <div class="action-card" @click=${this.handleOpenFolder}>
          <div class="action-icon">📁</div>
          <div class="action-title">Open Folder</div>
          <p class="action-desc">Open a project folder to work with</p>
        </div>

        <div class="action-card" @click=${this.handleSettings}>
          <div class="action-icon">⚙️</div>
          <div class="action-title">Settings</div>
          <p class="action-desc">Configure models, extensions, and preferences</p>
        </div>
      </div>

      <div class="tips">
        <div class="tips-title">Quick Tips</div>
        <div class="tip">
          <span class="tip-key">Ctrl+K</span>
          <span>Toggle this window from anywhere</span>
        </div>
        <div class="tip">
          <span class="tip-key">Ctrl+N</span>
          <span>Start a new chat</span>
        </div>
        <div class="tip">
          <span class="tip-key">/agent</span>
          <span>Type to spawn a specialized agent</span>
        </div>
      </div>
    `;
  }

  private handleNewChat(): void {
    console.log('[WelcomePanel] New chat clicked');
    // TODO: Trigger new chat via IPC
  }

  private handleSpawnAgent(): void {
    console.log('[WelcomePanel] Spawn agent clicked');
    // TODO: Open agent spawn dialog
  }

  private async handleOpenFolder(): Promise<void> {
    try {
      const folder = await window.koboldAPI.system.selectFolder();
      if (folder) {
        console.log('[WelcomePanel] Selected folder:', folder);
      }
    } catch (err) {
      console.error('[WelcomePanel] Failed to select folder:', err);
    }
  }

  private handleSettings(): void {
    console.log('[WelcomePanel] Settings clicked');
    // TODO: Open settings dialog
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'kobold-welcome-panel': WelcomePanel;
  }
}
