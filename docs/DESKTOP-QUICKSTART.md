# 0xKobold Desktop - Quick Start Guide

## What Was Created

I've scaffolded a complete Electron desktop application foundation in `apps/0xkobold-desktop/` with:

### Architecture Foundation
- **Complete Electron structure** with main, preload, and renderer processes
- **Type-safe IPC** system across all layers
- **Phase 1 implementation** ready to extend

### Key Files Created

```
apps/0xkobold-desktop/
├── package.json                      # Dependencies & Electron builder config
├── electron.vite.config.ts           # Electron bundler config
├── vite.config.ts                    # Renderer bundler config
├── tsconfig.json                     # TypeScript configuration
├── README.md                         # Project documentation
│
├── src/
│   ├── main/
│   │   └── index.ts                  # Main process entry
│   ├── preload/
│   │   └── index.ts                  # IPC bridge (type-safe API)
│   ├── renderer/
│   │   ├── index.html                # HTML entry
│   │   ├── main.ts                   # Renderer entry
│   │   ├── app.ts                    # Main app component
│   │   ├── styles/
│   │   │   └── app.css               # Draconic theme + Tailwind
│   │   └── components/
│   │       ├── Sidebar.ts            # Agent tree, skills, sessions
│   │       ├── StatusBar.ts          # Gateway, tokens, model
│   │       └── WelcomePanel.ts       # Landing screen
│   └── shared/
│       ├── ipc-channels.ts           # All IPC channel constants
│       └── api-types.ts              # Type definitions
│
└── resources/                        # (empty - needs icons)
```

## What This Architecture Enables

### 1. PI-Web-UI Integration
- Uses `@mariozechner/pi-web-ui` components for chat
- Lit-based web components (consistent with pi-mono patterns)
- Tailwind CSS v4 for styling

### 2. 0xKobold Extension Loading
Extensions from `src/pi-config.ts` load in main process:
```typescript
// In main process
import { config } from "../../../src/pi-config";
for (const extPath of config.extensions) {
  await loadExtension(extPath, piAPI);
}
```

### 3. IPC Communication
Type-safe bridge between renderer and main:

**Renderer calls main:**
```typescript
// Renderer
await window.koboldAPI.agent.send("Hello");
await window.koboldAPI.skills.execute("spawn_subagent", { task: "..." });

// Main (handler)
ipcMain.handle(IPC_CHANNELS.AGENT.SEND, async (_, content) => {
  return piBridge.sendMessage(content);
});
```

**Main pushes to renderer:**
```typescript
// Main
mainWindow.webContents.send(IPC_CHANNELS.AGENT.MESSAGE, message);

// Renderer
window.koboldAPI.agent.onMessage((msg) => {
  // Update UI
});
```

### 4. Agent Tree Visualization
Real-time updates from `pi-orchestration`:
```typescript
// Subscribe to agent tree changes
window.koboldAPI.agentTree.onUpdate((tree) => {
  // Render AgentTreePanel
});
```

## Next Steps

### Phase 1: Verify Foundation (Ready Now)

```bash
cd apps/0xkobold-desktop

# Install dependencies
bun install

# First time: check TypeScript compiles
bun run typecheck

# Run in development
bun run dev
```

**Expected:** Electron window opens with welcome screen showing:
- "0xKobold" title with dragon logo
- 4 quick action cards (New Chat, Spawn Agent, Open Folder, Settings)
- Status bar with gateway status
- Sidebar with Agents/Skills/Sessions tabs

### Phase 2: PI Integration

Create these files to bring the agent online:

**`src/main/pi-bridge.ts`**
```typescript
import { Agent } from "@mariozechner/pi-agent-core";
import { KoboldConfig } from "../../../src/pi-config";

export class PIBridge {
  private agent: Agent;
  
  constructor() {
    this.agent = new Agent({
      extensions: KoboldConfig.extensions,
    });
  }
  
  async sendMessage(content: string): Promise<void> {
    await this.agent.sendMessage({ role: "user", content });
  }
  
  onMessage(callback: (msg: AgentMessage) => void): () => void {
    return this.agent.onMessage(callback);
  }
}
```

