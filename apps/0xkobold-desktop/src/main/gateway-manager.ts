/**
 * Gateway Integration for Desktop App
 * 
 * Two modes:
 * 1. Embedded Mode - App runs the gateway server locally (WebSocket + HTTP)
 * 2. Connect Mode - App connects to an external gateway
 */

import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { GatewayStatus } from '../shared/api-types';
import log from 'electron-log';

// ============================================================================
// Gateway Types
// ============================================================================

export type GatewayMode = 'embedded' | 'connect' | 'disconnected';

export interface GatewayConfig {
  mode: GatewayMode;
  port: number;
  host: string;
  externalUrl?: string; // For connect mode
}

export interface GatewayConnection {
  mode: GatewayMode;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  ws?: WebSocket;
  port?: number;
  host?: string;
  externalUrl?: string;
  error?: string;
}

// ============================================================================
// State
// ============================================================================

let connection: GatewayConnection = {
  mode: 'disconnected',
  status: 'disconnected',
};

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const RECONNECT_DELAY = 3000;

// ============================================================================
// Embedded Gateway (HTTP + WebSocket server in main process)
// ============================================================================

let embeddedServer: ReturnType<typeof import('http').createServer> | null = null;
let embeddedWs: ReturnType<typeof import('ws').WebSocketServer> | null = null;

/**
 * Start embedded gateway server
 */
export async function startEmbeddedGateway(port: number = 18789, host: string = '127.0.0.1'): Promise<void> {
  if (connection.status === 'connected' && connection.mode === 'embedded') {
    log.info('[Gateway] Already running embedded');
    return;
  }

  try {
    // Stop any existing connection
    await disconnect();

    const http = await import('http');
    const { WebSocketServer } = await import('ws');

    // Create HTTP server
    embeddedServer = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        type: 'gateway-info',
        version: '0xKobold Desktop',
        port,
        host,
        timestamp: new Date().toISOString(),
      }));
    });

    // Create WebSocket server
    embeddedWs = new WebSocketServer({ server: embeddedServer });

    embeddedWs.on('connection', (ws, req) => {
      log.info('[Gateway] Client connected to embedded gateway');
      ws.send(JSON.stringify({ type: 'connected', status: 'ok' }));

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          handleEmbeddedMessage(msg, ws);
        } catch (err) {
          log.error('[Gateway] Invalid message:', err);
        }
      });

      ws.on('close', () => {
        log.info('[Gateway] Client disconnected');
      });
    });

    // Start listening
    await new Promise<void>((resolve, reject) => {
      embeddedServer!.listen(port, host, () => {
        log.info(`[Gateway] Embedded server started on ws://${host}:${port}`);
        resolve();
      });
      embeddedServer!.on('error', reject);
    });

    connection = {
      mode: 'embedded',
      status: 'connected',
      port,
      host,
    };

    notifyRenderer();
  } catch (err: any) {
    log.error('[Gateway] Failed to start embedded:', err);
    connection = { mode: 'disconnected', status: 'error', error: err.message };
    notifyRenderer();
  }
}

/**
 * Stop embedded gateway server
 */
export async function stopEmbeddedGateway(): Promise<void> {
  if (connection.mode !== 'embedded') return;

  embeddedWs?.close();
  embeddedServer?.close();
  embeddedWs = null;
  embeddedServer = null;

  connection = { mode: 'disconnected', status: 'disconnected' };
  log.info('[Gateway] Embedded server stopped');
  notifyRenderer();
}

/**
 * Handle messages to embedded gateway
 */
function handleEmbeddedMessage(msg: any, ws: import('ws').WebSocket): void {
  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    case 'prompt':
      // TODO: Route to PI agent
      ws.send(JSON.stringify({ type: 'response', content: 'Gateway connected' }));
      break;
    default:
      log.debug('[Gateway] Unknown message type:', msg.type);
  }
}

// ============================================================================
// Connect Mode (WebSocket client to external gateway)
// ============================================================================

let clientWs: WebSocket | null = null;

/**
 * Connect to an external gateway
 */
export async function connectToGateway(url: string): Promise<void> {
  if (connection.status === 'connected' && connection.mode === 'connect') {
    log.info('[Gateway] Already connected to', url);
    return;
  }

  try {
    // Stop any existing connection
    await disconnect();

    const { WebSocket } = await import('ws');
    connection = {
      mode: 'connect',
      status: 'connecting',
      externalUrl: url,
    };
    notifyRenderer();

    clientWs = new WebSocket(url);

    clientWs.on('open', () => {
      log.info('[Gateway] Connected to external gateway:', url);
      connection.status = 'connected';
      notifyRenderer();
    });

    clientWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleExternalMessage(msg);
      } catch (err) {
        log.debug('[Gateway] Non-JSON message received');
      }
    });

    clientWs.on('close', () => {
      log.info('[Gateway] Disconnected from gateway');
      connection.status = 'disconnected';
      connection.ws = undefined;
      notifyRenderer();
      scheduleReconnect();
    });

    clientWs.on('error', (err) => {
      log.error('[Gateway] Connection error:', err.message);
      connection.status = 'error';
      connection.error = err.message;
      notifyRenderer();
    });

  } catch (err: any) {
    log.error('[Gateway] Failed to connect:', err);
    connection = { mode: 'disconnected', status: 'error', error: err.message };
    notifyRenderer();
  }
}

/**
 * Disconnect from gateway
 */
export async function disconnect(): Promise<void> {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (clientWs) {
    clientWs.close();
    clientWs = null;
  }

  if (connection.mode === 'embedded') {
    await stopEmbeddedGateway();
  }

  connection = { mode: 'disconnected', status: 'disconnected' };
  notifyRenderer();
}

/**
 * Schedule reconnection attempt
 */
function scheduleReconnect(): void {
  if (connection.mode !== 'connect' || !connection.externalUrl) return;

  reconnectTimer = setTimeout(async () => {
    if (connection.mode === 'connect' && connection.status === 'disconnected') {
      log.info('[Gateway] Attempting reconnection...');
      await connectToGateway(connection.externalUrl!);
    }
  }, RECONNECT_DELAY);
}

/**
 * Handle messages from external gateway
 */
function handleExternalMessage(msg: any): void {
  log.debug('[Gateway] External message:', msg.type);

  // Broadcast to renderer
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(IPC_CHANNELS.GATEWAY.ON_EVENT, {
      type: msg.type,
      payload: msg,
    });
  });
}

/**
 * Send message to connected gateway
 */
export function sendToGateway(msg: object): void {
  if (clientWs?.readyState === 1) { // OPEN
    clientWs.send(JSON.stringify(msg));
  }
}

// ============================================================================
// Status & Notifications
// ============================================================================

/**
 * Get current gateway status
 */
export function getGatewayStatus(): GatewayStatus {
  return {
    running: connection.status === 'connected',
    port: connection.port || 0,
    host: connection.host || '',
    url: connection.mode === 'embedded'
      ? `ws://${connection.host}:${connection.port}`
      : connection.externalUrl || '',
    agents: 0,
    clients: connection.status === 'connected' ? 1 : 0,
  };
}

/**
 * Notify renderer of gateway state change
 */
function notifyRenderer(): void {
  const status = getGatewayStatus();
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(IPC_CHANNELS.GATEWAY.ON_EVENT, {
      type: 'gateway.status',
      payload: {
        ...status,
        mode: connection.mode,
        status: connection.status,
        error: connection.error,
      },
    });
  });
}
