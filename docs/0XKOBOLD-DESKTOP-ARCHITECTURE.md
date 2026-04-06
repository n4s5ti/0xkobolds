# 0xKobold Desktop App - Architecture Specification

## Overview

The 0xKobold Desktop App is an **Electron-based distribution** of the `pi-coding-agent` framework, extending it with 0xKobold-specific features (multi-agent orchestration, gateway, memory systems, skills). It leverages `@mariozechner/pi-web-ui` for the chat interface while providing desktop-native capabilities.

**Core Philosophy**: The desktop app is the TUI equivalent - not a replacement, but an alternative interface that runs the same underlying agent system.

## Architecture Goals

1. **Single Source of Truth** - Same extensions, skills, and configuration as CLI/TUI
2. **Web-First UI** - Uses `@mariozechner/pi-web-ui` components (lit-based web components)
3. **Native Capabilities** - Full filesystem access, native notifications, system integration
4. **Hot-Reload Development** - Skills and extensions reload without app restart
5. **Multi-Context** - Can spawn subagents as separate windows/processes

## Directory Structure

```
apps/
├── 0xkobold-desktop/                    # Electron desktop application
│   ├── electron.vite.config.ts          # Vite config for Electron main/renderer
│   ├── package.json
│   ├── tsconfig.json
│   │
│   ├── src/
│   │   ├── main/                        # Electron Main Process (Node.js)
│   │   │   ├── index.ts                 # Entry point, window management
│   │   │   ├── pi-bridge.ts            # Bridge to pi-coding-agent
│   │   │   ├── ipc-handler.ts          # IPC handlers (renderer → main)
│   │   │   ├── extension-loader.ts     # Load 0xKobold extensions
│   │   │   ├── gateway-server.ts       # WebSocket gateway (optional embedded)
│   │   │   └── menu.ts                  # Native menus, tray
│   │   │
│   │   ├── preload/                     # Electron Preload Scripts (isolated context)
│   │   │   └── index.ts                 # Exposed APIs to renderer
│   │   │
│   │   ├── renderer/                    # Electron Renderer Process (Web UI)
│   │   │   ├── index.html               # Entry HTML
│   │   │   ├── main.ts                  # Renderer entry
│   │   │   ├── app.ts                   # Main app component (lit-based)
│   │   │   ├── stores/                  # 0xKobold-specific stores
│   │   │   │   ├── KoboldStorage.ts     # Extends AppStorage
│   │   │   │   ├── SkillStore.ts        # Hot-reloaded skills
│   │   │   │   ├── AgentTreeStore.ts    # Multi-agent visualization
│   │   │   │   └── GatewayStore.ts      # Gateway connection state
│   │   │   │
│   │   │   ├── components/              # 0xKobold custom components
│   │   │   │   ├── AgentTreePanel.ts    # Agent hierarchy visualization
│   │   │   │   ├── SkillPanel.ts        # Skill browser/manager
│   │   │   │   ├── GatewayStatusBar.ts  # Gateway connection status
│   │   │   │   ├── KoboldChatPanel.ts   # Extended ChatPanel
│   │   │   │   └── SystemTray.ts        # System tray integration
│   │   │   │
│   │   │   ├── styles/
│   │   │   │   ├── app.css              # Tailwind + custom 0xKobold theme
│   │   │   │   └── draconic-theme.css   # Dragon/dark theme vars
│   │   │   │
│   │   │   └── integrations/
│   │   │       ├── skill-loader.ts      # Hot-reload skill system
│   │   │       └── extension-bridge.ts  # Extension communication
│   │   │
│   │   └── shared/                      # Shared types between main/preload/renderer
│   │       ├── ipc-channels.ts          # IPC channel names (enforced type safety)
│   │       ├── agent-events.ts          # Agent event types
│   │       └── api-types.ts             # API type definitions
│   │
│   └── resources/                       # App resources
│       ├── icons/                       # App icons (macOS, Windows, Linux)
│       ├── tray/                        # Tray icons
│       └── sounds/                      # Notification sounds
│
└── file-share/                          # Existing app (unchanged)
```

## Architecture Layers

### Layer 1: Electron Main Process (Node.js)

The **main process** is the brain. It:
- Runs the `pi-coding-agent` agent loop
- Loads and manages 0xKobold extensions
- Manages filesystem hot-reload for skills
- Handles native system integration (tray, notifications)
- Embeds the gateway WebSocket server