**Update `src/main/ipc-handler.ts`**
```typescript
import { PIBridge } from "./pi-bridge";

const bridge = new PIBridge();

ipcMain.handle(IPC_CHANNELS.AGENT.SEND, async (_, content) => {
  await bridge.sendMessage(content);
  return { success: true };
});

// Push messages to renderer
bridge.onMessage((msg) => {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send(IPC_CHANNELS.AGENT.MESSAGE, msg);
  });
});
```

**Integrate `@mariozechner/pi-web-ui` ChatPanel**

In `src/renderer/app.ts`:
```typescript
import { ChatPanel } from "@mariozechner/pi-web-ui";
import { KoboldStorage } from "./stores/KoboldStorage";

// Create storage with 0xKobold extensions
const storage = new KoboldStorage();
setAppStorage(storage);

// Use ChatPanel in render
render(html`
  <chat-panel .storage="${storage}"></chat-panel>
`, root);
```

### Phase 3: Custom Components

Add 0xKobold-specific features:

1. **AgentTreePanel** - Visualize `pi-orchestration` hierarchy
2. **SkillPanel** - Browse and execute hot-reloaded skills
3. **GatewayStatusBar** - Start/stop embedded gateway
4. **KoboldChatPanel** - Extends ChatPanel with `/agent` commands

### Phase 4: System Integration

- System tray (already stubbed in `index.ts`)
- Global shortcuts (Ctrl+K toggle)
- Native notifications
- Auto-updater

## Key Architectural Decisions

### Why Electron + pi-web-ui?
- **pi-web-ui** is already designed for this (Lit web components, themable)
- **Electron** gives native access while using web tech
- **Vite + electron-vite** provides fast dev experience with HMR

### Why Not React/Vue?
- pi-web-ui uses Lit (web components) - matching the stack is simpler
- Lit is framework-agnostic but integrates well with any
- Can add React wrapper later if needed

### Where Do Extensions Run?
- **Main process only** - Renderer cannot load Node modules
- Extensions register tools/commands via IPC bridge
- Tools execute in main, results displayed in renderer

### How Does Hot-Reload Work?
- Main process watches `skills/` directory
- On change: reload skills, push list to renderer via IPC
- Renderer updates SkillPanel immediately

## File Reference

| File | Purpose |
|------|---------|
| `docs/0XKOBOLD-DESKTOP-ARCHITECTURE.md` | Full architecture spec |
| `docs/0XKOBOLD-DESKTOP-IMPLEMENTATION.md` | Implementation plan |
| `src/shared/ipc-channels.ts` | All IPC channel definitions |
| `src/shared/api-types.ts` | Shared TypeScript types |
| `src/main/index.ts` | Main process entry |
| `src/preload/index.ts` | Security bridge + API exposure |
| `src/renderer/app.ts` | Root Lit component |
| `src/renderer/styles/app.css` | Draconic theme |

## Testing

```bash
# Type checking
bun run typecheck

# Run development with logs
DEBUG=* bun run dev

# Build for production
bun run build

# Package application
bun run package:mac    # or :win, :linux
```

## Common Issues

### "Cannot find module 'electron'"
```bash
bun install  # Ensure all deps installed
```

### TypeScript errors in preload
Check that `api-types.ts` exports match what's used in preload

### Window shows blank screen
- Check DevTools console for errors
- Verify `index.html` loads `main.ts` correctly
- Check Vite dev server is running (port 5173)

## Resources

- [pi-web-ui GitHub](https://github.com/badlogic/pi-mono/tree/main/packages/web-ui)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Lit Documentation](https://lit.dev/)
- [Tailwind v4](https://tailwindcss.com/blog/tailwindcss-v4-alpha)
