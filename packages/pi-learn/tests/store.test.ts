import { describe, it, expect, beforeEach, afterEach } from "vitest";
import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import path from "path";
import os from "os";
import fs from "fs";

// Import store class - we'll test it directly
import {
  generateId,
  type Peer,
  type Session,
  type Conclusion,
  type Summary,
  type PeerCard,
  type Workspace,
  type PeerRepresentation,
} from "../src/shared";

// Simple in-memory store for testing without the full extension
class TestStore {
  private db: SqlJsDatabase | null = null;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    const SQL = await initSqlJs();
    
    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }
    this.initTables();
  }

  private initTables(): void {
    if (!this.db) return;
    this.db.exec(`
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
        PRIMARY KEY (id, workspace_id)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        peer_ids TEXT NOT NULL DEFAULT '[]',
        message_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (id, workspace_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
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
        embedding TEXT
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
        embedding TEXT
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
        PRIMARY KEY (peer_id, workspace_id)
      );
    `);
  }

  private run(sql: string, params: any[] = []): void {
    if (!this.db) return;
    this.db.run(sql, params);
  }

  private getOne(sql: string, params: any[] = []): any {
    if (!this.db) return null;
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
    if (!this.db) return [];
    const results: any[] = [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  // Workspace operations
  saveWorkspace(workspace: Workspace): void {
    this.run(
      `INSERT OR REPLACE INTO workspaces (id, name, created_at, config) VALUES (?, ?, ?, ?)`,
      [workspace.id, workspace.name, workspace.createdAt, JSON.stringify(workspace.config)]
    );
  }

  getWorkspace(id: string): Workspace | null {
    const row = this.getOne("SELECT * FROM workspaces WHERE id = ?", [id]);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      config: JSON.parse(row.config || "{}"),
    };
  }

  // Peer operations
  savePeer(workspaceId: string, peer: Peer): void {
    this.run(
      `INSERT OR REPLACE INTO peers (id, workspace_id, name, type, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)`,
      [peer.id, workspaceId, peer.name, peer.type, peer.createdAt, JSON.stringify(peer.metadata)]
    );
  }

  getPeer(workspaceId: string, peerId: string): Peer | null {
    const row = this.getOne(
      "SELECT * FROM peers WHERE id = ? AND workspace_id = ?",
      [peerId, workspaceId]
    );
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || "{}"),
    };
  }

  getAllPeers(workspaceId: string): Peer[] {
    const rows = this.getAll(
      "SELECT * FROM peers WHERE workspace_id = ?",
      [workspaceId]
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata || "{}"),
    }));
  }

  // Session operations
  saveSession(workspaceId: string, session: Session): void {
    this.run(
      `INSERT OR REPLACE INTO sessions (id, workspace_id, peer_ids, message_count, created_at, updated_at, config) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        workspaceId,
        JSON.stringify(session.peerIds),
        session.messageCount,
        session.createdAt,
        session.updatedAt,
        JSON.stringify(session.config)
      ]
    );
  }

  getSession(workspaceId: string, sessionId: string): Session | null {
    const row = this.getOne(
      "SELECT * FROM sessions WHERE id = ? AND workspace_id = ?",
      [sessionId, workspaceId]
    );
    if (!row) return null;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      peerIds: JSON.parse(row.peer_ids || "[]"),
      messageCount: row.message_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      config: JSON.parse(row.config || "{}"),
    };
  }

  // Conclusion operations
  saveConclusion(workspaceId: string, conclusion: Conclusion): void {
    this.run(
      `INSERT INTO conclusions (id, peer_id, workspace_id, type, content, premises, confidence, created_at, source_session_id, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conclusion.id,
        conclusion.peerId,
        workspaceId,
        conclusion.type,
        conclusion.content,
        JSON.stringify(conclusion.premises),
        conclusion.confidence,
        conclusion.createdAt,
        conclusion.sourceSessionId,
        conclusion.embedding ? JSON.stringify(conclusion.embedding) : null
      ]
    );
  }

  getConclusions(workspaceId: string, peerId: string): Conclusion[] {
    const rows = this.getAll(
      `SELECT * FROM conclusions WHERE peer_id = ? AND workspace_id = ? ORDER BY created_at DESC`,
      [peerId, workspaceId]
    );
    return rows.map((row) => ({
      id: row.id,
      peerId: row.peer_id,
      type: row.type,
      content: row.content,
      premises: JSON.parse(row.premises || "[]"),
      confidence: row.confidence,
      createdAt: row.created_at,
      sourceSessionId: row.source_session_id,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
    }));
  }

  // Summary operations
  saveSummary(workspaceId: string, summary: Summary): void {
    this.run(
      `INSERT INTO summaries (id, session_id, peer_id, workspace_id, type, content, message_count, created_at, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        summary.id,
        summary.sessionId,
        summary.peerId,
        workspaceId,
        summary.type,
        summary.content,
        summary.messageCount,
        summary.createdAt,
        summary.embedding ? JSON.stringify(summary.embedding) : null
      ]
    );
  }

  getSummaries(workspaceId: string, peerId: string): Summary[] {
    const rows = this.getAll(
      `SELECT * FROM summaries WHERE peer_id = ? AND workspace_id = ? ORDER BY created_at DESC`,
      [peerId, workspaceId]
    );
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      peerId: row.peer_id,
      type: row.type,
      content: row.content,
      messageCount: row.message_count,
      createdAt: row.created_at,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
    }));
  }

  // Peer card operations
  savePeerCard(workspaceId: string, card: PeerCard): void {
    this.run(
      `INSERT OR REPLACE INTO peer_cards (peer_id, workspace_id, name, occupation, interests, traits, goals, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        card.peerId,
        workspaceId,
        card.name || null,
        card.occupation || null,
        JSON.stringify(card.interests),
        JSON.stringify(card.traits),
        JSON.stringify(card.goals),
        card.updatedAt
      ]
    );
  }

  getPeerCard(workspaceId: string, peerId: string): PeerCard | null {
    const row = this.getOne(
      "SELECT * FROM peer_cards WHERE peer_id = ? AND workspace_id = ?",
      [peerId, workspaceId]
    );
    if (!row) return null;
    return {
      peerId: row.peer_id,
      name: row.name,
      occupation: row.occupation,
      interests: JSON.parse(row.interests || "[]"),
      traits: JSON.parse(row.traits || "[]"),
      goals: JSON.parse(row.goals || "[]"),
      updatedAt: row.updated_at,
    };
  }

  // Get full representation
  getRepresentation(workspaceId: string, peerId: string): PeerRepresentation | null {
    const conclusions = this.getConclusions(workspaceId, peerId);
    const summaries = this.getSummaries(workspaceId, peerId);
    const peerCard = this.getPeerCard(workspaceId, peerId);
    const lastConclusion = conclusions[0];
    return {
      peerId,
      conclusions,
      summaries,
      peerCard,
      lastReasonedAt: lastConclusion?.createdAt || 0,
    };
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

describe("TestStore", () => {
  let store: TestStore;
  let dbPath: string;
  const workspaceId = "test-workspace";
  const peerId = "test-peer";
  const sessionId = "test-session";

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `pi-learn-test-${Date.now()}.db`);
    store = new TestStore(dbPath);
    await store.init();
  });

  afterEach(() => {
    store.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {}
  });

  describe("Workspace operations", () => {
    it("should save and retrieve workspace", () => {
      const workspace: Workspace = {
        id: workspaceId,
        name: "Test Workspace",
        createdAt: Date.now(),
        config: { reasoningEnabled: true },
      };
      store.saveWorkspace(workspace);
      const retrieved = store.getWorkspace(workspaceId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe("Test Workspace");
      expect(retrieved?.config.reasoningEnabled).toBe(true);
    });

    it("should return null for non-existent workspace", () => {
      const retrieved = store.getWorkspace("non-existent");
      expect(retrieved).toBeNull();
    });
  });

  describe("Peer operations", () => {
    it("should save and retrieve peer", () => {
      const peer: Peer = {
        id: peerId,
        name: "Test User",
        type: "user",
        createdAt: Date.now(),
        metadata: {},
      };
      store.savePeer(workspaceId, peer);
      const retrieved = store.getPeer(workspaceId, peerId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe("Test User");
      expect(retrieved?.type).toBe("user");
    });

    it("should get all peers in workspace", () => {
      const peer1: Peer = { id: "peer1", name: "User 1", type: "user", createdAt: Date.now(), metadata: {} };
      const peer2: Peer = { id: "peer2", name: "Agent", type: "agent", createdAt: Date.now(), metadata: {} };
      store.savePeer(workspaceId, peer1);
      store.savePeer(workspaceId, peer2);
      const peers = store.getAllPeers(workspaceId);
      expect(peers).toHaveLength(2);
    });
  });

  describe("Session operations", () => {
    it("should save and retrieve session", () => {
      const session: Session = {
        id: sessionId,
        workspaceId,
        peerIds: ["user", "agent"],
        messageCount: 5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        config: {},
      };
      store.saveSession(workspaceId, session);
      const retrieved = store.getSession(workspaceId, sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.peerIds).toEqual(["user", "agent"]);
      expect(retrieved?.messageCount).toBe(5);
    });
  });

  describe("Conclusion operations", () => {
    it("should save and retrieve conclusions", () => {
      const conclusion: Conclusion = {
        id: generateId("test_"),
        peerId,
        type: "deductive",
        content: "Test conclusion",
        premises: ["premise 1", "premise 2"],
        confidence: 0.9,
        createdAt: Date.now(),
        sourceSessionId: sessionId,
      };
      store.saveConclusion(workspaceId, conclusion);
      const conclusions = store.getConclusions(workspaceId, peerId);
      expect(conclusions).toHaveLength(1);
      expect(conclusions[0].content).toBe("Test conclusion");
      expect(conclusions[0].type).toBe("deductive");
      expect(conclusions[0].confidence).toBe(0.9);
    });

    it("should store multiple conclusions", () => {
      for (let i = 0; i < 3; i++) {
        const conclusion: Conclusion = {
          id: generateId("test_"),
          peerId,
          type: "inductive",
          content: `Conclusion ${i}`,
          premises: [],
          confidence: 0.7,
          createdAt: Date.now() + i,
          sourceSessionId: sessionId,
        };
        store.saveConclusion(workspaceId, conclusion);
      }
      const conclusions = store.getConclusions(workspaceId, peerId);
      expect(conclusions).toHaveLength(3);
      // Should be ordered by created_at DESC
      expect(conclusions[0].content).toBe("Conclusion 2");
    });
  });

  describe("Summary operations", () => {
    it("should save and retrieve summaries", () => {
      const summary: Summary = {
        id: generateId("sum_"),
        sessionId,
        peerId,
        type: "short",
        content: "Test summary content",
        messageCount: 10,
        createdAt: Date.now(),
      };
      store.saveSummary(workspaceId, summary);
      const summaries = store.getSummaries(workspaceId, peerId);
      expect(summaries).toHaveLength(1);
      expect(summaries[0].content).toBe("Test summary content");
      expect(summaries[0].type).toBe("short");
    });
  });

  describe("Peer card operations", () => {
    it("should save and retrieve peer card", () => {
      const card: PeerCard = {
        peerId,
        name: "John Doe",
        occupation: "Software Engineer",
        interests: ["coding", "music"],
        traits: ["analytical", "creative"],
        goals: ["build great software"],
        updatedAt: Date.now(),
      };
      store.savePeerCard(workspaceId, card);
      const retrieved = store.getPeerCard(workspaceId, peerId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe("John Doe");
      expect(retrieved?.occupation).toBe("Software Engineer");
      expect(retrieved?.interests).toEqual(["coding", "music"]);
    });

    it("should return null for non-existent peer card", () => {
      const retrieved = store.getPeerCard(workspaceId, "non-existent");
      expect(retrieved).toBeNull();
    });
  });

  describe("Representation", () => {
    it("should get full peer representation", () => {
      // Add conclusion
      const conclusion: Conclusion = {
        id: generateId("test_"),
        peerId,
        type: "deductive",
        content: "Test conclusion",
        premises: [],
        confidence: 0.9,
        createdAt: Date.now(),
        sourceSessionId: sessionId,
      };
      store.saveConclusion(workspaceId, conclusion);

      // Add summary
      const summary: Summary = {
        id: generateId("sum_"),
        sessionId,
        peerId,
        type: "short",
        content: "Test summary",
        messageCount: 10,
        createdAt: Date.now(),
      };
      store.saveSummary(workspaceId, summary);

      // Add peer card
      const card: PeerCard = {
        peerId,
        name: "John",
        interests: [],
        traits: [],
        goals: [],
        updatedAt: Date.now(),
      };
      store.savePeerCard(workspaceId, card);

      const rep = store.getRepresentation(workspaceId, peerId);
      expect(rep).not.toBeNull();
      expect(rep?.conclusions).toHaveLength(1);
      expect(rep?.summaries).toHaveLength(1);
      expect(rep?.peerCard?.name).toBe("John");
      expect(rep?.lastReasonedAt).toBeGreaterThan(0);
    });
  });
});