```typescript
// src/main/pi-bridge.ts
import { Agent } from "@mariozechner/pi-agent-core";
import { KoboldConfig } from "../../src/pi-config";

export class PIBridge {
  private agent: Agent;
  private extensions: Map<string, ExtensionAPI>;
  
  constructor() {
    // Initialize with same config as CLI/TUI
    this.agent = new Agent({
      ui: "web", // Tell PI we're using web UI
      extensions: KoboldConfig.extensions,
      ...
    });
  }
  
  // Expose methods for IPC handlers
  async sendMessage(content: string, options?: SendOptions): Promise<void> {
    // Route to PI agent
    await this.agent.sendMessage(content, options);
  }
  
  onMessage(callback: (msg: AgentMessage) => void): () => void {
    return this.agent.onMessage(callback);
  }
  
  // Extension management
  async loadExtension(path: string): Promise<void> {
    // Same as CLI/TUI
  }
}
```

### Layer 2: Electron Preload (Security Bridge)

The **preload script** is the security boundary. It exposes a controlled API to the renderer process.

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from "electron";
import type { IpcChannels } from "../shared/ipc-channels";

const api = {
  // Agent communication
  agent: {
    send: (content: string) => ipcRenderer.invoke("agent:send", content),
    onMessage: (callback: (msg: AgentMessage) => void) => {
      ipcRenderer.on("agent:message", (_, msg) => callback(msg));
      return () => ipcRenderer.removeAllListeners("agent:message");
    },
    interrupt: () => ipcRenderer.invoke("agent:interrupt"),
    getState: () => ipcRenderer.invoke("agent:get-state"),
  },
  
  // Skills
  skills: {
    list: () => ipcRenderer.invoke("skills:list"),
    execute: (name: string, args: unknown) => 
      ipcRenderer.invoke("skills:execute", name, args),
    onReload: (callback: (skills: Skill[]) => void) => {
      ipcRenderer.on("skills:reloaded", (_, skills) => callback(skills));
    },
  },
  
  // Agent tree (multi-agent)
  agentTree: {
    getTree: () => ipcRenderer.invoke("agent-tree:get"),
    spawn: (task: string, options?: SpawnOptions) => 
      ipcRenderer.invoke("agent-tree:spawn", task, options),
    onUpdate: (callback: (tree: AgentNode) => void) => {
      ipcRenderer.on("agent-tree:update", (_, tree) => callback(tree));
    },
  },
  
  // Gateway
  gateway: {
    getStatus: () => ipcRenderer.invoke("gateway:status"),
    start: () => ipcRenderer.invoke("gateway:start"),
    stop: () => ipcRenderer.invoke("gateway:stop"),
  },
  
  // System
  system: {
    showNotification: (title: string, body: string) => 
      ipcRenderer.invoke("system:notify", title, body),
    openExternal: (url: string) => ipcRenderer.invoke("system:open-external", url),
    selectFolder: () => ipcRenderer.invoke("system:select-folder"),
  },
};

contextBridge.exposeInMainWorld("koboldAPI", api);
export type KoboldAPI = typeof api;
```

### Layer 3: Renderer Process (Web UI)

The **renderer process** is the web UI. It uses `@mariozechner/pi-web-ui` components with 0xKobold customizations.

```typescript
// src/renderer/main.ts
import { html, render } from "lit";
import { KoboldApp } from "./app";
import "./styles/app.css";

// Extend pi-web-ui's AppStorage with 0xKobold stores
import { setAppStorage } from "@mariozechner/pi-web-ui";
import { KoboldStorage } from "./stores/KoboldStorage";

const storage = new KoboldStorage();
setAppStorage(storage);

// Mount app
const root = document.getElementById("app")!;
render(html`<kobold-app></kobold-app>`, root);
```

```typescript
// src/renderer/app.ts
import { LitElement, html, css } from "lit";
import { customElement } from "@mariozechner/mini-lit";
import { ChatPanel } from "@mariozechner/pi-web-ui";
import { AgentTreePanel } from "./components/AgentTreePanel";

@customElement("kobold-app")
export class KoboldApp extends LitElement {
  static styles = css`
    :host {
      display: grid;
      grid-template-columns: 280px 1fr;
      height: 100vh;
    }
    .sidebar {
      background: var(--sidebar-bg);
      border-right: 1px solid var(--border-color);
    }
    .main {
      display: flex;
      flex-direction: column;
    }
  `;

