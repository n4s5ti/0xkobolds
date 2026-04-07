/**
 * Desktop-Specific PI Configuration
 * 
 * Minimal config for the 0xkobold-desktop Electron app.
 * Loads pi-kobold which bundles: orchestration, gateway, and dev tools.
 */

import { existsSync } from "fs";
import { join, resolve } from "path";

interface Config {
  ui: 'web' | 'tui' | 'cli';
  extensions: string[];
  keybindings?: Record<string, string>;
  settings?: Record<string, unknown>;
}

/**
 * Resolve @0xkobold packages from node_modules
 */
function ext(name: string): string {
  // In Electron: __dirname is dist/main/
  const base = resolve(__dirname, "../../../node_modules", name);
  const distPath = join(base, "dist", "index.js");
  const srcPath = join(base, "src", "index.ts");
  
  if (existsSync(distPath)) return distPath;
  if (existsSync(srcPath)) return srcPath;
  return distPath;
}

export const config: Config = {
  ui: 'web',

  extensions: [
    // Core bundle: orchestration + gateway + dev tools
    ext('@0xkobold/pi-kobold'),
    
    // Desktop-specific extensions can be added here
    // ext('@0xkobold/pi-cloudflare-browser'),
  ],

  keybindings: {
    'ctrl+c': 'interrupt',
    'ctrl+d': 'shutdown',
    'ctrl+l': 'clear',
    'f1': 'help',
  },

  settings: {
    // Gateway settings (pi-kobold inherits pi-gateway)
    '0xkobold.gateway.port': 18789,
    '0xkobold.gateway.host': '127.0.0.1',
    
    // Desktop-specific settings
    '0xkobold.desktop.autoStartGateway': true,
    '0xkobold.desktop.notifyOnMessage': true,
  },
};

export default config;
