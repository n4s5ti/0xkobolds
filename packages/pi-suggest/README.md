# @0xkobold/pi-suggest

Ghost text prompt suggester for pi-coding-agent. Forked from @guwidoe/pi-prompt-suggester architecture.

## Features

- 👻 **Ghost Text** - Suggestions appear inline in the editor as ghost/dim text
- ⌨️ **Space to Accept** - Press Space on empty editor to accept suggestion
- ✏️ **Type to Override** - Any keypress hides ghost and types normally
- 🔄 **Auto-Generate** - Suggestions generated after each agent response
- 🤖 **LLM-Powered** - Uses Ollama for smart, contextual suggestions
- 📝 **File Context** - Extracts TODOs/FIXMEs from code
- 🔍 **Pattern Recognition** - Detects workflow patterns
- 📚 **Learning** - Learns from accepted/dismissed suggestions
- ⚡ **Proactive** - Auto-shows suggestions after long responses
- 🎹 **Keyboard Shortcuts** - 1-5 to select, arrows to navigate
- 📋 **Multi-Suggestion** - Shows up to 3 suggestions
- 🔧 **Custom Templates** - Define your own suggestion templates
- 👥 **Team Sharing** - Share configs across team

## Install

```bash
# Global install
pi install npm:@0xkobold/pi-suggest

# Project-local install
pi install -l npm:@0xkobold/pi-suggest
```

## LLM Setup (Optional)

pi-suggest can use a local LLM for smarter suggestions:

1. Install Ollama: `brew install ollama` (macOS) or `curl -fsSL https://ollama.com/install.sh`
2. Pull a model: `ollama pull llama3.2`
3. Start Ollama: `ollama serve`

```bash
# Configure environment
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=llama3.2
```

## Usage

After an assistant completion, the extension suggests the next user prompt as ghost text in the editor.

### Commands

- `/suggest status` - Show current suggestion
- `/suggest ghost` - Show current ghost text
- `/suggest stats` - Show acceptance/dismissal stats
- `/suggest configure` - Show LLM configuration
- `/suggest learn` - Show learning statistics

### How It Works

1. **Session Analysis** - Extracts topics, decisions, tasks from conversation
2. **Intent Classification** - Determines user intent (IMPLEMENT, DEBUG, REFACTOR, etc.)
3. **File Context** - Extracts TODOs/FIXMEs from recent files
4. **Pattern Recognition** - Detects workflow patterns (create→test→commit)
5. **Learning** - Adapts based on accepted/dismissed suggestions
6. **LLM Generation** - Generates contextual suggestions (or falls back to templates)
7. **Ghost Text Display** - Shows suggestion inline in editor

### User Interaction

- **Press Space** on an empty editor to accept the full suggestion
- **Type any character** to dismiss the ghost and type normally
- Suggestions are tracked for acceptance rate analytics

## Phase 4 Features

### Proactive Suggestions
Suggestions automatically appear after long responses (>200 chars).

Configuration:
```typescript
{
  enabled: true,
  minResponseLength: 200,
  minIdleTime: 2000,
  maxSuggestions: 3,
}
```

### Keyboard Shortcuts
- `1-5` - Select suggestion by number
- `↑↓` - Navigate suggestions
- `Enter` - Accept selected suggestion
- `Esc` - Dismiss suggestions

### Custom Templates
Create your own suggestion templates:

```typescript
import { TemplateManager } from '@0xkobold/pi-suggest';

const manager = new TemplateManager();
manager.addTemplate({
  name: "my-template",
  template: "Run tests for {module}",
  intent: ["IMPLEMENT"],
});
```

### Team Sharing
Share suggestion configurations across your team via JSON:

```bash
# Export team config
/suggest export > team-config.json

# Import team config
/suggest import < team-config.json
```

## Learning (Phase 3)

pi-suggest learns from your behavior to improve suggestions:

### What It Learns
- **Acceptance patterns**: Which suggestions you accept
- **Rejection patterns**: Which suggestions you dismiss  
- **Preferences**: Your stated preferences ("I prefer tests first")

### Privacy
Learning data is stored locally in `~/.0xkobold/pi-suggest/store.db`

## Architecture

Based on @guwidoe/pi-prompt-suggester:

- `GhostSuggestionEditor` extends `CustomEditor` from pi-coding-agent
- Overrides `handleInput()` to intercept Space key for acceptance
- Overrides `render()` to draw ghost text inline with cursor
- Uses `ctx.ui.setEditorComponent()` to install custom editor

### Core Modules

| Module | Purpose |
|--------|---------|
| `SessionAnalyzer` | Extracts topics, decisions, tasks from conversation |
| `IntentClassifier` | Classifies intent: DEBUG, IMPLEMENT, REFACTOR, etc. |
| `SuggestionGenerator` | Template-based suggestion generation |
| `LlmSuggester` | LLM-powered suggestion generation (Ollama) |
| `FileContextExtractor` | Extracts TODOs, FIXMEs, functions from code |
| `PatternRecognizer` | Detects workflow patterns |
| `SuggestionLearner` | Tracks accepted/dismissed, calculates rates |
| `PreferenceExtractor` | Extracts user preferences from conversation |
| `RejectionDetector` | Detects patterns in rejected suggestions |
| `SuggestionWidget` | Multi-suggestion UI widget |
| `ShortcutHandler` | Keyboard shortcut management |
| `TemplateManager` | Custom template management |
| `TeamConfig` | Team config sharing |
| `SuggestionStore` | SQLite persistence for tracking |

## Phases

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Core | ✅ Complete | Session analysis, intent classification, templates |
| Phase 2: Intelligence | ✅ Complete | LLM generation, file context, patterns |
| Phase 3: Learning | ✅ Complete | Learning from outcomes, rejection patterns |
| Phase 4: Polish | ✅ Complete | Proactive, shortcuts, templates, sharing |

## License

MIT
