/**
 * 0xKobold Desktop - PI Agent Bridge
 * 
 * This bridge manages the lifecycle of the PI Agent in the Electron main process.
 * It handles extension loading, session management, and routes messages between
 * the PI Agent and the Electron IPC system.
 */

import { Agent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { resolve, join } from "path";
import { homedir } from "node:os";
import log from "electron-log";
import { config as koboldConfig } from "../../../src/pi-config";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { BrowserWindow } from "electron";

/**
 * Extension Resolver
 * Handles resolving extension paths from pi-config.ts
 */
function resolveExtensionPath(spec: string): string {
  const projRoot = resolve(__dirname, "../../../");
  
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return resolve(projRoot, spec);
  }
  
  if (spec.startsWith("@0xkobold/")) {
    // Resolve from node_modules
    return resolve(projRoot, "node_modules", spec, "dist", "index.js");
  }
  
  return spec;
}

export class PIBridge {
  private agent: Agent | null = null;
  private extensionsLoaded: string[] = [];

  constructor() {
    this.initAgent();
  }

  private async initAgent(): Promise<void> {
    try {
      log.info("[PIBridge] Initializing PI Agent...");

      // Configure PI environment
      process.env.PI_CODING_AGENT_DIR = resolve(homedir(), ".0xkobold");

      // Create agent instance
      this.agent = new Agent({
        ui: "web", // Indicate we are using a web-based UI
        extensions: this.prepareExtensions(),
        // Pass other core config from 0xKobold's global settings
      });

      log.info("[PIBridge] PI Agent initialized successfully");
    } catch (err) {
      log.error("[PIBridge] Failed to initialize agent:", err);
    }
  }

  private prepareExtensions(): string[] {
    log.info("[PIBridge] Preparing extensions from pi-config.ts");
    
    // Resolve all paths from the main 0xKobold config
    const resolved = koboldConfig.extensions.map(spec => {
      try {
        return resolveExtensionPath(spec);
      } catch (e) {
        log.warn(`[PIBridge] Could not resolve extension: ${spec}`);
        return spec;
      }
    });

    log.info(`[PIBridge] Loading ${resolved.length} extensions`);
    return resolved;
  }

  /**
   * Send a message to the PI Agent
   */
  async sendMessage(content: string): Promise<void> {
    if (!this.agent) throw new Error("Agent not initialized");
    
    log.debug(`[PIBridge] Sending message: ${content.slice(0, 100)}...`);
    await this.agent.sendMessage({
      role: "user",
      content: content
    });
  }

  /**
   * Interrupt current agent operation
   */
  async interrupt(): Promise<void> {
    if (!this.agent) return;
    log.debug("[PIBridge] Interrupting agent");
    await this.agent.interrupt();
  }

  /**
   * Clear the current session
   */
  async clear(): Promise<void> {
    if (!this.agent) return;
    log.debug("[PIBridge] Clearing session");
    await this.agent.clear();
  }

  /**
   * Subscribe to agent messages and route them to all windows
   */
  setupMessageRouting(): void {
    if (!this.agent) return;

    this.agent.onMessage((msg: AgentMessage) => {
      log.debug("[PIBridge] New agent message received");
      
      // Broadcast to all open Electron windows
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send(IPC_CHANNELS.AGENT.MESSAGE, msg);
      });
    });
  }

  /**
   * Get the current agent state
   */
  async getState(): Promise<any> {
    if (!this.agent) return { isProcessing: false };
    
    return {
      isProcessing: this.agent.isProcessing(),
      currentModel: this.agent.currentModel,
      // contextTokens: this.agent.getContextTokens(),
    };
  }
}

// Singleton instance
export const piBridge = new PIBridge();