  render() {
    return html`
      <aside class="sidebar">
        <agent-tree-panel></agent-tree-panel>
        <skill-panel></skill-panel>
      </aside>
      <main class="main">
        <gateway-status-bar></gateway-status-bar>
        <kobold-chat-panel></kobold-chat-panel>
      </main>
    `;
  }
}
```

## Integration with pi-web-ui

### Store Extension Pattern

```typescript
// src/renderer/stores/KoboldStorage.ts
import { 
  AppStorage, 
  SettingsStore, 
  SessionsStore,
  ProviderKeysStore 
} from "@mariozechner/pi-web-ui";
import { SkillStore } from "./SkillStore";
import { AgentTreeStore } from "./AgentTreeStore";

export class KoboldStorage extends AppStorage {
  skills: SkillStore;
  agentTree: AgentTreeStore;
  
  constructor() {
    super(
      new SettingsStore(),
      new ProviderKeysStore(),
      new SessionsStore(),
      // ... other stores
    );
    
    this.skills = new SkillStore();
    this.agentTree = new AgentTreeStore();
  }
  
  // 0xKobold-specific persistence
  async saveSession(session: KoboldSession): Promise<void> {
    // Save to 0xKobold session DB, not just pi-web-ui's
    await window.koboldAPI.sessions.save(session);
  }
}
```

### Custom Chat Panel

Extends `ChatPanel` from pi-web-ui with 0xKobold features:

```typescript
// src/renderer/components/KoboldChatPanel.ts
import { ChatPanel } from "@mariozechner/pi-web-ui";
import { customElement } from "@mariozechner/mini-lit";

@customElement("kobold-chat-panel")
export class KoboldChatPanel extends ChatPanel {
  // Add 0xKobold-specific features
  
  protected renderToolbar(): unknown {
    return html`
      ${super.renderToolbar()}
      <kobold-toolbar-button 
        icon="🐉"
        @click=${this.spawnSubagent}
        title="Spawn Subagent"
      ></kobold-toolbar-button>
      <kobold-toolbar-button
        icon="⚡"
        @click=${this.showSkills}
        title="Skills"
      ></kobold-toolbar-button>
    `;
  }
  
  private async spawnSubagent() {
    const task = await this.promptForTask();
    await window.koboldAPI.agentTree.spawn(task);
  }
}
```

## Extension Loading

Extensions are loaded in the main process exactly as they are in CLI/TUI:

```typescript
// src/main/extension-loader.ts
import { pathToFileURL } from "url";
import { existsSync } from "fs";
import { resolve } from "path";

export async function loadExtensions(pi: ExtensionAPI): Promise<void> {
  const { config } = await import("../../../src/pi-config");
  
  for (const extPath of config.extensions) {
    try {
      // Resolve path (handles both npm packages and local paths)
      const resolved = resolveExtensionPath(extPath);
      
      // Import extension
      const extModule = await import(pathToFileURL(resolved).href);
      const ext = extModule.default || extModule;
      
      // Initialize with PI API
      if (typeof ext === "function") {
        await ext(pi);
        console.log(`[Extension] Loaded: ${extPath}`);
      }
    } catch (err) {
      console.error(`[Extension] Failed to load ${extPath}:`, err);
    }
  }
}

function resolveExtensionPath(spec: string): string {
  if (spec.startsWith("./") || spec.startsWith("../")) {
    // Local path - resolve relative to project root
    return resolve(PROJECT_ROOT, spec);
  }
  
  if (spec.startsWith("@0xkobold/")) {
    // Scoped package - resolve from node_modules
    return resolve(NODE_MODULES, spec, "dist/index.js");
  }
  
  // Absolute path passed through
  return spec;
}
```

## Skill Hot-Reload

Skills hot-reload in the main process, updates propagate to renderer:

```typescript
// src/main/skill-watcher.ts
import { watch } from "fs";
import { SKILLS_DIR } from "../../src/skills/loader";

