/**
 * Gateway Tools for pi-kobold
 * 
 * Provides tools to control the pi-gateway from the desktop app UI.
 * These tools bridge the gateway state to the IPC system.
 */

import { defineTool } from "@mariozechner/pi-coding-agent";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { getGatewayBridge } from "../index.js";

// ============================================================================
// Gateway State (in-memory bridge)
// ============================================================================

let gatewayRunning = false;
let gatewayPort = 18789;
let gatewayHost = "127.0.0.1";

/**
 * Gateway status tool
 */
export const gatewayStatusTool = defineTool({
  name: "gateway_status",
  label: "Gateway Status",
  description: "Get the current status of the messaging gateway",
  parameters: Type.Object({}),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    const bridge = getGatewayBridge();
    
    return {
      content: [{
        type: "text" as const,
        text: `🌐 Gateway Status:
        
Running: ${gatewayRunning ? "✅ Yes" : "❌ No"}
Port: ${gatewayPort}
Host: ${gatewayHost}
URL: ws://${gatewayHost}:${gatewayPort}

Bridge State:
- Clients: ${bridge.clients.size}
- Adapters: ${bridge.adapters.join(", ") || "none"}
- Sessions: ${bridge.sessions}`,
      }],
      details: {
        running: gatewayRunning,
        port: gatewayPort,
        host: gatewayHost,
        url: `ws://${gatewayHost}:${gatewayPort}`,
        ...bridge,
      },
    };
  },
});

/**
 * Gateway start tool
 */
export const gatewayStartTool = defineTool({
  name: "gateway_start",
  label: "Start Gateway",
  description: "Start the messaging gateway server",
  parameters: Type.Object({
    port: Type.Optional(Type.Number({ description: "Port to listen on (default: 18789)" })),
    host: Type.Optional(Type.String({ description: "Host to bind to (default: 127.0.0.1)" })),
  }),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    if (gatewayRunning) {
      return {
        content: [{
          type: "text" as const,
          text: "⚠️ Gateway is already running",
        }],
        details: { running: true, port: gatewayPort },
      };
    }

    gatewayPort = params.port || gatewayPort;
    gatewayHost = params.host || gatewayHost;
    gatewayRunning = true;

    return {
      content: [{
        type: "text" as const,
        text: `✅ Gateway started on ws://${gatewayHost}:${gatewayPort}`,
      }],
      details: {
        running: true,
        port: gatewayPort,
        host: gatewayHost,
        url: `ws://${gatewayHost}:${gatewayPort}`,
      },
    };
  },
});

/**
 * Gateway stop tool
 */
export const gatewayStopTool = defineTool({
  name: "gateway_stop",
  label: "Stop Gateway",
  description: "Stop the messaging gateway server",
  parameters: Type.Object({}),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    if (!gatewayRunning) {
      return {
        content: [{
          type: "text" as const,
          text: "⚠️ Gateway is not running",
        }],
        details: { running: false },
      };
    }

    gatewayRunning = false;

    return {
      content: [{
        type: "text" as const,
        text: "✅ Gateway stopped",
      }],
      details: { running: false },
    };
  },
});

// ============================================================================
// Desktop App Integration
// ============================================================================

/**
 * Notify desktop app of gateway state change
 * This is called when gateway starts/stops via CLI or other means
 */
export function notifyDesktopGatewayState(): void {
  const bridge = getGatewayBridge();
  bridge.isRunning = gatewayRunning;
  bridge.port = gatewayPort;
  console.log("[gateway-tools] Notifying desktop of gateway state:", gatewayRunning);
}

/**
 * Get gateway state for desktop app IPC
 */
export function getDesktopGatewayState() {
  return {
    running: gatewayRunning,
    port: gatewayPort,
    host: gatewayHost,
    url: `ws://${gatewayHost}:${gatewayPort}`,
    clients: gatewayRunning ? 1 : 0, // Placeholder
    adapters: [] as string[],
    sessions: 0,
  };
}
