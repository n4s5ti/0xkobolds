# Architecture

How the git sync tools work under the hood.

## Config Resolution

```
┌──────────────┐     ┌────────────────┐     ┌──────────────┐
│ Tool Params   │────▶│ .git-sync.json │────▶│ Auto-Detect  │
│ (highest pri) │     │ (config file)  │     │ (fallback)   │
└──────────────┘     └────────────────┘     └──────────────┘
```

Each setting is resolved independently. If `org` is provided as a param but `prefix` isn't, `prefix` comes from config or auto-detection.

## Subtree Mode

Used when a monorepo has subdirectories that map to individual GitHub repos.

### Push Flow

```
Monorepo                              Individual Repo
─────────                             ────────────────
packages/lib-core/                    github.com/org/lib-core
       │                                      ▲
       │  git subtree split                   │
       │  --prefix=packages/lib-core          │
       │         │                            │
       │         ▼                            │
       │   _split branch (synthetic)          │
       │         │                            │
       │         └── git push ────────────────┘
```

1. `git subtree split --prefix=packages/lib-core` — creates a synthetic branch with only that subdirectory's history
2. Push the split branch to the individual repo's remote

### Pull Flow

```
Individual Repo                       Monorepo
───────────────                       ──────────
github.com/org/lib-core               packages/lib-core/
       │                                      ▲
       │  git fetch pkg-lib-core main         │
       │         │                            │
       │         ▼                            │
       │  git subtree pull --squash           │
       │  --prefix=packages/lib-core           │
       │         │                            │
       │         └────────────────────────────┘
```

1. Fetch latest from the individual repo's remote
2. `git subtree pull --squash` — merges individual repo changes into the prefix directory as a single commit

### Remote Naming

Remotes are named `{remotePrefix}{name}` (default: `pkg-lib-core`). This avoids conflicts with `origin` and other conventional remotes.

```
origin              → monorepo (e.g. 0xkobolds/0xkobolds)
pkg-lib-core        → individual repo (e.g. my-team/lib-core)
pkg-lib-utils       → individual repo (e.g. my-team/lib-utils)
```

## Standalone Mode

Used for a single git repo pushing to GitHub — no subtree operations.

### Push Flow

```
git push origin main
```

### Pull Flow

```
git pull origin main
```

No subtree split/merge overhead. Just standard git operations.

## Status Detection

### Subtree mode

For each subdirectory, status is detected by:

1. Split the prefix directory to a synthetic branch
2. Compare the tip of that branch with the remote's HEAD
3. If equal → ✅ synced; if different → count commits ahead/behind

This is the most accurate method but requires `git subtree split` (can be slow for large repos).

### Standalone mode

Uses `git log` to compare local and remote branches:

```bash
git log origin/main..HEAD --oneline | wc -l   # ahead
git log HEAD..origin/main --oneline | wc -l   # behind
```

## Directory Detection

```
findGitRoot(cwd)
  │
  ├── Walk up from cwd
  │   Check for .git/ directory
  │   Max 10 hops
  │
  └── Returns first directory with .git/

resolveConfig(root, params)
  │
  ├── Read .git-sync.json or .git-sync.jsonc
  ├── Merge with params (params win)
  ├── Auto-detect missing org from git remote -v
  └── Return Required<GitSyncConfig>

listSubdirs(root, prefix, pattern)
  │
  ├── ls -d {prefix}/{pattern}/
  ├── Filter hidden dirs (.*)
  └── Return basenames sorted
```

## Tool Registration

All 7 tools are registered via `registerGitPackageSyncTools(pi)` in `src/index.ts`:

```
pi.registerTool({ name: "git_package_status", ... })
pi.registerTool({ name: "git_package_push",  ... })
pi.registerTool({ name: "git_package_pull",  ... })
pi.registerTool({ name: "git_package_init",  ... })
pi.registerTool({ name: "git_issue",          ... })
pi.registerTool({ name: "git_pr",             ... })
pi.registerTool({ name: "git_worktree",       ... })
```

Each tool uses TypeBox schemas for parameter validation and returns structured `{ content, details }` objects.