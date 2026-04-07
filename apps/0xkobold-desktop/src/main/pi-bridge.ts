/**
 * 0xKobold Desktop - PI Agent Bridge
 *
 * Bridges the Electron main process to the pi-coding-agent SDK.
 * Uses createAgentSession() which handles model config, stream function,
 * auth, tools, session management, and extensions properly.
 */

import { createAgentSession, type AgentSession } from "@mariozechner/pi-coding-agent";
import type { AgentEvent } from "@mariozechner/pi-agent-core";
import { resolve } from "path";
import { homedir } from "node:os";
import log from "electron-log";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { BrowserWindow } from "electron";

export class PIBridge {
  private session: AgentSession | null = null;
  private unsubscribe: (() => void) | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    try {
      log.info("[PIBridge] Initializing agent session...");

      process.env.PI_CODING_AGENT_DIR = resolve(homedir(), ".0xkobold");

      const result = await createAgentSession({
        cwd: process.cwd(),
        agentDir: resolve(homedir(), ".0xkobold"),
      });

      this.session = result.session;

      if (result.modelFallbackMessage) {
        log.warn(`[PIBridge] Model fallback: ${result.modelFallbackMessage}`);
      }

      // Subscribe to agent events and relay to renderer windows
      this.unsubscribe = this.session.subscribe((event: any) => {
        this.relayEvent(event);
      });

      this.initialized = true;
      log.info("[PIBridge] Agent session initialized successfully");

      // Log extensions result
      if (result.extensionsResult) {
        const exts = result.extensionsResult;
        log.info(`[PIBridge] Extensions loaded: ${exts.loaded?.length ?? 0}`);
        if (exts.errors?.length) {
          for (const err of exts.errors) {
            log.warn(`[PIBridge] Extension error: ${err}`);
          }
        }
      }
    } catch (err) {
      log.error("[PIBridge] Failed to initialize agent session:", err);
      this.initialized = false;
    }
  }

  private async ensureReady(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.init();
    }
    await this.initPromise;
    if (!this.session) {
      throw new Error("Agent session not initialized");
    }
  }

  /** Relay agent events to all Electron renderer windows */
  private relayEvent(event: any): void {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) return;

    windows.forEach(win => {
      try {
        win.webContents.send(IPC_CHANNELS.AGENT.MESSAGE, event);
      } catch {
        // Window may have been closed
      }
    });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Send a user message to the agent */
  async sendMessage(content: string): Promise<void> {
    await this.ensureReady();
    log.debug(`[PIBridge] Sending message: ${content.slice(0, 100)}...`);
    await this.session!.prompt(content);
  }

  /** Abort the current agent run */
  async interrupt(): Promise<void> {
    if (!this.session) return;
    log.debug("[PIBridge] Aborting agent");
    this.session!.agent.abort();
  }

  /** Reset the agent (clear transcript) */
  async clear(): Promise<void> {
    if (!this.session) return;
    log.debug("[PIBridge] Resetting agent");
    this.session!.agent.reset();
  }

  /** Get agent state snapshot */
  async getState(): Promise<{
    isProcessing: boolean;
    currentModel: string;
    messageCount: number;
  }> {
    if (!this.session) {
      return { isProcessing: false, currentModel: "unknown", messageCount: 0 };
    }
    const state = this.session.agent.state;
    return {
      isProcessing: state.isStreaming,
      currentModel: (state.model as any)?.id ?? "unknown",
      messageCount: state.messages.length,
    };
  }

  /** Get the agent tree — placeholder for multi-agent */
  getAgentTree(): any[] {
    // TODO: Integrate with pi-orchestration when available
    return [];
  }
}

// Singleton
export const piBridge = new PIBridge();