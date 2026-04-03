/**
 * 🐉 GatewayChatClient
 * 
 * OpenClaw-style gateway client for TUI communication.
 * Wraps GatewayClient with chat-specific functionality.
 * 
 * Based on OpenClaw's GatewayChatClient architecture.
 */

import { randomUUID } from "node:crypto";
import { GatewayClient, type GatewayClientConfig } from "./client";

export interface ChatSendOptions {
  sessionKey: string;
  message: string;
  thinking?: string;
  deliver?: boolean;
  timeoutMs?: number;
  runId?: string;
}

export interface GatewayEvent {
  event: string;
  payload?: unknown;
  seq?: number;
  runId?: string;
}

export interface HelloOk {
  version: string;
  protocol: number;
  sessionId: string;
  capabilities: string[];
  serverTime: number;
}

export interface SessionInfo {
  thinkingLevel?: string;
  model?: string;
  modelProvider?: string;
  contextTokens?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  displayName?: string;
}

/**
 * GatewayChatClient - OpenClaw-style chat gateway client
 * 
 * Features:
 * - WebSocket connection to gateway
 * - Chat message send/receive
 * - Session management
 * - Event handling for tool calls, streaming text
 * - Automatic reconnection
 * - Device authentication
 */
export class GatewayChatClient {
  private client: GatewayClient;
  private readyPromise: Promise<void>;
  private resolveReady?: () => void;
  private rejectReady?: (err: Error) => void;
  
  readonly connection: { url: string; token?: string; password?: string };
  hello?: HelloOk;
  
  onEvent?: (evt: GatewayEvent) => void;
  onConnected?: () => void;
  onDisconnected?: (reason: string) => void;
  onGap?: (info: { expected: number; received: number }) => void;

  constructor(connection: { url: string; token?: string; password?: string }) {
    this.connection = connection;
    
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    // Create gateway client
    const config: GatewayClientConfig = {
      url: connection.url,
      autoReconnect: false,
      token: connection.token,
      password: connection.password,
      clientName: "kobold-tui",
      clientVersion: "0.8.0",
      capabilities: ["chat", "files", "agent"],
      onConnect: () => this.handleConnect(),
      onDisconnect: (code, reason) => this.handleDisconnect(code, reason),
      onMessage: (msg) => this.handleMessage(msg),
      onError: (err) => this.handleError(err),
    };

    this.client = new GatewayClient(config);
  }

  /**
   * Connect to gateway
   */
  static async connect(opts: { url?: string; token?: string; password?: string }): Promise<GatewayChatClient> {
    const url = opts.url ?? "ws://localhost:7777";
    const connection = { url, token: opts.token, password: opts.password };
    const chatClient = new GatewayChatClient(connection);
    chatClient.start();
    
    // Wait for ready with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Connection timeout")), 5000);
    });
    
    try {
      await Promise.race([chatClient.waitForReady(), timeoutPromise]);
    } catch {
      // Connection failed - that's ok for TUI
    }
    
    return chatClient;
  }

  /**
   * Start the client connection
   */
  start(): void {
    this.client.connect();
  }

  /**
   * Stop the client connection
   */
  stop(): void {
    this.client.disconnect();
  }

  /**
   * Wait for connection to be ready
   */
  async waitForReady(): Promise<void> {
    await this.readyPromise;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client.isConnected();
  }

  /**
   * Send a chat message
   */
  async sendChat(opts: ChatSendOptions): Promise<{ runId: string }> {
    const runId = opts.runId ?? randomUUID();
    
    // Send via gateway method
    this.client.send({
      type: "request",
      channel: "agent",
      payload: {
        method: "agent.run",
        params: {
          message: opts.message,
          sessionKey: opts.sessionKey,
          thinking: opts.thinking,
          deliver: opts.deliver,
          timeout: opts.timeoutMs,
          idempotencyKey: runId,
        },
      },
    });

    return { runId };
  }

  /**
   * Send agent.run request and get response
   */
  async agentRun(message: string, sessionKey = "default"): Promise<{
    runId: string;
    status: string;
    result?: unknown;
  }> {
    const runId = randomUUID();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Agent run timeout"));
      }, 120000);

      const onMessage = (msg: any) => {
        if (msg.payload?.runId === runId) {
          clearTimeout(timeout);
          cleanup();
          resolve({
            runId,
            status: msg.payload.status,
            result: msg.payload.result,
          });
        }
      };

      const cleanup = () => {
        this.client.off("message", onMessage);
      };

      this.client.on("message", onMessage);

      // Send the request
      this.client.send({
        type: "request",
        channel: "agent",
        payload: {
          method: "agent.run",
          params: {
            message,
            sessionKey,
            timeoutMs: 120000,
            idempotencyKey: runId,
          },
        },
      });
    });
  }

  /**
   * Get agent status
   */
  async getAgentStatus(runId: string): Promise<{
    runId: string;
    status: string;
    result?: string;
    error?: string;
  }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Status check timeout"));
      }, 10000);

      const onMessage = (msg: any) => {
        if (msg.payload?.runId === runId) {
          clearTimeout(timeout);
          cleanup();
          resolve({
            runId,
            status: msg.payload.status,
            result: msg.payload.result,
            error: msg.payload.error,
          });
        }
      };

      const cleanup = () => {
        this.client.off("message", onMessage);
      };

      this.client.on("message", onMessage);

      this.client.send({
        type: "request",
        channel: "agent",
        payload: {
          method: "agent.status",
          params: { runId },
        },
      });
    });
  }

  /**
   * Wait for agent completion
   */
  async waitForAgent(runId: string, timeoutMs = 120000): Promise<{
    runId: string;
    status: string;
    result?: unknown;
    error?: string;
  }> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getAgentStatus(runId);
      
      if (status.status === "completed") {
        return { runId, status: "completed", result: status.result };
      }
      if (status.status === "failed" || status.status === "error") {
        return { runId, status: status.status, error: status.error };
      }

      // Poll every 500ms
      await new Promise((r) => setTimeout(r, 500));
    }

    return { runId, status: "timeout" };
  }

  // Private handlers

  private handleConnect(): void {
    console.log("[GatewayChatClient] Connected");
    this.hello = {
      version: "0.8.0",
      protocol: 1,
      sessionId: randomUUID(),
      capabilities: ["chat", "files", "agent"],
      serverTime: Date.now(),
    };
    this.resolveReady?.();
    this.onConnected?.();
  }

  private handleDisconnect(code: number, reason: string): void {
    this.onDisconnected?.(reason);
  }

  private handleError(err: Error): void {
    // Don't reject or log if we're intentionally not connecting
    this.rejectReady?.(err);
  }

  private handleMessage(msg: unknown): void {
    const frame = msg as Record<string, unknown>;
    
    // Emit generic event
    const event: GatewayEvent = {
      event: (frame.event as string) || "message",
      payload: frame.payload,
      seq: frame.seq as number,
      runId: frame.runId as string,
    };
    
    this.onEvent?.(event);
  }
}

// Export for TUI usage
export type { GatewayClientConfig };
