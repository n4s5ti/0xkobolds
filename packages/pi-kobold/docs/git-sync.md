# Git Sync Tools

Generic git↔GitHub sync tools that work for **any project, any org, any directory structure**. Shipped as part of `@0xkobold/pi-kobold`.

## Overview

| Mode | When | What It Does |
|------|-------|-------------|
| **subtree** | Monorepo with subdirectories that map to individual GitHub repos | `git subtree push/pull` between prefix dirs and GitHub |
| **standalone** | Single git repo | Plain `git push/pull` to GitHub |

Plus GitHub Issues, PRs, and worktree management for both modes.

## Quick Examples

### Standalone project

```
# First time: create repo on GitHub and push
git_package_init(name="my-app", org="my-team")

# After committing changes
git_package_push(mode="standalone")

# Pull from GitHub
git_package_pull(mode="standalone")

# Create an issue
git_issue(repo="my-app", title="Fix login bug", labels=["bug"])
```

### Monorepo with subdirectories

```
# See which packages are out of sync
git_package_status(org="my-team", prefix="packages", pattern="lib-*")

# Push a specific subdirectory to its own GitHub repo
git_package_push(name="lib-core", org="my-team", prefix="packages")

# Pull changes from an individual repo back into the monorepo
git_package_pull(name="lib-utils", org="my-team", prefix="packages")

# Initialize a new package repo
git_package_init(name="lib-new", org="my-team", prefix="packages")
```

### With a config file (no repeated params)

Create `.git-sync.json` in the repo root:

```json
{
  "org": "my-team",
  "prefix": "packages",
  "pattern": "lib-*",
  "defaultBranch": "main"
}
```

Then:

```
git_package_status()                // uses config defaults
git_package_push(name="lib-core")  // org/prefix from config
```