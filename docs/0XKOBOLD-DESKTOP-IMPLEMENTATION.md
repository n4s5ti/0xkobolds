# 0xKobold Desktop - Implementation Plan

## Phase 1: Foundation (Week 1-2)

### 1.1 Scaffold Structure
```bash
# Create directory structure
mkdir -p apps/0xkobold-desktop/src/{main,preload,renderer/{components,stores,styles,integrations},shared}
mkdir -p apps/0xkobold-desktop/resources/{icons,tray,sounds}
```

### 1.2 Configuration Files

**apps/0xkobold-desktop/package.json**
```json
{
  "name": "@0xkobold/desktop",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build && vite build",
    "build:main": "electron-vite build --entry main",
    "build:preload": "electron-vite build --entry preload",
    "build:renderer": "vite build",
    "preview": "electron-vite preview",
    "package": "electron-builder",
    "package:all": "electron-builder -mwl",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@mariozechner/pi-agent-core": "^0.65.0",
    "@mariozechner/pi-web-ui": "^0.65.0",
    "@mariozechner/mini-lit": "^0.2.0",
    "lit": "^3.3.1",
    "electron-log": "^5.0.0",
    "electron-updater": "^6.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "electron": "^28.0.0",
    "electron-builder": "^24.9.0",
    "electron-vite": "^2.0.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "tailwindcss": "^4.0.0"
  },
  "build": {
    "appId": "com.0xkobold.desktop",
    "productName": "0xKobold",
    "directories": {
      "output": "dist/electron"
    },
    "files": [
      "dist/main/**/*",
      "dist/preload/**/*",
      "dist/renderer/**/*",
      "resources/**/*"
    ],
    "mac": {
      "target": ["dmg", "zip"],
      "icon": "resources/icons/icon.icns"
    },
    "win": {
      "target": ["nsis", "portable"],
      "icon": "resources/icons/icon.ico"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "icon": "resources/icons"
    }
  }
}
```

**apps/0xkobold-desktop/electron.vite.config.ts**
```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
});
```

**apps/0xkobold-desktop/vite.config.ts**
```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
```

### 1.3 Core Files

**src/shared/ipc-channels.ts**
```typescript
export const IPC_CHANNELS = {
  AGENT: {
    SEND: 'agent:send',
    MESSAGE: 'agent:message',
    INTERRUPT: 'agent:interrupt',
    GET_STATE: 'agent:get-state',
  },
  APP: {
    READY: 'app:ready',
    QUIT: 'app:quit',
  },
} as const;
```

**src/main/index.ts**
```typescript
import { app, BrowserWindow } from 'electron';
import { resolve } from 'path';
import { registerIPCHandlers } from './ipc-handler';

let mainWindow: BrowserWindow | null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(resolve(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  registerIPCHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

**src/preload/index.ts**
```typescript
import { contextBridge, ipcRenderer } from 'electron';

const api = {
  agent: {
    send: (content: string) => ipcRenderer.invoke('agent:send', content),
    onMessage: (callback: (msg: any) => void) => {
      ipcRenderer.on('agent:message', (_, msg) => callback(msg));
      return () => ipcRenderer.removeAllListeners('agent:message');
    },
  },
};

contextBridge.exposeInMainWorld('koboldAPI', api);
export type KoboldAPI = typeof api;
```

**src/renderer/index.html**
```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>0xKobold</title>
    <link rel="stylesheet" href="./styles/app.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

**src/renderer/main.ts**
```typescript
import { html, render } from 'lit';
import './styles/app.css';

const app = html`
  <div class="w-full h-screen flex items-center justify-center bg-slate-900 text-white">
    <h1 class="text-4xl font-bold">🐉 0xKobold Desktop</h1>
    <p class="mt-4 text-slate-400">Coming soon...</p>
  </div>
`;

render(app, document.getElementById('app')!);
```

**src/renderer/styles/app.css**
```css
@import "tailwindcss";

:root {
  --sidebar-bg: #0f172a;
  --border-color: #1e293b;
  --accent: #f59e0b;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
}
```

## Phase 2: PI Integration (Week 2-3)

