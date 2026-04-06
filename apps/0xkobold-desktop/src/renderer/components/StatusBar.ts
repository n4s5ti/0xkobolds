/**
 * StatusBar Component
 * 
 * Bottom status bar showing:
 * - Gateway connection status
 * - Current model
 * - Token count usage
 * - Session status
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "@mariozechner/mini-lit";

@customElement("kobold-status-bar")
export class StatusBar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 var(--spacing-md);
      height: 100%;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .section {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    .section-left {
      flex: 1;
    }

    .section-center {
      flex: 1;
      justify-content: center;
    }

    .section-right {
      flex: 1;
      justify-content: flex-end;
    }

    .token-bar {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .token-progress {
      width: 100px;
      height: 4px;
      background: var(--color-bg-tertiary);
      border-radius: var(--radius-full);
      overflow: hidden;
    }

    .token-fill {
      height: 100%;
      background: var(--color-accent);
      border-radius: var(--radius-full);
      transition: width 0.3s ease;
    }

    .token-fill.warning {
      background: var(--color-warning);
    }

    .token-fill.error {
      background: var(--color-error);
    }

    .status-label {
      color: var(--color-text-secondary);
    }

    .status-value {
      color: var(--color-text-primary);
      font-weight: 500;
    }

    .model-badge {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      padding: var(--spacing-xs) var(--spacing-sm);
      background: var(--color-bg-tertiary);
      border-radius: var(--radius-full);
      font-weight: 500;
    }

    .model-icon {
      font-size: 0.75rem;
    }

    .action-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: var(--spacing-xs);
      border-radius: var(--radius-sm);
      transition: all var(--transition-fast);
    }

    .action-btn:hover {
      color: var(--color-text-primary);
      background: var(--color-bg-tertiary);
    }
  `;

  @state()
  private tokenCount = 0;

  @state()
  private maxTokens = 128000;

  @state()
  private currentModel = 'ollama/llama3.2';

  private get tokenPercentage(): number {
    return Math.min((this.tokenCount / this.maxTokens) * 100, 100);
  }

  private get tokenFillClass(): string {
    if (this.tokenPercentage > 90) return 'error';
    if (this.tokenPercentage > 70) return 'warning';
    return '';
  }

  render() {
    return html`
      <div class="section section-left">
        <gateway-status-bar></gateway-status-bar>
      </div>

      <div class="section section-center">
        <div class="status-item token-bar">
          <span class="status-label">Tokens:</span>
          <div class="token-progress">
            <div 
              class="token-fill ${this.tokenFillClass}"
              style="width: ${this.tokenPercentage}%"
            ></div>
          </div>
          <span class="status-value">${this.tokenCount.toLocaleString()}</span>
        </div>
      </div>

      <div class="section section-right">
        <div class="model-badge">
          <span class="model-icon">🧠</span>
          <span>${this.currentModel}</span>
        </div>
        
        <button class="action-btn" @click=${this.handleClear} title="Clear conversation">
          🗑️
        </button>
      </div>
    `;
  }

  private handleClear(): void {
    console.log('[StatusBar] Clear conversation clicked');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'kobold-status-bar': StatusBar;
  }
}
