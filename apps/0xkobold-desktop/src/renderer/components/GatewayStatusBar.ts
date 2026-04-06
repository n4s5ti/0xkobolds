/**
 * GatewayStatusBar Component
 * 
 * Shows gateway connection status and provides controls:
 * - Embedded mode: Shows local gateway status
 * - Connect mode: Shows connection to external gateway
 * - Disconnected: Allows starting/connecting
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "@mariozechner/mini-lit";
import type { GatewayStatus, GatewayMode } from "../../shared/api-types";

@customElement("gateway-status-bar")
export class GatewayStatusBar extends LitElement {
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

    .section-right {
      flex: 1;
      justify-content: flex-end;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .status-indicator.connected {
      background-color: var(--color-success);
      box-shadow: 0 0 6px var(--color-success);
    }

    .status-indicator.disconnected {
      background-color: var(--color-text-muted);
    }

    .status-indicator.connecting {
      background-color: var(--color-warning);
      animation: pulse 1s infinite;
    }

    .status-indicator.error {
      background-color: var(--color-error);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .status-label {
      color: var(--color-text-secondary);
    }

    .status-value {
      color: var(--color-text-primary);
      font-weight: 500;
    }

    .mode-badge {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      padding: 2px 8px;
      border-radius: var(--radius-full);
      font-size: 0.625rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .mode-badge.embedded {
      background: rgba(34, 197, 94, 0.2);
      color: var(--color-success);
    }

    .mode-badge.connect {
      background: rgba(59, 130, 246, 0.2);
      color: var(--color-info);
    }

    .mode-badge.disconnected {
      background: var(--color-bg-tertiary);
      color: var(--color-text-muted);
    }

    .action-btn {
      background: transparent;
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      cursor: pointer;
      padding: 4px 12px;
      border-radius: var(--radius-md);
      font-size: 0.75rem;
      transition: all var(--transition-fast);
    }

    .action-btn:hover {
      background: var(--color-bg-tertiary);
      color: var(--color-text-primary);
      border-color: var(--color-accent);
    }

    .action-btn.active {
      background: var(--color-accent);
      color: var(--color-bg-primary);
      border-color: var(--color-accent);
    }

    .url-display {
      font-family: monospace;
      font-size: 0.625rem;
      color: var(--color-text-muted);
    }
  `;

  @state()
  private status: GatewayStatus | null = null;

  @state()
  private showConnectDialog = false;

  @state()
  private connectUrl = '';

  connectedCallback() {
    super.connectedCallback();
    this.loadStatus();
    this.subscribeToEvents();
  }

  private async loadStatus() {
    try {
      this.status = await window.koboldAPI.gateway.getStatus();
    } catch (err) {
      console.error('[GatewayStatusBar] Failed to load status:', err);
    }
  }

  private subscribeToEvents() {
    const unsubscribe = window.koboldAPI.gateway.onEvent((event) => {
      if (event.type === 'gateway.status' || event.type === 'gateway.started' || event.type === 'gateway.stopped') {
        this.loadStatus();
      }
    });

    this.addEventListener('disconnected', unsubscribe);
  }

  private async startEmbedded() {
    try {
      await window.koboldAPI.gateway.startEmbedded(18789, '127.0.0.1');
    } catch (err) {
      console.error('[GatewayStatusBar] Failed to start:', err);
    }
  }

  private async connect() {
    if (!this.connectUrl) return;
    try {
      await window.koboldAPI.gateway.connect(this.connectUrl);
      this.showConnectDialog = false;
      this.connectUrl = '';
    } catch (err) {
      console.error('[GatewayStatusBar] Failed to connect:', err);
    }
  }

  private async disconnect() {
    try {
      await window.koboldAPI.gateway.disconnect();
    } catch (err) {
      console.error('[GatewayStatusBar] Failed to disconnect:', err);
    }
  }

  private getStatusClass(): string {
    if (!this.status?.running) return 'disconnected';
    return 'connected';
  }

  private getModeBadgeClass(): string {
    if (!this.status?.running) return 'disconnected';
    return this.status.mode === 'embedded' ? 'embedded' : 'connect';
  }

  private getModeLabel(): string {
    if (!this.status?.running) return 'Disconnected';
    return this.status.mode === 'embedded' ? 'Embedded' : 'Connected';
  }

  render() {
    return html`
      <div class="section section-left">
        <div class="status-item">
          <div class="status-indicator ${this.getStatusClass()}"></div>
          <span class="status-label">Gateway:</span>
          <span class="status-value">${this.getModeLabel()}</span>
        </div>
        
        ${this.status?.running ? html`
          <div class="mode-badge ${this.getModeBadgeClass()}">
            ${this.status.url}
          </div>
        ` : ''}
      </div>

      <div class="section section-right">
        ${!this.status?.running ? html`
          <button class="action-btn" @click=${this.startEmbedded} title="Start local gateway">
            ▶️ Start
          </button>
          <button class="action-btn" @click=${() => this.showConnectDialog = true} title="Connect to external gateway">
            🔗 Connect
          </button>
        ` : html`
          ${this.status?.mode === 'embedded' ? html`
            <span class="url-display">ws://${this.status?.host}:${this.status?.port}</span>
          ` : html`
            <span class="url-display">${this.status?.url}</span>
          `}
          <button class="action-btn" @click=${this.disconnect} title="Disconnect">
            ⏹️ Stop
          </button>
        `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gateway-status-bar': GatewayStatusBar;
  }
}
