# pi-suggest - Context-Aware Suggestion Engine

> Generates intelligent next-step suggestions based on session history, current context, and user intent

## Overview

**pi-suggest** is a pi-coding-agent extension that analyzes:
1. **Session History** - Recent conversations, decisions, and outcomes
2. **Current Context** - Active file, task, or work in progress
3. **User Intent** - Inferred goals from conversation patterns

It generates actionable "next step" prompts that feel like suggestions from a thoughtful collaborator.

## Core Concept

Instead of generic autocomplete, pi-suggest builds a "mental model" of where the conversation is heading and offers contextually relevant suggestions like:

- "Should we write tests for this?"
- "Want me to add error handling?"
- "This looks like it needs a config file - shall I create one?"
- "Based on our discussion about X, consider Y..."

## Architecture

```
pi-suggest/
├── src/
│   ├── index.ts           # Extension entry point
│   ├── analyzer/
│   │   ├── session.ts     # Session history analyzer
│   │   ├── context.ts     # Current context extractor
│   │   ├── intent.ts      # User intent classifier
│   │   └── scorer.ts      # Suggestion scoring engine
│   ├── generator/
│   │   ├── prompt.ts      # Suggestion prompt builder
│   │   └── templates.ts    # Prompt templates
│   └── ui/
│       └── widget.ts      # Suggestion UI widget
├── dist/
├── package.json
├── tsconfig.json
└── README.md
```

## Key Features

### 1. Session Analysis
- Parse recent conversation for patterns
- Identify: decisions made, tasks started, blockers encountered
- Track topic transitions
- Remember user preferences ("I prefer tests first")

### 2. Context Extraction
- Current file/language
- Active task or feature being worked on
- Recent changes (git diff context)
- Open TODOs or FIXMEs in code

### 3. Intent Classification
- **IMPLEMENT** - Writing new code
- **DEBUG** - Fixing issues
- **REFACTOR** - Improving existing code
- **RESEARCH** - Exploring/understanding
- **PLAN** - Designing architecture
- **REVIEW** - Code review mode

### 4. Suggestion Generation
- Multiple suggestion types:
  - **Action** - "Run the tests"
  - **Question** - "Should we handle edge case X?"
  - **Observation** - "This function is getting long..."
  - **Offer** - "I can refactor this if you want"
