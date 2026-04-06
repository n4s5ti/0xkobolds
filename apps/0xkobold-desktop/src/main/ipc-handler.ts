/**
 * 0xKobold Desktop - IPC Handler
 * 
 * Bridges Electron IPC calls from the renderer to the PI agent bridge.
 * Integrates with gateway manager for embedded/connect gateway modes.
 */

import { ipcMain } from 'electron';
import { piBridge } from './pi-bridge';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { IpcResponse, DesktopSettings, GatewayStatus } from '../shared/api-types';
import { DEFAULT_SETTINGS } from '../shared/api-types';
import log from 'electron-log';

// Import gateway manager
import { 
  startEmbeddedGateway, 
  stopEmbeddedGateway, 
  connectToGateway, 
  disconnect as disconnectGateway,
  getGatewayStatus, 
} from './gateway-manager';

let settings: DesktopSettings = { ...DEFAULT_SETTINGS };

export function registerIPCHandlers(): void {
  log.info('[IPC] Registering PI-integrated handlers');

  // ===========================================================================
  // AGENT CHANNELS
  // ===========================================================================

  ipcMain.handle(IPC_CHANNELS.AGENT.SEND, async (_event, content: string): Promise<IpcResponse<void>> => {
    try {
      await piBridge.sendMessage(content);
      return { success: true };
    } catch (err: any) {
      log.error('[IPC] Agent send error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AGENT.INTERRUPT, async (): Promise<IpcResponse<void>> => {
    try {
      await piBridge.interrupt();
      return { success: true };
    } catch (err: any) {
      log.error('[IPC] Agent interrupt error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AGENT.CLEAR, async (): Promise<IpcResponse<void>> => {
    try {
      await piBridge.clear();
      return { success: true };
    } catch (err: any) {
      log.error('[IPC] Agent clear error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AGENT.GET_STATE, async (): Promise<IpcResponse<any>> => {
    try {
      const state = await piBridge.getState();
      return { success: true, data: state };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ===========================================================================
  // GATEWAY CHANNELS (embedded or connect modes)
  // ===========================================================================

  ipcMain.handle(IPC_CHANNELS.GATEWAY.GET_STATUS, async (): Promise<IpcResponse<GatewayStatus>> => {
    try {
      const status = getGatewayStatus();
      return { success: true, data: status };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.GATEWAY.START_EMBEDDED, 
    async (_event, port?: number, host?: string): Promise<IpcResponse<void>> => {
      try {
        await startEmbeddedGateway(port || 18789, host || '127.0.0.1');
        const status = getGatewayStatus();
        log.info('[IPC] Embedded gateway started:', status.url);
        return { success: true, data: status };
      } catch (err: any) {
        log.error('[IPC] Gateway start error:', err);
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GATEWAY.CONNECT, 
    async (_event, url: string): Promise<IpcResponse<void>> => {
      try {
        await connectToGateway(url);
        log.info('[IPC] Connected to gateway:', url);
        return { success: true };
      } catch (err: any) {
        log.error('[IPC] Gateway connect error:', err);
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GATEWAY.DISCONNECT, 
    async (): Promise<IpcResponse<void>> => {
      try {
        await disconnectGateway();
        log.info('[IPC] Disconnected from gateway');
        return { success: true };
      } catch (err: any) {
        log.error('[IPC] Gateway disconnect error:', err);
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GATEWAY.STOP, 
    async (): Promise<IpcResponse<void>> => {
      try {
        await stopEmbeddedGateway();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GATEWAY.RESTART, 
    async (): Promise<IpcResponse<void>> => {
      try {
        await stopEmbeddedGateway();
        await startEmbeddedGateway();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  // ===========================================================================
  // SKILLS CHANNELS
  // ===========================================================================

  ipcMain.handle(IPC_CHANNELS.SKILLS.LIST, async (): Promise<IpcResponse<any[]>> => {
    try {
      // TODO: Get actual skills from skill loader
      const skills = [
        { name: 'file_operations', description: 'File read/write', risk: 'medium' },
        { name: 'shell', description: 'Run shell commands', risk: 'high' },
        { name: 'web_search', description: 'Search the web', risk: 'safe' },
      ];
      return { success: true, data: skills };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SKILLS.EXECUTE, async (_event, name: string, args: unknown): Promise<IpcResponse<any>> => {
    try {
      log.info('[IPC] Skill execution:', name, args);
      // TODO: Delegate to skill system
      return { success: true, data: { executed: name, result: 'Not yet implemented' } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ===========================================================================
  // AGENT TREE CHANNELS (pi-orchestration integration)
  // ===========================================================================

  ipcMain.handle(IPC_CHANNELS.AGENT_TREE.GET_TREE, async (): Promise<IpcResponse<any[]>> => {
    try {
      const tree = piBridge.getAgentTree?.() || [];
      return { success: true, data: tree };
    } catch (err: any) {
      return { success: true, data: [] };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_TREE.SPAWN, async (_event, task: string, options?: any): Promise<IpcResponse<string>> => {
    try {
      log.info('[IPC] Spawn agent:', task);
      const agentId = `agent-${Date.now()}`;
      return { success: true, data: agentId };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.AGENT_TREE.KILL, async (_event, agentId: string): Promise<IpcResponse<void>> => {
    try {
      log.info('[IPC] Kill agent:', agentId);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ===========================================================================
  // SYSTEM & APP CHANNELS
  // ===========================================================================

  ipcMain.handle(IPC_CHANNELS.APP.GET_SETTINGS, async (): Promise<IpcResponse<DesktopSettings>> => {
    return { success: true, data: settings };
  });

  ipcMain.handle(
    IPC_CHANNELS.APP.SET_SETTINGS, 
    async (_event, newSettings: Partial<DesktopSettings>): Promise<IpcResponse<void>> => {
      settings = { ...settings, ...newSettings };
      
      const { BrowserWindow } = await import('electron');
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send(IPC_CHANNELS.APP.ON_SETTINGS_CHANGE, settings);
      });
      
      return { success: true };
    }
  );

  ipcMain.handle(IPC_CHANNELS.SYSTEM.OPEN_EXTERNAL, async (_event, url: string) => {
    const { shell } = await import('electron');
    await shell.openExternal(url);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM.SELECT_FOLDER, async () => {
    const { dialog, BrowserWindow } = await import('electron');
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || undefined, {
      properties: ['openDirectory'],
    });
    return result.canceled ? { success: false, error: "Canceled" } : { success: true, data: result.filePaths[0] };
  });

  ipcMain.handle(IPC_CHANNELS.SYSTEM.SELECT_FILE, async (_event, options?: { filters?: { name: string; extensions: string[] }[] }) => {
    const { dialog, BrowserWindow } = await import('electron');
    const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow() || undefined, {
      properties: ['openFile'],
      filters: options?.filters,
    });
    return result.canceled ? { success: false, error: "Canceled" } : { success: true, data: result.filePaths[0] };
  });

  log.info('[IPC] All handlers registered');
}
