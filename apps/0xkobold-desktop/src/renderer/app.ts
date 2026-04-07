/**
 * 0xKobold Desktop - Main Application Component
 * 
 * Root component that sets up the app layout:
 * - Sidebar: Agent tree, skills, navigation (t3.chat style — dark, compact)
 * - Main area: Chat panel or welcome screen (no titlebar — clean)
 * - Status bar: Minimal bottom bar with model/gateway info
 *
 * Inspired by t3.chat's layout: sidebar + chat, no wasted header space.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "./utils/safe-custom-element";
import { when } from "lit/directives/when.js";
import { setAppStorage } from "@mariozechner/pi-web-ui";

import "./components/Sidebar";
import "./components/StatusBar";
import "./components/WelcomePanel";
import "./components/KoboldChatPanel";

import { koboldStorage } from "./stores/KoboldStorage";

import type { DesktopSettings } from "../shared/api-types";
import type { KoboldChatPanel } from "./components/KoboldChatPanel";

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
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    /* Titlebar is drag-only, no visible chrome — t3.chat style */
    .titlebar-drag {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 32px;
      -webkit-app-region: drag;
      z-index: 10;
      pointer-events: none;
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
  private declare settings: DesktopSettings | null;

  @state()
  private declare isLoading: boolean;

  @state()
  private declare error: string | null;

  @state()
  private declare showChat: boolean;

  /** Currently active session ID — set when user clicks a session in sidebar */
  @state()
  private declare activeSessionId: string | null;

  private settingsUnsubscribe?: () => void;
  private chatPanelRef?: KoboldChatPanel | null;

  constructor() {
    super();
    this.settings = null;
    this.isLoading = true;
    this.error = null;
    this.showChat = false;
    this.activeSessionId = null;
  }

  connectedCallback(): void {
    super.connectedCallback();
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

  /** Start a fresh chat (clear session) */
  private startNewChat() {
    this.activeSessionId = null;
    this.showChat = true;
  }

  /** User clicked a session in the sidebar — switch to that chat */
  private handleSelectSession(e: CustomEvent) {
    const { id } = e.detail;
    this.activeSessionId = id;
    this.showChat = true;

    // If the chat panel is already rendered, load the session immediately.
    // Otherwise, updated() will load it after the panel mounts.
    this.updateComplete.then(() => {
      const panel = this.shadowRoot?.querySelector("kobold-chat-panel") as any;
      if (panel?.loadSession) {
        panel.loadSession(id);
      }
    });
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
            if (e.detail === 'new-chat') this.startNewChat();
          }}
          @select-session=${this.handleSelectSession}
          ?compact=${this.settings?.["desktop.appearance.compactMode"]}
        ></kobold-sidebar>
      </aside>

      <main class="main">
        <!-- Invisible drag region for window management -->
        <div class="titlebar-drag"></div>

        <div class="content">
          ${when(
            this.showChat,
            () => html`<kobold-chat-panel></kobold-chat-panel>`,
            () => html`<kobold-welcome-panel @new-chat=${this.startNewChat}></kobold-welcome-panel>`
          )}
        </div>
      </main>

      <footer class="status">
        <kobold-status-bar></kobold-status-bar>
      </footer>
    `;
  }
}