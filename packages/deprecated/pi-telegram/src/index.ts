/**
 * Telegram Extension for PI
 * 
 * Provides Telegram bot integration:
 * - Send messages to chat
 * - Handle incoming messages
 * - Bot status and commands
 */

import { Type } from '@sinclair/typebox';
import type { ExtensionAPI, ExtensionContext, AgentToolResult } from '@mariozechner/pi-coding-agent';

// Types for Telegram message format
interface TelegramConfig {
  token: string;
  mode?: 'polling' | 'webhook';
  webhookUrl?: string;
  port?: number;
}

// We'll use dynamic import to check if node-telegram-bot-api is available
let telegramBot: any = null;
let botInstance: any = null;
let connected = false;

/**
 * Load Telegram bot module
 */
async function loadTelegramBot(): Promise<any> {
  if (telegramBot) return telegramBot;
  try {
    telegramBot = await import('node-telegram-bot-api');
    return telegramBot;
  } catch {
    return null;
  }
}

/**
 * Telegram Extension
 */
export default function telegramExtension(pi: ExtensionAPI) {
  const config: TelegramConfig = {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    mode: process.env.TELEGRAM_MODE as 'polling' | 'webhook' || 'polling',
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
    port: parseInt(process.env.TELEGRAM_PORT || '3000'),
  };

  if (!config.token) {
    return; // Silent fail if not configured
  }

  // ============ TOOLS ============

  pi.registerTool({
    name: 'telegram_send_message',
    label: 'Send Telegram Message',
    description: 'Send a message to a Telegram chat',
    parameters: Type.Object({
      chatId: Type.String({ description: 'Telegram chat ID (number or @channelname)' }),
      text: Type.String({ description: 'Message text to send' }),
      parseMode: Type.Optional(Type.Union([
        Type.Literal('HTML'),
        Type.Literal('Markdown'),
        Type.Literal('MarkdownV2'),
      ], { description: 'Formatting mode' })),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
      ctx: ExtensionContext
    ): Promise<AgentToolResult<any>> {
      const { chatId, text, parseMode } = params as {
        chatId: string;
        text: string;
        parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      };

      try {
        // Ensure bot is initialized
        if (!botInstance) {
          await initializeBot(ctx, config);
        }

        if (!botInstance) {
          return { 
            content: [{ type: 'text' as const, text: 'Telegram bot not initialized. Check token.' }],
            details: { error: true } as any 
          };
        }

        const options: any = {};
        if (parseMode) options.parse_mode = parseMode;

        await botInstance.sendMessage(chatId, text, options);
        
        return {
          content: [{ type: 'text' as const, text: `✅ Message sent to ${chatId}` }],
          details: { sent: true, chatId } as any,
        };
      } catch (err) {
        return { 
          content: [{ type: 'text' as const, text: `Error: ${err}` }],
          details: { error: true } as any 
        };
      }
    },
  });

  pi.registerTool({
    name: 'telegram_send_photo',
    label: 'Send Telegram Photo',
    description: 'Send a photo to a Telegram chat',
    parameters: Type.Object({
      chatId: Type.String({ description: 'Telegram chat ID' }),
      photo: Type.String({ description: 'Photo URL or file path' }),
      caption: Type.Optional(Type.String({ description: 'Photo caption' })),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
      ctx: ExtensionContext
    ): Promise<AgentToolResult<any>> {
      const { chatId, photo, caption } = params as {
        chatId: string;
        photo: string;
        caption?: string;
      };

      try {
        if (!botInstance) {
          await initializeBot(ctx, config);
        }

        if (!botInstance) {
          return { 
            content: [{ type: 'text' as const, text: 'Telegram bot not initialized' }],
            details: { error: true } as any 
          };
        }

        await botInstance.sendPhoto(chatId, photo, { caption });
        
        return {
          content: [{ type: 'text' as const, text: `✅ Photo sent to ${chatId}` }],
          details: { sent: true } as any,
        };
      } catch (err) {
        return { 
          content: [{ type: 'text' as const, text: `Error: ${err}` }],
          details: { error: true } as any 
        };
      }
    },
  });

  pi.registerTool({
    name: 'telegram_get_me',
    label: 'Get Bot Info',
    description: 'Get information about the Telegram bot',
    parameters: Type.Object({}),
    async execute(): Promise<AgentToolResult<any>> {
      try {
        if (!botInstance) {
          return { 
            content: [{ type: 'text' as const, text: 'Telegram bot not initialized' }],
            details: { error: true } as any 
          };
        }

        const me = await botInstance.getMe();
        
        return {
          content: [{
            type: 'text' as const,
            text: `🤖 ${me.first_name}\n@${me.username}\nID: ${me.id}\nCan join groups: ${me.can_join_groups ? 'Yes' : 'No'}`,
          }],
          details: { bot: me } as any,
        };
      } catch (err) {
        return { 
          content: [{ type: 'text' as const, text: `Error: ${err}` }],
          details: { error: true } as any 
        };
      }
    },
  });

  // ============ COMMANDS ============

  pi.registerCommand('telegram-status', {
    description: 'Show Telegram bot status',
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (!config.token) {
        ctx.ui.notify('Telegram: Not configured (TELEGRAM_BOT_TOKEN missing)', 'warning');
        return;
      }

      if (!botInstance) {
        ctx.ui.notify('Telegram: Initializing bot...', 'info');
        await initializeBot(ctx, config);
      }

      const status = connected ? '✓ Connected' : '✗ Disconnected';
      ctx.ui.notify(`Telegram: ${status}`, connected ? 'info' : 'warning');
    },
  });

  pi.registerCommand('telegram-connect', {
    description: 'Connect Telegram bot',
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (!config.token) {
        ctx.ui.notify('Telegram: Not configured', 'error');
        return;
      }

      await initializeBot(ctx, config);
      
      if (connected) {
        ctx.ui.notify('Telegram: ✓ Connected', 'info');
      } else {
        ctx.ui.notify('Telegram: ✗ Failed to connect', 'error');
      }
    },
  });

  pi.registerCommand('telegram-disconnect', {
    description: 'Disconnect Telegram bot',
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (botInstance) {
        try {
          await botInstance.stopPolling();
          connected = false;
          botInstance = null;
          ctx.ui.notify('Telegram: Disconnected', 'info');
        } catch (err) {
          ctx.ui.notify(`Telegram: Error disconnecting - ${err}`, 'error');
        }
      } else {
        ctx.ui.notify('Telegram: Already disconnected', 'info');
      }
    },
  });
}

/**
 * Initialize Telegram bot
 */
async function initializeBot(ctx: ExtensionContext, config: TelegramConfig): Promise<void> {
  try {
    const TelegramBot = await loadTelegramBot();
    
    if (!TelegramBot) {
      ctx.ui.notify('Telegram: node-telegram-bot-api not installed', 'error');
      return;
    }

    botInstance = new TelegramBot.default(config.token, {
      polling: config.mode === 'polling',
      webHook: config.mode === 'webhook' ? { port: config.port } : false,
    });

    // Handle messages
    botInstance.on('message', (msg: any) => {
      if (msg.text) {
        console.log(`[Telegram] Message from ${msg.from?.username}: ${msg.text}`);
      }
    });

    // Handle polling errors
    botInstance.on('polling_error', (err: Error) => {
      console.error('[Telegram] Polling error:', err.message);
      connected = false;
    });

    connected = true;
    console.log('[Telegram] Bot started');
  } catch (err) {
    console.error('[Telegram] Failed to start:', err);
    connected = false;
  }
}
