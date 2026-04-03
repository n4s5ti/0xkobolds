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

## User Interaction

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
- [ ] LLM-powered suggestion generation
- [ ] Confidence scoring
- [ ] Context extraction from files
- [ ] Pattern recognition

### Phase 3: Learning
- [ ] pi-learn integration
- [ ] Preference learning
- [ ] Rejection pattern detection
- [ ] Cross-session memory

### Phase 4: Polish
- [ ] Proactive suggestions
- [ ] Keyboard shortcuts
- [ ] Custom templates
- [ ] Team/shared suggestions

## Success Metrics

- Suggestions accepted rate > 30%
- User-reported usefulness > 4/5
- Average time to suggestion < 100ms
- Zero false positive blocks

## Why This Matters

Current AI assistants are reactive - they wait for prompts. pi-suggest makes the agent **proactively collaborative**, anticipating needs like a thoughtful pair programmer would.

It transforms the relationship from "human directs, AI follows" to "collaborative dialogue where both contribute ideas".
