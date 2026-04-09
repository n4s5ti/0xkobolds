/**
 * Delivery Integration - Wire delivery system to gateways
 * 
 * Connects delivery.ts to Discord and WebSocket for proactive messaging.
 */

import {
  getDeliverySystem,
  type DeliveryTarget,
  type DeliverySystem,
} from "./index.js";

let deliverySystem: DeliverySystem | null = null;

/**
 * Initialize delivery system with a broadcast function (from pi-gateway)
 */
export function initDeliveryFromBroadcast(
  broadcastFn: (event: string, data: unknown) => void,
  homeSessionKey?: string
): DeliverySystem {
  const ds = getDeliverySystem();

  ds.registerHandler("websocket", async (message) => {
    try {
      broadcastFn("delivery", {
        id: message.id,
        content: message.content,
        sourceSessionKey: message.sourceSessionKey,
        priority: message.priority,
        timestamp: message.createdAt,
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  if (homeSessionKey) {
    ds.setHomeChannel({
      id: `ws-${homeSessionKey}`,
      type: "websocket",
      platformId: homeSessionKey,
      priority: 1,
    });
  }

  deliverySystem = ds;
  return ds;
}

/**
 * Initialize delivery system with Discord send function
 */
export function initDeliveryFromDiscordSend(
  sendToChannel: (channelId: string, content: string) => Promise<void>,
  homeChannelId?: string
): DeliverySystem {
  const ds = getDeliverySystem();

  ds.registerHandler("discord", async (message) => {
    try {
      const channelId = message.target.channelId ?? message.target.platformId;
      await sendToChannel(channelId, message.content);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  if (homeChannelId) {
    ds.setHomeChannel({
      id: `discord-${homeChannelId}`,
      type: "discord",
      platformId: homeChannelId,
      channelId: homeChannelId,
      priority: 1,
    });
  }

  deliverySystem = ds;
  return ds;
}

/**
 * Initialize delivery system with CLI (local terminal)
 */
export function initDeliveryFromCli(): DeliverySystem {
  const ds = getDeliverySystem();

  ds.registerHandler("cli", async (message) => {
    try {
      const prefix = message.priority === "urgent" ? "🚨 " : 
                     message.priority === "high" ? "⚡ " : "";
      console.log(`${prefix}${message.content}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ds.setHomeChannel({
    id: "cli-home",
    type: "cli",
    platformId: "local",
    priority: 1,
  });

  deliverySystem = ds;
  return ds;
}

/**
 * Get the global delivery system
 */
export function getDelivery(): DeliverySystem | null {
  return deliverySystem;
}

/**
 * Set home channel from config
 */
export function setHomeChannelFromConfig(config: {
  platform: "discord" | "cli" | "websocket";
  channelId?: string;
  sessionKey?: string;
}): void {
  if (!deliverySystem) {
    console.warn("[Delivery] System not initialized");
    return;
  }

  const target: DeliveryTarget = {
    id: `home-${config.platform}`,
    type: config.platform,
    platformId: config.channelId ?? config.sessionKey ?? "default",
    channelId: config.channelId,
    priority: 1,
    isHome: true,
  };

  deliverySystem.setHomeChannel(target);
  console.log(`[Delivery] Home channel set: ${config.platform}/${target.platformId}`);
}

/**
 * Helper: Chunk message for platforms with character limits
 */
export function chunkMessage(content: string, maxLength: number): string[] {
  if (content.length <= maxLength) {
    return [content];
  }

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    let breakPoint = maxLength;
    const lastNewline = remaining.lastIndexOf("\n", maxLength);
    if (lastNewline > maxLength * 0.5) {
      breakPoint = lastNewline + 1;
    } else {
      const lastSpace = remaining.lastIndexOf(" ", maxLength);
      if (lastSpace > maxLength * 0.5) {
        breakPoint = lastSpace + 1;
      }
    }
    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint);
  }

  return chunks;
}