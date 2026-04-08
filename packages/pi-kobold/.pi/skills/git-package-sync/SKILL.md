---
name: git-package-sync
description: Generic git↔GitHub sync tools. Push/pull subdirectories (subtree) or standalone repos, manage issues/PRs, and work with git worktrees. Works for any org, any directory structure.
---

# Git Sync Tools

Generic git↔GitHub sync tools that work for **any project**, not just a specific monorepo or org.

## Two Modes

| Mode | Use Case | How It Works |
|------|----------|--------------|
| **subtree** | Monorepo with subdirectories syncing to individual repos | `git subtree push/pull` |
| **standalone** | Single repo pushing to GitHub | Plain `git push/pull` |

Mode is auto-detected: if a `prefix` (like `packages/`) exists, subtree mode is used. For a single git repo, standalone mode applies.

## Configuration

### Auto-detection (zero config)

The tools infer settings from your repo:

| Setting | Source |
|---------|--------|
| `org` | GitHub org from `git remote -v` |
| `prefix` | Defaults to `packages` |
| `pattern` | Defaults to `*` (all subdirs) |
| `defaultBranch` | Defaults to `main` |
| `mode` | `subtree` if `prefix/` exists, else `standalone` |

### Config file (`.git-sync.json`)

Place in the repo root for persistent settings:

```json
{
  "org": "my-org",
  "prefix": "libs",
  "pattern": "lib-*",
  "defaultBranch": "main",
  "visibility": "public",
  "mode": "subtree",
  "remotePrefix": "pkg-"
}
```

### Tool parameters (override everything)

All tools accept `org`, `prefix`, `pattern`, `mode` params that override auto-detection and config file.

## Tools

### `git_package_status`

Show sync status of subdirectories (subtree) or the current repo (standalone).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | No | Specific subdirectory to check |
| `org` | string | No | GitHub org/user (auto-detected) |
| `prefix` | string | No | Subdirectory prefix, e.g. `packages` (default: `packages`) |
| `pattern` | string | No | Glob for subdirs, e.g. `lib-*` (default: `*`) |
| `mode` | `"subtree"` \| `"standalone"` | No | Override auto-detection |

### `git_package_push`

Push a subdirectory or standalone repo to GitHub. Creates the repo if it doesn't exist.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Subtree mode | Subdirectory name to push |
| `branch` | string | No | Target branch (default: `main`) |
| `force` | boolean | No | Force push if diverged |
| `remote` | string | No | Remote name for standalone (default: `origin`) |
| `org` | string | No | GitHub org/user |
| `prefix` | string | No | Subdirectory prefix |
| `mode` | `"subtree"` \| `"standalone"` | No | Override mode |

### `git_package_pull`

Pull from GitHub into a subdirectory or standalone repo.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Subtree mode | Subdirectory name to pull |
| `branch` | string | No | Source branch (default: `main`) |
| `squash` | boolean | No | Squash subtree pull (default: `true`) |
| `remote` | string | No | Remote name for standalone (default: `origin`) |

### `git_package_init`

Create a new GitHub repo, add remote, push initial content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Subtree mode | Project name (defaults to directory name in standalone) |
| `private` | boolean | No | Create as private (default: from config or `public`) |
| `description` | string | No | Repo description |

### `git_issue`

List or create issues on any GitHub repo.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | Yes | Repository name (e.g. `my-app`) |
| `action` | `"list"` \| `"create"` | No | Default: `list`, or `create` if title provided |
| `title` | string | No | Issue title (required for create) |
| `body` | string | No | Issue body |
| `labels` | string[] | No | Labels to apply |
| `org` | string | No | GitHub org (auto-detected) |

### `git_pr`

List or create PRs on any GitHub repo.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `repo` | string | Yes | Repository name |
| `action` | `"list"` \| `"create"` | No | Default: `list`, or `create` if title provided |
| `title` | string | No | PR title (required for create) |
| `body` | string | No | PR body |
| `head` | string | No | Head branch |
| `base` | string | No | Base branch (default: `main`) |
| `org` | string | No | GitHub org (auto-detected) |

### `git_worktree`

Manage git worktrees for isolated development.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `"list"` \| `"add"` \| `"remove"` | Yes | Action |
| `name` | string | add/remove | Worktree name |
| `branch` | string | No | Branch name (default: `<name>-work`) |

## Common Workflows

### Standalone project → GitHub

```
# Initialize and push
git_package_init(name="my-app", org="my-org")
```

### Monorepo with packages

```
# Check all packages
git_package_status(org="my-team", prefix="packages", pattern="lib-*")

# Push a specific package
git_package_push(name="lib-core", org="my-team", prefix="packages")

# Pull changes back
git_package_pull(name="lib-core", org="my-team")
```

### Issues & PRs on any repo

```
git_issue(repo="my-app", org="my-org", title="Bug: login fails")
git_pr(repo="my-app", org="my-org", title="Fix login validation")
```

### With a config file

Create `.git-sync.json` in repo root:

```json
{
  "org": "my-org",
  "prefix": "packages",
  "pattern": "lib-*",
  "defaultBranch": "main"
}
```

Then call tools without repeating params:

```
git_package_status()           // Uses config defaults
git_package_push(name="lib-core")  // org/prefix from config
```

## Conflict Resolution

**Pull conflicts:**
1. Edit conflicted files
2. `git add <path>`
3. `git commit -m "merge: resolve conflicts"`

**Push rejected (diverged):**
1. `git_package_push(name="...", force=true)` to overwrite, **or**
2. `git_package_pull(name="...")` first, resolve, then push

## Prerequisites

- **git** — Required for all operations
- **gh CLI** — Required for GitHub repo/issue/PR operations (`gh auth login`)
- **GitHub** — Targets any org/user on github.com