- Confidence scoring
- Rejection learning (don't suggest what user ignores)

## Learning Features (Phase 3)

pi-suggest learns from your behavior to improve suggestions over time.

### What It Learns

- **Acceptance patterns**: Which suggestions you accept
- **Rejection patterns**: Which suggestions you dismiss
- **Preferences**: Your stated preferences ("I prefer tests first")

### Commands

- `/suggest learn` - Show learning statistics
- `/suggest stats` - Show acceptance/dismissal rates

### How It Works

1. Tracks every suggestion outcome (accepted/dismissed)
2. Calculates per-suggestion acceptance rates
3. Detects patterns in rejections (e.g., "never suggest commits")
4. Applies boosts/penalties based on learned patterns
5. Suggests alternatives when patterns are detected

### Privacy

Learning data is stored locally in `~/.0xkobold/pi-suggest/store.db`

## LLM Setup (Optional)

pi-suggest can use a local LLM for smarter suggestions:

pi-suggest can use a local LLM (Ollama) to generate smarter, more contextual suggestions.

### Setup

1. Install Ollama: `brew install ollama` (macOS) or `curl -fsSL https://ollama.com/install.sh`
2. Pull a model: `ollama pull llama3.2`
3. Start Ollama: `ollama serve`

### Configuration

```bash
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=llama3.2
```

Or use `/suggest configure` to see current settings.

### Commands

- `/suggest configure` - Show LLM configuration
- `/suggest status` - Show current suggestion

### How It Works

1. **Session analysis** extracts topics, decisions, and tasks
2. **Intent classifier** determines user intent (IMPLEMENT, DEBUG, etc.)
3. **File context extractor** reads TODOs/FIXMEs from current file
4. **Pattern recognizer** detects workflow patterns
5. **LLM** generates contextual suggestions based on all above
6. **Fallback** to templates if LLM is unavailable

### Commands
- `/suggest` - Show current suggestions
- `/suggest refresh` - Regenerate suggestions
- `/suggest configure` - Open settings

### Trigger Modes
1. **Manual** - User types `/suggest`
2. **Proactive** - Auto-show after long response (>500 tokens)
3. **Contextual** - Show when entering new file/function
4. **Pattern** - Show after "I'm trying to..." or "I want to..."

### UI
- Show as widget below chat
- 3-5 suggestions max
- Keyboard shortcuts (1-5 to select)
- Dismiss with Escape or click
- Learn from dismissals

## Data Model

### Suggestion
```typescript
interface Suggestion {
  id: string;
  type: 'action' | 'question' | 'observation' | 'offer';
  text: string;
  confidence: number; // 0-1
  reason: string;    // Why this suggestion
  context: {
    based_on: 'session' | 'file' | 'pattern' | 'preference';
    session_summary?: string;
    file_path?: string;
    pattern?: string;
  };
  actions?: {
    label: string;
    prompt: string;  // Full prompt if selected
  }[];
}
```

### Session Summary
```typescript
interface SessionSummary {
  topics: string[];
  decisions: string[];
  tasks_in_progress: string[];
  blockers: string[];
  user_preferences: string[];
  recent_files: string[];
}
```

## Integration Points

### With pi-learn
- Use pi-learn for persistent memory of user preferences
- Learn from accepted/dismissed suggestions over time
- Store successful suggestion patterns

### With pi-gateway
- Suggest based on multi-session context
- Cross-session recommendations

### With Orchestrator
- Suggest next agent type based on intent
- "This looks like a job for the researcher agent"

## Configuration

```typescript
interface PiSuggestConfig {
  // Trigger settings
  auto_suggest: boolean;
  min_response_length: number; // chars before auto-suggest
  
  // Display settings  
  max_suggestions: number; // default 5
  show_confidence: boolean;
  
  // Learning settings
  learn_from_dismissals: boolean;
  dismissal_memory_ttl: number; // days
  
  // Intent detection
  intent_detection: 'basic' | 'advanced';
  
  // Integration
  use_pi_learn: boolean;
  use_session_history: boolean;
}
```

## Example Suggestions

### During Implementation
```
🎯 Based on your implementation of UserAuth:
• "This needs input validation - add sanitizeUserInput()"
• "Should we add logout functionality too?"
• "Consider extracting this to a UserService class"
```

### During Debugging
```
🔧 Detected debugging session:
• "Run with verbose logging to see where it fails"
• "Add a breakpoint at line 42"
• "Check if this ever worked - git bisect?"
```

### During Planning
```
📋 Planning detected:
• "Add this to the project backlog?"
• "Should we write an ADR for this decision?"
• "Break this into smaller tasks first?"
```

## Implementation Phases

### Phase 1: Core (MVP)
- [ ] Basic session analyzer
- [ ] Simple intent classifier
- [ ] Template-based suggestions
- [ ] Manual trigger via `/suggest`
- [ ] Dismiss tracking

### Phase 2: Intelligence
- [x] LLM-powered suggestion generation
- [x] Context extraction from files
- [x] Pattern recognition
- [x] Confidence scoring

### Phase 3: Learning
- [x] SuggestionLearner - Track outcomes, calculate acceptance rates
- [x] Preference learning - Extract preferences from conversation
- [x] Rejection pattern detection - Detect patterns in rejected suggestions
- [x] Cross-session memory - Via SQLite persistence

### Phase 4: Polish
- [x] Proactive suggestions - Auto-show after long responses
- [x] Keyboard shortcuts - 1-5 to select, arrows to navigate
- [x] Custom templates - User-defined suggestion templates
- [x] Team sharing - Share configs across team

## Success Metrics

- Suggestions accepted rate > 30%
- User-reported usefulness > 4/5
- Average time to suggestion < 100ms
- Zero false positive blocks

## Why This Matters

Current AI assistants are reactive - they wait for prompts. pi-suggest makes the agent **proactively collaborative**, anticipating needs like a thoughtful pair programmer would.

It transforms the relationship from "human directs, AI follows" to "collaborative dialogue where both contribute ideas".
