# pi-suggest Phase 4: Polish Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add proactive suggestions, keyboard shortcuts, custom templates, and team sharing features.

**Architecture:** Extend the extension to auto-trigger suggestions, add multi-suggestion UI with keyboard navigation, support user-defined templates, and enable sharing via config file.

**Tech Stack:** TypeScript, Bun, pi-coding-agent types

---

## File Structure

```
packages/pi-suggest/
├── src/
│   ├── ui/
│   │   ├── widget.ts         # NEW - Multi-suggestion widget
│   │   └── shortcuts.ts       # NEW - Keyboard shortcuts handler
│   ├── config/
│   │   ├── templates.ts       # NEW - Custom template manager
│   │   └── sharing.ts         # NEW - Team config sharing
│   ├── generator/
│   │   ├── suggestion.ts      # (EXISTING - extend)
│   │   └── templates.ts       # (EXISTING - extend)
│   └── index.ts               # (EXISTING - integrate)
└── test/
    ├── ui/
    │   ├── widget.test.ts     # NEW
    │   └── shortcuts.test.ts  # NEW
    └── config/
        └── templates.test.ts  # NEW
```

---

## Task 1: Multi-Suggestion Widget

**Files:**
- Create: `packages/pi-suggest/src/ui/widget.ts`
- Create: `packages/pi-suggest/src/ui/shortcuts.ts`
- Test: `packages/pi-suggest/test/ui/widget.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/pi-suggest/test/ui/widget.test.ts
import { describe, test, expect } from "bun:test";
import { SuggestionWidget } from "../../dist/ui/widget.js";

describe("Suggestion Widget", () => {
  test("renders multiple suggestions", () => {
    const widget = new SuggestionWidget();
    
    const suggestions = [
      { text: "Run the tests", type: "action" as const },
      { text: "Add documentation", type: "offer" as const },
      { text: "Should we add tests?", type: "question" as const },
    ];
    
    widget.setSuggestions(suggestions);
    
    expect(widget.getSuggestions().length).toBe(3);
  });

  test("selects suggestion by index", () => {
    const widget = new SuggestionWidget();
    
    widget.setSuggestions([
      { text: "A", type: "action" as const },
      { text: "B", type: "action" as const },
      { text: "C", type: "action" as const },
    ]);
    
    widget.selectIndex(1);
    expect(widget.getSelectedText()).toBe("B");
  });

  test("returns undefined when no suggestions", () => {
    const widget = new SuggestionWidget();
    expect(widget.getSelectedText()).toBeUndefined();
  });

  test("clamps index to valid range", () => {
    const widget = new SuggestionWidget();
    
    widget.setSuggestions([
      { text: "A", type: "action" as const },
    ]);
    
    widget.selectIndex(10); // Out of bounds
    expect(widget.getSelectedIndex()).toBe(0);
    
    widget.selectIndex(-1); // Negative
    expect(widget.getSelectedIndex()).toBe(0);
  });

  test("renders suggestion with type indicator", () => {
    const widget = new SuggestionWidget();
    
    widget.setSuggestions([
      { text: "Test this", type: "action" as const },
      { text: "Should we?", type: "question" as const },
    ]);
    
    const rendered = widget.renderSuggestion(0);
    expect(rendered).toContain("1.");
    expect(rendered).toContain("Test this");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pi-suggest && bun test test/ui/widget.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/pi-suggest/src/ui/widget.ts

export interface SuggestionItem {
  text: string;
  type: "action" | "question" | "observation" | "offer";
  confidence?: number;
}

const TYPE_INDICATORS: Record<string, string> = {
  action: "⚡",
  question: "❓",
  observation: "💡",
  offer: "🙋",
};

export class SuggestionWidget {
  private suggestions: SuggestionItem[] = [];
  private selectedIndex = 0;

  setSuggestions(suggestions: SuggestionItem[]): void {
    this.suggestions = suggestions;
    this.selectedIndex = 0;
  }

  getSuggestions(): SuggestionItem[] {
    return this.suggestions;
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  getSelectedText(): string | undefined {
    return this.suggestions[this.selectedIndex]?.text;
  }

  selectIndex(index: number): void {
    if (this.suggestions.length === 0) {
      this.selectedIndex = 0;
      return;
    }
    
    // Clamp to valid range
    this.selectedIndex = Math.max(0, Math.min(index, this.suggestions.length - 1));
  }

  selectNext(): void {
    this.selectIndex(this.selectedIndex + 1);
  }

  selectPrevious(): void {
    this.selectIndex(this.selectedIndex - 1);
  }

  render(): string[] {
    if (this.suggestions.length === 0) {
      return [];
    }

    const lines: string[] = [];
    lines.push("👻 Suggestions:");
    
    for (let i = 0; i < this.suggestions.length; i++) {
      lines.push(this.renderSuggestion(i));
    }
    
    lines.push("");
    lines.push("↑↓ Navigate | Enter Select | Esc Close");
    
    return lines;
  }

  renderSuggestion(index: number): string {
    const suggestion = this.suggestions[index];
    if (!suggestion) return "";
    
    const indicator = TYPE_INDICATORS[suggestion.type] || "•";
    const prefix = index === this.selectedIndex ? "▶ " : "  ";
    const confidence = suggestion.confidence ? ` (${Math.round(suggestion.confidence * 100)}%)` : "";
    
    return `${prefix}${index + 1}. ${indicator} ${suggestion.text}${confidence}`;
  }
}

export default SuggestionWidget;
```

