/**
 * 0xKobold Desktop - Custom Chat Panel
 * 
 * Extends the standard ChatPanel from @mariozechner/pi-web-ui
 * to bridge the renderer to the Electron main process PI agent.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "@mariozechner/mini-lit";
import { ChatPanel } from "@mariozechner/pi-web-ui";
import { AgentMessage } from "@mariozechner/pi-agent-core";
import { when } from "lit/directives/when.js";

@customElement("kobold-chat-panel")
export class KoboldChatPanel extends ChatPanel {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: var(--color-bg-primary);
    }

    .kobold-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--color-bg-secondary);
      border-bottom: 1px solid var(--sidebar-border);
    }

    .tool-btn {
      background: var(--color-bg-tertiary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      color: var(--color-text-secondary);
      cursor: pointer;
      padding: 4px 8px;
      font-size: 0.75rem;
      transition: all var(--transition-fast);
    }

    .tool-btn:hover {
      background: var(--color-border-hover);
      color: var(--color-text-primary);
      border-color: var(--color-accent);
    }

    .tool-btn.active {
      background: var(--color-accent);
      color: var(--color-bg-primary);
    }
  `;

  @state()
  private isProcessing = false;

  connectedCallback() {
    super.connectedCallback();
    this.initAgentBridge();
  }

  private initAgentBridge() {
    // Listen for messages from the main process PI agent
    window.koboldAPI.agent.onMessage((msg: AgentMessage) => {
      this.handleIncomingMessage(msg);
    });

    // Update processing state
    const updateState = async () => {
      const state = await window.koboldAPI.agent.getState();
      this.isProcessing = state.isProcessing;
    };

    setInterval(updateState, 1000);
  }

  private handleIncomingMessage(msg: AgentMessage) {
    // The pi-web-ui ChatPanel typically manages its own internal 
    // message history. We need to push the IPC message into that history.
    
    // Since pi-web-ui's ChatPanel is often driving its own Agent instance,
    // we are overriding it here to be driven by the main process via IPC.
    
    // 1. Add message to the display history
    this.addMessageToUI(msg);
    
    // 2. If it's a tool call, handle it via the bridge if needed
    if (msg.role === 'assistant' && msg.tool_calls) {
      // Tool execution happens in main process, so we just wait for results
    }
  }

  private addMessageToUI(msg: AgentMessage) {
    // This logic depends on the specific version of pi-web-ui's ChatPanel
    // We'll use the internal addMessage method if available, or update the state
    if (typeof (this as any).addMessage === 'function') {
      (this as any).addMessage(msg);
    } else {
      // Fallback: manually push to the session store
      const sessions = window.koboldStorage?.sessions;
      if (sessions) {
        // Logic to add to active session
      }
    }
  }

  /**
   * Override the default send behavior to use Electron IPC
   */
  async handleSend(content: string) {
    try {
      this.isProcessing = true;
      await window.koboldAPI.agent.send(content);
      
      // Manually add user message to UI since the 
      // response comes back asynchronously via onMessage
      this.addMessageToUI({
        role: 'user',
        content: content,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[KoboldChatPanel] Send failed:', err);
    } finally {
      // Processing state is managed by the getState poller
    }
  }

  render() {
    return html`
      <div class="kobold-toolbar">
        <div class="toolbar-left">
          <button class="tool-btn" @click=${() => this.interrupt()}>🛑 Interrupt</button>
        </div>
        <div class="toolbar-right">
          <button class="tool-btn" @click=${() => this.clear()}>🗑️ Clear</button>
        </div>
      </div>
      
      <div class="chat-container" style="flex: 1; overflow: hidden;">
        ${super.render()}
      </div>
    `;
  }

  private async interrupt() {
    await window.koboldAPI.agent.interrupt();
  }

  private async clear() {
    await window.koboldAPI.agent.clear();
    // Also clear the UI history
    if (typeof (this as any).clearHistory === 'function') {
      (this as any).clearHistory();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'kobold-chat-panel': KoboldChatPanel;
  }
}
