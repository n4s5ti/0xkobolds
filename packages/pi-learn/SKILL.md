---
name: pi-learn
description: "Open-source memory infrastructure for pi agents. Provides peer representations, reasoning, context assembly, dreaming, and hybrid memory (global + project-scoped) capabilities. Use when tracking user preferences, maintaining context across sessions, building peer mental models, or enabling persistent agent memory."
risk: safe
source: 0xkobold/pi-learn
date_added: "2026-03-16"
---

# Pi-Learn

Open-source memory infrastructure for pi agents, inspired by [Honcho](https://honcho.dev). Enables stateful AI agents with persistent memory, peer understanding, and contextual reasoning.

## When to Use

Use pi-learn when:
- You need the agent to remember information across sessions
- Tracking user preferences, interests, and goals
- Building a mental model of the user (peer representation)
- Maintaining project-specific context alongside user profiles
- Enabling creative/dream synthesis for deeper insights
- Cross-project memory sharing vs. project-isolated memory
- Automatic data retention/pruning policies

## Core Concepts

### Peer Representation
The agent builds mental models of users through:
- **Conclusions**: Insights extracted from conversations (deductive, inductive, abductive)
- **Peer Cards**: Biographical data (name, occupation, interests, traits, goals)
- **Summaries**: Periodic conversation summaries
- **Observations**: Raw messages stored before reasoning

### Hybrid Memory Architecture
Two-tier memory system:

| Scope | Storage | Content | Access |
|-------|---------|---------|--------|
| **Global (user)** | `__global__` workspace | Traits, interests, goals | All projects |
| **Project (local)** | Project workspace | Code patterns, decisions | Current project only |

### Dreaming
Background reasoning that synthesizes deeper insights. Unlike real-time reasoning, dreaming:
- Runs on a schedule
- Looks at broader patterns
- Generates creative hypotheses

## Tools (28 total)

### Core Memory Tools

| Tool | Description |
|------|-------------|
| `learn_add_message` | Store a message for future reasoning |
| `learn_add_messages_batch` | Bulk insert multiple messages |
| `learn_add_observation` | Store raw observation before reasoning |
| `learn_get_context` | Retrieve assembled peer context (blended) |
| `learn_query` | Semantic search through memories |

### Reasoning Tools

| Tool | Description |
|------|-------------|
| `learn_reason_now` | Trigger immediate reasoning |
| `learn_trigger_dream` | Manually trigger dream cycle |

### Peer Card Tools

| Tool | Description |
|------|-------------|
| `learn_get_peer_card` | Get biographical info card |
| `learn_update_peer_card` | Manually update peer card |

### Session Tools

| Tool | Description |
|------|-------------|
| `learn_list_peers` | List all peers in workspace |
| `learn_list_sessions` | List all sessions |
| `learn_get_session` | Get specific session with messages |
| `learn_search_sessions` | Search sessions by keyword |
| `learn_tag_session` | Add/remove session tags |
| `learn_get_sessions_by_tag` | Get sessions by tag |
| `learn_list_tags` | List all unique tags |

### Statistics & Insights

| Tool | Description |
|------|-------------|
| `learn_get_stats` | Get memory statistics |
| `learn_get_insights` | Comprehensive learning patterns |
| `learn_get_summaries` | Get peer summaries |
| `learn_get_dream_status` | Dream system status |

### Data Management

| Tool | Description |
|------|-------------|
| `learn_prune` | Trigger retention pruning |
| `learn_export` | Export all memory as JSON |
| `learn_import` | Import from JSON backup |

### Cross-Peer Tools

| Tool | Description |
|------|-------------|
| `learn_observe_peer` | Record observation about another peer |
| `learn_get_perspective` | Get perspective from one peer on another |

### Scope-Specific Context

| Tool | Description |
|------|-------------|
| `learn_get_global_context` | Get cross-project context only |
| `learn_get_project_context` | Get project-specific context only |

## Usage Examples

### Basic: Store and Retrieve Context

```typescript
// Add user message to memory
learn_add_message({
  content: "I'm really interested in functional programming and TypeScript",
  role: "user"
});

// Later, retrieve assembled context
const context = learn_get_context({});
// Returns: blended global + project context with interests, traits, conclusions
```

### Intermediate: Query Specific Memories

```typescript
// Search for conclusions about a topic
const results = learn_query({
  query: "TypeScript preferences",
  topK: 5,
  minSimilarity: 0.5
});

// Get comprehensive stats
const stats = learn_get_stats({});
// Returns: conclusionCount, summaryCount, topInterests, topTraits, etc.
```

### Advanced: Trigger Dreaming

```typescript
// Manually trigger dream cycle
learn_trigger_dream({
  scope: "project"  // or "user" for global
});

// Check dream status
const status = learn_get_dream_status({});
// Returns: lastDreamedAt, dreamCount, nextDreamMs, etc.
```

### Cross-Peer: Observe Other Agents

```typescript
// Record observation about another peer
learn_observe_peer({
  aboutPeerId: "coding-agent",
  content: "Responds quickly and prefers TypeScript"
});

// Get perspective from user's view
const perspective = learn_get_perspective({
  observerPeerId: "user",
  targetPeerId: "coding-agent"
});
```

## Configuration

```json
{
  "learn": {
    "workspaceId": "default",
    "reasoningEnabled": true,
    "reasoningModel": "qwen3.5:latest",
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
      "retentionDays": 0,
      "pruneOnStartup": true,
      "pruneIntervalHours": 24
    }
  },
  "ollama": {
    "apiKey": "your-api-key"
  }
}
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `/learn status` | Show memory status |
| `/learn context` | Show assembled context |
| `/learn config` | Show configuration |
| `/learn dream` | Trigger dream cycle |
| `/learn prune` | Prune old data |
| `/learn search <query>` | Search sessions |
| `/learn sessions` | List sessions |

## Conclusion Types

| Type | Confidence | Description |
|------|------------|-------------|
| **Deductive** | 80-100% | Logical certainty from explicit premises |
| **Inductive** | 60-80% | Pattern observed across messages |
| **Abductive** | 40-60% | Best explanation for behavior |

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
│  • turn_end        │  • Messages     │  • Dreaming        │
│                    │  • Conclusions  │                    │
├─────────────────────────────────────────────────────────────┤
│                    Ollama Integration                       │
│  ┌─────────────────┐        ┌─────────────────────────┐  │
│  │ Embeddings       │        │ Reasoning Model          │  │
│  │ nomic-embed-     │        │ (configurable)          │  │
│  │ text-v2-moe      │        │                          │  │
│  └─────────────────┘        └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Data Storage

SQLite database at `~/.pi/memory/pi-learn.db`:

```sql
-- Tables
workspaces, peers, sessions, messages, 
conclusions, summaries, peer_cards, observations

-- Indexes
idx_conclusions_peer, idx_conclusions_created
idx_summaries_peer, idx_messages_session
```

## Ollama Requirements

Requires Ollama running locally with:
- **Embeddings**: `nomic-embed-text-v2-moe:latest`
- **Reasoning**: Any Ollama chat model

```bash
ollama pull nomic-embed-text-v2-moe:latest
ollama pull qwen3.5:latest
```

## See Also

- [Hybrid Memory Architecture](../docs/HYBRID_MEMORY_ARCHITECTURE.md)
- [pi-ollama](https://github.com/0xKobold/pi-ollama) - Ollama integration
- [Honcho](https://honcho.dev) - Inspiration for this project
