# 0xKobold Desktop App 🐉

An Electron-based desktop application for 0xKobold, providing a native GUI experience using `@mariozechner/pi-web-ui` components.

## Features

- **Native Desktop Experience**: System tray, global shortcuts, native notifications
- **0xKobold Integration**: Full access to extensions, skills, and multi-agent orchestration
- **Web-based UI**: Built with Lit (web components) and Tailwind CSS
- **Hot Reload**: Skills reload automatically without restarting the app
- **Multi-Window**: Spawn subagents as separate windows
- **Gateway Embedded**: WebSocket server runs inside the desktop app

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ELECTRON MAIN                           │
│  ┌──────────────────┐  ┌────────────────────────────────┐   │
│  │ pi-coding-agent  │  │ 0xKobold Extensions          │   │
│  │ (Agent Core)     │  │ • pi-kobold                  │   │
│  └──────────────────┘  │ • pi-orchestration           │   │
│         │              │ • pi-learn                   │   │
│         ▼              │ • Custom extensions          │   │
│  ┌──────────────────┐  └────────────────────────────────┘   │
│  │ IPC Bridge       │                                      │
│  │ (main ↔ renderer)                                       │
│  └──────────────────┘                                      │
└────────────────────────────┬────────────────────────────────┘
                              │ IPC
┌────────────────────────────┴────────────────────────────────┐
│                    ELECTRON RENDERER                         │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │         @mariozechner/pi-web-ui Components               │  │
│  │  ┌─────────────────────────────────────────────────┐    │  │
│  │  │   0xKobold Custom Components                     │    │  │
│  │  │  ┌──────────────┐  ┌────────────┐  ┌──────────┐│    │  │
│  │  │  │AgentTreePanel│  │SkillPanel  │  │ChatPanel ││    │  │
│  │  │  └──────────────┘  └────────────┘  └──────────┘│    │  │
│  │  └─────────────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- Bun 1.0+ or Node.js 20+
- macOS, Windows, or Linux

### Installation

```bash
# From the monorepo root
cd apps/0xkobold-desktop
bun install
```

### Development

```bash
# Start in development mode
bun run dev
```

This will:
1. Launch Electron with the main process compiled
2. Start the Vite dev server for the renderer
3. Enable hot module replacement (HMR)
4. Open DevTools automatically

### Building

```bash
# Build all targets
bun run build

# Build for specific platform
bun run build:main     # Main process
bun run build:preload  # Preload script
bun run build:renderer # Renderer process
```

### Packaging

```bash
# Package for current platform
bun run package

# Package for all platforms
bun run package:all

# Platform specific
bun run package:mac
bun run package:win
bun run package:linux
```

## Project Structure

```
├── src/
│   ├── main/           # Electron main process (Node.js)
│   │   ├── index.ts    # Entry point
│   │   ├── pi-bridge.ts # PI agent integration
│   │   └── ipc-handler.ts # IPC handlers
│   ├── preload/        # Preload scripts (security bridge)
│   │   └── index.ts    # API exposed to renderer
│   ├── renderer/       # Web UI (Lit + Tailwind)
│   │   ├── index.html  # Entry HTML
│   │   ├── main.ts     # Renderer entry
│   │   ├── app.ts      # Main app component
│   │   ├── components/ # Custom components
│   │   └── styles/     # CSS files
│   └── shared/         # Types shared across layers
│       ├── ipc-channels.ts
│       └── api-types.ts
├── resources/          # App resources
│   ├── icons/         # App icons
│   ├── tray/          # Tray icons
│   └── sounds/        # Notification sounds
├── electron.vite.config.ts  # Electron Vite config
├── vite.config.ts           # Renderer Vite config
└── package.json
```

## IPC Channels

All communication between main and renderer uses typed IPC channels defined in `src/shared/ipc-channels.ts`:

### Agent Channels
- `agent:send` - Send message to agent
- `agent:message` - Receive messages from agent
- `agent:interrupt` - Interrupt current operation
- `agent:get-state` - Get agent state

### Skill Channels
- `skills:list` - List available skills
- `skills:execute` - Execute a skill
- `skills:reloaded` - Skills hot-reload event

### Agent Tree Channels
- `agent-tree:get-tree` - Get agent hierarchy
- `agent-tree:spawn` - Spawn subagent
- `agent-tree:kill` - Kill agent
- `agent-tree:on-update` - Tree update events

### Gateway Channels
- `gateway:get-status` - Get gateway status
- `gateway:start` - Start embedded gateway
- `gateway:stop` - Stop gateway

### System Channels
- `system:show-notification` - Native notification
- `system:open-external` - Open external URL
- `system:select-folder` - Folder picker dialog

## Custom Components

### AgentTreePanel
Displays the hierarchical agent tree from `pi-orchestration`.

### SkillPanel
Browse and execute hot-reloaded skills.

### GatewayStatusBar
Shows gateway connection and controls.

### KoboldChatPanel
Extended ChatPanel from `pi-web-ui` with 0xKobold features.

## Development Guidelines

### Adding IPC Handlers

1. Add channel to `src/shared/ipc-channels.ts`
2. Implement handler in `src/main/ipc-handler.ts`
3. Expose to renderer in `src/preload/index.ts`
4. Use in renderer components

### Adding UI Components

1. Create component in `src/renderer/components/`
2. Use Lit and `@mariozechner/mini-lit`
3. Register in `src/renderer/main.ts` or parent component
4. Import styles from `src/renderer/styles/`

### Security

- **Never** use `nodeIntegration: true` in renderer
- **Never** disable `contextIsolation`
- All Node.js access must go through preload script
- Validate all IPC inputs on main side

## Configuration

Desktop-specific settings (stored separately from CLI config):

```typescript
// Key types in src/shared/api-types.ts
interface DesktopSettings {
  // Window
  'desktop.window.width': number;
  'desktop.window.height': number;
  'desktop.window.alwaysOnTop': boolean;
  
  // System
  'desktop.system.startOnLogin': boolean;
  'desktop.system.minimizeToTray': boolean;
  
  // Shortcuts
  'desktop.shortcuts.toggleWindow': string;
  'desktop.shortcuts.newChat': string;
  
  // Gateway
  'desktop.gateway.embedded': boolean;
  'desktop.gateway.port': number;
  
  // Appearance
  'desktop.appearance.theme': 'draconic' | 'light' | 'system';
}
```

## Integration with 0xKobold

The desktop app is a **distribution** of 0xKobold, meaning:

- Same extensions loaded via `pi-config.ts`
- Same skill hot-reload system
- Same gateway protocol
- Same session storage
- Same settings hierarchy (global > local)

The key difference is the **UI layer** - Electron/Web instead of Terminal.

## Troubleshooting

### App won't start
- Check Electron version compatibility: `bun pm ls electron`
- Clear dist: `rm -rf dist/`
- Rebuild: `bun run build`

### IPC not working
- Verify channel names match exactly
- Check preload script loaded: DevTools → Console → `window.koboldAPI`

### Styles not applying
- Verify Tailwind v4: Check `package.json`
- Rebuild styles: `bun run build:renderer`

## Environment Variables

- `NODE_ENV`: `development` | `production`
- `VITE_DEV_SERVER_URL`: Vite dev server URL (auto-set)

## License

MIT - Same as 0xKobold
