---
name: git-package-sync
description: Manage bidirectional sync between the 0xKobold monorepo and individual pi-package GitHub repos. Use when pushing packages to individual repos, pulling changes back, creating repos, managing issues/PRs, or working with git worktrees for isolated development.
---

# Git Package Sync

Bidirectional sync between the 0xKobold monorepo (`packages/pi-*/`) and individual GitHub repos under `0xKobold/`, plus GitHub Issues/PR management and git worktree support.

## Architecture

```
0xKobolds Monorepo (origin)
├── packages/pi-gateway/    ←→  github.com/0xKobold/pi-gateway
├── packages/pi-learn/      ←→  github.com/0xKobold/pi-learn
├── packages/pi-ollama/     ←→  github.com/0xKobold/pi-ollama
└── ...                          (15+ packages)

Sync mechanism: git subtree split/push + subtree pull --squash
Remote convention: pkg-<name> (e.g. pkg-pi-gateway)
Worktrees: .worktrees/<package-name>/
```

## Tools

### `git_package_status`

Show sync status of all pi-packages: remote config, GitHub repo existence, and drift detection.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `package` | string | No | Specific package to check (omit for all) |
| `cwd` | string | No | Monorepo root (auto-detected if omitted) |

**When to use:** Before any sync operation, status checks, CI debugging.

### `git_package_push`

Push a package subtree from the monorepo to its individual GitHub repo. Creates the repo if it doesn't exist.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `package` | string | Yes | Package name (e.g. `pi-gateway`) |
| `branch` | string | No | Target branch (default: `main`) |
| `force` | boolean | No | Force push if diverged (default: `false`) |
| `cwd` | string | No | Monorepo root |

**When to use:** After committing changes to a package in the monorepo, to publish to the individual repo.

### `git_package_pull`

Pull changes from a package's individual GitHub repo into the monorepo via `git subtree pull`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `package` | string | Yes | Package name |
| `branch` | string | No | Source branch (default: `main`) |
| `squash` | boolean | No | Squash into single commit (default: `true`) |
| `cwd` | string | No | Monorepo root |

**When to use:** When external contributions land on an individual repo and need syncing back.

### `git_package_init`

Create a new GitHub repo for a package, add the git remote, and push initial content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `package` | string | Yes | Package name |
| `private` | boolean | No | Create as private repo (default: `false`) |
| `description` | string | No | GitHub repo description |
| `cwd` | string | No | Monorepo root |

**When to use:** When adding a new package that doesn't have its own GitHub repo yet.

### `git_issue`

List or create GitHub issues on a package's individual repo.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `package` | string | Yes | Package name |
| `action` | `"list"` \| `"create"` | No | Defaults to `list`, or `create` if title provided |
| `title` | string | No | Issue title (required for create) |
| `body` | string | No | Issue body (markdown) |
| `labels` | string[] | No | Labels to apply |

### `git_pr`

List or create pull requests on a package's individual repo.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `package` | string | Yes | Package name |
| `action` | `"list"` \| `"create"` | No | Defaults to `list`, or `create` if title provided |
| `title` | string | No | PR title (required for create) |
| `body` | string | No | PR body (markdown) |
| `head` | string | No | Head branch |
| `base` | string | No | Base branch (default: `main`) |

### `git_worktree`

Manage git worktrees for isolated package development.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `"list"` \| `"add"` \| `"remove"` | Yes | Action to perform |
| `package` | string | No | Package name (required for add/remove) |
| `branch` | string | No | Branch name (default: `<package>-work`) |

**When to use:** When you need to work on a package in isolation without dirtying the monorepo working tree.

## Common Workflows

### Check overall sync status

```
git_package_status()
```

### Push changes after local development

```
1. Commit changes in the monorepo
2. git_package_push(package="pi-gateway")
```

### Pull external contributions

```
git_package_pull(package="pi-ollama")
```

### Initialize a new package repo

```
git_package_init(package="pi-mymodule", description="New module for X")
```

### Create an issue for a bug

```
git_issue(package="pi-gateway", title="Websocket disconnect on idle", labels=["bug"])
```

### Create a PR for a feature

```
git_pr(package="pi-learn", title="Add dream cycle scheduling", body="Implements periodic...")
```

### Isolated work with worktrees

```
# Create an isolated worktree
git_worktree(action="add", package="pi-ollama")

# List all worktrees
git_worktree(action="list")

# Remove when done
git_worktree(action="remove", package="pi-ollama")
```

## Prerequisites

- **git** — Required for subtree operations
- **gh CLI** — Required for GitHub repo/issue/PR operations (`gh auth login`)
- **Monorepo structure** — Must have `packages/pi-*/` directory
- **GitHub org** — Targets `0xKobold` organization

## Conflict Resolution

If `git_package_pull` reports merge conflicts:

1. Edit conflicted files in `packages/<pkg>/`
2. `git add packages/<pkg>/`
3. `git commit -m "merge: resolve conflicts from <pkg> sync"`

If `git_package_push` is rejected (diverged histories):

1. `git_package_push(package="<pkg>", force=true)` to overwrite, **or**
2. `git_package_pull(package="<pkg>")` first, resolve locally, then push again

## CI Integration

Existing GitHub Actions workflows handle automated sync:

| Workflow | Trigger | Action |
|----------|---------|--------|
| `publish.yml` | Push to main with `packages/pi-*/**` changes | Subtree push to individual repos |
| `sync-packages.yml` | Push to main with specific package changes | Direct subtree push |
| `sync-from-individual.yml` | Hourly cron | Pull individual repo changes into monorepo |

These tools supplement CI for manual operations, one-off syncs, and GH Issues/PRs.