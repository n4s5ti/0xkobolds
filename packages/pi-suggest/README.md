# @0xkobold/pi-suggest

Ghost text prompt suggester for pi-coding-agent. Forked from @guwidoe/pi-prompt-suggester architecture.

## Features

- 👻 **Ghost Text** - Suggestions appear inline in the editor as ghost/dim text
- ⌨️ **Space to Accept** - Press Space on empty editor to accept suggestion
- ✏️ **Type to Override** - Any keypress hides ghost and types normally
- 🔄 **Auto-Generate** - Suggestions generated after each agent response

## Install

```bash
# Global install
pi install npm:@0xkobold/pi-suggest

# Project-local install
pi install -l npm:@0xkobold/pi-suggest
```

## Usage

After an assistant completion, the extension suggests the next user prompt as ghost text in the editor.

### Commands

- `/suggest status` - Show current suggestion
- `/suggest ghost` - Show current ghost text

### How It Works

1. After agent responds, a suggestion appears as gray/dim text in the empty input field
2. **Press Space** on an empty editor to accept the full suggestion
3. **Type any character** to dismiss the ghost and type normally

## Architecture

Based on @guwidoe/pi-prompt-suggester:

- `GhostSuggestionEditor` extends `CustomEditor` from pi-coding-agent
- Overrides `handleInput()` to intercept Space key for acceptance
- Overrides `render()` to draw ghost text inline with cursor
- Uses `ctx.ui.setEditorComponent()` to install custom editor

## License

MIT
