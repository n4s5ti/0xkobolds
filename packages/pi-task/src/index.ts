/**
 * pi-task - Kanban Task Management for Pi Agents
 *
 * Provides a 6-column Kanban board with SQLite persistence:
 *   Backlog → Needs Assignment → In Progress → Needs Review → Blocked → Done
 *
 * Tools:
 *   task_breakdown  - Break a request into subtasks
 *   task_list       - List tasks by status
 *   task_update     - Update task status or assignee
 *
 * Commands:
 *   /task            - Create a task
 *   /tasks           - Show the Kanban board
 *   /task-show <id>  - Show task details
 *   /task-move <id> <status> - Move task to a column
 *   /task-assign <id> <assignee> - Assign a task
 *   /task-comment <id> <text>   - Comment on a task
 *   /task-delete <id> - Delete a task
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import {
  initDatabase,
  createTask,
  getTask,
  listTasks,
  getBoard,
  updateTaskStatus,
  assignTask,
  addComment,
  getComments,
  deleteTask,
  TASK_COLUMNS,
  type TaskStatus,
} from "./store.js";

// ═════════════════════════════════════════════════════════════════════════════
// Simple arg parser (no external dependency)
// ═════════════════════════════════════════════════════════════════════════════

function parseArgs(args: string, defs: { name: string; required?: boolean }[]): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  const parts = args.trim().split(/\s+/);

  for (let i = 0; i < defs.length; i++) {
    if (i < parts.length) {
      if (i === defs.length - 1) {
        result[defs[i].name] = parts.slice(i).join(" ");
      } else {
        result[defs[i].name] = parts[i];
      }
    } else {
      result[defs[i].name] = undefined;
    }
  }

  return result;
}

// ═════════════════════════════════════════════════════════════════════════════
// Extension Factory
// ═════════════════════════════════════════════════════════════════════════════

let currentSessionId: string = "default";

export default async function taskExtension(pi: ExtensionAPI): Promise<void> {
  initDatabase();

  // Track session
  pi.on("session_start", async (_event, ctx) => {
    currentSessionId = ctx.sessionManager.getSessionId();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Commands
  // ═════════════════════════════════════════════════════════════════════════

  pi.registerCommand("task", {
    description: "Create a new task",
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [
        { name: "title", required: true },
        { name: "description", required: false },
      ]);
      const title = parsed.title;
      const description = parsed.description || "";

      if (!title) {
        ctx.ui?.notify?.("Usage: /task <title> [description]", "warning");
        return;
      }

      const task = createTask(title, description, { sessionId: currentSessionId }, currentSessionId);
      ctx.ui?.notify?.(
        `✅ Created task: ${task.title}\nID: ${task.id}\nStatus: ${task.status}`,
        "info"
      );
    },
  });

  pi.registerCommand("tasks", {
    description: "Show task board",
    handler: async (_args, ctx) => {
      const board = getBoard();
      const lines: string[] = ["📋 Task Board\n"];

      for (const col of TASK_COLUMNS) {
        const tasks = board[col.id];
        lines.push(`${col.emoji} ${col.label} (${tasks.length})`);

        if (tasks.length === 0) {
          lines.push("   (empty)");
        } else {
          for (const task of tasks.slice(0, 5)) {
            const assignee = task.assignee ? ` @${task.assignee}` : "";
            const priority = task.priority === "critical" ? "🔴" : task.priority === "high" ? "🟡" : "";
            lines.push(`   ${priority} ${task.title.slice(0, 40)}${assignee}`);
          }
          if (tasks.length > 5) {
            lines.push(`   ... and ${tasks.length - 5} more`);
          }
        }
        lines.push("");
      }

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("task-show", {
    description: "Show task details",
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [{ name: "id", required: true }]);
      const searchId = parsed.id;

      if (!searchId) {
        ctx.ui?.notify?.("Usage: /task-show <task-id>", "warning");
        return;
      }

      const task = getTask(searchId);
      if (!task) {
        ctx.ui?.notify?.(`Task not found: ${searchId}`, "error");
        return;
      }

      const col = TASK_COLUMNS.find(c => c.id === task!.status);
      const comments = getComments(task.id);

      let details =
        `📝 ${task.title}\n` +
        `ID: ${task.id}\n` +
        `Status: ${col?.emoji} ${col?.label}\n` +
        `Priority: ${task.priority}\n` +
        `Assignee: ${task.assignee || "unassigned"}\n` +
        `Tags: ${task.tags.join(", ") || "none"}\n` +
        `Created: ${new Date(task.createdAt).toLocaleString()}\n\n` +
        `Description:\n${task.description || "(no description)"}`;

      if (comments.length > 0) {
        details += `\n\nComments (${comments.length}):`;
        for (const comment of comments.slice(-3)) {
          const time = new Date(comment.timestamp).toLocaleTimeString();
          details += `\n  [${time}] ${comment.content.slice(0, 60)}`;
        }
      }

      ctx.ui?.notify?.(details, "info");
    },
  });

  pi.registerCommand("task-move", {
    description: "Move task to a different column",
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [
        { name: "id", required: true },
        { name: "status", required: true },
      ]);
      const id = parsed.id!;
      const status = parsed.status! as TaskStatus;
      const validStatuses: TaskStatus[] = [
        "backlog", "needs-assignment", "in-progress", "needs-review", "blocked", "done",
      ];

      if (!validStatuses.includes(status)) {
        ctx.ui?.notify?.(`Invalid status. Use: ${validStatuses.join(", ")}`, "error");
        return;
      }

      const task = getTask(id);
      if (!task) {
        ctx.ui?.notify?.(`Task not found: ${id}`, "error");
        return;
      }

      updateTaskStatus(task.id, status, undefined, currentSessionId);
      ctx.ui?.notify?.(`Moved "${task.title.slice(0, 30)}" to ${status}`, "info");
    },
  });

  pi.registerCommand("task-assign", {
    description: "Assign task to someone",
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [
        { name: "id", required: true },
        { name: "assignee", required: true },
      ]);
      const id = parsed.id!;
      const assigneeName = parsed.assignee!;

      const task = getTask(id);
      if (!task) {
        ctx.ui?.notify?.(`Task not found: ${id}`, "error");
        return;
      }

      assignTask(task.id, assigneeName, currentSessionId);
      ctx.ui?.notify?.(`Assigned "${task.title.slice(0, 30)}" to ${assigneeName}`, "info");
    },
  });

  pi.registerCommand("task-comment", {
    description: "Add comment to a task",
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [
        { name: "id", required: true },
        { name: "content", required: true },
      ]);
      const id = parsed.id!;
      const content = parsed.content!;

      const task = getTask(id);
      if (!task) {
        ctx.ui?.notify?.(`Task not found: ${id}`, "error");
        return;
      }

      addComment(task.id, content, currentSessionId);
      ctx.ui?.notify?.(`Comment added to "${task.title.slice(0, 30)}"`, "info");
    },
  });

  pi.registerCommand("task-delete", {
    description: "Delete a task",
    handler: async (args: string, ctx) => {
      const parsed = parseArgs(args, [{ name: "id", required: true }]);
      const id = parsed.id!;

      const task = getTask(id);
      if (!task) {
        ctx.ui?.notify?.(`Task not found: ${id}`, "error");
        return;
      }

      deleteTask(task.id);
      ctx.ui?.notify?.(`Deleted: ${task.title}`, "info");
    },
  });

  // ═════════════════════════════════════════════════════════════════════════
  // Tools
  // ═════════════════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "task_breakdown",
    label: "Task Breakdown",
    description: "Break down a request into kanban subtasks. Creates task records, NOT agents. Subtasks need: title (required), description, priority.",
    parameters: Type.Object({
      request: Type.String({ description: "The original request being broken down" }),
      subtasks: Type.Array(Type.Object({
        title: Type.String({ description: "Subtask title (required)" }),
        description: Type.Optional(Type.String({ description: "Detailed description" })),
        priority: Type.Optional(Type.String({ enum: ["low", "medium", "high", "critical"], description: "Priority level" })),
      })),
    }),
    async execute(_toolCallId: any, params: any, _signal: any, _onUpdate: any, _ctx: any) {
      const { request, subtasks } = params as {
        request: string;
        subtasks: Array<{ title: string; description?: string; priority?: string }>;
      };

      // Validate subtasks have title
      const invalidSubtasks = subtasks.filter((st) => {
        if (!st.title || typeof st.title !== "string" || st.title.trim() === "") {
          return true;
        }
        return false;
      });

      if (invalidSubtasks.length > 0) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ ${invalidSubtasks.length} subtask(s) missing required 'title' field.\n\n` +
              `Each subtask must have: { "title": "string", "description?": "string", "priority?": "low|medium|high|critical" }\n\n` +
              `❌ WRONG: { "task": "do something", "assignee": "worker" }\n` +
              `✅ CORRECT: { "title": "do something", "description": "...", "priority": "high" }`,
          }],
          details: { error: "missing_title" } as any,
        };
      }

      const parentTask = createTask(request, "Auto-generated from breakdown", {
        status: "in-progress",
        sessionId: currentSessionId,
      }, currentSessionId);

      const created = subtasks.map((st) =>
        createTask(st.title, st.description || "", {
          parentId: parentTask.id,
          priority: (st.priority as any) || "medium",
          sessionId: currentSessionId,
        }, currentSessionId)
      );

      return {
        content: [{
          type: "text" as const,
          text: `Created ${created.length} subtasks for: ${request}\n\n${created.map(t => `- ${t.title}`).join("\n")}`,
        }],
        details: { parentTaskId: parentTask.id, subtaskIds: created.map(t => t.id) } as any,
      };
    },
  });

  pi.registerTool({
    name: "task_list",
    label: "Task List",
    description: "List tasks by status, optionally filtered.",
    parameters: Type.Object({
      status: Type.Optional(Type.String({
        enum: ["backlog", "needs-assignment", "in-progress", "needs-review", "blocked", "done"],
        description: "Filter by status",
      })),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 20)", default: 20 })),
    }),
    async execute(_toolCallId: any, params: any, _signal: any, _onUpdate: any, _ctx: any) {
      const tasks = listTasks(
        params.status ? { status: params.status as TaskStatus, sessionId: currentSessionId } : { sessionId: currentSessionId }
      ).slice(0, params.limit || 20);

      return {
        content: [{
          type: "text" as const,
          text: tasks.length === 0
            ? "No tasks found"
            : tasks.map(t => `[${t.status}] ${t.title}`).join("\n"),
        }],
        details: { count: tasks.length } as any,
      };
    },
  });

  pi.registerTool({
    name: "task_update",
    label: "Task Update",
    description: "Update task status or assignee.",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID" }),
      status: Type.Optional(Type.String({
        enum: ["backlog", "needs-assignment", "in-progress", "needs-review", "blocked", "done"],
        description: "New status",
      })),
      assignee: Type.Optional(Type.String({ description: "Assign to someone" })),
      note: Type.Optional(Type.String({ description: "Note for status change" })),
    }),
    async execute(_toolCallId: any, params: any, _signal: any, _onUpdate: any, _ctx: any) {
      const { taskId, status, assignee, note } = params;
      const task = getTask(taskId);

      if (!task) {
        return {
          content: [{ type: "text" as const, text: `Task not found: ${taskId}` }],
          details: { error: "not_found" } as any,
        };
      }

      if (status) updateTaskStatus(taskId, status as TaskStatus, note, currentSessionId);
      if (assignee) assignTask(taskId, assignee, currentSessionId);

      return {
        content: [{ type: "text" as const, text: `Updated task: ${task.title}` }],
        details: { taskId, status: status || task.status, assignee: assignee || task.assignee } as any,
      };
    },
  });

  console.log("[pi-task] Extension loaded — Kanban task management ready");
}