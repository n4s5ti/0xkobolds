# AGENT.md — @0xkobold/pi-learn

## What This Package Does

Open-source memory infrastructure for pi agents. Stores messages, observations, and conclusions in SQLite with Ollama-powered reasoning, vector search, context assembly, dreaming, and session summarization.

Inspired by [Honcho](https://honcho.dev)'s hierarchical peer/session/message model.

## Architecture

```
src/
├── index.ts                 # Extension entry (lifecycle hooks, 17 tools, 7 commands)
├── tools/index.ts           # Tool definitions (learn_add_message, learn_reason_now, etc.)
├── shared.ts                # Types, cosineSimilarity, constants, workspace utilities
├── renderers.ts             # CLI formatting for stats, peer cards, context
└── core/
    ├── store.ts             # SQLiteStore — all data persistence (sql.js/WASM)
    ├── reasoning.ts         # ReasoningEngine — LLM reasoning, observation → conclusion bridge
    ├── context.ts           # ContextAssembler — query, vector search, auto-summarize
    ├── dream.ts             # DreamRunner — scheduled creative reasoning
    ├── config.ts            # Configuration loading with assertions
    ├── commands.ts          # /learn command handlers
    ├── bridge.ts            # Standalone MemoryProvider (no pi dependency)
    ├── project-detection.ts # File-based project/workspace detection
    └── project-integration.ts # Project-scope workspace switching
```

## Extension Factory

```typescript
export default async function(pi: ExtensionAPI): Promise<void>
```

Registered in pi-kobold's `subExtensions` array with sentinel `{ type: "tool", name: "learn_add_message" }`.

## Key Pipeline (v0.4.0+)

1. **Add message** → `learn_add_message` stores with `processed=false`
2. **learn_reason_now** → Fetches unprocessed observations → runs LLM reasoning → saves conclusions with embeddings → marks processed → auto-generates summaries
3. **learn_query / searchSimilar** → Generates query embedding via Ollama → cosine similarity against conclusion embeddings → keyword fallback

## Tools (17 total)

| Tool | Description |
|------|-------------|
| `learn_add_message` | Add a message to memory |
| `learn_add_observation` | Store raw observation for later reasoning |
| `learn_add_messages_batch` | Batch add multiple messages |
| `learn_get_context` | Retrieve assembled peer context |
| `learn_query` | Search memory with embeddings |
| `learn_reason_now` | **Key tool** — trigger immediate reasoning on unprocessed observations |
| `learn_trigger_dream` | Manually trigger dreaming |
| `learn_get_peer_card` | Get biographical info card |
| `learn_update_peer_card` | Update peer card manually |
| `learn_list_peers` | List all peers in workspace |
| `learn_get_stats` | Get memory statistics |
| `learn_get_insights` | Get topic distribution and engagement metrics |
| `learn_get_summaries` | Get peer summaries |
| `learn_prune` | Trigger retention pruning |
| `learn_search_sessions` | Search sessions by keyword |
| `learn_get_session` | Get specific session with messages |
| `learn_list_sessions` | List all sessions |
| `learn_tag_session` | Tag sessions for categorization |

## Commands

| Command | Description |
|---------|-------------|
| `/learn status` | Show memory status |
| `/learn context` | Show assembled context |
| `/learn config` | Show configuration |
| `/learn enable` | Enable reasoning |
| `/learn disable` | Disable reasoning |
| `/learn dream` | Trigger dream cycle |
| `/learn prune` | Prune old data |

## Sentinel Tool

`learn_add_message` — Used by pi-kobold's duplicate-load guard.

## Key Types (importable from `@0xkobold/pi-learn/shared`)

```typescript
import {
  cosineSimilarity,
  GLOBAL_WORKSPACE_ID,
  type WorkspaceId,
  type PeerId,
  type Conclusion,
  type PeerCard,
  type Message,
  type Observation,
  type SessionSummary,
} from "@0xkobold/pi-learn/shared";
```

## Key Types (importable from core modules)

```typescript
import { SQLiteStore } from "@0xkobold/pi-learn/core/store";
import { ReasoningEngine, type ReasonedConclusion } from "@0xkobold/pi-learn/core/reasoning";
import { ContextAssembler } from "@0xkobold/pi-learn/core/context";
```

## Lifecycle Hooks

- `session_start` — Initializes store, loads context, detects project workspace
- `before_agent_start` — Injects assembled context into system prompt
- `message_end` / `turn_end` — Auto-reasons on new messages

## Data Storage

SQLite via `sql.js` (WebAssembly) at `~/.pi/memory/pi-learn.db`:

- Cross-runtime compatible (Node.js and Bun)
- Tables: workspaces, peers, sessions, messages, observations, conclusions, summaries, peer_cards
- Embeddings stored as JSON blobs on conclusions

## Configuration

Settings file (`~/.pi/agent/settings.json`) or `.pi/settings.json`:

```json
{
  "learn": {
    "workspaceId": "default",
    "reasoningEnabled": true,
    "reasoningModel": "kimi-k2.5:cloud",
    "embeddingModel": "nomic-embed-text-v2-moe:latest"
  }
}
```

## Integration with pi-kobold

Loaded as a sub-extension. Users install either:

- `pi install npm:@0xkobold/pi-learn` — standalone
- `pi install npm:@0xkobold/pi-kobold` — bundled (loads learn automatically)

No conflicts if both installed — pi-kobold's duplicate guard skips re-loading.

## Dependencies

- `@mariozechner/pi-coding-agent` >=0.62.0 (peer)
- `@sinclair/typebox` >=0.32.0 (peer)
- `ollama` >=0.6.0 (peer)
- `@0xkobold/pi-ollama` ^0.2.0 (runtime — for embeddings/reasoning)
- `sql.js` ^1.14.1 (runtime — SQLite via WASM)