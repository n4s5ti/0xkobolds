/**
 * pi-task - Task Store (SQLite-backed Kanban)
 *
 * Pure data layer. No framework dependencies.
 * Uses bun:sqlite for persistence.
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";

// ═════════════════════════════════════════════════════════════════════════════
// Types
// ═════════════════════════════════════════════════════════════════════════════

export type TaskStatus =
  | "backlog"
  | "needs-assignment"
  | "in-progress"
  | "needs-review"
  | "blocked"
  | "done";

export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee?: string;
  sessionId: string;
  parentId?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  metadata: Record<string, unknown>;
}

export interface TaskComment {
  id: string;
  taskId: string;
  author: string;
  content: string;
  timestamp: number;
}

export interface TaskHistoryEntry {
  id: string;
  taskId: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string;
  timestamp: number;
  note: string;
}

export const TASK_COLUMNS: { id: TaskStatus; label: string; emoji: string }[] = [
  { id: "backlog", label: "Backlog", emoji: "📋" },
  { id: "needs-assignment", label: "Needs Assignment", emoji: "👤" },
  { id: "in-progress", label: "In Progress", emoji: "🏗️" },
  { id: "needs-review", label: "Needs Review", emoji: "👀" },
  { id: "blocked", label: "Blocked", emoji: "🚫" },
  { id: "done", label: "Done", emoji: "✅" },
];

// ═════════════════════════════════════════════════════════════════════════════
// Database
// ═════════════════════════════════════════════════════════════════════════════

const DEFAULT_DB_DIR = join(homedir(), ".0xkobold");
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, "tasks.db");

let db: Database | null = null;

/**
 * Initialize (or get) the task database.
 * Call with custom path for testing, or omit for default.
 */
