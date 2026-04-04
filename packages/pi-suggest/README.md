# @0xkobold/pi-suggest

Ghost text prompt suggester for pi-coding-agent. Forked from @guwidoe/pi-prompt-suggester architecture.

## Features

- 👻 **Ghost Text** - Suggestions appear inline in the editor as ghost/dim text
- ⌨️ **Space to Accept** - Press Space on empty editor to accept suggestion
- ✏️ **Type to Override** - Any keypress hides ghost and types normally
- 🔄 **Auto-Generate** - Suggestions generated after each agent response
- 🤖 **LLM-Powered** - Uses Ollama for smart, contextual suggestions (Phase 2)
- 📝 **File Context** - Extracts TODOs/FIXMEs from code (Phase 2)
- 🔍 **Pattern Recognition** - Detects workflow patterns (Phase 2)

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

### How It Works

1. **Session Analysis** - Extracts topics, decisions, tasks from conversation
2. **Intent Classification** - Determines user intent (IMPLEMENT, DEBUG, REFACTOR, etc.)
3. **File Context** - Extracts TODOs/FIXMEs from recent files
4. **Pattern Recognition** - Detects workflow patterns (create→test→commit)
5. **LLM Generation** - Generates contextual suggestions (or falls back to templates)
6. **Ghost Text Display** - Shows suggestion inline in editor

### User Interaction

- **Press Space** on an empty editor to accept the full suggestion
- **Type any character** to dismiss the ghost and type normally
- Suggestions are tracked for acceptance rate analytics

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
| `SuggestionStore` | SQLite persistence for tracking |
| `SuggestionCache` | In-memory cache for quick access |

## Phases

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Core | ✅ Complete | Session analysis, intent classification, templates |
| Phase 2: Intelligence | ✅ Complete | LLM generation, file context, patterns |
| Phase 3: Learning | 🔜 Next | pi-learn integration for preference learning |
| Phase 4: Polish | 🔜 Future | Proactive suggestions, keyboard shortcuts |

## License

MIT
