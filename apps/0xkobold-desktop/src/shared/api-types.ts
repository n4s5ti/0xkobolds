/**
 * Shared API Type Definitions
 * 
 * Types synchronized between main and renderer processes.
 * These mirror the 0xKobold internal types but are serializable for IPC.
 */

import type { AgentMessage } from '@mariozechner/pi-agent-core';

// Re-export AgentMessage for convenience
export type { AgentMessage };

/** Skill definition from 0xKobold */
export interface SerializableSkill {
  name: string;
  description: string;
  risk: 'safe' | 'medium' | 'high';
  parameters: Record<string, unknown>;
}

/** Agent node in the agent tree */
export interface SerializableAgentNode {
  id: string;
  parentId?: string;
  name: string;
  type: 'coordinator' | 'specialist' | 'researcher' | 'planner' | 'reviewer' | 'worker' | 'scout';
  status: 'idle' | 'running' | 'completed' | 'error' | 'compacting';
  depth: number;
  task?: string;
  model?: string;
  spawnedAt: string; // ISO date
  children: string[];
  progress?: number;
  error?: string;
}

/** Gateway connection status */
export interface GatewayStatus {
  running: boolean;
  port: number;
  host: string;
  url: string;
  agents: number;
  clients: number;
  mode?: GatewayMode;
  status?: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
}

/** Gateway connection modes */
export type GatewayMode = 'embedded' | 'connect' | 'disconnected';


/** Gateway configuration for desktop app */
export interface GatewayConfig {
  mode: GatewayMode;
  port: number;
  host: string;
  externalUrl?: string;
}

/** Session metadata */
export interface SessionMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  hasContext: boolean;
}

/** Desktop-specific settings */
export interface DesktopSettings {
  // Window settings
  'desktop.window.width': number;
  'desktop.window.height': number;
  'desktop.window.alwaysOnTop': boolean;
  'desktop.window.transparent': boolean;
  'desktop.window.frameless': boolean;

  // System integration
  'desktop.system.startOnLogin': boolean;
  'desktop.system.minimizeToTray': boolean;
  'desktop.system.showNotifications': boolean;

  // Global shortcuts
  'desktop.shortcuts.toggleWindow': string;
  'desktop.shortcuts.newChat': string;

  // Gateway
  'desktop.gateway.embedded': boolean;
  'desktop.gateway.autoStart': boolean;
  'desktop.gateway.port': number;

  // Appearance
  'desktop.appearance.theme': 'draconic' | 'light' | 'system';
  'desktop.appearance.fontSize': 'small' | 'medium' | 'large';
  'desktop.appearance.compactMode': boolean;
}

/** Default settings */
export const DEFAULT_SETTINGS: DesktopSettings = {
  'desktop.window.width': 1400,
  'desktop.window.height': 900,
  'desktop.window.alwaysOnTop': false,
  'desktop.window.transparent': false,
  'desktop.window.frameless': true,

  'desktop.system.startOnLogin': false,
  'desktop.system.minimizeToTray': true,
  'desktop.system.showNotifications': true,

  'desktop.shortcuts.toggleWindow': 'CommandOrControl+Shift+K',
  'desktop.shortcuts.newChat': 'CommandOrControl+Shift+N',

  'desktop.gateway.embedded': true,
  'desktop.gateway.autoStart': true,
  'desktop.gateway.port': 18789,

  'desktop.appearance.theme': 'draconic',
  'desktop.appearance.fontSize': 'medium',
  'desktop.appearance.compactMode': false,
};

/** IPC Response wrapper */
export interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Agent state for UI */
export interface AgentState {
  isProcessing: boolean;
  currentModel?: string;
  contextTokens?: number;
  maxContextTokens?: number;
}
