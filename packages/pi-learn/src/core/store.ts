/**
 * SQLite Store Module - Database operations for pi-learn
 * Uses sql.js (WebAssembly SQLite) for cross-runtime compatibility
 */

import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import { cosineSimilarity } from "../shared.js";
import type {
  Workspace,
  Peer,
  Session,
  Conclusion,
  Summary,
  PeerCard,
  Observation,
  PeerRepresentation,
  ExportData,
  Scope,
} from "../shared.js";
import { GLOBAL_WORKSPACE_ID } from "../shared.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export async function createStore(dbPath: string): Promise<SQLiteStore> {
  return new SQLiteStore(dbPath);
}

// ============================================================================
// STORE CLASS
// ============================================================================

export class SQLiteStore {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dbPath: string) {
    console.assert(dbPath !== null, 'dbPath must not be null');
    console.assert(typeof dbPath === 'string', 'dbPath must be string');
    console.assert(dbPath.length > 0, 'dbPath must not be empty');
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    console.assert(this.db === null, 'db should not be initialized twice');
    
    const SQL = await initSqlJs();
    console.assert(SQL !== null, 'SQL.js initialization failed');
    
    // Load existing database or create new one
    if (existsSync(this.dbPath)) {
      const buffer = readFileSync(this.dbPath);
      console.assert(buffer !== null, 'failed to read database file');
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
      console.assert(this.db !== null, 'failed to create new database');
    }
    
