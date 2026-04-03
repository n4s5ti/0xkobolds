/**
 * Twitch EventSub WebSocket Client
 * Real-time events via WebSocket transport
 */

import type { ExtensionContext } from '@mariozechner/pi-coding-agent';

export type TwitchEventType =
  | 'stream.online'
  | 'stream.offline'
  | 'channel.update'
  | 'channel.follow'
  | 'channel.subscribe'
  | 'channel.cheer'
  | 'channel.raid';

export interface EventSubConfig {
  clientId: string;
  onEvent: (eventType: TwitchEventType, data: Record<string, unknown>) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

interface EventSubWelcome {
  metadata: { message_type: 'session_welcome' };
  payload: { session: { id: string; keepalive_timeout_seconds: number } };
}

interface EventSubNotification {
  metadata: { message_type: 'notification'; message_id: string; message_timestamp: string };
  payload: {
    subscription: { type: string; status: string };
    event: Record<string, unknown>;
  };
}

interface EventSubKeepalive {
  metadata: { message_type: 'session_keepalive'; message_id: string; message_timestamp: string };
}

interface EventSubReconnect {
  metadata: { message_type: 'session_reconnect' };
  payload: { session: { id: string; reconnect_url: string } };
}

interface EventSubRevocation {
  metadata: { message_type: 'revocation' };
  payload: { subscription: { type: string; status: string } };
}

type EventSubMessage =
  | EventSubWelcome
  | EventSubNotification
  | EventSubKeepalive
  | EventSubReconnect
  | EventSubRevocation;

export class TwitchEventSub {
  private ws: WebSocket | null = null;
  private config: EventSubConfig;
  private sessionId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  private subscribedEvents: Set<string> = new Set();

  constructor(config: EventSubConfig) {
    this.config = config;
  }

  /**
   * Connect to EventSub WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

      this.ws.onopen = () => {
        this.config.onConnect?.();
      };

      this.ws.onclose = () => {
        this.config.onDisconnect?.();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.config.onError?.(new Error('WebSocket error'));
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      // Wait for session_welcome
      const checkSession = setInterval(() => {
        if (this.sessionId) {
          clearInterval(checkSession);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkSession);
        if (!this.sessionId) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as EventSubMessage;
      const type = msg.metadata.message_type;

      switch (type) {
        case 'session_welcome': {
          const welcome = msg as EventSubWelcome;
          this.sessionId = welcome.payload.session.id;
          console.log(`[EventSub] Connected: ${this.sessionId}`);
          this.startKeepalive(welcome.payload.session.keepalive_timeout_seconds);
          break;
        }

        case 'notification': {
          const notif = msg as EventSubNotification;
          if (notif.payload?.subscription?.type && notif.payload?.event) {
            this.config.onEvent(
              notif.payload.subscription.type as TwitchEventType,
              notif.payload.event
            );
          }
          break;
        }

        case 'session_keepalive': {
          // Heartbeat received - no action needed
          break;
        }

        case 'session_reconnect': {
          console.log('[EventSub] Reconnect requested');
          this.scheduleReconnect();
          break;
        }

        case 'revocation': {
          const rev = msg as EventSubRevocation;
          console.log(`[EventSub] Revoked: ${rev.payload.subscription.type}`);
          this.subscribedEvents.delete(rev.payload.subscription.type);
          break;
        }
        
        default:
          // Keepalive and other unhandled types
          break;
      }
    } catch (err) {
      console.error('[EventSub] Parse error:', err);
    }
  }

  /**
   * Start keepalive heartbeat
   */
  private startKeepalive(timeoutSeconds: number): void {
    const interval = (timeoutSeconds || 10) * 1000 * 0.7; // 70% of timeout
    this.keepaliveInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, interval);
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.config.onError?.(new Error('Max reconnect attempts'));
      return;
    }

    const delay = 1000 * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`[EventSub] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((err) => this.config.onError?.(err));
    }, delay);
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.maxReconnectAttempts = 0;
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
    }
    this.ws?.close();
    this.ws = null;
    this.sessionId = null;
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.sessionId !== null;
  }

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}
