/**
 * Twitch Extension for PI
 * 
 * Phase 1: Core API tools (stream, user, clips, search)
 * Phase 2: EventSub for real-time events
 * Phase 3: Moderation and channel management
 */

import { Type } from '@sinclair/typebox';
import type { ExtensionAPI, ExtensionContext, AgentToolResult } from '@mariozechner/pi-coding-agent';
import { TwitchAuth } from './auth.js';
import { TwitchAPI } from './api.js';
import { TwitchEventSub, TwitchEventType } from './eventsub.js';

// Module-level state
let auth: TwitchAuth | null = null;
let api: TwitchAPI | null = null;
let eventsub: TwitchEventSub | null = null;

// Subscribed channels for notifications
const subscribedChannels: Set<string> = new Set();
const channelCallbacks: Map<string, (event: TwitchEventType, data: Record<string, unknown>) => void> = new Map();

/**
 * Twitch Extension
 */
export default function twitchExtension(pi: ExtensionAPI) {
  // Get config from environment
  const config = {
    clientId: process.env.TWITCH_CLIENT_ID || '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
    channels: process.env.TWITCH_CHANNELS?.split(',').filter(Boolean) || [],
  };

  if (!config.clientId || !config.clientSecret) {
    return; // Silent fail if not configured
  }

  // Initialize auth and API
  auth = new TwitchAuth(config);
  api = new TwitchAPI(auth);

  // ============ PHASE 1: API TOOLS ============

  pi.registerTool({
    name: 'twitch_get_stream',
    label: 'Get Twitch Stream',
    description: 'Get current stream status for a Twitch broadcaster',
    parameters: Type.Object({
      broadcaster: Type.String({ description: 'Broadcaster login name (e.g., "moikapy")' }),
    }),
    async execute(_toolCallId, params): Promise<AgentToolResult<any>> {
      if (!api) return { content: [{ type: 'text' as const, text: 'API not initialized' }], details: { error: true } as any };
      
      try {
        const { broadcaster } = params as { broadcaster: string };
        const stream = await api.getStream(broadcaster);
        
        if (!stream) {
          return { content: [{ type: 'text' as const, text: `${broadcaster} is not currently live` }], details: { live: false } as any };
        }
        
        return {
          content: [{
            type: 'text' as const,
            text: `🔴 ${broadcaster} is LIVE!\nTitle: ${stream.title}\nGame: ${stream.game_name}\nViewers: ${stream.viewer_count}\nStarted: ${stream.started_at}`,
          }],
          details: { live: true, stream } as any,
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err}` }], details: { error: true } as any };
      }
    },
  });

  pi.registerTool({
    name: 'twitch_get_user',
    label: 'Get Twitch User',
    description: 'Get Twitch user/channel information',
    parameters: Type.Object({
      login: Type.String({ description: 'User login name' }),
    }),
    async execute(_toolCallId, params): Promise<AgentToolResult<any>> {
      if (!api) return { content: [{ type: 'text' as const, text: 'API not initialized' }], details: { error: true } as any };
      
      try {
        const { login } = params as { login: string };
        const user = await api.getUser(login);
        
        if (!user) {
          return { content: [{ type: 'text' as const, text: `User "${login}" not found` }], details: { found: false } as any };
        }
        
        return {
          content: [{
            type: 'text' as const,
            text: `${user.display_name} (@${user.login})\nType: ${user.broadcaster_type || user.type}\nBio: ${user.description || '(none)'}\nCreated: ${user.created_at}`,
          }],
          details: { found: true, user } as any,
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err}` }], details: { error: true } as any };
      }
    },
  });

  pi.registerTool({
    name: 'twitch_create_clip',
    label: 'Create Twitch Clip',
    description: 'Create a clip of the current live stream',
    parameters: Type.Object({
      broadcaster: Type.String({ description: 'Broadcaster login name' }),
    }),
    async execute(_toolCallId, params): Promise<AgentToolResult<any>> {
      if (!api) return { content: [{ type: 'text' as const, text: 'API not initialized' }], details: { error: true } as any };
      
      try {
        const { broadcaster } = params as { broadcaster: string };
        const clip = await api.createClip(broadcaster);
        
        return {
          content: [{ type: 'text' as const, text: `✅ Clip created!\n${clip.url}\nTitle: ${clip.title}` }],
          details: { clip } as any,
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err}` }], details: { error: true } as any };
      }
    },
  });

  pi.registerTool({
    name: 'twitch_search_channels',
    label: 'Search Twitch Channels',
    description: 'Search for Twitch channels by name',
    parameters: Type.Object({
      query: Type.String({ description: 'Search query' }),
    }),
    async execute(_toolCallId, params): Promise<AgentToolResult<any>> {
      if (!api) return { content: [{ type: 'text' as const, text: 'API not initialized' }], details: { error: true } as any };
      
      try {
        const { query } = params as { query: string };
        const channels = await api.searchChannels(query);
        
        if (channels.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No channels found' }], details: { count: 0 } as any };
        }
        
        const results = channels.slice(0, 10).map(c => `- ${c.name}: ${c.description}`).join('\n');
        return {
          content: [{ type: 'text' as const, text: `Found ${channels.length} channels:\n${results}` }],
          details: { count: channels.length } as any,
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err}` }], details: { error: true } as any };
      }
    },
  });

  // ============ PHASE 2: EVENT SUB TOOLS ============

  pi.registerTool({
    name: 'twitch_subscribe_channel',
    label: 'Subscribe to Channel',
    description: 'Subscribe to notifications when a channel goes live or offline',
    parameters: Type.Object({
      broadcaster: Type.String({ description: 'Broadcaster login name' }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext): Promise<AgentToolResult<any>> {
      const { broadcaster } = params as { broadcaster: string };
      
      if (!eventsub) {
        await connectEventSub(ctx);
      }
      
      if (!eventsub?.isConnected()) {
        return { content: [{ type: 'text' as const, text: 'Failed to connect to EventSub' }], details: { error: true } as any };
      }
      
      subscribedChannels.add(broadcaster.toLowerCase());
      
      channelCallbacks.set(broadcaster.toLowerCase(), (event, data) => {
        if (event === 'stream.online') {
          ctx.ui.notify(`🎮 ${broadcaster} is now LIVE!`, 'info');
        } else if (event === 'stream.offline') {
          ctx.ui.notify(`📴 ${broadcaster} went offline`, 'info');
        }
      });
      
      return {
        content: [{ type: 'text' as const, text: `✅ Subscribed to ${broadcaster} notifications` }],
        details: { subscribed: broadcaster } as any,
      };
    },
  });

  pi.registerTool({
    name: 'twitch_get_subscriptions',
    label: 'Get Subscriptions',
    description: 'List all channels you are subscribed to for notifications',
    parameters: Type.Object({}),
    async execute(): Promise<AgentToolResult<any>> {
      const channels = Array.from(subscribedChannels);
      
      if (channels.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No subscriptions. Use twitch_subscribe_channel first.' }], details: { subscriptions: [] } as any };
      }
      
      return {
        content: [{ type: 'text' as const, text: `Subscribed to ${channels.length} channels:\n${channels.join(', ')}` }],
        details: { subscriptions: channels } as any,
      };
    },
  });

  // ============ PHASE 3: MODERATION & CHANNEL MANAGEMENT ============

  pi.registerTool({
    name: 'twitch_get_chat_settings',
    label: 'Get Chat Settings',
    description: 'Get chat settings for a channel (slow mode, follower only, etc.)',
    parameters: Type.Object({
      broadcaster: Type.String({ description: 'Broadcaster login name' }),
    }),
    async execute(_toolCallId, params): Promise<AgentToolResult<any>> {
      if (!api) return { content: [{ type: 'text' as const, text: 'API not initialized' }], details: { error: true } as any };
      
      try {
        const { broadcaster } = params as { broadcaster: string };
        const user = await api.getUser(broadcaster);
        if (!user) {
          return { content: [{ type: 'text' as const, text: `User "${broadcaster}" not found` }], details: { error: true } as any };
        }
        
        const settings = await api.getChatSettings(user.id);
        
        const lines = [
          `Chat Settings for ${broadcaster}:`,
          `- Slow mode: ${settings.slow}s`,
          `- Followers only: ${settings.follower_delay >= 0 ? `${settings.follower_delay}m` : 'off'}`,
          `- Subscribers only: ${settings.subscriber ? 'Yes' : 'No'}`,
          `- Emote mode: ${settings.emote_mode ? 'On' : 'Off'}`,
          `- Unique chat: ${settings.unique_chat_mode ? 'On' : 'Off'}`,
        ];
        
        return { content: [{ type: 'text' as const, text: lines.join('\n') }], details: { settings } as any };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err}` }], details: { error: true } as any };
      }
    },
  });

  pi.registerTool({
    name: 'twitch_get_moderators',
    label: 'Get Moderators',
    description: 'Get the list of moderators for a channel',
    parameters: Type.Object({
      broadcaster: Type.String({ description: 'Broadcaster login name' }),
    }),
    async execute(_toolCallId, params): Promise<AgentToolResult<any>> {
      if (!api) return { content: [{ type: 'text' as const, text: 'API not initialized' }], details: { error: true } as any };
      
      try {
        const { broadcaster } = params as { broadcaster: string };
        const user = await api.getUser(broadcaster);
        if (!user) {
          return { content: [{ type: 'text' as const, text: `User "${broadcaster}" not found` }], details: { error: true } as any };
        }
        
        const mods = await api.getModerators(user.id);
        
        if (mods.length === 0) {
          return { content: [{ type: 'text' as const, text: `No moderators found for ${broadcaster}` }], details: { moderators: [] } as any };
        }
        
        const list = mods.map(m => `- ${m.display_name} (@${m.login})`).join('\n');
        return {
          content: [{ type: 'text' as const, text: `Moderators for ${broadcaster} (${mods.length}):\n${list}` }],
          details: { moderators: mods } as any,
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err}` }], details: { error: true } as any };
      }
    },
  });

  pi.registerTool({
    name: 'twitch_get_game',
    label: 'Get Game Info',
    description: 'Get information about a Twitch game/category',
    parameters: Type.Object({
      name: Type.String({ description: 'Game name (e.g., "Minecraft")' }),
    }),
    async execute(_toolCallId, params): Promise<AgentToolResult<any>> {
      if (!api) return { content: [{ type: 'text' as const, text: 'API not initialized' }], details: { error: true } as any };
      
      try {
        const { name } = params as { name: string };
        const categories = await api.searchCategories(name);
        
        if (categories.length === 0) {
          return { content: [{ type: 'text' as const, text: `No game found for "${name}"` }], details: { found: false } as any };
        }
        
        const game = categories[0];
        return {
          content: [{ type: 'text' as const, text: `🎮 ${game.name}\nID: ${game.id}` }],
          details: { found: true, game } as any,
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${err}` }], details: { error: true } as any };
      }
    },
  });

  // ============ COMMANDS ============

  pi.registerCommand('twitch-status', {
    description: 'Show Twitch connection status',
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (!auth) {
        ctx.ui.notify('Twitch extension not configured', 'info');
        return;
      }
      
      const apiStatus = auth.isAuthenticated() ? '✓ API' : '✗ API';
      const eventStatus = eventsub?.isConnected() ? '✓ EventSub' : '✗ EventSub';
      const subCount = subscribedChannels.size;
      
      ctx.ui.notify(`Twitch: ${apiStatus}, ${eventStatus}, ${subCount} subscriptions`, 'info');
    },
  });

  pi.registerCommand('twitch-following', {
    description: 'Show channels being monitored',
    handler: async (_args: string, ctx: ExtensionContext) => {
      const channels = config.channels || [];
      ctx.ui.notify(
        channels.length > 0 ? `Monitoring: ${channels.join(', ')}` : 'No channels configured',
        'info'
      );
    },
  });
}

/**
 * Connect to EventSub WebSocket
 */
async function connectEventSub(ctx: ExtensionContext): Promise<void> {
  const clientId = process.env.TWITCH_CLIENT_ID || '';
  
  eventsub = new TwitchEventSub({
    clientId,
    onEvent: (event, data) => {
      const broadcaster = (data.broadcaster_user_login as string || data.broadcaster_user_name as string || '').toLowerCase();
      const callback = channelCallbacks.get(broadcaster);
      if (callback) callback(event, data);
      console.log(`[Twitch] Event: ${event} for ${broadcaster}`);
    },
    onConnect: () => console.log('[Twitch] EventSub connected'),
    onDisconnect: () => console.log('[Twitch] EventSub disconnected'),
    onError: (err) => console.error('[Twitch] EventSub error:', err.message),
  });

  try {
    await eventsub.connect();
  } catch (err) {
    console.error('[Twitch] Failed to connect EventSub:', err);
  }
}
