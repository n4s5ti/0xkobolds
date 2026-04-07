/**
 * 0xKobold Desktop - Chat Panel (t3.chat inspired)
 *
 * Design principles from t3.chat:
 * - Clean, centered message area
 * - Assistant messages: plain text (no bubble), left-aligned, role label above
 * - User messages: subtle right-aligned bubble with accent tint
 * - Input bar: rounded container at bottom (20px radius on top, flat bottom)
 * - Typing indicator: animated dots
 * - Actions row: minimal stop/clear below input
 * - Deep purple-black background, warm muted text colors
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "../utils/safe-custom-element";
import { ref, createRef } from "lit/directives/ref.js";
import type { Ref } from "lit/directives/ref.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@customElement("kobold-chat-panel")
export class KoboldChatPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background-color: var(--color-bg-primary);
    }

    /* ------------------------------------------------------------------ */
    /*  Message list (scrollable)                                          */
    /* ------------------------------------------------------------------ */
    .message-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: var(--spacing-lg) var(--spacing-xl);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      scroll-behavior: smooth;
      scrollbar-width: thin;
      scrollbar-color: var(--color-bg-tertiary) transparent;
    }

    .scroll-anchor {
      overflow-anchor: auto;
      height: 1px;
    }

    /* ------------------------------------------------------------------ */
    /*  Empty state                                                         */
    /* ------------------------------------------------------------------ */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      gap: var(--spacing-md);
      color: var(--color-text-muted);
      user-select: none;
    }

    .empty-state-icon {
      font-size: 3rem;
      opacity: 0.2;
    }

    .empty-state-text {
      font-size: 0.8125rem;
    }

    /* ------------------------------------------------------------------ */
    /*  Messages                                                            */
    /* ------------------------------------------------------------------ */
    .message {
      display: flex;
      flex-direction: column;
      max-width: 100%;
    }

    .message.user {
      align-items: flex-end;
    }

    .message.assistant {
      align-items: flex-start;
    }

    .message.system {
      align-items: center;
    }

    /* ---- User message — subtle accent-tinted bubble ---- */
    .message.user .bubble {
      background: rgba(245, 158, 11, 0.12);
      color: var(--color-text-primary);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-2xl) var(--radius-2xl) var(--radius-sm) var(--radius-2xl);
      max-width: 75%;
      line-height: 1.55;
      font-size: 0.875rem;
      word-break: break-word;
      border: 1px solid rgba(245, 158, 11, 0.18);
    }

    /* ---- Assistant — plain text, no bubble ---- */
    .message.assistant .role-label {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 4px;
      font-size: 0.6875rem;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-weight: 600;
    }

    .role-icon {
      font-size: 0.8rem;
    }

    .message.assistant .bubble {
      background: none;
      color: var(--color-text-primary);
      padding: 0;
      max-width: 100%;
      line-height: 1.65;
      font-size: 0.875rem;
      word-break: break-word;
    }

    /* ---- System — centered subtle pill ---- */
    .message.system .bubble {
      background: var(--color-bg-tertiary);
      color: var(--color-text-muted);
      font-size: 0.75rem;
      font-style: italic;
      padding: var(--spacing-xs) var(--spacing-md);
      border-radius: var(--radius-full);
    }

    /* ---- Timestamp ---- */
    .message-time {
      font-size: 0.625rem;
      color: var(--color-text-muted);
      opacity: 0.5;
      margin-top: 3px;
      padding: 0 2px;
    }

    /* ------------------------------------------------------------------ */
    /*  Typing Indicator                                                    */
    /* ------------------------------------------------------------------ */
    .typing-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: var(--spacing-xs) 0;
      align-self: flex-start;
    }

    .typing-indicator .dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--color-accent);
      animation: bounce 1.4s ease-in-out infinite;
    }

    .typing-indicator .dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator .dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
      30% { transform: translateY(-5px); opacity: 1; }
    }

    /* ------------------------------------------------------------------ */
    /*  Input area — t3.chat rounded container style                       */
    /* ------------------------------------------------------------------ */
    .input-area {
      flex-shrink: 0;
      padding: 0 var(--spacing-xl) var(--spacing-md);
    }

    .input-container {
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: var(--input-radius);
      display: flex;
      flex-direction: column;
      transition: border-color var(--transition-fast);
    }

    .input-container:focus-within {
      border-color: var(--color-accent);
      background: var(--input-bg-focus);
    }

    .textarea-row {
      display: flex;
      align-items: flex-end;
      padding: var(--spacing-sm) var(--spacing-md);
      gap: var(--spacing-sm);
    }

    .chat-input {
      flex: 1;
      resize: none;
      background: transparent;
      border: none;
      color: var(--color-text-primary);
      padding: 0;
      font-family: inherit;
      font-size: 0.875rem;
      line-height: 1.5;
      min-height: 24px;
      max-height: 140px;
      outline: none;
    }

    .chat-input::placeholder {
      color: var(--color-text-muted);
    }

    .chat-input:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .send-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: var(--radius-md);
      border: none;
      background: var(--color-accent);
      color: var(--color-bg-primary);
      cursor: pointer;
      transition: all var(--transition-fast);
      flex-shrink: 0;
      font-size: 1rem;
    }

    .send-btn:hover:not(:disabled) {
      background: var(--color-accent-light);
      transform: scale(1.08);
    }

    .send-btn:active:not(:disabled) {
      transform: scale(0.95);
    }

    .send-btn:disabled {
      opacity: 0.2;
      cursor: not-allowed;
    }

    /* ---- Bottom row: model selector, toggles ---- */
    .input-bottom-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px var(--spacing-sm) var(--spacing-xs) var(--spacing-md);
      font-size: 0.6875rem;
      color: var(--color-text-muted);
    }

    .input-bottom-row .model-label {
      display: flex;
      align-items: center;
      gap: 4px;
      opacity: 0.7;
    }

    .input-bottom-row .actions {
      display: flex;
      gap: var(--spacing-xs);
    }

    .action-btn {
      background: none;
      border: none;
      color: var(--color-text-muted);
      font-size: 0.6875rem;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      transition: color var(--transition-fast);
      font-family: inherit;
    }

    .action-btn:hover {
      color: var(--color-text-primary);
    }

    .action-btn.stop {
      color: var(--color-error);
    }

    .action-btn.stop:hover {
      color: #ff6b6b;
    }

    /* ------------------------------------------------------------------ */
    /*  Animations                                                          */
    /* ------------------------------------------------------------------ */
    @keyframes msgIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;

  // ---- State ----

  @state()
  private declare messages: ChatMessage[];

  @state()
  private declare isProcessing: boolean;

  @state()
  private declare inputText: string;

  // ---- Refs ----

  private messageListRef: Ref<HTMLElement> = createRef();
  private inputRef: Ref<HTMLTextAreaElement> = createRef();

  // ---- Public API ----

  /** Load a previous session's messages by ID */
  public async loadSession(sessionId: string): Promise<void> {
    try {
      const raw = await window.koboldAPI?.sessions.load(sessionId);
      if (!raw) return;
      this.messages = (raw as any[]).map((msg: any, i: number) => ({
        id: msg.id ?? `hist-${sessionId}-${i}`,
        role: msg.role ?? "assistant",
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
      }));
      this.isProcessing = false;
      this.scrollToBottom();
    } catch (err) {
      console.error('[KoboldChatPanel] Failed to load session:', err);
    }
  }

  // ---- Lifecycle ----

  constructor() {
    super();
    this.messages = [];
    this.isProcessing = false;
    this.inputText = "";
  }

  connectedCallback() {
    super.connectedCallback();
    this.subscribeToIPC();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  // ---- IPC ----

  private subscribeToIPC() {
    window.koboldAPI?.agent.onMessage((event: any) => {
      // AgentEvent from pi-agent-core: { type, ...}
      // We care about turn_end (complete message) and message_update (streaming)
      switch (event.type) {
        case "agent_start":
          this.isProcessing = true;
          break;

        case "agent_end":
          this.isProcessing = false;
          break;

        case "turn_end": {
          // event.message is the completed assistant AgentMessage
          // Skip user messages — we already render those optimistically in handleSend()
          const msg = event.message;
          if (msg && msg.role !== "user") {
            this.appendMessage(msg);
          }
          break;
        }

        case "message_update": {
          // Streaming update — update last assistant message in place
          const msg = event.message;
          if (msg && msg.role !== "user") {
            this.updateLastAssistantMessage(msg);
          }
          break;
        }

        case "message_start": {
          // New message beginning — skip user, we render those optimistically
          const msg = event.message;
          if (msg && msg.role !== "user") {
            this.appendMessage(msg);
          }
          break;
        }
      }

      this.scrollToBottom();
    });
  }

  /** Append a new message to the chat */
  private appendMessage(msg: any): void {
    // Extract text content from the message
    const content = this.extractText(msg);
    const role = msg.role ?? "assistant";
    if (!content && role === "assistant") return; // skip empty

    this.messages = [
      ...this.messages,
      {
        id: msg.id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role,
        content,
        timestamp: Date.now(),
      },
    ];
  }

  /** Update the last assistant message (for streaming) */
  private updateLastAssistantMessage(msg: any): void {
    const content = this.extractText(msg);
    if (!content) return;

    const last = this.messages[this.messages.length - 1];
    if (last?.role === "assistant") {
      // Update existing
      this.messages = this.messages.map((m, i) =>
        i === this.messages.length - 1 ? { ...m, content } : m
      );
    } else {
      // New streaming message
      this.messages = [
        ...this.messages,
        {
          id: msg.id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: "assistant",
          content,
          timestamp: Date.now(),
        },
      ];
    }
  }

  /** Extract text from an AgentMessage (which may have structured content) */
  private extractText(msg: any): string {
    if (typeof msg.content === "string") return msg.content;
    // AssistantMessage content is an array of content blocks
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text ?? "")
        .join("");
    }
    if (msg.text) return msg.text;
    return "";
  }

  // ---- Actions ----

  private async handleSend() {
    const content = this.inputText.trim();
    if (!content || this.isProcessing) return;

    this.messages = [
      ...this.messages,
      {
        id: `msg-${Date.now()}-user`,
        role: "user",
        content,
        timestamp: Date.now(),
      },
    ];

    this.inputText = "";
    this.isProcessing = true;
    this.scrollToBottom();

    const textarea = this.inputRef.value;
    if (textarea) {
      textarea.style.height = "auto";
    }

    try {
      await window.koboldAPI?.agent.send(content);
    } catch (err) {
      this.messages = [
        ...this.messages,
        {
          id: `msg-${Date.now()}-err`,
          role: "system",
          content: `Error: ${err instanceof Error ? err.message : "Send failed"}`,
          timestamp: Date.now(),
        },
      ];
      this.isProcessing = false;
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  }

  private handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    this.inputText = target.value;
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
  }

  private async handleInterrupt() {
    await window.koboldAPI?.agent.interrupt();
    this.isProcessing = false;
  }

  private async handleClear() {
    await window.koboldAPI?.agent.clear();
    this.messages = [];
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      const el = this.messageListRef.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // ---- Render ----

  private fmtTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  render() {
    return html`
      <!-- Message List -->
      <div class="message-list" ${ref(this.messageListRef)}>
        ${this.messages.length === 0
          ? html`
            <div class="empty-state">
              <div class="empty-state-icon">🐉</div>
              <div class="empty-state-text">Start a conversation</div>
            </div>
          `
          : this.messages.map((msg) => {
              if (msg.role === "user") {
                return html`
                  <div class="message user">
                    <div class="bubble">${msg.content}</div>
                    <span class="message-time">${this.fmtTime(msg.timestamp)}</span>
                  </div>
                `;
              }
              if (msg.role === "system") {
                return html`
                  <div class="message system">
                    <div class="bubble">${msg.content}</div>
                  </div>
                `;
              }
              // assistant
              return html`
                <div class="message assistant">
                  <div class="role-label">
                    <span class="role-icon">🐉</span> 0xKobold
                  </div>
                  <div class="bubble">${msg.content}</div>
                  <span class="message-time">${this.fmtTime(msg.timestamp)}</span>
                </div>
              `;
            })
        }

        ${this.isProcessing
          ? html`
            <div class="typing-indicator">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          `
          : ""}

        <div class="scroll-anchor"></div>
      </div>

      <!-- Input area — t3.chat style rounded container -->
      <div class="input-area">
        <div class="input-container">
          <div class="textarea-row">
            <textarea
              class="chat-input"
              ${ref(this.inputRef)}
              .value=${this.inputText}
              placeholder="Message 0xKobold…"
              ?disabled=${this.isProcessing}
              @keydown=${this.handleKeyDown}
              @input=${this.handleInput}
              rows="1"
            ></textarea>
            <button
              class="send-btn"
              ?disabled=${!this.inputText.trim() || this.isProcessing}
              @click=${this.handleSend}
              title="Send"
            >↵</button>
          </div>
          <div class="input-bottom-row">
            <span class="model-label">🧠 glm-5.1:cloud</span>
            <div class="actions">
              ${this.isProcessing
                ? html`<button class="action-btn stop" @click=${this.handleInterrupt}>⏹ Stop</button>`
                : ""}
              ${this.messages.length > 0
                ? html`<button class="action-btn" @click=${this.handleClear}>Clear</button>`
                : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "kobold-chat-panel": KoboldChatPanel;
  }
}