export function startSkillWatcher(pi: ExtensionAPI): void {
  const watcher = watch(SKILLS_DIR, { recursive: true }, async (event, filename) => {
    if (filename?.endsWith(".ts")) {
      console.log(`[Skills] Change detected: ${filename}`);
      
      try {
        // Reload skills
        const { reloadSkills } = await import("../../src/skills/loader");
        const skills = await reloadSkills();
        
        // Notify renderer
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send("skills:reloaded", skills);
        });
      } catch (err) {
        console.error("[Skills] Reload failed:", err);
      }
    }
  });
  
  process.on("exit", () => watcher.close());
}
```

## Gateway Integration

The desktop app can operate in two gateway modes:

1. **Embedded Mode** (default): Gateway runs inside the Electron main process
2. **External Mode**: Connects to existing 0xKobold gateway server

```typescript
// src/main/gateway-embed.ts
import { startGateway } from "../../src/gateway/index";

export async function startEmbeddedGateway(pi: ExtensionAPI): Promise<void> {
  const gateway = await startGateway({
    port: 18789,
    host: "127.0.0.1",
  });
  
  // Forward gateway events to renderer
  gateway.on("agent.spawned", (evt) => {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send("agent-tree:update", evt);
    });
  });
}
```

## Type Safety Across Layers

### Shared Types

```typescript
// src/shared/ipc-channels.ts
export const IPC_CHANNELS = {
  AGENT: {
    SEND: "agent:send",
    MESSAGE: "agent:message",
    INTERRUPT: "agent:interrupt",
    GET_STATE: "agent:get-state",
  },
  SKILLS: {
    LIST: "skills:list",
    EXECUTE: "skills:execute",
    RELOADED: "skills:reloaded",
  },
  AGENT_TREE: {
    GET: "agent-tree:get",
    SPAWN: "agent-tree:spawn",
    UPDATE: "agent-tree:update",
  },
  GATEWAY: {
    STATUS: "gateway:status",
    START: "gateway:start",
    STOP: "gateway:stop",
  },
} as const;

export type IpcChannels = typeof IPC_CHANNELS;
```

### Strict Typing for IPC

```typescript
// src/main/ipc-handler.ts (main process)
import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../shared/ipc-channels";

export function registerIPCHandlers(bridge: PIBridge): void {
  // Type-safe channel registration
  ipcMain.handle(IPC_CHANNELS.AGENT.SEND, async (_, content: string) => {
    return bridge.sendMessage(content);
  });
  
  ipcMain.handle(IPC_CHANNELS.SKILLS.EXECUTE, async (_, name: string, args: unknown) => {
    return bridge.executeSkill(name, args);
  });
}

// src/renderer/api.ts (renderer process)
import { IPC_CHANNELS } from "../shared/ipc-channels";

declare global {
  interface Window {
    koboldAPI: {
      agent: {
        send: (content: string) => Promise<void>;
        onMessage: (cb: (msg: AgentMessage) => void) => () => void;
      };
      skills: {
        execute: (name: string, args: unknown) => Promise<unknown>;
      };
    };
  }
}
```

## State Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        ELECTRON MAIN                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────┐   │
│  │ pi-coding   │  │ 0xKobold     │  │ Gateway Server          │   │
│  │ -agent      │  │ Extensions   │  │ (WebSocket)             │   │
│  │             │  │              │  │                         │   │
│  │ Agent loop  │  │ • pi-kobold  │  │ • Hierarchical agents   │   │
│  │ Tools       │  │ • pi-ollama  │  │ • Token prediction    │   │
│  │ Extensions  │  │ • Custom     │  │ • Connection pooling    │   │
│  └──────┬──────┘  └──────────────┘  └─────────────────────────┘   │
│         │                                                        │
│         ▼ IPC                                                   │
│  ┌──────────────┐                                               │
│  │ PI Bridge    │◄──────────────────────────────────────────────┤
│  │ • Messages   │                                               │
│  │ • Skills     │                                               │
│  │ • Agent tree │                                               │
│  └──────┬───────┘                                               │
└─────────┼───────────────────────────────────────────────────────┘
          │
          │ Electron IPC
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ELECTRON RENDERER                           │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │                  @mariozechner/pi-web-ui                   │   │
│  │  ┌─────────────────┐  ┌─────────────────────────────────┐ │   │
│  │  │  ChatPanel      │  │  AgentInterface                 │ │   │
│  │  │  (Messages)     │  │  (Tool displays)                │ │   │
│  │  └─────────────────┘  └─────────────────────────────────┘ │   │
│  └───────────────────────────────────────────────────────────┘   │
│                            ▲                                     │
│  ┌─────────────────────────┴─────────────────────────────────┐   │
│  │              0xKobold Custom Components                      │   │
│  │  ┌──────────────┐ ┌────────────┐ ┌──────────────────────┐  │   │
│  │  │AgentTreePanel│ │SkillPanel  │ │GatewayStatusBar      │  │   │
│  │  └──────────────┘ └────────────┘ └──────────────────────┘  │   │
│  └────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Build & Development

### Development Mode

```bash
# In apps/0xkobold-desktop/
bun run dev

