/**
 * Pi-Framework Configuration for 0xKobold
 * 
 * Philosophy: Explicit over magic (KISS, DRY)
 * - No auto-discovery - list what's loaded
 * - Clear structure - infrastructure, then features
 */

import { existsSync, readFileSync } from "fs";
import { join, resolve, dirname } from "path";

// Local Config type
interface Config {
  ui?: 'tui' | 'cli';
  extensions?: string[];
  keybindings?: Record<string, string>;
  settings?: Record<string, unknown>;
}

/**
 * Get project root - handles both dev (src/) and prod (dist/)
 */
function getProjectRoot(): string {
  try {
    const url = import.meta.url;
    if (url) {
      const filePath = url.replace(/^file:\/\//, '');
      if (filePath.includes('/dist/')) {
        return resolve(dirname(dirname(filePath)));
      }
      return resolve(dirname(filePath), '..');
    }
  } catch {}
  
  try {
    if (String(__dirname).includes('/dist/')) {
      return resolve(__dirname, '../..');
    }
  } catch {}
  
  return resolve(__dirname, '..');
}

const projectRoot = getProjectRoot();

/**
 * Resolve extension path - prefers dist/ if built, else src/
 */
function ext(name: string): string {
  const base = join(projectRoot, 'node_modules', name);
  
  // Try dist/ first (production)
  const distPath = join(base, 'dist', 'index.js');
  if (existsSync(distPath)) {
    return distPath;
  }
  
  // Fall back to src/ (development)
  const srcPath = join(base, 'src', 'index.ts');
  if (existsSync(srcPath)) {
    return srcPath;
  }
  
  return join(base, 'dist', 'index.js'); // Default
}

// =============================================================================
// CONFIG
// =============================================================================

export const config: Config = {
  ui: 'tui',

  extensions: [
    // Infrastructure
    './src/config/unified-config.ts',
    './src/sessions/UnifiedSessionBridge.ts',
    
    // Core Features
    './src/extensions/core/task-manager-extension.ts',
    './src/extensions/core/heartbeat-extension.ts',
    
    // Multi-Channel
    './src/extensions/core/multi-channel-extension.ts',
    './src/extensions/core/twitch-extension.ts',
    
    // DRACONIC SYSTEMS
    './src/extensions/core/git-commit-extension.ts',
    './src/extensions/core/draconic-lair-extension.ts',
    './src/extensions/core/draconic-hoard-extension.ts',
    './src/extensions/core/draconic-safety-extension.ts',

    // Developer Tools
    './src/extensions/core/diagnostics-extension.ts',

    './node_modules/@aliou/pi-processes/src/index.ts',
    './src/extensions/core/wallet-extension.ts',
    './src/extensions/core/update-extension.ts',
    './src/extensions/core/self-update-extension.ts',
    
    // Community Extensions
    './src/extensions/community/draconic-messenger-wrapper.ts',
    
    // Context Engine
    
    // Published @0xkobold packages (explicit paths)
    ext('@0xkobold/pi-learn'),
    ext('@0xkobold/pi-ollama'),
    ext('@0xkobold/pi-orchestration'),
    ext('@0xkobold/pi-persona'),
    ext('@0xkobold/pi-bridge'),
    ext('@0xkobold/pi-mcp'),
    ext('@0xkobold/pi-obsidian-bridge'),
    ext('@0xkobold/pi-cloudflare-browser'),
    ext('@0xkobold/pi-wallet'),
    ext('@0xkobold/pi-erc8004'),
    ext('@0xkobold/pi-gateway'),
    ext('@0xkobold/pi-suggest'),
  ],

  keybindings: {
    'ctrl+c': 'interrupt',
    'ctrl+d': 'shutdown',
    'ctrl+l': 'clear',
    'f1': 'help',
    'f2': 'toggle_tree',
    'ctrl+t': 'toggle_tree',
    'ctrl+n': 'new_chat',
    'ctrl+s': 'session_snapshot',
    'ctrl+r': 'resume_session',
  },

  settings: {
    '0xkobold.sessions.enabled': true,
    '0xkobold.sessions.dbPath': '~/.0xkobold/sessions.db',
    '0xkobold.sessions.autoResume': true,
    '0xkobold.sessions.resumeMaxAgeHours': 168,
    '0xkobold.sessions.snapshotInterval': 300000,
    
    '0xkobold.gateway.port': 18789,
    '0xkobold.gateway.host': '127.0.0.1',
    
    '0xkobold.discord.enabled': true,
    '0xkobold.discord.autoReply': true,
    
    '0xkobold.memory.persist': true,
    '0xkobold.memory.dbPath': '~/.0xkobold/memory.db',
    '0xkobold.memory.unified': true,
    
    '0xkobold.agents.workdir': '~/.0xkobold/agents',
    '0xkobold.agents.persist': true,
    
    '0xkobold.model.provider': 'ollama',
    '0xkobold.model.name': 'kimi-k2.5:cloud',
    '0xkobold.model.custom': [],
    
    '0xkobold.update.checkOnStartup': true,
    '0xkobold.update.autoInstall': true,
    
    '0xkobold.heartbeat.enabled': true,
    '0xkobold.heartbeat.every': '30m',
    '0xkobold.heartbeat.ackMaxChars': 300,
    
    '0xkobold.obsidian.enabled': false,
    '0xkobold.obsidian.vault': 'obsidian_vault',
    '0xkobold.obsidian.tasksFile': '10-Action/Tasks.md',
    '0xkobold.obsidian.pollOn': ['morning', 'evening', 'periodic'],
    '0xkobold.obsidian.autoCreateVault': true,
  },
};

export type KoboldConfig = typeof config;

export default config;
