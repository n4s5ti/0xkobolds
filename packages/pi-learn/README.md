# @0xkobold/pi-learn

Open-source memory infrastructure for [pi](https://pi.dev) agents, inspired by [Honcho](https://honcho.dev).

Part of the [0xKobold](https://github.com/0xKobold) ecosystem.

## Installation

### Bundled (recommended)

```bash
pi install npm:@0xkobold/pi-kobold
# pi-learn loaded as sub-extension automatically
```

### Standalone

```bash
pi install npm:@0xkobold/pi-learn

# Or in pi-config.ts
{
  extensions: [
    'npm:@0xkobold/pi-learn'
  ]
}

# Or temporary (testing)
pi -e npm:@0xkobold/pi-learn
```

## Features

- **Peer Representations**: Build rich mental models of users through reasoning
- **LLM-Based Reasoning**: Uses Ollama for embeddings and reasoning (local or cloud)
- **Context Assembly**: Retrieves relevant context for agent prompts
- **Vector Search**: Semantic similarity search using embeddings with keyword fallback
- **Dreaming**: Background/creative reasoning synthesis
- **Observation Bridge**: Unprocessed observations automatically flow into reasoning pipeline
- **Session Summarization**: Auto-generates short and long summaries at message thresholds
- **Retention Policies**: Automatic data pruning

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Pi-Learn                             │
├─────────────────────────────────────────────────────────────┤
│  Session Events    │  SQLiteStore   │  Reasoning Engine   │
│  ────────────────  │  ─────────────  │  ────────────────  │
│  • session_start   │  • Workspaces   │  • Message batch    │
│  • before_agent    │  • Peers        │  • Conclusions      │
│  • message_end     │  • Sessions     │  • Observations     │
│  • turn_end        │  • Messages     │  • Peer cards       │
│                    │  • Conclusions  │  • Summaries        │
│                    │  • Observations │  • Dreaming        │
├─────────────────────────────────────────────────────────────┤
│                    Ollama Integration                       │
│  ┌─────────────────┐        ┌─────────────────────────┐  │
│  │ Embeddings       │        │ Reasoning Model          │  │
│  │ nomic-embed-     │        │ (configurable)          │  │
│  │ text-v2-moe      │        │                          │  │
│  └─────────────────┘        └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Data Model

Inspired by Honcho's hierarchical structure:

1. **Workspace**: Top-level container (isolated namespaces)
2. **Peer**: User, agent, or entity being observed
3. **Session**: Interaction thread between peers
4. **Message**: Individual conversation entries
5. **Observation**: Raw observations stored before reasoning
6. **Conclusion**: Synthesized insights from reasoning
7. **Representation**: Aggregated peer knowledge

## Reasoning Pipeline

Messages flow through a full pipeline:

1. **Add message** → stored with `processed=false`
2. **learn_reason_now** → fetches unprocessed observations, runs LLM reasoning, saves conclusions with embeddings, marks observations as processed
3. **autoSummarize** → generates short summaries every 20 messages, long summaries every 60 messages
4. **searchSimilar** → uses vector similarity (cosine similarity on embeddings) with keyword fallback

### Conclusion Types

- **Deductive**: Certain conclusions from explicit premises (90% confidence)
- **Inductive**: Patterns observed across messages (70% confidence)
- **Abductive**: Simplest explanations for behavior (50% confidence)

## Peer Cards

Biographical cache:

- Name, occupation
- Interests, traits, goals
- Updated through reasoning or manually

## Dreaming

Dreaming is background reasoning that synthesizes deeper insights:

- Runs on a schedule (configurable interval)
- Looks at broader patterns across sessions
- Generates creative hypotheses about the peer
- Can update peer cards with insights

## Retention Policies

Automatic data pruning:

- **Summaries**: Default 30 days retention
- **Conclusions**: Default 90 days retention
- **Messages**: Forever by default (configurable)

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

## Tools (14 total)

| Tool | Description |
|------|-------------|
| `learn_add_message` | Add a message to memory |
| `learn_add_observation` | Store raw observation for later reasoning |
| `learn_add_messages_batch` | Batch add multiple messages |
| `learn_get_context` | Retrieve assembled peer context |
| `learn_query` | Search memory with embeddings |
| `learn_reason_now` | Trigger immediate reasoning on unprocessed observations |
| `learn_trigger_dream` | Manually trigger dreaming |
| `learn_get_peer_card` | Get biographical info card |
| `learn_update_peer_card` | Update peer card manually |
| `learn_list_peers` | List all peers in workspace |
| `learn_get_stats` | Get memory statistics |
| `learn_get_summaries` | Get peer summaries |
| `learn_prune` | Trigger retention pruning |
| `learn_search_sessions` | Search sessions by keyword |
| `learn_get_session` | Get specific session with messages |
| `learn_list_sessions` | List all sessions |
| `learn_tag_session` | Tag sessions for categorization |

## Configuration

```json
{
  "learn": {
    "workspaceId": "default",
    "reasoningEnabled": true,
    "reasoningModel": "kimi-k2.5:cloud",
    "embeddingModel": "nomic-embed-text-v2-moe:latest",
    "tokenBatchSize": 1000,
    "dream": {
      "enabled": true,
      "intervalMs": 3600000,
      "minMessagesSinceLastDream": 5,
      "batchSize": 50
    },
    "retention": {
      "summaryRetentionDays": 30,
      "conclusionRetentionDays": 90,
      "retentionDays": 0
    }
  },
  "ollama": {
    "apiKey": "your-api-key"
  }
}
```

Environment variables:

- `LEARN_REASONING_MODEL` - Override reasoning model
- `LEARN_EMBEDDING_MODEL` - Override embedding model
- `LEARN_TOKEN_BATCH_SIZE` - Override token batch size
- `OLLAMA_API_KEY` - Override Ollama API key

## API Functions

Library functions are importable for programmatic use:

```typescript
// Core modules
import { SQLiteStore } from "@0xkobold/pi-learn/core/store";
import { ReasoningEngine, type ReasonedConclusion } from "@0xkobold/pi-learn/core/reasoning";
import { ContextAssembler } from "@0xkobold/pi-learn/core/context";

// Shared types and utilities
import { cosineSimilarity, GLOBAL_WORKSPACE_ID } from "@0xkobold/pi-learn/shared";

// CLI renderers
import { renderStats, renderPeerCard } from "@0xkobold/pi-learn/renderers";

// Use vector search
const store = new SQLiteStore(dbPath);
const results = await store.searchSimilar(workspaceId, peerId, "query text", 10);

// Manual reasoning
const reasoningEngine = new ReasoningEngine(ollama, model);
const conclusions = await reasoningEngine.reasonOnObservations(workspaceId, peerId, observations);

// Auto-summarize at thresholds
const assembler = new ContextAssembler(store, ollama, model);
await assembler.autoSummarize(workspaceId, peerId, reasoningEngine);
```

## Local Storage

Data is stored in SQLite at `~/.pi/memory/pi-learn.db`:

```sql
-- Tables
workspaces, peers, sessions, messages,
observations, conclusions, summaries, peer_cards

-- Indexes for performance
idx_conclusions_peer, idx_conclusions_created,
idx_summaries_peer, idx_messages_session
```

## Ollama Requirements

Pi-learn requires Ollama running locally or via cloud:

- **Embeddings**: `nomic-embed-text-v2-moe:latest` (required for semantic search)
- **Reasoning**: Any Ollama chat model (default: `kimi-k2.5:cloud`)

```bash
# Pull required models
ollama pull nomic-embed-text-v2-moe:latest

# Pull your preferred reasoning model
ollama pull kimi-k2.5:cloud
```

## Related Packages

- [`@0xkobold/pi-kobold`](https://github.com/0xKobold/pi-kobold) — Meta-extension that bundles this and other sub-extensions
- [`@0xkobold/pi-ollama`](https://github.com/0xKobold/pi-ollama) — Ollama integration for pi agents
- [`@0xkobold/pi-persona`](https://github.com/0xKobold/pi-persona) — Scope-aware persona management

## Local Development

```bash
git clone https://github.com/0xKobold/pi-learn
cd pi-learn
npm install
npm run build
pi install ./
```

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.

## License

MIT