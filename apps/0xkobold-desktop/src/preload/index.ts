/**
 * 0xKobold Desktop - Preload Script
 * 
 * This script runs in an isolated context before the renderer loads.
 * It exposes a controlled API to the renderer via contextBridge.
 * 
 * Security: The renderer cannot access Node.js APIs directly.
 * All communication must go through this bridge.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { 
  AgentMessage,
  SerializableSkill,
  SerializableAgentNode,
  GatewayStatus,
  GatewayMode,
  GatewayConfig,
  SessionMetadata,
  DesktopSettings,
  IpcResponse,
  AgentState,
} from '../shared/api-types';

/**
 * Type-safe IPC wrapper
 */
function createIPCHandler<T, Args extends unknown[] = []>(
  channel: string
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    const response = await ipcRenderer.invoke(channel, ...args) as IpcResponse<T>;
    if (!response.success) {
      throw new Error(response.error || 'Unknown IPC error');
    }
    return response.data as T;
  };
}

/**
 * Type-safe event emitter wrapper
 */
function createEventEmitter<T>(
  channel: string
): (callback: (data: T) => void) => () => void {
  return (callback: (data: T) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: T) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

/**
 * Agent API - Communication with the PI agent
 */
const agentAPI = {
  /** Send a message to the agent */
  send: createIPCHandler<void, [string]>(IPC_CHANNELS.AGENT.SEND),

  /** Interrupt the current agent operation */
  interrupt: createIPCHandler<void>(IPC_CHANNELS.AGENT.INTERRUPT),

  /** Get current agent state */
  getState: createIPCHandler<AgentState>(IPC_CHANNELS.AGENT.GET_STATE),

  /** Clear the current conversation */
  clear: createIPCHandler<void>(IPC_CHANNELS.AGENT.CLEAR),

  /** Subscribe to agent messages */
  onMessage: createEventEmitter<AgentMessage>(IPC_CHANNELS.AGENT.MESSAGE),
};

/**
 * Skills API - Hot-reloaded skill system
 */
const skillsAPI = {
  /** List all available skills */
  list: createIPCHandler<SerializableSkill[]>(IPC_CHANNELS.SKILLS.LIST),

  /** Execute a skill by name */
  execute: createIPCHandler<unknown, [string, unknown]>(IPC_CHANNELS.SKILLS.EXECUTE),

  /** Get skill parameter definition */
  getDefinition: createIPCHandler<Record<string, unknown>, [string]>(
    IPC_CHANNELS.SKILLS.GET_DEFINITION
  ),

  /** Subscribe to skill reload events */
  onReload: createEventEmitter<SerializableSkill[]>(IPC_CHANNELS.SKILLS.RELOADED),
};

/**
 * Agent Tree API - Multi-agent orchestration
 */
const agentTreeAPI = {
  /** Get the current agent hierarchy tree */
  getTree: createIPCHandler<SerializableAgentNode[]>(IPC_CHANNELS.AGENT_TREE.GET_TREE),

  /** Spawn a new subagent */
  spawn: createIPCHandler<string, [string, { parentId?: string; model?: string }]>(
    IPC_CHANNELS.AGENT_TREE.SPAWN
  ),

  /** Kill an agent by ID */
  kill: createIPCHandler<void, [string]>(IPC_CHANNELS.AGENT_TREE.KILL),

  /** Get detailed status of an agent */
  getStatus: createIPCHandler<SerializableAgentNode, [string]>(
    IPC_CHANNELS.AGENT_TREE.GET_STATUS
  ),

  /** Subscribe to agent tree updates */
  onUpdate: createEventEmitter<SerializableAgentNode[]>(IPC_CHANNELS.AGENT_TREE.ON_UPDATE),
};

/**
 * Gateway API - WebSocket gateway control (embedded or connect mode)
 */
const gatewayAPI = {
  /** Get current gateway status */
  getStatus: createIPCHandler<GatewayStatus>(IPC_CHANNELS.GATEWAY.GET_STATUS),

  /** Start embedded gateway server */
  startEmbedded: createIPCHandler<void, [number, string]>(
    IPC_CHANNELS.GATEWAY.START_EMBEDDED
  ),

  /** Connect to an external gateway */
  connect: createIPCHandler<void, [string]>(IPC_CHANNELS.GATEWAY.CONNECT),

  /** Disconnect from gateway */
  disconnect: createIPCHandler<void>(IPC_CHANNELS.GATEWAY.DISCONNECT),

  /** Stop gateway server */
  stop: createIPCHandler<void>(IPC_CHANNELS.GATEWAY.STOP),

  /** Restart gateway server */
  restart: createIPCHandler<void>(IPC_CHANNELS.GATEWAY.RESTART),

  /** Subscribe to gateway events (status changes, messages) */
  onEvent: createEventEmitter<{ type: string; payload: unknown }>(IPC_CHANNELS.GATEWAY.ON_EVENT),
};

/**
 * Sessions API - Session management
 */
const sessionsAPI = {
  /** List all saved sessions */
  list: createIPCHandler<SessionMetadata[]>(IPC_CHANNELS.SESSIONS.LIST),

  /** Load a session by ID */
  load: createIPCHandler<AgentMessage[], [string]>(IPC_CHANNELS.SESSIONS.LOAD),

  /** Save current session */
  save: createIPCHandler<string, [string, AgentMessage[]]>(IPC_CHANNELS.SESSIONS.SAVE),

  /** Delete a session */
  delete: createIPCHandler<void, [string]>(IPC_CHANNELS.SESSIONS.DELETE),

  /** Export session to file */
  export: createIPCHandler<void, [string, string]>(IPC_CHANNELS.SESSIONS.EXPORT),
};

/**
 * System API - Native system integration
 */
const systemAPI = {
  /** Show a native notification */
  showNotification: createIPCHandler<void, [string, string]>(
    IPC_CHANNELS.SYSTEM.SHOW_NOTIFICATION
  ),

  /** Open URL in external browser */
  openExternal: createIPCHandler<void, [string]>(IPC_CHANNELS.SYSTEM.OPEN_EXTERNAL),

  /** Open folder selection dialog */
  selectFolder: createIPCHandler<string | null>(IPC_CHANNELS.SYSTEM.SELECT_FOLDER),

  /** Open file selection dialog */
  selectFile: createIPCHandler<string | null, [{ 
    filters?: { name: string; extensions: string[] }[] 
  }]>(IPC_CHANNELS.SYSTEM.SELECT_FILE),

  /** Get app version */
  getVersion: createIPCHandler<string>(IPC_CHANNELS.SYSTEM.GET_VERSION),
};

/**
 * App API - Application settings and lifecycle
 */
const appAPI = {
  /** Get all settings */
  getSettings: createIPCHandler<DesktopSettings>(IPC_CHANNELS.APP.GET_SETTINGS),

  /** Update settings */
  setSettings: createIPCHandler<void, [Partial<DesktopSettings>]>(
    IPC_CHANNELS.APP.SET_SETTINGS
  ),

  /** Subscribe to settings changes */
  onSettingsChange: createEventEmitter<DesktopSettings>(IPC_CHANNELS.APP.ON_SETTINGS_CHANGE),

  /** Quit the application */
  quit: () => ipcRenderer.send(IPC_CHANNELS.APP.QUIT),
};

/**
 * Combined API exposed to renderer
 */
const koboldAPI = {
  agent: agentAPI,
  skills: skillsAPI,
  agentTree: agentTreeAPI,
  gateway: gatewayAPI,
  sessions: sessionsAPI,
  system: systemAPI,
  app: appAPI,
};

// Expose the API to window.koboldAPI
contextBridge.exposeInMainWorld('koboldAPI', koboldAPI);

// Also expose versions for debugging
contextBridge.exposeInMainWorld('versions', {
  node: process.versions.node,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
});

// Type declaration for TypeScript
declare global {
  interface Window {
    koboldAPI: typeof koboldAPI;
    versions: {
      node: string;
      electron: string;
      chrome: string;
    };
  }
}

export type KoboldAPI = typeof koboldAPI;
