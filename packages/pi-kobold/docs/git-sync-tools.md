# Tool Reference

Complete parameter reference for all 7 git sync tools.

---

## `git_package_status`

Show sync status of subdirectories (subtree mode) or the current repo (standalone mode).

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | No | Specific subdirectory to check (omit for all) |
| `org` | string | No | GitHub org/user (auto-detected from git remotes) |
| `prefix` | string | No | Monorepo subdirectory prefix (default: `packages`) |
| `pattern` | string | No | Glob for subdirectories (default: `*`) |
| `mode` | `"subtree"` \| `"standalone"` | No | Override auto-detected mode |
| `cwd` | string | No | Project root directory (auto-detected) |

### Output Examples

**Subtree mode:**

```
## 📦 Package Sync Status

**Org:** `my-team` • **Prefix:** `packages` • **Pattern:** `lib-*`

| Name      | Package          | Remote | GitHub | Sync          |
|-----------|------------------|--------|--------|---------------|
| lib-core  | @team/lib-core   | ✅     | ✅     | ✅ synced     |
| lib-utils | @team/lib-utils  | ✅     | ✅     | ⬇️ behind by 3|
| lib-new   | lib-new          | —      | ❌     | ❌ no repo    |

**3 packages** • Root: `/home/user/monorepo` • Org: `my-team`
```

**Standalone mode:**

```
## 📦 Git Status (standalone)

| Property | Value |
|----------|-------|
| Root     | `/home/user/my-app` |
| Branch   | `main` |
| Remote   | `https://github.com/my-team/my-app.git` |
| GitHub   | ✅ |
| Ahead    | 2 commits |
| Behind   | 0 commits |
```

---

## `git_package_push`

Push a subdirectory (subtree mode) or the current repo (standalone mode) to GitHub.

Creates the GitHub repo if it doesn't exist (subtree mode only).

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Subtree | Subdirectory name to push (e.g. `lib-core`) |
| `branch` | string | No | Target branch (default: `main`) |
| `force` | boolean | No | Force push even if diverged (default: `false`) |
| `remote` | string | No | Remote name for standalone mode (default: `origin`) |
| `org` | string | No | GitHub org/user |
| `prefix` | string | No | Subdirectory prefix |
| `pattern` | string | No | Subdirectory glob pattern |
| `mode` | `"subtree"` \| `"standalone"` | No | Override mode |
| `cwd` | string | No | Project root directory |

### Behavior by Mode

**Subtree:**
1. If GitHub repo doesn't exist → create it
2. Ensure git remote is configured (`pkg-{name}`)
3. Run `git subtree push --prefix={prefix}/{name} {remote} {branch}`

**Standalone:**
1. Run `git push {remote} {branch}`

### Error Handling

- If push is rejected (diverged): suggests `force: true` or pull first
- If repo creation fails: returns the `gh` CLI error
- If remote setup fails: returns diagnostic info

---

## `git_package_pull`

Pull changes from GitHub into a subdirectory (subtree mode) or the current repo (standalone mode).

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Subtree | Subdirectory name to pull |
| `branch` | string | No | Source branch (default: `main`) |
| `squash` | boolean | No | Squash subtree pull (default: `true`, subtree only) |
| `remote` | string | No | Remote name for standalone mode (default: `origin`) |
| `org` | string | No | GitHub org/user |
| `prefix` | string | No | Subdirectory prefix |
| `mode` | `"subtree"` \| `"standalone"` | No | Override mode |
| `cwd` | string | No | Project root directory |

### Conflict Resolution

When a pull produces merge conflicts, the tool returns instructions:

```
⚠️ Merge conflicts pulling `lib-core`:
```
CONFLICT (content): Merge conflict in src/index.ts
```

Resolve in `packages/lib-core/`, then:
```bash
git add packages/lib-core/
git commit -m "merge: resolve conflicts from lib-core sync"
```
```

---

## `git_package_init`

Create a new GitHub repo for a subdirectory (subtree mode) or standalone project.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Subtree | Project name (defaults to directory name in standalone) |
| `private` | boolean | No | Create as private repo (default: from config or `public`) |
| `description` | string | No | Repo description on GitHub |
| `org` | string | No | GitHub org/user |
| `prefix` | string | No | Subdirectory prefix |
| `mode` | `"subtree"` \| `"standalone"` | No | Override mode |
| `cwd` | string | No | Project root directory |

### Behavior by Mode

**Subtree:**
1. Create GitHub repo via `gh repo create`
2. Add git remote (`pkg-{name}`)
3. Run `git subtree push --prefix={prefix}/{name} {remote} main`

**Standalone:**
1. `git init` if not already a git repo
2. Create GitHub repo via `gh repo create`
3. Add `origin` remote
4. `git push -u origin main`

---

## `git_issue`

List or create GitHub issues on any repo.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `repo` | string | **Yes** | Repository name (e.g. `my-app`, `lib-core`) |
| `action` | `"list"` \| `"create"` | No | Default: `list`, or `create` if `title` is provided |
| `title` | string | Create | Issue title |
| `body` | string | No | Issue body (markdown) |
| `labels` | string[] | No | Labels to apply |
| `org` | string | No | GitHub org/user (auto-detected) |

### Examples

```
# List issues
git_issue(repo="my-app", org="my-team")

# Create an issue
git_issue(repo="my-app", title="Login fails on Safari", labels=["bug"])

# Create with body
git_issue(repo="lib-core", title="Add caching", body="Implement LRU cache for hot paths", labels=["enhancement"])
```

---

## `git_pr`

List or create pull requests on any GitHub repo.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `repo` | string | **Yes** | Repository name |
| `action` | `"list"` \| `"create"` | No | Default: `list`, or `create` if `title` is provided |
| `title` | string | Create | PR title |
| `body` | string | No | PR body (markdown) |
| `head` | string | No | Head branch for the PR |
| `base` | string | No | Base branch (default: `main`) |
| `org` | string | No | GitHub org/user (auto-detected) |

### Examples

```
# List PRs
git_pr(repo="my-app", org="my-team")

# Create a PR
git_pr(repo="lib-core", title="Add caching layer", head="feature/cache", base="main")
```

---

## `git_worktree`

Manage git worktrees for isolated development.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `action` | `"list"` \| `"add"` \| `"remove"` | **Yes** | Action to perform |
| `name` | string | add/remove | Worktree identifier |
| `branch` | string | No | Branch name (default: `{name}-work`) |
| `cwd` | string | No | Git root directory |

### Examples

```
# List all worktrees
git_worktree(action="list")

# Create a worktree for isolated work
git_worktree(action="add", name="lib-core", branch="lib-core-feature")

# Remove when done
git_worktree(action="remove", name="lib-core")
```

### How It Works

Worktrees are created in `.worktrees/{name}/` under the git root. This keeps them out of the way but accessible. When you create a worktree, a new branch is created automatically (or you can specify an existing one).

```
repo/
├── .worktrees/
│   ├── lib-core/      ← worktree for lib-core
│   └── lib-utils/     ← worktree for lib-utils
├── packages/
│   ├── lib-core/
│   └── lib-utils/
└── .git/
```