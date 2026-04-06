/**
 * Kobold Registry
 * 
 * A singleton registry that manages the discovery and registration of 
 * capabilities across the pi-kobold extension suite.
 */

import { CapabilityType, CapabilityProvider } from "./capabilities.js";

class KoboldRegistry {
  private providers = new Map<CapabilityType, CapabilityProvider>();

  /**
   * Register a capability provider.
   * If a provider already exists for this type, it will be overwritten.
   */
  register(type: CapabilityType, instance: any, version: string = "1.0.0"): void {
    console.log(`[KoboldRegistry] Registering ${type} capability provider (v${version})`);
    this.providers.set(type, { type, instance, version });
  }

  /**
   * Retrieve a capability provider.
   * Returns null if no provider is registered for the given type.
   */
  getCapability<T>(type: CapabilityType): T | null {
    const provider = this.providers.get(type);
    if (!provider) {
      return null;
    }
    return provider.instance as T;
  }

  /**
   * Check if a specific capability is available.
   */
  hasCapability(type: CapabilityType): boolean {
    return this.providers.has(type);
  }

  /**
   * List all currently registered capabilities.
   */
  listCapabilities(): Array<{ type: CapabilityType; version: string }> {
    return Array.from(this.providers.entries()).map(([type, provider]) => ({
      type,
      version: provider.version,
    }));
  }

  /**
   * Unregister a capability provider.
   */
  unregister(type: CapabilityType): void {
    this.providers.delete(type);
  }
}

// Export a singleton instance
export const registry = new KoboldRegistry();
