/**
 * Suggestion Store - SQLite persistence for suggestion tracking
 */

import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import type { Suggestion } from "../generator/suggestion.js";

export interface SuggestionStats {
  total_suggestions: number;
  accepted_count: number;
  dismissed_count: number;
  acceptance_rate: number;
}

export interface PopularPattern {
  text: string;
  count: number;
  acceptance_rate: number;
}

export class SuggestionStore {
  private db: Database | null = null;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath?: string) {
    const defaultPath = path.join(homedir(), ".0xkobold", "pi-suggest", "store.db");
    this.dbPath = dbPath || defaultPath;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    await fs.mkdir(dir, { recursive: true });

    this.db = new Database(this.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS suggestions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        text TEXT NOT NULL,
        confidence REAL,
        reason TEXT,
        context_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        suggestion_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (suggestion_id) REFERENCES suggestions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_outcomes_suggestion ON outcomes(suggestion_id);
      CREATE INDEX IF NOT EXISTS idx_outcomes_created ON outcomes(created_at);
    `);

    this.initialized = true;
  }

  async recordSuggestion(suggestion: Suggestion): Promise<void> {
    if (!this.db) throw new Error("Store not initialized");
    await this.init();

    this.db.prepare(`
      INSERT OR REPLACE INTO suggestions (id, type, text, confidence, reason, context_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      suggestion.id,
      suggestion.type,
      suggestion.text,
      suggestion.confidence,
      suggestion.reason,
      JSON.stringify(suggestion.context)
    );
  }

  async recordOutcome(suggestionId: string, outcome: "accepted" | "dismissed"): Promise<void> {
    if (!this.db) throw new Error("Store not initialized");
    await this.init();

    this.db.prepare(`
      INSERT INTO outcomes (suggestion_id, outcome)
      VALUES (?, ?)
    `).run(suggestionId, outcome);
  }

  async getStats(): Promise<SuggestionStats> {
    if (!this.db) throw new Error("Store not initialized");
    await this.init();

    const total = this.db.query(`
      SELECT COUNT(*) as count FROM suggestions
    `).get() as { count: number };

    const accepted = this.db.query(`
      SELECT COUNT(*) as count FROM outcomes WHERE outcome = 'accepted'
    `).get() as { count: number };

    const dismissed = this.db.query(`
      SELECT COUNT(*) as count FROM outcomes WHERE outcome = 'dismissed'
    `).get() as { count: number };

    const total_outcomes = accepted.count + dismissed.count;
    const acceptance_rate = total_outcomes > 0 ? accepted.count / total_outcomes : 0;

    return {
      total_suggestions: total.count,
      accepted_count: accepted.count,
      dismissed_count: dismissed.count,
      acceptance_rate,
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

export default SuggestionStore;
