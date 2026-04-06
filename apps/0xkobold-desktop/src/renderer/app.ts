/**
 * 0xKobold Desktop - Main Application Component
 * 
 * Root component that sets up the app layout:
 * - Sidebar: Agent tree, skills, navigation
 * - Main area: Chat panel, content
 * - Status bar: Gateway status, session info
 *
 * Uses Lit (lit-html) for templating, consistent with pi-web-ui.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "@mariozechner/mini-lit";
import { when } from "lit/directives/when.js";
import { setAppStorage } from "@mariozechner/pi-web-ui";

// Import child components
import "./components/Sidebar";
import "./components/StatusBar";
import "./components/WelcomePanel";
import "./components/KoboldChatPanel";

// Stores
import { koboldStorage } from "./stores/KoboldStorage";

// Types
import type { DesktopSettings } from "../shared/api-types";

declare global {
  interface Window {
    koboldAPI: {
      app: {
        getSettings: () => Promise<DesktopSettings>;
        onSettingsChange: (cb: (s: DesktopSettings) => void) => () => void;
      };
    };
  }
}

@customElement("kobold-app")
export class KoboldApp extends LitElement {
  static styles = css`
    :host {
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      grid-template-rows: 1fr auto;
      grid-template-areas:
        "sidebar main"
        "sidebar status";
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      background-color: var(--color-bg-primary);
    }

    :host([compact]) {
      grid-template-columns: 1fr;
      grid-template-areas:
        "main"
        "status";
    }

    .sidebar {
      grid-area: sidebar;
      background-color: var(--sidebar-bg);
      border-right: 1px solid var(--sidebar-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    :host([compact]) .sidebar {
      display: none;
    }

    .main {
      grid-area: main;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }

    .status {
      grid-area: status;
      height: 32px;
      border-top: 1px solid var(--sidebar-border);
      background-color: var(--sidebar-bg);
    }

    .content {
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
    }

    .titlebar {
      height: 40px;
      -webkit-app-region: drag;
      display: flex;
      align-items: center;
      padding: 0 var(--spacing-md);
      border-bottom: 1px solid var(--sidebar-border);
    }

    .titlebar.no-drag {
      -webkit-app-region: no-drag;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      font-weight: 600;
      font-size: 1.125rem;
      color: var(--color-text-primary);
    }

    .logo-emoji {
      font-size: 1.25rem;
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: var(--spacing-lg);
    }

    .loading-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--color-bg-tertiary);
      border-top-color: var(--color-accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .loading-text {
      color: var(--color-text-secondary);
      font-size: 0.875rem;
    }
  `;

  @state()
  private settings: DesktopSettings | null = null;

  @state()
  private isLoading = true;

  @state()
  private error: string | null = null;

  @state()
  private showChat = false;

  private settingsUnsubscribe?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    
    // 1. Setup Global Storage for pi-web-ui components
    setAppStorage(koboldStorage);
    
    this.loadSettings();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.settingsUnsubscribe?.();
  }

  private async loadSettings(): Promise<void> {
    try {
      this.settings = await window.koboldAPI.app.getSettings();
      this.isLoading = false;

      this.settingsUnsubscribe = window.koboldAPI.app.onSettingsChange(
        (newSettings) => {
          this.settings = newSettings;
          this.requestUpdate();
        }
      );
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Failed to load settings";
      this.isLoading = false;
    }
  }

  private toggleChat() {
    this.showChat = !this.showChat;
  }

  render() {
    if (this.isLoading) {
      return html`
        <div class="loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">Initializing 0xKobold...</div>
        </div>
      `;
    }

    if (this.error) {
      return html`
        <div class="loading">
          <div style="color: var(--color-error)">❌ Error: ${this.error}</div>
          <button @click=${() => location.reload()} style="
            padding: var(--spacing-sm) var(--spacing-md);
            background: var(--color-accent);
            border: none;
            border-radius: var(--radius-md);
            cursor: pointer;
          ">Reload</button>
        </div>
      `;
    }

    return html`
      <aside class="sidebar">
        <kobold-sidebar
          @action=${(e: any) => {
            if (e.detail === 'new-chat') this.toggleChat();
          }}
          ?compact=${this.settings?.["desktop.appearance.compactMode"]}
        ></kobold-sidebar>
      </aside>

      <main class="main">
        <div class="titlebar">
          <div class="logo">
            <span class="logo-emoji">🐉</span>
            <span>0xKobold</span>
          </div>
        </div>

        <div class="content">
          ${when(
            this.showChat,
            () => html`<kobold-chat-panel></kobold-chat-panel>`,
            () => html`<kobold-welcome-panel @new-chat=${this.toggleChat}></kobold-welcome-panel>`
          )}
        </div>
      </main>

      <footer class="status">
        <kobold-status-bar></kobold-status-bar>
      </footer>
    `;
  }
}
