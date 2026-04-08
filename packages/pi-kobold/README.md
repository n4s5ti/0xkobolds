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

### Git Package Sync Tools

Manage bidirectional sync between the monorepo and individual GitHub repos, plus issues and PRs.

| Tool | Description |
|------|-------------|
| `git_package_status` | Show sync status of all pi-packages (drift, missing repos, unconfigured remotes) |
| `git_package_push` | Push a package subtree to its individual GitHub repo |
| `git_package_pull` | Pull changes from an individual repo into the monorepo |
| `git_package_init` | Create a GitHub repo for a package and push initial content |
| `git_issue` | List or create GitHub issues on a package repo |
| `git_pr` | List or create pull requests on a package repo |
| `git_worktree` | Manage git worktrees for isolated package development |

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
│ Git Package Sync (7 tools)                                  │
│ • subtree push/pull • repo init • issues • PRs • worktrees │
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

# Push a package to its individual repo
git_package_push(package="pi-gateway")

# Pull external changes back
git_package_pull(package="pi-ollama")

# Create a GitHub issue
git_issue(package="pi-mcp", title="Bug: connection timeout", labels=["bug"])
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