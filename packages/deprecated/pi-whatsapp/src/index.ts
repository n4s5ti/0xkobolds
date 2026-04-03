/**
 * WhatsApp Extension for PI
 * 
 * Provides WhatsApp integration via Baileys (WhatsApp Web protocol):
 * - Send messages
 * - Receive messages (relay to agent)
 * - Status and commands
 */

import { Type } from '@sinclair/typebox';
import type { ExtensionAPI, ExtensionContext, AgentToolResult } from '@mariozechner/pi-coding-agent';

interface WhatsAppConfig {
  sessionPath?: string;
}

// Baileys types - loaded dynamically
let Baileys: any = null;
let sock: any = null;
let connected = false;
let qrCode: string | null = null;

/**
 * WhatsApp Extension
 */
export default function whatsAppExtension(pi: ExtensionAPI) {
  const config: WhatsAppConfig = {
    sessionPath: process.env.WHATSAPP_SESSION_PATH || './whatsapp-session',
  };

  // ============ TOOLS ============

  pi.registerTool({
    name: 'whatsapp_send_message',
    label: 'Send WhatsApp Message',
    description: 'Send a WhatsApp message to a number or group',
    parameters: Type.Object({
      jid: Type.String({ description: 'Contact JID (e.g., "1234567890@s.whatsapp.net") or group JID' }),
      text: Type.String({ description: 'Message text to send' }),
    }),
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate
    ): Promise<AgentToolResult<any>> {
      const { jid, text } = params as { jid: string; text: string };

      try {
        if (!sock || !connected) {
          return {
            content: [{ type: 'text' as const, text: 'WhatsApp not connected. Use /whatsapp-connect first.' }],
            details: { error: true, notConnected: true } as any,
          };
        }

        await sock.sendMessage(jid, { text });
        
        return {
          content: [{ type: 'text' as const, text: `✅ Message sent to ${jid}` }],
          details: { sent: true, jid } as any,
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
    name: 'whatsapp_get_qr',
    label: 'Get WhatsApp QR Code',
    description: 'Get the QR code for WhatsApp authentication',
    parameters: Type.Object({}),
    async execute(): Promise<AgentToolResult<any>> {
      if (!qrCode) {
        return {
          content: [{ type: 'text' as const, text: 'No QR code available. Connect first with /whatsapp-connect.' }],
          details: { qrCode: null } as any,
        };
      }

      return {
        content: [{ type: 'text' as const, text: `📱 Scan this QR code with WhatsApp:\n\n${qrCode}` }],
        details: { qrCode } as any,
      };
    },
  });

  pi.registerTool({
    name: 'whatsapp_get_contacts',
    label: 'Get WhatsApp Contacts',
    description: 'Get list of contacts',
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: 'Max contacts to return', default: 50 })),
    }),
    async execute(_toolCallId, params): Promise<AgentToolResult<any>> {
      const { limit = 50 } = params as { limit?: number };

      try {
        if (!sock || !connected) {
          return {
            content: [{ type: 'text' as const, text: 'WhatsApp not connected' }],
            details: { error: true } as any,
          };
        }

        const contacts = Object.keys(sock.store?.contacts || {})
          .slice(0, limit)
          .map(jid => {
            const contact = sock.store.contacts[jid];
            return `- ${contact?.name || jid} (${jid})`;
          })
          .join('\n');

        return {
          content: [{ type: 'text' as const, text: contacts || 'No contacts found' }],
          details: { count: Object.keys(sock.store?.contacts || {}).length } as any,
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

  pi.registerCommand('whatsapp-status', {
    description: 'Show WhatsApp connection status',
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (connected) {
        ctx.ui.notify('WhatsApp: ✓ Connected', 'info');
      } else if (qrCode) {
        ctx.ui.notify('WhatsApp: ⏳ Waiting for QR scan...', 'info');
      } else {
        ctx.ui.notify('WhatsApp: ✗ Disconnected. Use /whatsapp-connect', 'warning');
      }
    },
  });

  pi.registerCommand('whatsapp-connect', {
    description: 'Connect to WhatsApp',
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (connected) {
        ctx.ui.notify('WhatsApp: Already connected', 'info');
        return;
      }

      ctx.ui.notify('WhatsApp: Connecting... (this may take a moment)', 'info');

      try {
        await connectWhatsApp(ctx, config);
      } catch (err) {
        ctx.ui.notify(`WhatsApp: Connection failed - ${err}`, 'error');
      }
    },
  });

  pi.registerCommand('whatsapp-disconnect', {
    description: 'Disconnect from WhatsApp',
    handler: async (_args: string, ctx: ExtensionContext) => {
      if (sock) {
        sock.logout();
        sock = null;
        connected = false;
        qrCode = null;
        ctx.ui.notify('WhatsApp: Disconnected', 'info');
      } else {
        ctx.ui.notify('WhatsApp: Already disconnected', 'info');
      }
    },
  });
}

/**
 * Connect to WhatsApp using Baileys
 */
async function connectWhatsApp(ctx: ExtensionContext, config: WhatsAppConfig): Promise<void> {
  try {
    // Dynamic import Baileys
    const baileys = await import('@whiskeysockets/baileys');
    Baileys = baileys;

    const { state, saveCreds } = await baileys.useMultiFileAuthState(config.sessionPath || './whatsapp-session');
    
    sock = baileys.makeWASocket({
      auth: state,
      printQRInTerminal: true,
    });

    // Handle connection
    sock.ev.on('creds.update', () => {
      saveCreds();
    });
    
    sock.ev.on('connection.update', ({ qr }: any) => {
      if (qr) {
        qrCode = qr;
        ctx.ui.notify('WhatsApp: 📱 QR code ready. Scan with WhatsApp app.', 'info');
      }
    });

    // Handle disconnection
    sock.ev.on('disconnected', () => {
      connected = false;
      ctx.ui.notify('WhatsApp: ✗ Disconnected', 'warning');
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', ({ messages }: any) => {
      for (const msg of messages) {
        if (!msg.key.fromMe) {
          const from = msg.key.remoteJid;
          const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
          console.log(`[WhatsApp] Message from ${from}: ${text}`);
        }
      }
    });

  } catch (err) {
    console.error('[WhatsApp] Failed to connect:', err);
    throw err;
  }
}