### 2.1 PI Bridge
Create `src/main/pi-bridge.ts` to initialize `@mariozechner/pi-agent-core` and expose it via IPC.

### 2.2 Extension Loading
Port 0xKobold extension loading logic from `src/index.ts` to the main process.

### 2.3 Basic Chat
Integrate `ChatPanel` from `@mariozechner/pi-web-ui` with the bridge.

## Phase 3: 0xKobold Features (Week 3-4)

### 3.1 Agent Tree Panel
Visualize running agents from `pi-orchestration`.

### 3.2 Skill Panel
Hot-reload skill browser with execution capability.

### 3.3 Gateway Status
Connection status indicator with start/stop controls.

## Phase 4: Polish (Week 4-5)

### 4.1 System Integration
- System tray
- Native notifications
- Global shortcuts
- Auto-updater

### 4.2 Theming
- Draconic (0xKobold) theme for pi-web-ui components
- Dark/light/system mode support

### 4.3 Configuration
- Settings UI
- Import/export config
- CLI flag parity (`--local`, etc.)

## Phase 5: Distribution (Week 5-6)

### 5.1 Build Pipeline
- GitHub Actions for automated builds
- Code signing (macOS/Windows)
- Auto-updater integration

### 5.2 Package Managers
- Homebrew (macOS)
- AUR (Arch Linux)
- Chocolatey (Windows)

## Quick Start Commands

```bash
# Phase 1: Bootstrap
cd apps/0xkobold-desktop
bun install
bun run dev  # Should show Electron window with "Coming soon..."

# Phase 2: PI Integration
# Implement PI bridge, should see ChatPanel from pi-web-ui

# Phase 3: 0xKobold Features
# Add AgentTree, SkillPanel, GatewayStatus

# Phase 4: Build
bun run build
bun run package
```

## Testing Strategy

| Component | Test Approach |
|-----------|--------------|
| Main Process | Unit tests with Jest/Vitest |
| Preload | Integration tests with Playwright |
| Renderer | Component tests with Web Test Runner |
| E2E | Playwright for full app flow |

## File Checklist

### Phase 1 Files
- [ ] `apps/0xkobold-desktop/package.json`
- [ ] `apps/0xkobold-desktop/electron.vite.config.ts`
- [ ] `apps/0xkobold-desktop/vite.config.ts`
- [ ] `apps/0xkobold-desktop/tsconfig.json`
- [ ] `src/shared/ipc-channels.ts`
- [ ] `src/main/index.ts`
- [ ] `src/preload/index.ts`
- [ ] `src/renderer/index.html`
- [ ] `src/renderer/main.ts`
- [ ] `src/renderer/styles/app.css`

### Phase 2 Files
- [ ] `src/main/pi-bridge.ts`
- [ ] `src/main/ipc-handler.ts`
- [ ] `src/main/extension-loader.ts`
- [ ] `src/renderer/app.ts` (KoboldApp component)
- [ ] `src/renderer/components/KoboldChatPanel.ts`

### Phase 3 Files
- [ ] `src/renderer/stores/KoboldStorage.ts`
- [ ] `src/renderer/stores/SkillStore.ts`
- [ ] `src/renderer/stores/AgentTreeStore.ts`
- [ ] `src/renderer/components/AgentTreePanel.ts`
- [ ] `src/renderer/components/SkillPanel.ts`
- [ ] `src/renderer/components/GatewayStatusBar.ts`
- [ ] `src/renderer/styles/draconic-theme.css`

### Phase 4 Files
- [ ] `src/main/tray.ts`
- [ ] `src/main/notifications.ts`
- [ ] `src/main/shortcuts.ts`
- [ ] `src/renderer/components/SettingsPanel.ts`
- [ ] `resources/icons/` (icon sets)

---

## Success Criteria

- [ ] Electron app launches with `bun run dev`
- [ ] Basic chat works with pi-web-ui's ChatPanel
- [ ] Agent tree visualization updates in real-time
- [ ] Skills hot-reload updates the UI
- [ ] Gateway can be started/stopped from UI
- [ ] Packaged app runs on macOS/Windows/Linux
- [ ] Auto-updater works for new releases
