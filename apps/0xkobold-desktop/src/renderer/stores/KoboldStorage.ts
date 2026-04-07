/**
 * 0xKobold Desktop - Renderer Storage Bridge
 * 
 * Extends @mariozechner/pi-web-ui's AppStorage to integrate 0xKobold's
 * custom stores and persistence layers.
 */

import { 
  AppStorage, 
  SettingsStore, 
  SessionsStore,
  ProviderKeysStore,
} from "@mariozechner/pi-web-ui";
import { IndexedDBStorageBackend } from "@mariozechner/pi-web-ui";

// 0xKobold specific stores
import { SkillStore } from "./SkillStore";
import { AgentTreeStore } from "./AgentTreeStore";

/**
 * KoboldStorage integrates the standard PI web-ui storage
 * with the custom needs of 0xKobold.
 */
export class KoboldStorage extends AppStorage {
  public skills: SkillStore;
  public agentTree: AgentTreeStore;
  
  constructor() {
    // Initialize standard stores
    const settings = new SettingsStore();
    const keys = new ProviderKeysStore();
    const sessions = new SessionsStore();
    
    // Setup backend (using IndexedDB via pi-web-ui's backend)
    const backend = new IndexedDBStorageBackend({
      dbName: "0xkobold-desktop",
      version: 1,
      stores: [
        settings.getConfig(),
        keys.getConfig(),
        sessions.getConfig(),
      ],
    });

    super(settings, keys, sessions, backend);
  }
  
  /**
   * Custom method to sync current session state with main process
   */
  async syncSessionWithMain(): Promise<void> {
    // TODO: Implement via IPC
    await window.koboldAPI.sessions.save(
      // current session id and messages
    );
  }
}

// Singleton instance
export const koboldStorage = new KoboldStorage();
