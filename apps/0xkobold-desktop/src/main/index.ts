/**
 * 0xKobold Desktop - Main Process Entry Point
 * 
 * The main process is the Node.js runtime that:
 * - Creates the Electron BrowserWindow
 * - Initializes the PI Agent (via bridge)
 * - Manages gateway (embedded/connect modes)
 * - Handles IPC communication with renderer
 * - Manages native system integrations (tray, notifications)
 */

import { app, BrowserWindow, nativeImage, Tray, Menu } from 'electron';
import { resolve } from 'path';
import log from 'electron-log';

// Import IPC handlers
import { registerIPCHandlers } from './ipc-handler';

// Import gateway manager
import { startEmbeddedGateway } from './gateway-manager';
import { initializeGateway } from './gateway-manager';

// Configure logging
log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// State
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Settings (simplified - loaded from IPC)
const APP_SETTINGS = {
  width: 1400,
  height: 900,
  alwaysOnTop: false,
  frameless: true,
  transparent: false,
  minimizeToTray: true,
  gatewayPort: 18789,
  gatewayAutoStart: true,
  newChatShortcut: 'CommandOrControl+Shift+N',
};

/**
 * Create the main application window
 */
function createMainWindow(): BrowserWindow {
  log.info('[Main] Creating main window');

  mainWindow = new BrowserWindow({
    width: APP_SETTINGS.width,
    height: APP_SETTINGS.height,
    
    // Frame and titlebar
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: !APP_SETTINGS.frameless,
    transparent: APP_SETTINGS.transparent,
    
    // Web preferences - security focused
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
    
    // Appearance
    backgroundColor: APP_SETTINGS.transparent ? undefined : '#0f172a',
    show: false, // Show after load to prevent flash
  });

  // Load the renderer
  const isDev = !!process.env.VITE_DEV_SERVER_URL || app.isPackaged === false;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  
  if (isDev) {
    log.info('[Main] Loading renderer from dev server:', devServerUrl);
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    // Production mode - load built files
    mainWindow.loadFile(resolve(__dirname, '../renderer/index.html'));
  }

  // Show when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    
    if (APP_SETTINGS.alwaysOnTop) {
      mainWindow?.setAlwaysOnTop(true, 'floating');
    }
  });

  // Handle window close
  mainWindow.on('close', (event) => {
    if (APP_SETTINGS.minimizeToTray && process.platform !== 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) {
      event.preventDefault();
      import('electron').then(({ shell }) => shell.openExternal(url));
    }
  });

  return mainWindow;
}

/**
 * Create system tray icon
 */
function createTray(): void {
  // Try to create a simple tray icon
  try {
    // Create a 16x16 tray icon programmatically
    const trayIcon = nativeImage.createEmpty();
    
    tray = new Tray(trayIcon);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show 0xKobold',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createMainWindow();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'New Chat',
        accelerator: APP_SETTINGS.newChatShortcut,
        click: () => {
          mainWindow?.webContents.send('agent:clear');
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ]);
    
    tray.setContextMenu(contextMenu);
    tray.setToolTip('0xKobold - Your Digital Familiar');
    
    tray.on('click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow?.show();
        mainWindow?.focus();
      }
    });
  } catch (err) {
    log.warn('[Main] Could not create tray:', err);
  }
}

/**
 * Application entry point
 */
app.whenReady().then(async () => {
  log.info('[Main] 0xKobold Desktop starting');
  log.info('[Main] Platform:', process.platform);
  log.info('[Main] Electron:', process.versions.electron);
  
  // Register IPC handlers
  registerIPCHandlers();
  log.info('[Main] IPC handlers registered');
  
  // Create main window
  createMainWindow();
  log.info('[Main] Main window created');
  
  // Create system tray
  if (APP_SETTINGS.minimizeToTray) {
    createTray();
  }
  
  // Auto-start embedded gateway if configured (smart connect to existing if available)
  if (APP_SETTINGS.gatewayAutoStart) {
    log.info('[Main] Auto-starting gateway on port', APP_SETTINGS.gatewayPort);
    try {
      await initializeGateway('auto', APP_SETTINGS.gatewayPort, '127.0.0.1');
      log.info('[Main] Gateway initialized (embedded or connected)');
    } catch (err) {
      log.warn('[Main] Failed to initialize gateway:', err);
    }
  }

  // macOS: Re-create window when dock icon clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow?.show();
    }
  });
});

// Quit when all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Before quit
app.on('before-quit', () => {
  log.info('[Main] App quitting');
  // Note: gateway cleanup handled by gateway-manager
});

// Security: Prevent new window creation
app.on('web-contents-created', (_event, contents) => {
  contents.on('new-window', (event) => {
    event.preventDefault();
  });
});

// Log unhandled errors
process.on('uncaughtException', (error) => {
  log.error('[Main] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  log.error('[Main] Unhandled rejection:', reason);
});