# This runs:
# 1. electron-vite dev (bundles main + preload)
# 2. Vite dev server for renderer (HMR support)
# 3. 0xKobold extensions in watch mode
```

### Production Build

```bash
bun run build

# Creates:
# dist/
#   ├── main/         # Bundled main process
#   ├── preload/      # Bundled preload script
#   ├── renderer/     # Vite-built web assets
#   └── electron/     # Electron-builder output
```

### Package Scripts

```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "npm run build:main && npm run build:preload && npm run build:renderer",
    "build:main": "electron-vite build --config electron.vite.config.ts --entry main",
    "build:preload": "electron-vite build --config electron.vite.config.ts --entry preload",
    "build:renderer": "vite build",
    "package": "electron-builder",
    "package:mac": "electron-builder --mac",
    "package:win": "electron-builder --win",
    "package:linux": "electron-builder --linux"
  }
}
```

## Configuration

### Desktop-Specific Settings

```typescript
// src/shared/desktop-config.ts
export interface DesktopConfig {
  // UI settings
  "desktop.window.width": number;
  "desktop.window.height": number;
  "desktop.window.alwaysOnTop": boolean;
  "desktop.window.transparent": boolean;
  
  // Integration
  "desktop.system.startOnLogin": boolean;
  "desktop.system.minimizeToTray": boolean;
  "desktop.globalShortcuts.chat": string;
  
  // Gateway
  "desktop.gateway.embedded": boolean;
  "desktop.gateway.autoStart": boolean;
  "desktop.gateway.port": number;
  
  // Extensions (merged with CLI config)
  "desktop.extensions.additional": string[];
}
```

## Security Considerations

1. **Context Isolation**: Preload script runs in isolated context
2. **IPC Validation**: All IPC calls validated on main side
3. **No Node Integration**: Renderer doesn't have direct Node access
4. **CSP Headers**: Strict Content-Security-Policy for web content
5. **Extension Sandboxing**: Extensions run in main process (trusted), not renderer

```typescript
// Security headers
const securityHeaders = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Required for lit
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' ws://localhost:*", // Gateway WebSocket
  ].join("; "),
};
```

## Relationship to Existing Packages

| Package | Role in Desktop App |
|---------|---------------------|
| `@0xkobold/pi-kobold` | Meta-extension, loaded in main process |
| `@0xkobold/pi-orchestration` | Multi-agent coordination, main process |
| `@0xkobold/pi-gateway` | Gateway functionality, can be embedded |
| `@0xkobold/pi-ollama` | LLM provider, shared with CLI |
| `@mariozechner/pi-web-ui` | UI components, renderer process |
| `@mariozechner/pi-agent-core` | Core agent, main process |

## Migration from CLI/TUI

Users can seamlessly switch between interfaces:

```bash
# CLI mode - same extensions, skills, config
0xkobold --cli

# TUI mode - terminal UI
0xkobold --tui

# Desktop mode - launches Electron app
0xkobold --desktop

# If no flag and DISPLAY available, desktop is default
0xkobold  # Launches desktop on macOS/Linux GUI
```

## Future Extensions

1. **Multi-Window**: Spawn agents as separate windows (`--window` flag)
2. **Floating Chat**: Always-on-top compact mode
3. **Screenpipe Integration**: Desktop app aware of screen content
4. **Voice Mode**: Native TTS/STT using system capabilities
5. **System Tray Control**: Quick actions without opening window

---

## References

- [@mariozechner/pi-web-ui](https://github.com/badlogic/pi-mono/tree/main/packages/web-ui)
- [@mariozechner/pi-agent-core](https://github.com/badlogic/pi-mono/tree/main/packages/agent-core)
- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Vite](https://electron-vite.org/)