export function initDatabase(dbPath?: string): Database {
  if (db) return db;

  const path = dbPath || DEFAULT_DB_PATH;
  const dir = join(path, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(path);
  db.run("PRAGMA journal_mode = WAL;");

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT NOT NULL DEFAULT 'medium',
      assignee TEXT,
      session_id TEXT NOT NULL,
      parent_id TEXT,
      tags TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      metadata TEXT,
      FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS task_history (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by TEXT,
      timestamp INTEGER NOT NULL,
      note TEXT,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee)`);

  return db;
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════════

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee,
    sessionId: row.session_id,
    parentId: row.parent_id,
    tags: JSON.parse(String(row.tags || "[]")),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    metadata: JSON.parse(String(row.metadata || "{}")),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CRUD Operations
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Create a new task.
 */
export function createTask(
  title: string,
  description: string = "",
  options: Partial<Pick<Task, "status" | "priority" | "assignee" | "sessionId" | "parentId" | "tags" | "metadata">> = {},
  sessionId: string = "default"
): Task {
  const database = initDatabase();
  const id = generateTaskId();
  const now = Date.now();

  const task: Task = {
    id,
    title,
    description,
    status: options.status || "backlog",
    priority: options.priority || "medium",
    assignee: options.assignee,
    sessionId: options.sessionId || sessionId,
    parentId: options.parentId,
    tags: options.tags || [],
    createdAt: now,
    updatedAt: now,
    metadata: options.metadata || {},
  };

  database.run(
    `INSERT INTO tasks (id, title, description, status, priority, assignee, session_id, parent_id, tags, created_at, updated_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [task.id, task.title, task.description, task.status, task.priority,
     task.assignee || null, task.sessionId || null, task.parentId || null,
     JSON.stringify(task.tags), task.createdAt, task.updatedAt,
     JSON.stringify(task.metadata)]
  );

  database.run(
    `INSERT INTO task_history (id, task_id, from_status, to_status, changed_by, timestamp, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [`hist-${Date.now()}`, task.id, null, task.status, sessionId, now, "Task created"]
  );

  return task;
}

/**
 * Get a task by ID (exact match or prefix).
 */
export function getTask(id: string): Task | null {
  const database = initDatabase();

  const row = database.query("SELECT * FROM tasks WHERE id = ?").get(id) as any;
  if (row) return rowToTask(row);

  // Prefix match
  const prefixRows = database.query("SELECT * FROM tasks WHERE id LIKE ? LIMIT 5").all(`${id}%`) as any[];
  if (prefixRows.length === 1) return rowToTask(prefixRows[0]);

  return null;
}

/**
 * Update task status. Records history.
 */
export function updateTaskStatus(id: string, newStatus: TaskStatus, note?: string, changedBy: string = "default"): boolean {
  const database = initDatabase();
  const task = getTask(id);
  if (!task) return false;

  const oldStatus = task.status;
  const now = Date.now();

  database.run(
    `UPDATE tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?`,
    [newStatus, now, newStatus === "done" ? now : task.completedAt || null, id]
  );

  database.run(
    `INSERT INTO task_history (id, task_id, from_status, to_status, changed_by, timestamp, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [`hist-${Date.now()}`, id, oldStatus, newStatus, changedBy, now, note || `Moved from ${oldStatus} to ${newStatus}`]
  );

  return true;
}

/**
 * Assign a task. Moves to in-progress if in backlog/needs-assignment.
 */
export function assignTask(id: string, assignee: string, changedBy: string = "default"): boolean {
  const database = initDatabase();
  const task = getTask(id);
  if (!task) return false;

  database.run(
    `UPDATE tasks SET assignee = ?, updated_at = ? WHERE id = ?`,
    [assignee, Date.now(), id]
  );

  if (task.status === "backlog" || task.status === "needs-assignment") {
    updateTaskStatus(id, "in-progress", `Assigned to ${assignee}`, changedBy);
  }

  return true;
}

/**
 * Add a comment to a task.
 */
export function addComment(taskId: string, content: string, author: string = "default"): boolean {
  const database = initDatabase();
  database.run(
    `INSERT INTO task_comments (id, task_id, author, content, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [`comment-${Date.now()}`, taskId, author, content, Date.now()]
  );
  return true;
}

/**
 * Get comments for a task.
 */
export function getComments(taskId: string): TaskComment[] {
  const database = initDatabase();
  const rows = database.query("SELECT * FROM task_comments WHERE task_id = ? ORDER BY timestamp").all(taskId) as any[];
  return rows.map(row => ({
    id: row.id,
    taskId: row.task_id,
    author: row.author,
    content: row.content,
    timestamp: row.timestamp,
  }));
}

/**
 * List tasks with optional filters.
 */
export function listTasks(filter?: {
  status?: TaskStatus;
  sessionId?: string;
  assignee?: string;
}): Task[] {
  const database = initDatabase();
  let query = "SELECT * FROM tasks WHERE 1=1";
  const params: (string | number)[] = [];

  if (filter?.status) {
    query += " AND status = ?";
    params.push(filter.status);
  }
  if (filter?.sessionId) {
    query += " AND session_id = ?";
    params.push(filter.sessionId);
  }
  if (filter?.assignee) {
    query += " AND assignee = ?";
    params.push(filter.assignee);
  }

  query += " ORDER BY priority DESC, updated_at DESC";

  const rows = database.query(query).all(...params) as any[];
  return rows.map(rowToTask);
}

/**
 * Get full kanban board.
 */
export function getBoard(): Record<TaskStatus, Task[]> {
  const board: Record<TaskStatus, Task[]> = {
    backlog: [],
    "needs-assignment": [],
    "in-progress": [],
    "needs-review": [],
    blocked: [],
    done: [],
  };

  for (const task of listTasks()) {
    board[task.status].push(task);
  }
  return board;
}

/**
 * Delete a task.
 */
export function deleteTask(id: string): boolean {
  const database = initDatabase();
  database.run("DELETE FROM tasks WHERE id = ?", [id]);
  return true;
}

/**
 * Get task history.
 */
export function getTaskHistory(taskId: string): TaskHistoryEntry[] {
  const database = initDatabase();
  const rows = database.query("SELECT * FROM task_history WHERE task_id = ? ORDER BY timestamp").all(taskId) as any[];
  return rows.map(row => ({
    id: row.id,
    taskId: row.task_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedBy: row.changed_by,
    timestamp: row.timestamp,
    note: row.note,
  }));
}