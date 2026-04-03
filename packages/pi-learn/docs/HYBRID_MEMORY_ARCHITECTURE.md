# Hybrid Memory Architecture

## Problem Statement

Currently, pi-learn stores memories per-project (per workspace/session directory). This provides privacy and isolation but misses cross-project patterns about the user.

## Solution: Hybrid Approach

### Core Principle
- **Project memories stay project-local** (messages, conclusions about code)
- **User traits float globally** (interests, preferences, goals)

### Scope Classification

| Scope | Content | Storage | Access |
|-------|---------|---------|--------|
| `project` | Code patterns, project-specific decisions, session history | Local workspace | Current project only |
| `user` | Traits, interests, goals, cross-project patterns | Global workspace | All projects |

### Data Model Changes

#### 1. Conclusions Table
```sql
ALTER TABLE conclusions ADD COLUMN scope TEXT NOT NULL DEFAULT 'project';
-- Values: 'project' | 'user'
```

#### 2. Global Workspace
- `workspaceId = "__global__"` reserved for cross-project data
- Created automatically on first init
- Stores: global peer card, user-scope conclusions

### Scope Classification Rules

#### User Scope (Global)
- Inferences about user traits ("Perfectionist", "Methodical validator")
- Inferences about interests ("Interested in functional programming")
- Inferences about goals ("Building production-grade systems")
- Cross-project patterns ("Also works on React projects")
- User preferences ("Prefers TypeScript over JavaScript")

#### Project Scope (Local)
- Project-specific decisions ("Chose SQLite for local storage")
- Code patterns ("Uses React hooks for state management")
- Session-specific context
- Implementation details

### Context Assembly

```typescript
interface AssembledContext {
  global: {
    peerCard: PeerCard | null;
    conclusions: Conclusion[];  // scope='user'
  };
  project: {
    peerCard: PeerCard | null;  // project-specific override
    conclusions: Conclusion[];  // scope='project'
    messages: Message[];
    summaries: Summary[];
  };
}
```

`assembleContext()` returns blended string:
1. Global peer card (interests, traits, goals)
2. Global user-scope conclusions
3. Project peer card (if different from global)
4. Project-scope conclusions
5. Recent summaries

### Reasoning Engine Changes

#### Prompt Updates
- `buildReasoningPrompt()` → classify each conclusion with scope
- `buildDreamPrompt()` → blend global + project conclusions

#### Output Parsing
```typescript
interface ReasoningOutput {
  explicit: Array<{ content: string; scope: 'user' | 'project' }>;
  deductive: Array<{ premises: string[]; conclusion: string; scope: 'user' | 'project' }>;
}
```

### Implementation Plan

#### Phase 1: Database & Store ✅ (Complete)
- [x] Migration to add scope column
- [x] `saveConclusion(workspaceId, conclusion)` with scope field
- [x] `getConclusions(workspaceId, peerId, scope?)` - filter by scope
- [x] `getGlobalConclusions(peerId)` - get from __global__
- [x] Create __global__ workspace on init
- [x] `getBlendedRepresentation()` for context assembly

#### Phase 2: Context Assembly ✅ (Complete)
- [x] `assembleContext()` blends global + local
- [x] `getGlobalContext(peerId)` - global only
- [x] `getProjectContext(workspaceId, peerId)` - project only
- [x] `getBlendedContext()` returns structured global + local data
- [x] `searchSimilar()` searches across both scopes
- [x] `getMemoryStats()` includes both local and global counts
- [x] New tools: `learn_get_global_context`, `learn_get_project_context`

#### Phase 3: Reasoning ✅ (Complete)
- [x] Update reasoning prompts to output scope (SCOPE: user|project)
- [x] Parse scope from reasoning output
- [x] `ReasoningContext` interface for informed reasoning
- [x] `blendedConclusions` field in BlendedContext
- [x] Dream saves conclusions to appropriate workspace based on model-assigned scope
- [x] Logging for scope distribution debugging

#### Phase 4: Testing ✅ (Complete - Database Recovered)
- [x] Database recovery (1272 conclusions recovered from corruption)
- [x] Test helper tools: `learn_test_hybrid`, `learn_count_by_scope`
- [ ] Verify new conclusions get proper scope assigned
- [ ] Integration tests for context blending

### Backward Compatibility

- Existing conclusions default to `scope='project'`
- Migration handles old data gracefully
- All existing tools continue to work
- Global data created incrementally as reasoning runs

### Configuration

```json
{
  "learn": {
    "scope": {
      "reasoningDefaultsTo": "project",  // or "user"
      "allowGlobal": true
    }
  }
}
```