```typescript
// packages/pi-suggest/src/ui/shortcuts.ts

import { Key } from "@mariozechner/pi-tui";

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => void;
}

export class ShortcutHandler {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private enabled = true;

  constructor() {
    // Register default shortcuts
    this.register("1", "Select suggestion 1", () => this.emit("select", 0));
    this.register("2", "Select suggestion 2", () => this.emit("select", 1));
    this.register("3", "Select suggestion 3", () => this.emit("select", 2));
    this.register("4", "Select suggestion 4", () => this.emit("select", 3));
    this.register("5", "Select suggestion 5", () => this.emit("select", 4));
    this.register("up", "Previous suggestion", () => this.emit("previous"));
    this.register("down", "Next suggestion", () => this.emit("next"));
    this.register("enter", "Accept suggestion", () => this.emit("accept"));
    this.register("escape", "Dismiss suggestions", () => this.emit("dismiss"));
  }

  register(key: string, description: string, action: () => void): void {
    this.shortcuts.set(key.toLowerCase(), { key, description, action });
  }

  handle(key: string): boolean {
    if (!this.enabled) return false;
    
    const shortcut = this.shortcuts.get(key.toLowerCase());
    if (shortcut) {
      shortcut.action();
      return true;
    }
    
    return false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getShortcuts(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  private emit(event: string, data?: number): void {
    // Event emission handled by extension
    console.log(`[pi-suggest] Shortcut: ${event}`, data);
  }
}

export default ShortcutHandler;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/pi-suggest && bun run build && bun test test/ui/widget.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/pi-suggest
git add src/ui/widget.ts src/ui/shortcuts.ts test/ui/widget.test.ts
git commit -m "feat(pi-suggest): add multi-suggestion widget with keyboard shortcuts"
```

---

## Task 2: Proactive Suggestions

**Files:**
- Modify: `packages/pi-suggest/src/index.ts`
- Modify: `packages/pi-suggest/src/types.ts`

- [ ] **Step 1: Update types for proactive config**

```typescript
// packages/pi-suggest/src/types.ts - add
export interface ProactiveConfig {
  enabled: boolean;
  minResponseLength: number;  // Min chars before auto-suggest
  minIdleTime: number;        // Min ms of idle before suggestion
  showMultiple: boolean;       // Show 3-5 suggestions vs 1
  maxSuggestions: number;      // Max suggestions to show
}

export const DEFAULT_PROACTIVE_CONFIG: ProactiveConfig = {
  enabled: true,
  minResponseLength: 200,
  minIdleTime: 2000,
  showMultiple: true,
  maxSuggestions: 3,
};
```

- [ ] **Step 2: Update runtime state**

