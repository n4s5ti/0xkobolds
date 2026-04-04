/**
 * Suggestion Cache - In-memory cache for quick suggestion access
 */

import type { Suggestion } from "../generator/suggestion.js";

interface CacheEntry {
  suggestion: Suggestion;
  timestamp: number;
  outcome?: "accepted" | "dismissed";
}

export class SuggestionCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_SIZE = 10;

  set(suggestion: Suggestion): void {
    // Evict old entries if cache is full
    if (this.cache.size >= this.MAX_SIZE) {
      this.evictOldest();
    }

    this.cache.set(suggestion.id, {
      suggestion,
      timestamp: Date.now(),
    });
  }

  get(id: string): Suggestion | undefined {
    const entry = this.cache.get(id);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(id);
      return undefined;
    }

    return entry.suggestion;
  }

  getLatest(): Suggestion | undefined {
    const entries = Array.from(this.cache.values())
      .sort((a, b) => b.timestamp - a.timestamp);

    const fresh = entries.find(e => Date.now() - e.timestamp < this.TTL_MS);
    return fresh?.suggestion;
  }

  markOutcome(id: string, outcome: "accepted" | "dismissed"): void {
    const entry = this.cache.get(id);
    if (entry) {
      entry.outcome = outcome;
    }
  }

  private evictOldest(): void {
    let oldest: string | undefined;
    let oldestTime = Infinity;

    for (const [id, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldest = id;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getSize(): number {
    return this.cache.size;
  }
}

export default SuggestionCache;
