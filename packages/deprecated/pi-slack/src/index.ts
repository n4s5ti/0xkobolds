/**
 * Slack Extension for PI
 * 
 * Provides Slack integration:
 * - Send messages via webhook
 * - Post to channels
 * - Status and commands
 */

import { Type } from '@sinclair/typebox';
import type { ExtensionAPI, ExtensionContext, AgentToolResult } from '@mariozechner/pi-coding-agent';

interface SlackConfig {
  webhookUrl?: string;
  botToken?: string;
  signingSecret?: string;
}

let webhookUrl: string | undefined;
let botToken: string | undefined;
let connected = false;

/**
 * Slack Extension
 */
export default function slackExtension(pi: ExtensionAPI) {
  const config: SlackConfig = {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  };

  webhookUrl = config.webhookUrl;
  botToken = config.botToken;

  if (!config.webhookUrl && !config.botToken) {
    return; // Silent fail if not configured
  }

  // ============ TOOLS ============

  pi.registerTool({
    name: 'slack_send_message',
    label: 'Send Slack Message',
    description: 'Send a message to Slack via webhook',
    parameters: Type.Object({
      text: Type.String({ description: 'Message text to send' }),
      channel: Type.Optional(Type.String({ description: 'Channel override (requires bot token)' })),
      username: Type.Optional(Type.String({ description: 'Bot username override' })),
      iconEmoji: Type.Optional(Type.String({ description: 'Emoji icon (e.g., ":robot:")' })),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate
    ): Promise<AgentToolResult<any>> {
      const { text, channel, username, iconEmoji } = params as {
        text: string;
        channel?: string;
        username?: string;
        iconEmoji?: string;
      };

      try {
        const payload: Record<string, string> = { text };
        if (channel) payload.channel = channel;
        if (username) payload.username = username;
        if (iconEmoji) payload.icon_emoji = iconEmoji;

        if (webhookUrl) {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new Error(`Slack API error: ${response.status}`);
          }

          return {
            content: [{ type: 'text' as const, text: `✅ Message sent to Slack${channel ? ` (#${channel})` : ''}` }],
            details: { sent: true, channel } as any,
          };
        } else {
          return {
            content: [{ type: 'text' as const, text: 'No webhook URL configured' }],
            details: { error: true } as any,
          };
        }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err}` }],
          details: { error: true } as any,
        };
      }
    },
  });

  pi.registerTool({
    name: 'slack_post_message',
    label: 'Post to Slack Channel',
    description: 'Post a rich message to Slack using Web API (requires bot token)',
    parameters: Type.Object({
      channel: Type.String({ description: 'Channel ID or name (e.g., "C123456" or "#general")' }),
      text: Type.String({ description: 'Message text' }),
      blocks: Type.Optional(Type.Array(Type.Any(), { description: 'Slack Block Kit blocks' })),
      attachments: Type.Optional(Type.Array(Type.Any(), { description: 'Slack attachments' })),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate
    ): Promise<AgentToolResult<any>> {
      const { channel, text, blocks, attachments } = params as {
        channel: string;
        text: string;
        blocks?: any[];
        attachments?: any[];
      };

      try {
        if (!botToken) {
          return {
            content: [{ type: 'text' as const, text: 'Bot token required (SLACK_BOT_TOKEN)' }],
            details: { error: true } as any,
          };
        }

        const body: Record<string, any> = { channel, text };
        if (blocks) body.blocks = blocks;
        if (attachments) body.attachments = attachments;

        const response = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${botToken}`,
          },
          body: JSON.stringify(body),
        });

        const result = await response.json() as { ok: boolean; error?: string; channel?: string; ts?: string };

        if (!result.ok) {
          throw new Error(result.error || 'Unknown error');
        }

        return {
          content: [{ type: 'text' as const, text: `✅ Posted to #${channel} (${result.ts})` }],
          details: { posted: true, channel: result.channel, ts: result.ts } as any,
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err}` }],
          details: { error: true } as any,
        };
      }
    },
  });

  pi.registerTool({
    name: 'slack_get_channel_info',
    label: 'Get Slack Channel Info',
    description: 'Get information about a Slack channel',
    parameters: Type.Object({
      channel: Type.String({ description: 'Channel ID or name' }),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate
    ): Promise<AgentToolResult<any>> {
      const { channel } = params as { channel: string };

      try {
        if (!botToken) {
          return {
            content: [{ type: 'text' as const, text: 'Bot token required' }],
            details: { error: true } as any,
          };
        }

        // First resolve channel name to ID
        const listResponse = await fetch('https://slack.com/api/conversations.list', {
          headers: { 'Authorization': `Bearer ${botToken}` },
        });
        const listResult = await listResponse.json() as { ok: boolean; channels?: any[] };
        
        if (!listResult.ok) {
          throw new Error(listResult as any);
        }

        const targetChannel = listResult.channels?.find((c: any) => 
          c.id === channel || c.name === channel.replace('#', '')
        );

        if (!targetChannel) {
          return {
            content: [{ type: 'text' as const, text: `Channel not found: ${channel}` }],
            details: { found: false } as any,
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: `#${targetChannel.name}\nID: ${targetChannel.id}\nMembers: ${targetChannel.num_members}\nCreated: ${new Date(parseInt(targetChannel.created) * 1000).toISOString()}\nTopic: ${targetChannel.topic?.value || '(none)'}`,
          }],
          details: { channel: targetChannel } as any,
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err}` }],
          details: { error: true } as any,
        };
      }
    },
  });

  // ============ COMMANDS ============

  pi.registerCommand('slack-status', {
    description: 'Show Slack connection status',
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (!config.webhookUrl && !config.botToken) {
        ctx.ui.notify('Slack: Not configured', 'warning');
        return;
      }

      const webhook = config.webhookUrl ? '✓ Webhook' : '✗ Webhook';
      const bot = config.botToken ? '✓ Bot Token' : '✗ Bot Token';

      ctx.ui.notify(`Slack: ${webhook}, ${bot}`, 'info');
    },
  });

  pi.registerCommand('slack-test', {
    description: 'Test Slack webhook',
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (!config.webhookUrl) {
        ctx.ui.notify('Slack: No webhook URL configured', 'warning');
        return;
      }

      try {
        await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: '🧪 Test message from PI' }),
        });
        ctx.ui.notify('Slack: ✓ Test message sent', 'info');
      } catch (err) {
        ctx.ui.notify(`Slack: ✗ Test failed - ${err}`, 'error');
      }
    },
  });
}