Add to RuntimeState:
```typescript
proactiveConfig: ProactiveConfig;
widget: SuggestionWidget;
shortcutHandler: ShortcutHandler;
lastResponseTime: number;
```

Initialize:
```typescript
proactiveConfig: DEFAULT_PROACTIVE_CONFIG,
widget: new SuggestionWidget(),
shortcutHandler: new ShortcutHandler(),
lastResponseTime: 0,
```

- [ ] **Step 3: Update generateSuggestion for multiple suggestions**

```typescript
// Update generateSuggestion to return multiple
async function generateSuggestions(messages: Message[]): Promise<SuggestionItem[]> {
  // ... existing logic ...
  
  const items: SuggestionItem[] = [];
  
  // Add template suggestions
  const templates = runtime.suggestionGenerator.generate(summary, intentResult.intent, runtime.proactiveConfig.maxSuggestions);
  for (const s of templates) {
    items.push({ text: s.text, type: s.type, confidence: s.confidence });
  }
  
  // Add LLM suggestions
  if (llmSuggestions.length > 0) {
    for (const s of llmSuggestions.slice(0, 2)) {
      items.push({ text: s.text, type: s.type, confidence: s.confidence });
    }
  }
  
  // Apply learning boosts
  return items.map(item => ({
    ...item,
    confidence: (item.confidence || 0.5) * runtime.learner.getSuggestionBoost(item.text),
  }));
}
```

- [ ] **Step 4: Add auto-trigger logic**

```typescript
// After agent_end handler
pi.on("agent_end", async (event: any, ctx: ExtensionContext) => {
  // ... existing code ...
  
  // Check if should auto-suggest
  if (runtime.proactiveConfig.enabled) {
    const responseLength = event.messages?.reduce(
      (acc: number, m: Message) => acc + (m.content?.length || 0), 0
    ) || 0;
    
    if (responseLength >= runtime.proactiveConfig.minResponseLength) {
      // Trigger suggestion after idle
      setTimeout(async () => {
        const suggestions = await generateSuggestions(event.messages);
        runtime.widget.setSuggestions(suggestions);
        
        if (suggestions.length > 0) {
          runtime.currentSuggestion = suggestions[0].text;
          runtime.suggestionRevision++;
        }
      }, runtime.proactiveConfig.minIdleTime);
    }
  }
});
```

- [ ] **Step 5: Build and test**

Run: `cd packages/pi-suggest && bun run build && bun test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd packages/pi-suggest
git add src/index.ts src/types.ts
git commit -m "feat(pi-suggest): add proactive suggestions with configurable triggers"
```

---

## Task 3: Custom Templates

**Files:**
- Create: `packages/pi-suggest/src/config/templates.ts`
- Test: `packages/pi-suggest/test/config/templates.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/pi-suggest/test/config/templates.test.ts
import { describe, test, expect } from "bun:test";
import { TemplateManager } from "../../dist/config/templates.js";

describe("Template Manager", () => {
  test("loads custom templates", () => {
    const manager = new TemplateManager();
    
    manager.addTemplate({
      name: "custom-test",
      template: "Run custom tests for {topic}",
      intent: ["IMPLEMENT"],
    });
    
    const templates = manager.getTemplates();
    expect(templates.some(t => t.name === "custom-test")).toBe(true);
  });

  test("renders template with variables", () => {
    const manager = new TemplateManager();
    
    manager.addTemplate({
      name: "greet",
      template: "Hello {name}!",
      intent: ["GENERAL"],
    });
    
    const rendered = manager.renderTemplate("greet", { name: "World" });
    expect(rendered).toBe("Hello World!");
  });

  test("returns undefined for missing template", () => {
    const manager = new TemplateManager();
    const rendered = manager.renderTemplate("nonexistent", {});
    expect(rendered).toBeUndefined();
  });

  test("removes template", () => {
    const manager = new TemplateManager();
    
    manager.addTemplate({
      name: "temp",
      template: "Temporary",
      intent: ["GENERAL"],
    });
    
    manager.removeTemplate("temp");
    expect(manager.getTemplates().some(t => t.name === "temp")).toBe(false);
  });

  test("loads from JSON config", () => {
    const manager = new TemplateManager();
    
    const config = [
      { name: "test-first", template: "Write tests first", intent: ["IMPLEMENT"] },
      { name: "commit-msg", template: "Commit: {message}", intent: ["GENERAL"] },
    ];
    
    manager.loadFromConfig(config);
    expect(manager.getTemplates().length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2-3: Write implementation**

```typescript
// packages/pi-suggest/src/config/templates.ts

