/**
 * WelcomePanel Component — t3.chat inspired
 * 
 * Shown when no conversation is active.
 * Centered heading with prompt suggestion chips.
 * Clean, minimal, warm purple-black palette.
 */

import { LitElement, html, css } from "lit";
import { customElement } from "../utils/safe-custom-element";

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
      padding-bottom: var(--spacing-2xl, 6rem);
      text-align: center;
      background-color: var(--color-bg-primary);
    }

    .hero {
      margin-bottom: var(--spacing-xl);
    }

    .logo {
      font-size: 3.5rem;
      margin-bottom: var(--spacing-md);
      animation: float 3s ease-in-out infinite;
    }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }

    .title {
      font-size: 2rem;
      font-weight: 700;
      color: var(--color-text-primary);
      margin: 0 0 var(--spacing-xs);
      background: linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-light) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .tagline {
      font-size: 1rem;
      color: var(--color-text-muted);
      margin: 0;
    }

    /* ---- Prompt Suggestion Chips — t3.chat style ---- */
    .prompts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      justify-content: center;
      max-width: 560px;
      margin-top: var(--spacing-lg);
    }

    .prompt-chip {
      padding: 8px var(--spacing-md);
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      color: var(--color-text-secondary);
      font-size: 0.8125rem;
      cursor: pointer;
      transition: all var(--transition-fast);
      font-family: inherit;
      white-space: nowrap;
    }

    .prompt-chip:hover {
      background: var(--color-border-hover);
      color: var(--color-text-primary);
      border-color: var(--color-border-hover);
      transform: translateY(-1px);
    }

    .prompt-chip:active {
      transform: translateY(0);
    }

    /* ---- Quick action cards ---- */
    .quick-actions {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--spacing-sm);
      max-width: 480px;
      width: 100%;
      margin-top: var(--spacing-lg);
    }

    .action-card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: var(--spacing-md);
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all var(--transition-normal);
      text-align: left;
    }

    .action-card:hover {
      background: var(--color-border-hover);
      border-color: var(--color-accent);
      transform: translateY(-2px);
    }

    .action-icon {
      font-size: 1.25rem;
      margin-bottom: var(--spacing-xs);
    }

    .action-title {
      font-weight: 600;
      color: var(--color-text-primary);
      font-size: 0.8125rem;
      margin: 0 0 2px;
    }

    .action-desc {
      font-size: 0.75rem;
      color: var(--color-text-muted);
      margin: 0;
    }

    /* ---- Tips ---- */
    .tips {
      max-width: 480px;
      width: 100%;
      margin-top: var(--spacing-xl);
    }

    .tips-title {
      font-size: 0.6875rem;
      font-weight: 600;
      color: var(--color-text-muted);
      margin-bottom: var(--spacing-sm);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .tip {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 4px 0;
      color: var(--color-text-muted);
      font-size: 0.75rem;
    }

    .tip-key {
      padding: 2px 6px;
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
      font-size: 0.6875rem;
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
        <h1 class="title">How can I help you?</h1>
        <p class="tagline">0xKobold · Your Digital Familiar</p>
      </div>

      <div class="prompts">
        <button class="prompt-chip" @click=${this.handleNewChat}>💬 Start a conversation</button>
        <button class="prompt-chip" @click=${this.handleSpawnAgent}>🤖 Spawn an agent</button>
        <button class="prompt-chip" @click=${this.handleOpenFolder}>📁 Open a project</button>
        <button class="prompt-chip" @click=${this.handleSettings}>⚙️ Configure settings</button>
      </div>

      <div class="quick-actions">
        <div class="action-card" @click=${this.handleNewChat}>
          <div class="action-icon">✨</div>
          <div class="action-title">New Chat</div>
          <p class="action-desc">Start a conversation</p>
        </div>
        <div class="action-card" @click=${this.handleSpawnAgent}>
          <div class="action-icon">🤖</div>
          <div class="action-title">Spawn Agent</div>
          <p class="action-desc">Create a specialized subagent</p>
        </div>
      </div>

      <div class="tips">
        <div class="tips-title">Keyboard shortcuts</div>
        <div class="tip">
          <span class="tip-key">Ctrl+K</span>
          <span>Toggle window</span>
        </div>
        <div class="tip">
          <span class="tip-key">Ctrl+N</span>
          <span>New chat</span>
        </div>
        <div class="tip">
          <span class="tip-key">/agent</span>
          <span>Spawn specialized agent</span>
        </div>
      </div>
    `;
  }

  private handleNewChat(): void {
    this.dispatchEvent(new CustomEvent('new-chat', { bubbles: true, composed: true }));
  }

  private handleSpawnAgent(): void {
    console.log('[WelcomePanel] Spawn agent clicked');
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
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'kobold-welcome-panel': WelcomePanel;
  }
}