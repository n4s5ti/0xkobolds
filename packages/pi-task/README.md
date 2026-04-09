# pi-task

Kanban-style task management for [pi-coding-agent](https://github.com/badlobby/pi-mono) — backlog, in-progress, review, blocked, done with SQLite persistence.

## Installation

```bash
pi install npm:@0xkobold/pi-task
```

Or as part of the meta-extension:

```bash
pi install npm:@0xkobold/pi-kobold
```

## Features

- **6-Column Kanban** — Backlog, Needs Assignment, In Progress, Needs Review, Blocked, Done
- **SQLite Persistence** — Tasks survive restarts (stored in `~/.0xkobold/tasks.db`)
- **Session-Aware** — Tasks are scoped to sessions
- **History Tracking** — All status changes are logged
- **Parent/Child Tasks** — Break down work into subtasks
- **Comments** — Add notes to any task

## Tools

| Tool | Description |
|------|-------------|
| `task_breakdown` | Break a request into kanban subtasks (creates task records, NOT agents) |
| `task_list` | List tasks, optionally filtered by status |
| `task_update` | Update task status or assignee |

## Commands

| Command | Description |
|---------|-------------|
| `/task <title> [desc]` | Create a new task |
| `/tasks` | Show the kanban board |
| `/task-show <id>` | Show task details |
| `/task-move <id> <status>` | Move task to a column |
| `/task-assign <id> <assignee>` | Assign a task |
| `/task-comment <id> <text>` | Comment on a task |
| `/task-delete <id>` | Delete a task |

## Kanban Columns

| Column | Emoji | Description |
|--------|-------|-------------|
| Backlog | 📋 | Ideas and future work |
| Needs Assignment | 👤 | Ready to start, unassigned |
| In Progress | 🏗️ | Actively being worked on |
| Needs Review | 👀 | Completed, awaiting review |
| Blocked | 🚫 | Stalled, needs intervention |
| Done | ✅ | Completed and verified |

## Parameters

### task_breakdown

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `request` | string | ✅ | The original request being broken down |
| `subtasks` | array | ✅ | Array of `{ title, description?, priority? }` |

### task_list

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | all | Filter by status |
| `limit` | number | 20 | Max results |

### task_update

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `taskId` | string | ✅ | Task ID |
| `status` | string | ❌ | New status |
| `assignee` | string | ❌ | Assign to someone |
| `note` | string | ❌ | Note for status change |

## Architecture

```
┌─────────────────────────────────────┐
│           pi-task                    │
├─────────────┬───────────────────────┤
│  Extension  │  Store (./store.js)   │
│  (index.ts) │  - SQLite CRUD        │
│  - Tools    │  - History tracking    │
│  - Commands │  - Session scoping    │
└─────────────┴───────────────────────┘
         │                    │
         └─── bun:sqlite ───┘
              ~/.0xkobold/tasks.db
```

The `./store` export path gives direct access to the data layer for programmatic use:

```typescript
import { createTask, listTasks, getBoard } from "@0xkobold/pi-task/store";

const task = createTask("Build feature X", "Detailed description");
const board = getBoard();
```

## Development

```bash
cd packages/pi-task
bun install
bun run build
bun test
```