export interface CustomTemplate {
  name: string;
  template: string;
  intent: string[];
  type?: "action" | "question" | "observation" | "offer";
}

export class TemplateManager {
  private templates: Map<string, CustomTemplate> = new Map();

  addTemplate(template: CustomTemplate): void {
    this.templates.set(template.name, template);
  }

  removeTemplate(name: string): boolean {
    return this.templates.delete(name);
  }

  getTemplate(name: string): CustomTemplate | undefined {
    return this.templates.get(name);
  }

  getTemplates(): CustomTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplatesForIntent(intent: string): CustomTemplate[] {
    return this.getTemplates().filter(t => 
      t.intent.includes(intent) || t.intent.includes("GENERAL")
    );
  }

  renderTemplate(name: string, variables: Record<string, string>): string | undefined {
    const template = this.getTemplate(name);
    if (!template) return undefined;

    let rendered = template.template;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    }
    return rendered;
  }

  loadFromConfig(config: CustomTemplate[]): void {
    for (const template of config) {
      this.addTemplate(template);
    }
  }

  exportToConfig(): CustomTemplate[] {
    return this.getTemplates();
  }
}

export default TemplateManager;
```

- [ ] **Step 4-5: Run tests and commit**

Run: `cd packages/pi-suggest && bun run build && bun test test/config/templates.test.ts`
Expected: PASS

```bash
cd packages/pi-suggest
git add src/config/templates.ts test/config/templates.test.ts
git commit -m "feat(pi-suggest): add custom template manager"
```

---

## Task 4: Team Config Sharing

**Files:**
- Create: `packages/pi-suggest/src/config/sharing.ts`
- Test: `packages/pi-suggest/test/config/sharing.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/pi-suggest/test/config/sharing.test.ts
import { describe, test, expect } from "bun:test";
import { TeamConfig } from "../../dist/config/sharing.js";

describe("Team Config", () => {
  test("creates team config", () => {
    const config = new TeamConfig("my-team");
    expect(config.teamId).toBe("my-team");
  });

  test("adds shared templates", () => {
    const config = new TeamConfig("test-team");
    
    config.addSharedTemplate({
      name: "team-test",
      template: "Run team tests",
      intent: ["IMPLEMENT"],
    });
    
    expect(config.getSharedTemplates().length).toBe(1);
  });

  test("exports config as JSON", () => {
    const config = new TeamConfig("export-team");
    
    config.addSharedTemplate({
      name: "export-test",
      template: "Export this",
      intent: ["GENERAL"],
    });
    
    const json = config.toJSON();
    expect(json).toContain("export-team");
    expect(json).toContain("export-test");
  });

  test("loads config from JSON", () => {
    const config = new TeamConfig("import-team");
    
    const json = JSON.stringify({
      teamId: "import-team",
      templates: [
        { name: "import-test", template: "Import this", intent: ["GENERAL"] },
      ],
    });
    
    config.fromJSON(json);
    expect(config.getSharedTemplates().length).toBe(1);
  });
});
```

- [ ] **Step 2-3: Write implementation**

```typescript
// packages/pi-suggest/src/config/sharing.ts

import type { CustomTemplate } from "./templates.js";

export interface TeamConfigData {
  teamId: string;
  templates: CustomTemplate[];
  preferences?: {
    defaultIntent?: string;
    maxSuggestions?: number;
  };
  patterns?: string[];  // Shared rejection patterns
}

export class TeamConfig {
  private teamId: string;
  private sharedTemplates: CustomTemplate[] = [];
  private preferences: TeamConfigData["preferences"] = {};
  private patterns: string[] = [];