    console.assert(this.db !== null, 'database must be initialized');
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = OFF");
    this.initTables();
    this.migrate();
    this.verifyAndFixSchema();
    this.scheduleSave();
  }

  private scheduleSave(): void {
    // Debounced save to disk (save every 5 seconds max)
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveToDisk(), 5000);
  }

  private saveToDisk(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error("[Store] Error saving database to disk:", err);
    }
  }

  private run(sql: string, params: any[] = []): void {
    if (!this.db) throw new Error("Database not initialized");
    this.db.run(sql, params);
    this.scheduleSave();
  }

  private exec(sql: string): void {
    if (!this.db) throw new Error("Database not initialized");
    this.db.exec(sql);
    this.scheduleSave();
  }

  private prepare(sql: string) {
    if (!this.db) throw new Error("Database not initialized");
    return this.db.prepare(sql);
  }

  private getOne(sql: string, params: any[] = []): any {
    if (!this.db) throw new Error("Database not initialized");
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  private getAll(sql: string, params: any[] = []): any[] {
    if (!this.db) throw new Error("Database not initialized");
    const results: any[] = [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  private initTables(): void {
    this.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        config TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS peers (
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'user',
        created_at INTEGER NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (id, workspace_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        peer_ids TEXT NOT NULL DEFAULT '[]',
        message_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        tags TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (id, workspace_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id, workspace_id) REFERENCES sessions(id, workspace_id),
        FOREIGN KEY (peer_id, workspace_id) REFERENCES peers(id, workspace_id)
      );

      CREATE TABLE IF NOT EXISTS conclusions (
        id TEXT PRIMARY KEY,
        peer_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        premises TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        source_session_id TEXT NOT NULL,
        embedding TEXT,
        scope TEXT NOT NULL DEFAULT 'project',
        FOREIGN KEY (peer_id, workspace_id) REFERENCES peers(id, workspace_id),
        FOREIGN KEY (source_session_id, workspace_id) REFERENCES sessions(id, workspace_id)
      );

      CREATE TABLE IF NOT EXISTS summaries (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        message_count INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        embedding TEXT,
        FOREIGN KEY (session_id, workspace_id) REFERENCES sessions(id, workspace_id),
        FOREIGN KEY (peer_id, workspace_id) REFERENCES peers(id, workspace_id)
      );

      CREATE TABLE IF NOT EXISTS peer_cards (
        peer_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        name TEXT,
        occupation TEXT,
        interests TEXT NOT NULL DEFAULT '[]',
        traits TEXT NOT NULL DEFAULT '[]',
        goals TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (peer_id, workspace_id),
        FOREIGN KEY (peer_id, workspace_id) REFERENCES peers(id, workspace_id)
      );

      CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        peer_id TEXT NOT NULL,
        about_peer_id TEXT,
        session_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        embedding TEXT,
        processed INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (peer_id, workspace_id) REFERENCES peers(id, workspace_id),
        FOREIGN KEY (session_id, workspace_id) REFERENCES sessions(id, workspace_id)
      );

      CREATE TABLE IF NOT EXISTS dream_metadata (
        workspace_id TEXT PRIMARY KEY,
        last_dreamed_at INTEGER NOT NULL DEFAULT 0,
        dream_count INTEGER NOT NULL DEFAULT 0,
        last_dream_messages INTEGER NOT NULL DEFAULT 0,
        last_dream_conclusions INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );

      CREATE INDEX IF NOT EXISTS idx_conclusions_peer ON conclusions(peer_id, workspace_id);
      CREATE INDEX IF NOT EXISTS idx_conclusions_created ON conclusions(created_at);
      CREATE INDEX IF NOT EXISTS idx_summaries_peer ON summaries(peer_id, workspace_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, workspace_id);
      CREATE INDEX IF NOT EXISTS idx_observations_peer ON observations(peer_id, workspace_id);
      CREATE INDEX IF NOT EXISTS idx_observations_processed ON observations(processed);
      CREATE INDEX IF NOT EXISTS idx_observations_about ON observations(about_peer_id, workspace_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_tags ON sessions(tags);
    `);
  }

  private migrate(): void {
    // Migrate sessions table to add tags column if it doesn't exist
    try {
      const columns = this.getAll("PRAGMA table_info(sessions)");
      const hasTags = columns.some(c => c.name === 'tags');
      if (!hasTags) {
        this.exec("ALTER TABLE sessions ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
      }
    } catch {
      // Column may already exist or table doesn't exist yet
    }

    // Migrate observations table to add about_peer_id column
    try {
      const columns = this.getAll("PRAGMA table_info(observations)");
      const hasAboutPeerId = columns.some(c => c.name === 'about_peer_id');
      if (!hasAboutPeerId) {
        this.exec("ALTER TABLE observations ADD COLUMN about_peer_id TEXT");
      }
    } catch {
      // Column may already exist
    }

    // Migrate messages table to add metadata column
    try {
      const columns = this.getAll("PRAGMA table_info(messages)");
      const hasMetadata = columns.some(c => c.name === 'metadata');
      if (!hasMetadata) {
        this.exec("ALTER TABLE messages ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
      }
    } catch {
      // Column may already exist
    }

    // Migrate conclusions table to add scope column
    try {
      const columns = this.getAll("PRAGMA table_info(conclusions)");
      const hasScope = columns.some(c => c.name === 'scope');
      if (!hasScope) {
        this.exec("ALTER TABLE conclusions ADD COLUMN scope TEXT NOT NULL DEFAULT 'project'");
      }
    } catch {
      // Column may already exist
    }
  }

  /**
   * Verify database schema integrity and fix any issues.
   * This ensures all required columns and indexes exist even if migrations
   * were skipped or failed in previous runs.
   */
  private verifyAndFixSchema(): void {
    const requiredColumns: Record<string, string[]> = {
      sessions: ['tags'],
      observations: ['about_peer_id'],
      messages: ['metadata'],
      conclusions: ['scope'],
    };

    const requiredIndexes: Record<string, Array<{ name: string; columns: string[] }>> = {
      observations: [
        { name: 'idx_observations_about', columns: ['about_peer_id', 'workspace_id'] },
      ],
      conclusions: [
        { name: 'idx_conclusions_scope', columns: ['scope', 'workspace_id'] },
      ],
    };

    // Verify and fix columns
    for (const [table, requiredCols] of Object.entries(requiredColumns)) {
      try {
        const columns = this.getAll(`PRAGMA table_info(${table})`);
        const columnNames = new Set(columns.map(c => c.name));

        for (const col of requiredCols) {
          if (!columnNames.has(col)) {
            console.warn(`[Store] Missing column '${col}' in '${table}' table. Adding...`);
            this.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`);
            console.log(`[Store] Added column '${col}' to '${table}' table.`);
          }
        }
      } catch (err) {
        console.error(`[Store] Error verifying columns for '${table}':`, err);
      }
    }

    // Verify and fix indexes
    for (const [table, requiredIdxs] of Object.entries(requiredIndexes)) {
      try {
        const existingIndexes = this.getAll(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='${table}'`);
        const indexNames = new Set(existingIndexes.map(i => i.name));

        for (const idx of requiredIdxs) {
          if (!indexNames.has(idx.name)) {
            console.warn(`[Store] Missing index '${idx.name}' on '${table}' table. Creating...`);
            this.exec(`CREATE INDEX ${idx.name} ON ${table}(${idx.columns.join(', ')})`);
            console.log(`[Store] Created index '${idx.name}' on '${table}' table.`);
          }
        }
      } catch (err) {
        console.error(`[Store] Error verifying indexes for '${table}':`, err);
      }
    }
  }

  // Workspace
  getWorkspace(id: string): Workspace | null {
    console.assert(id !== null, 'id must not be null');
    console.assert(typeof id === 'string', 'id must be string');
    console.assert(id.length > 0, 'id must not be empty');
    
    const row = this.getOne("SELECT * FROM workspaces WHERE id = ?", [id]);
    if (!row) return null;
    return { id: row.id, name: row.name, createdAt: row.created_at, config: JSON.parse(row.config || "{}") };
  }

  saveWorkspace(workspace: Workspace): void {
    console.assert(workspace !== null, 'workspace must not be null');
    console.assert(workspace.id !== null, 'workspace.id must not be null');
    console.assert(typeof workspace.name === 'string', 'workspace.name must be string');
    
    this.run(
      `INSERT OR REPLACE INTO workspaces (id, name, created_at, config) VALUES (?, ?, ?, ?)`,
      [workspace.id, workspace.name, workspace.createdAt, JSON.stringify(workspace.config)]
    );
  }


  // Peer
  getPeer(workspaceId: string, peerId: string): Peer | null {
    console.assert(workspaceId !== null, 'workspaceId must not be null');
    console.assert(peerId !== null, 'peerId must not be null');
    console.assert(typeof workspaceId === 'string', 'workspaceId must be string');
    console.assert(typeof peerId === 'string', 'peerId must be string');
    
    const row = this.getOne("SELECT * FROM peers WHERE id = ? AND workspace_id = ?", [peerId, workspaceId]);
    if (!row) return null;
    return { id: row.id, name: row.name, type: row.type, createdAt: row.created_at, metadata: JSON.parse(row.metadata || "{}") };
  }

  savePeer(workspaceId: string, peer: Peer): void {
    this.run(
      `INSERT OR REPLACE INTO peers (id, workspace_id, name, type, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)`,
      [peer.id, workspaceId, peer.name, peer.type, peer.createdAt, JSON.stringify(peer.metadata)]
    );
  }

  getAllPeers(workspaceId: string): Peer[] {
    const rows = this.getAll("SELECT * FROM peers WHERE workspace_id = ?", [workspaceId]);
    return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, createdAt: r.created_at, metadata: JSON.parse(r.metadata || "{}") }));
  }

  // Session
  getSession(workspaceId: string, sessionId: string): Session | null {
    const row = this.getOne("SELECT * FROM sessions WHERE id = ? AND workspace_id = ?", [sessionId, workspaceId]);
    if (!row) return null;
    return { 
      id: row.id, 
      workspaceId: row.workspace_id, 
      peerIds: JSON.parse(row.peer_ids), 
      messageCount: row.message_count, 
      createdAt: row.created_at, 
      updatedAt: row.updated_at, 
      config: JSON.parse(row.config || "{}"),
      tags: JSON.parse(row.tags || "[]")
    };
  }

  saveSession(workspaceId: string, session: Session): void {
    this.run(
      `INSERT OR REPLACE INTO sessions (id, workspace_id, peer_ids, message_count, created_at, updated_at, config, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [session.id, workspaceId, JSON.stringify(session.peerIds), session.messageCount, session.createdAt, session.updatedAt, JSON.stringify(session.config), JSON.stringify(session.tags || [])]
    );
  }

  getAllSessions(workspaceId: string): Session[] {
    const rows = this.getAll("SELECT * FROM sessions WHERE workspace_id = ? ORDER BY created_at DESC", [workspaceId]);
    return rows.map((r) => ({ 
      id: r.id, 
      workspaceId: r.workspace_id, 
      peerIds: JSON.parse(r.peer_ids), 
      messageCount: r.message_count, 
      createdAt: r.created_at, 
      updatedAt: r.updated_at, 
      config: JSON.parse(r.config || "{}"),
      tags: JSON.parse(r.tags || "[]")
    }));
  }

  // Session Tags
  tagSession(workspaceId: string, sessionId: string, tags: string[]): void {
    const session = this.getSession(workspaceId, sessionId);
    if (!session) return;
    
    const existingTags = new Set(session.tags || []);
    tags.forEach(t => existingTags.add(t));
    session.tags = Array.from(existingTags);
    session.updatedAt = Date.now();
    this.saveSession(workspaceId, session);
  }

  untagSession(workspaceId: string, sessionId: string, tags: string[]): void {
    const session = this.getSession(workspaceId, sessionId);
    if (!session) return;
    
    const tagSet = new Set(tags);
    session.tags = (session.tags || []).filter(t => !tagSet.has(t));
    session.updatedAt = Date.now();
    this.saveSession(workspaceId, session);
  }

  getSessionsByTag(workspaceId: string, tag: string, limit: number = 20): Session[] {
    const rows = this.getAll("SELECT * FROM sessions WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?", [workspaceId, limit]);
    return rows
      .map((r) => ({ 
        id: r.id, 
        workspaceId: r.workspace_id, 
        peerIds: JSON.parse(r.peer_ids), 
        messageCount: r.message_count, 
        createdAt: r.created_at, 
        updatedAt: r.updated_at, 
        config: JSON.parse(r.config || "{}"),
        tags: JSON.parse(r.tags || "[]")
      }))
      .filter(s => s.tags.includes(tag));
  }

  getAllTags(workspaceId: string): Array<{ tag: string; count: number }> {
    const sessions = this.getAllSessions(workspaceId);
    const tagCounts = new Map<string, number>();
    
    for (const session of sessions) {
      for (const tag of session.tags || []) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }
    
    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  // Messages
  saveMessage(workspaceId: string, message: { id: string; sessionId: string; peerId: string; role: string; content: string; createdAt: number; metadata?: Record<string, unknown> }): void {
    console.assert(workspaceId !== null, 'workspaceId must not be null');
    console.assert(message !== null, 'message must not be null');
    console.assert(message.id !== null, 'message.id must not be null');
    console.assert(message.content !== null, 'message.content must not be null');
    
    this.run(
      `INSERT INTO messages (id, session_id, workspace_id, peer_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [message.id, message.sessionId, workspaceId, message.peerId, message.role, message.content, JSON.stringify(message.metadata || {}), message.createdAt]
    );
  }


  // Batch message creation - efficient insert of multiple messages
  saveMessagesBatch(workspaceId: string, messages: Array<{ id: string; sessionId: string; peerId: string; role: string; content: string; createdAt: number; metadata?: Record<string, unknown> }>): number {
    console.assert(Array.isArray(messages), 'messages must be array');
    console.assert(messages.length > 0, 'messages must not be empty');
    
    for (const msg of messages) {
      console.assert(msg.id !== null, 'message id must not be null');
      console.assert(msg.content !== null, 'message content must not be null');
      
      this.run(
        `INSERT INTO messages (id, session_id, workspace_id, peer_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [msg.id, msg.sessionId, workspaceId, msg.peerId, msg.role, msg.content, JSON.stringify(msg.metadata || {}), msg.createdAt]
      );
    }
    return messages.length;
  }

  getMessages(workspaceId: string, sessionId: string, limit: number = 100): any[] {
    console.assert(typeof limit === 'number', 'limit must be number');
    console.assert(limit > 0, 'limit must be positive');
    
    return this.getAll("SELECT * FROM messages WHERE session_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT ?", [sessionId, workspaceId, limit]);
  }

  getRecentMessages(workspaceId: string, peerId: string, limit: number = 50): any[] {
    console.assert(typeof limit === 'number', 'limit must be number');
    console.assert(limit > 0, 'limit must be positive');
    
    return this.getAll("SELECT * FROM messages WHERE peer_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT ?", [peerId, workspaceId, limit]);
  }

  // Conclusions
  saveConclusion(workspaceId: string, conclusion: Conclusion): void {
    console.assert(workspaceId !== null, 'workspaceId must not be null');
    console.assert(conclusion !== null, 'conclusion must not be null');
    console.assert(conclusion.id !== null, 'conclusion.id must not be null');
    console.assert(conclusion.content !== null, 'conclusion.content must not be string');
    console.assert(typeof conclusion.content === 'string', 'conclusion.content must be string');
    console.assert(conclusion.type !== null, 'conclusion.type must not be null');
    
    // Validate confidence range
    if (conclusion.confidence !== undefined) {
      console.assert(conclusion.confidence >= 0 && conclusion.confidence <= 1, 'confidence must be 0-1');
    }
    
    this.run(
      `INSERT OR REPLACE INTO conclusions (id, peer_id, workspace_id, type, content, premises, confidence, created_at, source_session_id, embedding, scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [conclusion.id, conclusion.peerId, workspaceId, conclusion.type, conclusion.content, JSON.stringify(conclusion.premises), conclusion.confidence, conclusion.createdAt, conclusion.sourceSessionId, conclusion.embedding ? JSON.stringify(conclusion.embedding) : null, conclusion.scope || 'project']
    );
  }

  getConclusions(workspaceId: string, peerId: string, limit: number = 10, scope?: Scope): Conclusion[] {
    console.assert(workspaceId !== null, 'workspaceId must not be null');
    console.assert(peerId !== null, 'peerId must not be null');
    console.assert(typeof limit === 'number', 'limit must be number');
    
    let sql = "SELECT * FROM conclusions WHERE peer_id = ? AND workspace_id = ?";
    const params: any[] = [peerId, workspaceId];
    
    if (scope) {
      console.assert(scope === 'user' || scope === 'project', 'scope must be user or project');
      sql += " AND scope = ?";
      params.push(scope);
    }
    
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    
    const rows = this.getAll(sql, params);
    return rows.map((r) => ({ 
      id: r.id, 
      peerId: r.peer_id, 
      type: r.type, 
      content: r.content, 
      premises: JSON.parse(r.premises || "[]"), 
      confidence: r.confidence, 
      createdAt: r.created_at, 
      sourceSessionId: r.source_session_id, 
      embedding: r.embedding ? JSON.parse(r.embedding) : undefined,
      scope: (r.scope as Scope) || 'project'
    }));
  }

  getAllConclusions(workspaceId: string, peerId?: string, scope?: Scope): Conclusion[] {
    console.assert(workspaceId !== null, 'workspaceId must not be null');
    console.assert(typeof workspaceId === 'string', 'workspaceId must be string');
    
    if (peerId) {
      console.assert(typeof peerId === 'string', 'peerId must be string');
      return this.getConclusions(workspaceId, peerId, 10000, scope);
    }
    
    let sql = "SELECT * FROM conclusions WHERE workspace_id = ?";
    const params: any[] = [workspaceId];
    
    if (scope) {
      console.assert(scope === 'user' || scope === 'project', 'scope must be user or project');
      sql += " AND scope = ?";
      params.push(scope);
    }
    
    sql += " ORDER BY created_at DESC";
    
    const rows = this.getAll(sql, params);
    return rows.map((r) => ({ 
      id: r.id, 
      peerId: r.peer_id, 
      type: r.type, 
      content: r.content, 
      premises: JSON.parse(r.premises || "[]"), 
      confidence: r.confidence, 
      createdAt: r.created_at, 
      sourceSessionId: r.source_session_id, 
      embedding: r.embedding ? JSON.parse(r.embedding) : undefined,
      scope: (r.scope as Scope) || 'project'
    }));
  }

  // Get conclusions from the global workspace (user scope)
  getGlobalConclusions(peerId: string, limit: number = 100): Conclusion[] {
    return this.getConclusions(GLOBAL_WORKSPACE_ID, peerId, limit, 'user');
  }

  // Get all global (user scope) conclusions for a peer
  getAllGlobalConclusions(peerId: string): Conclusion[] {
    return this.getAllConclusions(GLOBAL_WORKSPACE_ID, peerId, 'user');
  }

  // Summaries
  saveSummary(workspaceId: string, summary: Summary): void {
    this.run(
      `INSERT INTO summaries (id, session_id, peer_id, workspace_id, type, content, message_count, created_at, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [summary.id, summary.sessionId, summary.peerId, workspaceId, summary.type, summary.content, summary.messageCount, summary.createdAt, summary.embedding ? JSON.stringify(summary.embedding) : null]
    );
  }

  getSummaries(workspaceId: string, peerId: string, limit: number = 10): Summary[] {
    const rows = this.getAll("SELECT * FROM summaries WHERE peer_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT ?", [peerId, workspaceId, limit]);
    return rows.map((r) => ({ id: r.id, sessionId: r.session_id, peerId: r.peer_id, type: r.type, content: r.content, messageCount: r.message_count, createdAt: r.created_at, embedding: r.embedding ? JSON.parse(r.embedding) : undefined }));
  }

  // Peer Cards
  getPeerCard(workspaceId: string, peerId: string): PeerCard | null {
    const row = this.getOne("SELECT * FROM peer_cards WHERE peer_id = ? AND workspace_id = ?", [peerId, workspaceId]);
    if (!row) return null;
    return { peerId: row.peer_id, name: row.name, occupation: row.occupation, interests: JSON.parse(row.interests || "[]"), traits: JSON.parse(row.traits || "[]"), goals: JSON.parse(row.goals || "[]"), updatedAt: row.updated_at };
  }

  savePeerCard(workspaceId: string, card: PeerCard): void {
    this.run(
      `INSERT OR REPLACE INTO peer_cards (peer_id, workspace_id, name, occupation, interests, traits, goals, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [card.peerId, workspaceId, card.name || null, card.occupation || null, JSON.stringify(card.interests), JSON.stringify(card.traits), JSON.stringify(card.goals), card.updatedAt]
    );
  }

  // Observations
  saveObservation(observation: Observation): void {
    this.run(
      `INSERT INTO observations (id, peer_id, about_peer_id, session_id, workspace_id, role, content, created_at, embedding, processed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [observation.id, observation.peerId, observation.aboutPeerId || null, observation.sessionId, observation.workspaceId, observation.role, observation.content, observation.createdAt, observation.embedding ? JSON.stringify(observation.embedding) : null, observation.processed ? 1 : 0]
    );
  }

  // Alias for backward compatibility
  addObservation = this.saveObservation;

  getObservations(workspaceId: string, peerId: string, limit: number = 100): Observation[] {
    const rows = this.getAll("SELECT * FROM observations WHERE peer_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT ?", [peerId, workspaceId, limit]);
    return rows.map((r) => ({ id: r.id, peerId: r.peer_id, aboutPeerId: r.about_peer_id || undefined, sessionId: r.session_id, workspaceId: r.workspace_id, role: r.role, content: r.content, createdAt: r.created_at, embedding: r.embedding ? JSON.parse(r.embedding) : undefined, processed: r.processed === 1 }));
  }

  // Cross-peer: Get observations made BY a peer about OTHER peers
  getObservationsForPeer(workspaceId: string, observerPeerId: string, limit: number = 100): Observation[] {
    const rows = this.getAll("SELECT * FROM observations WHERE peer_id = ? AND workspace_id = ? AND about_peer_id IS NOT NULL ORDER BY created_at DESC LIMIT ?", [observerPeerId, workspaceId, limit]);
    return rows.map((r) => ({ id: r.id, peerId: r.peer_id, aboutPeerId: r.about_peer_id, sessionId: r.session_id, workspaceId: r.workspace_id, role: r.role, content: r.content, createdAt: r.created_at, embedding: r.embedding ? JSON.parse(r.embedding) : undefined, processed: r.processed === 1 }));
  }

  // Cross-peer: Get observations made ABOUT a specific peer by OTHER peers
  getObservationsAboutPeer(workspaceId: string, targetPeerId: string, limit: number = 100): Observation[] {
    const rows = this.getAll("SELECT * FROM observations WHERE about_peer_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT ?", [targetPeerId, workspaceId, limit]);
    return rows.map((r) => ({ id: r.id, peerId: r.peer_id, aboutPeerId: r.about_peer_id, sessionId: r.session_id, workspaceId: r.workspace_id, role: r.role, content: r.content, createdAt: r.created_at, embedding: r.embedding ? JSON.parse(r.embedding) : undefined, processed: r.processed === 1 }));
  }

  getUnprocessedObservations(workspaceId: string, peerId: string, limit: number = 50): Observation[] {
    const rows = this.getAll("SELECT * FROM observations WHERE peer_id = ? AND workspace_id = ? AND processed = 0 ORDER BY created_at ASC LIMIT ?", [peerId, workspaceId, limit]);
    return rows.map((r) => ({ id: r.id, peerId: r.peer_id, sessionId: r.session_id, workspaceId: r.workspace_id, role: r.role, content: r.content, createdAt: r.created_at, embedding: r.embedding ? JSON.parse(r.embedding) : undefined, processed: false }));
  }

  markObservationsProcessed(observationIds: string[]): void {
    if (observationIds.length === 0) return;
    const placeholders = observationIds.map(() => '?').join(',');
    this.run(`UPDATE observations SET processed = 1 WHERE id IN (${placeholders})`, observationIds);
  }

  searchObservations(workspaceId: string, peerId: string, query: string, limit: number = 20): Array<Observation & { relevance: number }> {
    const observations = this.getObservations(workspaceId, peerId, 100);
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    
    if (queryWords.length === 0) {
      return observations.slice(0, limit).map(o => ({ ...o, relevance: 1 }));
    }

    // Score observations by keyword overlap
    const scored = observations.map(obs => {
      const contentLower = obs.content.toLowerCase();
      let matchCount = 0;
      
      for (const word of queryWords) {
        if (contentLower.includes(word)) {
          matchCount++;
        }
      }
      
      const relevance = matchCount / queryWords.length;
      return { ...obs, relevance };
    });

    return scored
      .filter(o => o.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  searchObservationsByEmbedding(workspaceId: string, peerId: string, queryEmbedding: number[], limit: number = 20): Array<Observation & { relevance: number }> {
    console.assert(workspaceId !== null, 'workspaceId must not be null');
    console.assert(peerId !== null, 'peerId must not be null');
    console.assert(Array.isArray(queryEmbedding), 'queryEmbedding must be array');
    console.assert(queryEmbedding.length > 0, 'queryEmbedding must not be empty');
    console.assert(typeof limit === 'number', 'limit must be number');
    
    const observations = this.getObservations(workspaceId, peerId, 100);
    
    const scored = observations
      .filter(o => o.embedding && o.embedding.length > 0)
      .map(obs => {
        const similarity = cosineSimilarity(queryEmbedding, obs.embedding!);
        return { ...obs, relevance: similarity };
      });

    return scored
      .filter(o => o.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }

  // Representation
  getRepresentation(workspaceId: string, peerId: string, includeGlobal: boolean = true): PeerRepresentation | null {
    console.assert(workspaceId !== null, 'workspaceId must not be null');
    console.assert(peerId !== null, 'peerId must not be null');
    console.assert(typeof includeGlobal === 'boolean', 'includeGlobal must be boolean');
    
    const conclusions = this.getConclusions(workspaceId, peerId, 100);
    const summaries = this.getSummaries(workspaceId, peerId, 10);
    const peerCard = this.getPeerCard(workspaceId, peerId);
    const observations = this.getObservations(workspaceId, peerId, 50);
    const lastConclusion = conclusions[0];
    return { peerId, conclusions, summaries, peerCard, observations, lastReasonedAt: lastConclusion?.createdAt || 0 };
  }

  // Get blended representation: local project + global user-scope
  getBlendedRepresentation(workspaceId: string, peerId: string): {
    local: PeerRepresentation | null;
    global: PeerRepresentation | null;
    blendedConclusions: Conclusion[];
  } {
    const local = this.getRepresentation(workspaceId, peerId, false);
    const global = this.getRepresentation(GLOBAL_WORKSPACE_ID, peerId, false);
    
    // Blend conclusions: project conclusions first, then global
    const blendedConclusions = [
      ...(local?.conclusions || []),
      ...(global?.conclusions || [])
    ];
    
    return {
      local,
      global,
      blendedConclusions
    };
  }

  // Search
  searchSessions(workspaceId: string, query: string, limit: number = 10): Array<{ sessionId: string; createdAt: number; snippet: string; relevance: number }> {
    const rows = this.getAll(
      `SELECT DISTINCT s.id, s.created_at, m.content
       FROM sessions s
       JOIN messages m ON m.session_id = s.id AND m.workspace_id = s.workspace_id
       WHERE s.workspace_id = ? AND m.content LIKE ?
       ORDER BY s.created_at DESC
       LIMIT ?`,
      [workspaceId, `%${query}%`, limit]
    );
    return rows.map((r) => ({ 
      sessionId: r.id, 
      createdAt: r.created_at, 
      snippet: (r.content as string).slice(0, 150).replace(/\n/g, " ") + ((r.content as string).length > 150 ? "..." : ""), 
      relevance: 1.0 
    }));
  }

  // Retention
  prune(retentionDays: number, summaryRetentionDays: number, conclusionRetentionDays: number): { deleted: number } {
    const now = Date.now();
    let deleted = 0;
    const tables: Array<[string, string, number]> = [
      ["messages", "created_at", retentionDays],
      ["summaries", "created_at", summaryRetentionDays],
      ["conclusions", "created_at", conclusionRetentionDays],
      ["observations", "created_at", retentionDays],
    ];
    for (const [table, field, days] of tables) {
      if (days > 0) {
        const cutoff = now - days * 24 * 60 * 60 * 1000;
        this.run(`DELETE FROM ${table} WHERE ${field} < ?`, [cutoff]);
        deleted++;
      }
    }
    return { deleted };
  }

  // Export/Import
  exportAll(workspaceId: string): ExportData {
    const workspace = this.getWorkspace(workspaceId)!;
    const peers = this.getAllPeers(workspaceId);
    const conclusions = this.getAllConclusions(workspaceId);
    const summaries = this.getSummaries(workspaceId, "", 10000);
    const observations = this.getObservations(workspaceId, "", 10000);
    const peerCards = this.getAll("SELECT * FROM peer_cards WHERE workspace_id = ?", [workspaceId]).map((r) => ({
      peerId: r.peer_id, 
      name: r.name, 
      occupation: r.occupation,
      interests: JSON.parse(r.interests || "[]"), 
      traits: JSON.parse(r.traits || "[]"),
      goals: JSON.parse(r.goals || "[]"), 
      updatedAt: r.updated_at,
    }));
    return { version: "1.0.0", exportedAt: Date.now(), workspace, peers, conclusions, summaries, observations, peerCards };
  }

  importAll(workspaceId: string, data: ExportData, merge: boolean = true): void {
    if (!merge) {
      ["conclusions", "summaries", "observations", "peer_cards"].forEach((t) => this.run(`DELETE FROM ${t} WHERE workspace_id = ?`, [workspaceId]));
    }
    data.peerCards?.forEach((c) => this.savePeerCard(workspaceId, c));
    data.conclusions?.forEach((c) => this.saveConclusion(workspaceId, c));
    data.summaries?.forEach((s) => this.saveSummary(workspaceId, s));
    data.observations?.forEach((o) => this.saveObservation(o));
  }

  // Dream metadata
  getDreamMetadata(workspaceId: string): { lastDreamedAt: number; dreamCount: number; lastDreamMessages: number; lastDreamConclusions: number } {
    const row = this.getOne("SELECT * FROM dream_metadata WHERE workspace_id = ?", [workspaceId]);
    if (!row) {
      return { lastDreamedAt: 0, dreamCount: 0, lastDreamMessages: 0, lastDreamConclusions: 0 };
    }
    return {
      lastDreamedAt: row.last_dreamed_at as number,
      dreamCount: row.dream_count as number,
      lastDreamMessages: row.last_dream_messages as number,
      lastDreamConclusions: row.last_dream_conclusions as number,
    };
  }

  updateDreamMetadata(workspaceId: string, messageCount: number, conclusionCount: number): void {
    this.run(
      `INSERT INTO dream_metadata (workspace_id, last_dreamed_at, dream_count, last_dream_messages, last_dream_conclusions) 
       VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET 
         last_dreamed_at = excluded.last_dreamed_at,
         dream_count = dream_count + 1,
         last_dream_messages = excluded.last_dream_messages,
         last_dream_conclusions = excluded.last_dream_conclusions`,
      [workspaceId, Date.now(), messageCount, conclusionCount]
    );
  }

  // Helpers
  getOrCreateWorkspace(id: string, name = "Default Workspace"): Workspace {
    let ws = this.getWorkspace(id);
    if (!ws) { ws = { id, name, createdAt: Date.now(), config: { reasoningEnabled: true, tokenBatchSize: 1000 } }; this.saveWorkspace(ws); }
    return ws;
  }

  // Ensure global workspace exists (called on init)
  ensureGlobalWorkspace(): Workspace {
    return this.getOrCreateWorkspace(GLOBAL_WORKSPACE_ID, "Global (Cross-Project)");
  }

  // Ensure global peer exists for a user
  ensureGlobalPeer(peerId: string, name: string): Peer {
    // First ensure the global workspace exists
    this.ensureGlobalWorkspace();
    return this.getOrCreatePeer(GLOBAL_WORKSPACE_ID, peerId, name, "user");
  }

  getOrCreatePeer(workspaceId: string, id: string, name: string, type: Peer["type"] = "user"): Peer {
    let peer = this.getPeer(workspaceId, id);
    if (!peer) { peer = { id, name, type, createdAt: Date.now(), metadata: {} }; this.savePeer(workspaceId, peer); }
    return peer;
  }

  getOrCreateSession(workspaceId: string, id: string, peerIds: string[] = []): Session {
    let session = this.getSession(workspaceId, id);
    if (!session) { session = { id, workspaceId, peerIds, messageCount: 0, createdAt: Date.now(), updatedAt: Date.now(), config: { observeMe: true, observeOthers: true }, tags: [] }; this.saveSession(workspaceId, session); }
    return session;
  }

  close(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveToDisk();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
