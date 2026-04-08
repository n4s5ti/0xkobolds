# Pi-Kobold

Meta-extension for [pi-coding-agent](https://github.com/badlogic/pi-mono) that bundles the 0xKobold ecosystem into a single install.

## Installation

```bash
pi install npm:@0xkobold/pi-kobold
```

## Bundled Sub-Extensions

| Extension | Description |
|-----------|-------------|
| [pi-orchestration](https://github.com/0xKobold/pi-orchestration) | Multi-agent workflows and task delegation |
| [pi-gateway](https://github.com/0xKobold/pi-gateway) | Hermes-style multi-platform messaging gateway |
| [pi-ollama](https://github.com/0xKobold/pi-ollama) | Unified Ollama provider (local + cloud) |
| [pi-learn](https://github.com/0xKobold/pi-learn) | Persistent memory and reasoning |
| [pi-mcp](https://github.com/0xKobold/pi-mcp) | Model Context Protocol integration (stdio, SSE, WebSocket) |

Installing `pi-kobold` activates all five. You can also install them individually:

```bash
# Pick and mix — no conflicts
pi install npm:@0xkobold/pi-ollama npm:@0xkobold/pi-learn
```

Duplicate registration is guarded — if a sub-extension was already loaded, pi-kobold skips it.

## Tools

### Core Tools

| Tool | Description |
|------|-------------|
| `kobold_initialize` | Initialize pi-kobold with LLM configuration |
| `kobold_create_skill` | Generate boilerplate for a new skill |
| `kobold_create_extension` | Generate boilerplate for a new extension |
| `kobold_status` | Show status of all sub-extensions |

### Git Sync Tools

Generic git↔GitHub sync tools that work for any project, org, or directory structure. Two modes: **subtree** (monorepo subdirs → individual repos) and **standalone** (single repo → GitHub).

All settings are configurable via tool params, `.git-sync.json` config file, or auto-detected from git remotes.

| Tool | Description |
|------|-------------|
| `git_package_status` | Show sync status of subdirectories or standalone repo |
| `git_package_push` | Push a subdirectory (subtree) or repo to GitHub |
| `git_package_pull` | Pull from GitHub into a subdirectory or repo |
| `git_package_init` | Create a GitHub repo and push initial content |
| `git_issue` | List or create GitHub issues on any repo |
| `git_pr` | List or create pull requests on any repo |
| `git_worktree` | Manage git worktrees for isolated development |

These tools use `git subtree` for history-preserving sync and `gh` CLI for GitHub operations. The monorepo is the source of truth — changes flow from `packages/<name>/` out to individual repos via `git_package_push`, and external contributions flow back in via `git_package_pull`.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         Pi-Kobold                            │
├──────────────┬──────────┬──────────┬──────────┬─────────────┤
│ Orchestrate  │ Gateway   │ Ollama   │ Learn    │ MCP         │
│ ──────────── │ ────────  │ ──────── │ ─────────│ ─────────── │
│ • Delegate   │ • Session │ • Local  │ • Observe│ • stdio     │
│ • Chain      │ • Secure  │ • Cloud  │ • Reason │ • SSE       │
│ • Parallel   │ • BG task │ • Vision │ • Dream  │ • WebSocket │
├──────────────┴──────────┴──────────┴──────────┴─────────────┤
│ Git Sync (7 tools — subtree + standalone)                    │
│ • push/pull • repo init • issues • PRs • worktrees • config │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install
pi install npm:@0xkobold/pi-kobold

# Check status
/kobold_status

# Initialize
/kobold_initialize

# Create a skill
/kobold_create_skill name="my-skill" description="Does something useful" path=".pi/skills/"

# Check package sync status
git_package_status()

# Push a subdirectory to its individual repo (subtree mode)
git_package_push(name="pi-gateway")

# Push a standalone project to GitHub
git_package_push(mode="standalone", org="my-org")

# Pull external changes back
git_package_pull(name="pi-ollama")

# Create a GitHub repo for a new project
git_package_init(name="my-app", org="my-org")

# Create a GitHub issue on any repo
git_issue(repo="pi-mcp", title="Bug: connection timeout", labels=["bug"])
```

## LLM Executor

Pi-kobold provides a shared LLM executor that pi-orchestration uses for multi-agent workflows:

```typescript
import { initializeKobold, orchestrate } from '@0xkobold/pi-kobold';

const executor = async (opts) => {
  // Your LLM call here
  return { content: "response", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
};

initializeKobold(executor);

const result = await orchestrate({ task: "plan a feature" });
```

## Storage

Sub-extensions use SQLite via [sql.js](https://github.com/nicolo-ribaudo/nicolo-nicolo/tree/main/nicolo) (WebAssembly) for cross-runtime compatibility (Node.js and Bun):

- `~/.0xkobold/gateway-sessions.db` — Gateway session data
- `~/.0xkobold/gateway-security.db` — Allowlists and pairing codes
- `~/.0xkobold/gateway-background-tasks.db` — Background task records
- `~/.pi/memory/pi-learn.db` — Learn memory and reasoning

## Local Development

```bash
git clone https://github.com/0xKobold/pi-kobold
cd pi-kobold
npm install
npm run build
pi install ./
```

## License

MIT