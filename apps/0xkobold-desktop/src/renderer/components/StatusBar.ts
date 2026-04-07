/**
 * StatusBar Component — t3.chat inspired
 * 
 * Minimal bottom bar:
 * - Gateway connection status (left)
 * - Token usage indicator (center)
 * - Model name (right)
 * 
 * Uses the warm purple-gray muted palette.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "../utils/safe-custom-element";

@customElement("kobold-status-bar")
export class StatusBar extends LitElement {
  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 var(--spacing-md);
      height: 100%;
      font-size: 0.6875rem;
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
      width: 80px;
      height: 3px;
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

    .token-fill.error-fill {
      background: var(--color-error);
    }

    .model-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: var(--color-bg-tertiary);
      border-radius: var(--radius-full);
      font-weight: 450;
      color: var(--color-text-secondary);
    }

    .action-btn {
      background: transparent;
      border: none;
      color: var(--color-text-muted);
      cursor: pointer;
      padding: 2px;
      border-radius: var(--radius-sm);
      transition: color var(--transition-fast);
      font-size: 0.75rem;
    }

    .action-btn:hover {
      color: var(--color-text-primary);
    }
  `;

  @state()
  private declare tokenCount: number;

  @state()
  private declare maxTokens: number;

  @state()
  private declare currentModel: string;

  constructor() {
    super();
    this.tokenCount = 0;
    this.maxTokens = 128000;
    this.currentModel = 'ollama/glm-5.1:cloud';
  }

  private get tokenPercentage(): number {
    return Math.min((this.tokenCount / this.maxTokens) * 100, 100);
  }

  private get tokenFillClass(): string {
    if (this.tokenPercentage > 90) return 'error-fill';
    if (this.tokenPercentage > 70) return 'warning';
    return '';
  }

  render() {
    return html`
      <div class="section section-left">
        <gateway-status-bar></gateway-status-bar>
      </div>

      <div class="section section-center">
        <div class="token-bar">
          <span>${this.tokenCount.toLocaleString()}</span>
          <div class="token-progress">
            <div
              class="token-fill ${this.tokenFillClass}"
              style="width: ${this.tokenPercentage}%"
            ></div>
          </div>
        </div>
      </div>

      <div class="section section-right">
        <div class="model-badge">
          <span>🧠</span>
          <span>${this.currentModel}</span>
        </div>
        <button class="action-btn" @click=${this.handleClear} title="Clear conversation">🗑️</button>
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