  constructor(teamId: string) {
    this.teamId = teamId;
  }

  addSharedTemplate(template: CustomTemplate): void {
    this.sharedTemplates.push(template);
  }

  removeSharedTemplate(name: string): boolean {
    const index = this.sharedTemplates.findIndex(t => t.name === name);
    if (index >= 0) {
      this.sharedTemplates.splice(index, 1);
      return true;
    }
    return false;
  }

  getSharedTemplates(): CustomTemplate[] {
    return [...this.sharedTemplates];
  }

  setPreference(key: string, value: unknown): void {
    this.preferences = { ...this.preferences, [key]: value };
  }

  getPreference<T>(key: string): T | undefined {
    return this.preferences?.[key as keyof typeof this.preferences] as T | undefined;
  }

  addPattern(pattern: string): void {
    if (!this.patterns.includes(pattern)) {
      this.patterns.push(pattern);
    }
  }

  getPatterns(): string[] {
    return [...this.patterns];
  }

  toJSON(): string {
    const data: TeamConfigData = {
      teamId: this.teamId,
      templates: this.sharedTemplates,
      preferences: this.preferences,
      patterns: this.patterns,
    };
    return JSON.stringify(data, null, 2);
  }

  fromJSON(json: string): void {
    try {
      const data = JSON.parse(json) as TeamConfigData;
      this.teamId = data.teamId;
      this.sharedTemplates = data.templates || [];
      this.preferences = data.preferences || {};
      this.patterns = data.patterns || [];
    } catch (error) {
      console.error("[pi-suggest] Failed to parse team config:", error);
    }
  }

  getTeamId(): string {
    return this.teamId;
  }
}

export default TeamConfig;
```

- [ ] **Step 4-5: Run tests and commit**

Run: `cd packages/pi-suggest && bun run build && bun test test/config/sharing.test.ts`
Expected: PASS

```bash
cd packages/pi-suggest
git add src/config/sharing.ts test/config/sharing.test.ts
git commit -m "feat(pi-suggest): add team config sharing"
```

---

## Task 5: Update Documentation

**Files:**
- Modify: `packages/pi-suggest/SPEC.md`
- Modify: `packages/pi-suggest/README.md`

- [ ] **Step 1: Update SPEC.md Phase 4 checklist**

```markdown
### Phase 4: Polish
- [x] Proactive suggestions - Auto-show after long responses
- [x] Keyboard shortcuts - 1-5 to select, arrows to navigate
- [x] Custom templates - User-defined suggestion templates
- [x] Team sharing - Share configs across team
```

- [ ] **Step 2: Update README with new features**

Add section:
```markdown
## Phase 4 Features

### Proactive Suggestions
Suggestions automatically appear after long responses.

Configuration:
```typescript
{
  enabled: true,
  minResponseLength: 200,  // Min chars before auto-suggest
  minIdleTime: 2000,       // Ms to wait before showing
  maxSuggestions: 3,        // How many to show
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
Share suggestion configurations across your team:

```bash
# Export team config
/suggest export-team > team-config.json

# Import team config
/suggest import-team < team-config.json
```
```

- [ ] **Step 3: Commit**

```bash
cd packages/pi-suggest
git add SPEC.md README.md
git commit -m "docs(pi-suggest): update SPEC and README for Phase 4"
```

---

## Summary

| Task | Description | New Files |
|------|-------------|-----------|
| 1 | Multi-Suggestion Widget | `src/ui/widget.ts`, `src/ui/shortcuts.ts` |
| 2 | Proactive Suggestions | Modified `src/index.ts`, `src/types.ts` |
| 3 | Custom Templates | `src/config/templates.ts` |
| 4 | Team Sharing | `src/config/sharing.ts` |
| 5 | Documentation | Updated `SPEC.md`, `README.md` |

**Phase 4 Features:**
- ✅ Proactive suggestions (auto-show after long responses)
- ✅ Keyboard shortcuts (1-5, arrows, Enter, Esc)
- ✅ Multi-suggestion widget
- ✅ Custom template manager
- ✅ Team config sharing

**pi-suggest Complete! 🎉**
