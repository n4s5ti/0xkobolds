/**
 * IPC Channel Definitions
 * 
 * Central registry of all IPC channels between main and renderer.
 * Using a single source of truth prevents typos and ensures type safety.
 */

export const IPC_CHANNELS = {
  /** Agent communication channels */
  AGENT: {
    SEND: 'agent:send',
    MESSAGE: 'agent:message',
    INTERRUPT: 'agent:interrupt',
    GET_STATE: 'agent:get-state',
    CLEAR: 'agent:clear',
  },

  /** Skill management channels */
  SKILLS: {
    LIST: 'skills:list',
    EXECUTE: 'skills:execute',
    GET_DEFINITION: 'skills:get-definition',
    RELOADED: 'skills:reloaded',
  },

  /** Multi-agent tree channels */
  AGENT_TREE: {
    GET_TREE: 'agent-tree:get-tree',
    SPAWN: 'agent-tree:spawn',
    KILL: 'agent-tree:kill',
    GET_STATUS: 'agent-tree:get-status',
    ON_UPDATE: 'agent-tree:on-update',
  },

  /** Gateway (WebSocket server + client) channels */
  GATEWAY: {
    GET_STATUS: 'gateway:get-status',
    START_EMBEDDED: 'gateway:start-embedded',
    CONNECT: 'gateway:connect',
    DISCONNECT: 'gateway:disconnect',
    STOP: 'gateway:stop',
    RESTART: 'gateway:restart',
    ON_EVENT: 'gateway:on-event',
  },

  /** Session management channels */
  SESSIONS: {
    LIST: 'sessions:list',
    LOAD: 'sessions:load',
    SAVE: 'sessions:save',
    DELETE: 'sessions:delete',
    EXPORT: 'sessions:export',
  },

  /** System integration channels */
  SYSTEM: {
    SHOW_NOTIFICATION: 'system:show-notification',
    OPEN_EXTERNAL: 'system:open-external',
    SELECT_FOLDER: 'system:select-folder',
    SELECT_FILE: 'system:select-file',
    GET_VERSION: 'system:get-version',
  },

  /** App lifecycle channels */
  APP: {
    READY: 'app:ready',
    QUIT: 'app:quit',
    GET_SETTINGS: 'app:get-settings',
    SET_SETTINGS: 'app:set-settings',
    ON_SETTINGS_CHANGE: 'app:on-settings-change',
  },
} as const;

/** Helper type for IPC channel paths */
export type IpcChannelSection = keyof typeof IPC_CHANNELS;
export type IpcChannelName<T extends IpcChannelSection> = keyof typeof IPC_CHANNELS[T];
