# Pi-Learn

Open-source memory infrastructure for pi agents, inspired by [Honcho](https://honcho.dev).

## Features

- **Peer Representations**: Build rich mental models of users through reasoning
- **LLM-Based Reasoning**: Uses Ollama for embeddings and reasoning
- **Context Assembly**: Retrieves relevant context for agent prompts
- **Vector Search**: Semantic similarity search using embeddings
- **Dreaming**: Background/creative reasoning synthesis
- **Retention Policies**: Automatic data pruning
- **SQLite Storage**: High-performance local database using sql.js (WebAssembly)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Pi-Learn                             │
├─────────────────────────────────────────────────────────────┤
│  Session Events    │  SQLiteStore   │  Reasoning Engine   │
│  ────────────────  │  ─────────────  │  ────────────────  │
│  • session_start   │  • Workspaces   │  • Message batch    │
│  • before_agent    │  • Peers        │  • Conclusions      │
│  • message_end     │  • Sessions     │  • Peer cards       │
│  • turn_end        │  • Messages     │  • Summaries        │
│                    │  • Conclusions  │  • Dreaming        │
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
5. **Representation**: Synthesized insights from reasoning

## Peer Representations

### Conclusions

Insights extracted from messages:

- **Deductive**: Certain conclusions from explicit premises (90% confidence)
- **Inductive**: Patterns observed across messages (70% confidence)
- **Abductive**: Simplest explanations for behavior (50% confidence)

### Peer Cards

Biographical cache:

- Name, occupation
- Interests, traits, goals
- Updated through reasoning or manually

### Summaries

Generated at message thresholds:

- Short summary: Every 20 messages
- Long summary: Every 60 messages

## Dreaming

Dreaming is background reasoning that synthesizes deeper insights. Unlike regular reasoning which processes message batches, dreaming:

- Runs on a schedule (configurable interval)
- Looks at broader patterns across sessions
- Generates creative hypotheses about the peer
- Can update peer cards with insights

## Retention Policies

Automatic data pruning:

- **Summaries**: Default 30 days retention
- **Conclusions**: Default 90 days retention
- **Messages**: Forever by default (configurable)

## Installation

```bash
# Add to pi settings (~/.pi/agent/settings.json)
{
  "packages": [
    "/path/to/pi-learn"
  ]
}
```

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
| `learn_get_context` | Retrieve assembled peer context |
| `learn_query` | Search memory with embeddings |
| `learn_reason_now` | Trigger immediate reasoning |
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

## Local Storage

Data is stored in SQLite at `~/.pi/memory/pi-learn.db`:

```sql
-- Tables
workspaces, peers, sessions, messages, 
conclusions, summaries, peer_cards

-- Indexes for performance
idx_conclusions_peer, idx_conclusions_created
idx_summaries_peer, idx_messages_session
```

## Ollama Requirements

Pi-learn requires Ollama running locally with:

- **Embeddings**: `nomic-embed-text-v2-moe:latest` (required for semantic search)
- **Reasoning**: Any Ollama chat model (default: `llama3.1`)

```bash
# Pull required models
ollama pull nomic-embed-text-v2-moe:latest

# Pull your preferred reasoning model
ollama pull kimi-k2.5:cloud
```

## License

MIT
