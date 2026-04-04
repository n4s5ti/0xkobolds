# pi-suggest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement full Phase 1 of pi-suggest - context-aware suggestion engine with session analysis, intent classification, template-based suggestions, and learning from user feedback.

**Architecture:** Modular architecture with separate concerns: `SessionAnalyzer`, `IntentClassifier`, `ContextExtractor`, `SuggestionGenerator`, and `SuggestionStore`. Ghost text UI handled by existing `GhostSuggestionEditor`. Uses bun:sqlite for persistence.

**Tech Stack:** TypeScript, bun:sqlite, pi-coding-agent ExtensionAPI, @sinclair/typebox

---

## File Structure

```
packages/pi-suggest/
├── src/
│   ├── index.ts              # Extension entry point (EXISTING - modify)
│   ├── types.ts              # Type definitions (EXISTING - extend)
│   ├── core/
│   │   ├── session.ts        # Session history analyzer
│   │   ├── intent.ts         # User intent classifier
│   │   ├── context.ts        # Current context extractor
│   │   └── inferrer.ts       # Heuristic inferrer (from index.ts)
│   ├── generator/
│   │   ├── suggestion.ts      # Suggestion generator (refactored)
│   │   └── templates.ts      # Suggestion templates
│   ├── store/
│   │   ├── sqlite.ts         # SQLite persistence
│   │   └── cache.ts          # In-memory cache
│   ├── ui/
│   │   └── widget.ts         # Suggestion widget (future)
│   └── commands.ts           # CLI commands (extend existing)
├── test/
│   ├── suggest.test.ts       # (EXISTING - extend)
│   ├── session.test.ts        # Session analyzer tests
│   ├── intent.test.ts         # Intent classifier tests
│   └── generator.test.ts      # Suggestion generator tests
├── dist/                     # (generated)
├── package.json               # (EXISTING)
├── tsconfig.json             # (EXISTING)
└── README.md                 # (EXISTING)
```

---

## Task 1: Create Core Module - Session Analyzer

**Files:**
- Create: `packages/pi-suggest/src/core/session.ts`
- Modify: `packages/pi-suggest/src/index.ts:1-10` (add imports)
- Test: `packages/pi-suggest/test/core/session.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/pi-suggest/test/core/session.test.ts
import { describe, test, expect } from "bun:test";
import { SessionAnalyzer } from "../src/core/session.js";

describe("Session Analyzer", () => {
  test("extracts topics from messages", () => {
    const analyzer = new SessionAnalyzer();
    
    const messages = [
      { role: "user", content: "Fix the authentication bug" },
      { role: "assistant", content: "I'll fix the auth issue" },
      { role: "user", content: "Create a new component" },
    ];
    
    const topics = analyzer.extractTopics(messages);
    expect(topics).toContain("authentication");
    expect(topics).toContain("component");
  });

  test("detects decisions made", () => {
    const analyzer = new SessionAnalyzer();
    
    const messages = [
      { role: "user", content: "Let's use TypeScript for this" },
      { role: "assistant", content: "Agreed, TypeScript is a good choice" },
    ];
    
    const decisions = analyzer.detectDecisions(messages);
    expect(decisions.length).toBeGreaterThan(0);
  });

  test("tracks tasks in progress", () => {
    const analyzer = new SessionAnalyzer();
    
    const messages = [
      { role: "user", content: "I need to implement user login" },
      { role: "assistant", content: "Starting the login implementation" },
    ];
    
    const tasks = analyzer.getTasksInProgress(messages);
    expect(tasks).toContain("user login");
  });

  test("summarizes session", () => {
    const analyzer = new SessionAnalyzer();
    
    const messages = [
      { role: "user", content: "Fix the bug" },
      { role: "assistant", content: "Fixed" },
      { role: "user", content: "Run tests" },
    ];
    
    const summary = analyzer.summarize(messages);
    expect(summary).toHaveProperty("topics");
    expect(summary).toHaveProperty("decisions");
    expect(summary).toHaveProperty("tasks_in_progress");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pi-suggest && bun test test/core/session.test.ts`
Expected: FAIL with "Cannot find module '../src/core/session.js'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/pi-suggest/src/core/session.ts
import type { Message } from "../types.js";

export interface SessionSummary {
  topics: string[];
  decisions: string[];
  tasks_in_progress: string[];
  blockers: string[];
  recent_files: string[];
  intent: string;
  last_action: string;
}

export class SessionAnalyzer {
  private decisionPatterns = [
    /\b(agreed|decided|let's|we should|will use|going with|chose|selected)\b/i,
    /\b(use|using|implement with)\s+(typescript|python|react|vue|postgres|mongodb|redis)/i,
  ];

  private taskPatterns = [
    /\b(need to|should|have to|must|going to|planning to)\s+(\w+(?:\s+\w+){0,3})/gi,
    /\b(implement|create|build|add|fix|update|remove|delete|refactor)\s+(?:the\s+)?(\w+(?:\s+\w+){0,3})/gi,
  ];

  private blockerPatterns = [
    /\b(error|bug|issue|problem|failed|failing|crash|exception|broken)\b/i,
    /\b(can't|cannot|unable to|stuck|blocked|don't know how)\b/i,
    /\?$/m,
  ];

  private filePatterns = [
    /(?:\/[\w\-\.]+)+\.[a-z]{2,6}(?:\:\d+)?|\b(?:src|lib|app|components|pages|hooks|utils)\/[\w\-\.\/]+/i,
  ];

  extractTopics(messages: Message[]): string[] {
    const topics = new Set<string>();
    const topicKeywords = [
      "auth", "login", "user", "database", "api", "config", "test",
      "bug", "error", "component", "function", "class", "deploy",
      "build", "install", "setup", "migration", "model", "schema",
    ];

    const allText = messages.map(m => m.content).join(" ").toLowerCase();
    
    for (const keyword of topicKeywords) {
      if (allText.includes(keyword)) {
        topics.add(keyword);
      }
    }

    return Array.from(topics);
  }

  detectDecisions(messages: Message[]): string[] {
    const decisions: string[] = [];
    
    for (const msg of messages) {
      const content = msg.content;
      
      for (const pattern of this.decisionPatterns) {
        const match = content.match(pattern);
        if (match) {
          decisions.push(match[0]);
        }
      }
    }

    return decisions;
  }

  getTasksInProgress(messages: Message[]): string[] {
    const tasks: string[] = [];
    
    // Get last user message and assistant response
    const lastUser = messages.filter(m => m.role === "user").pop();
    const lastAssistant = messages.filter(m => m.role === "assistant").pop();
    
    if (lastUser) {
      for (const pattern of this.taskPatterns) {
        let match;
        while ((match = pattern.exec(lastUser.content)) !== null) {
          tasks.push(match[0]);
        }
      }
    }

    // Check if assistant is working on something
    if (lastAssistant) {
      const workMatch = lastAssistant.content.match(/\b(writing|implementing|creating|fixing|building|adding|updating|working on)\s+(?:the\s+)?(\w+(?:\s+\w+){0,3})/i);
      if (workMatch) {
        tasks.push(workMatch[0]);
      }
    }

    return [...new Set(tasks)];
  }

  getBlockers(messages: Message[]): string[] {
    const blockers: string[] = [];
    
    for (const msg of messages) {
      for (const pattern of this.blockerPatterns) {
        if (pattern.test(msg.content)) {
          blockers.push(msg.content.slice(0, 100));
        }
      }
    }

    return blockers;
  }

  getRecentFiles(messages: Message[]): string[] {
    const files = new Set<string>();
    
    for (const msg of messages) {
      const matches = msg.content.match(this.filePatterns);
      if (matches) {
        for (const file of matches) {
          files.add(file);
        }
      }
    }

    return Array.from(files);
  }

  summarize(messages: Message[]): SessionSummary {
    return {
      topics: this.extractTopics(messages),
      decisions: this.detectDecisions(messages),
      tasks_in_progress: this.getTasksInProgress(messages),
      blockers: this.getBlockers(messages),
      recent_files: this.getRecentFiles(messages),
      intent: "unknown",
      last_action: this.getLastAction(messages),
    };
  }

  private getLastAction(messages: Message[]): string {
    const lastAssistant = messages.filter(m => m.role === "assistant").pop();
    if (!lastAssistant) return "awaiting_user";
    
    const content = lastAssistant.content.toLowerCase();
    
    if (content.includes("created") || content.includes("generated")) return "created";
    if (content.includes("fixed") || content.includes("resolved")) return "fixed";
    if (content.includes("updated") || content.includes("modified")) return "updated";
    if (content.includes("deleted") || content.includes("removed")) return "deleted";
    if (content.includes("error") || content.includes("failed")) return "error";
    if (content.includes("running") || content.includes("executing")) return "running";
    
    return "completed";
  }
}

export default SessionAnalyzer;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/pi-suggest && bun test test/core/session.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/pi-suggest
git add src/core/session.ts test/core/session.test.ts
git commit -m "feat(pi-suggest): add SessionAnalyzer for conversation analysis"
```

---

## Task 2: Create Core Module - Intent Classifier

**Files:**
- Create: `packages/pi-suggest/src/core/intent.ts`
- Test: `packages/pi-suggest/test/core/intent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/pi-suggest/test/core/intent.test.ts
import { describe, test, expect } from "bun:test";
import { IntentClassifier, IntentType } from "../src/core/intent.js";

describe("Intent Classifier", () => {
  let classifier: IntentClassifier;

  beforeEach(() => {
    classifier = new IntentClassifier();
  });

  test("classifies DEBUG intent", () => {
    const intent = classifier.classify("Fix the error in authentication");
    expect(intent).toBe(IntentType.DEBUG);
  });

  test("classifies IMPLEMENT intent", () => {
    const intent = classifier.classify("Create a new user service");
    expect(intent).toBe(IntentType.IMPLEMENT);
  });

  test("classifies REFACTOR intent", () => {
    const intent = classifier.classify("Refactor this to use composition API");
    expect(intent).toBe(IntentType.REFACTOR);
  });

  test("classifies RESEARCH intent", () => {
    const intent = classifier.classify("How does this library work?");
    expect(intent).toBe(IntentType.RESEARCH);
  });

  test("classifies REVIEW intent", () => {
    const intent = classifier.classify("Review this code for security issues");
    expect(intent).toBe(IntentType.REVIEW);
  });

  test("classifies PLAN intent", () => {
    const intent = classifier.classify("Design a new architecture for the API");
    expect(intent).toBe(IntentType.PLAN);
  });

  test("returns confidence score", () => {
    const result = classifier.classifyWithConfidence("Fix the bug");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pi-suggest && bun test test/core/intent.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/pi-suggest/src/core/intent.ts

export enum IntentType {
  IMPLEMENT = "IMPLEMENT",
  DEBUG = "DEBUG",
  REFACTOR = "REFACTOR",
  RESEARCH = "RESEARCH",
  PLAN = "PLAN",
  REVIEW = "REVIEW",
  GENERAL = "GENERAL",
}

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  reason: string;
}

interface IntentPattern {
  type: IntentType;
  patterns: RegExp[];
  weight: number;
}

export class IntentClassifier {
  private patterns: IntentPattern[] = [
    {
      type: IntentType.DEBUG,
      patterns: [
        /\b(fix|error|bug|issue|problem|broken|fail|crash|exception|not working|doesn't work)\b/i,
        /\bdebug|debugging|troubleshoot/i,
      ],
      weight: 1.0,
    },
    {
      type: IntentType.IMPLEMENT,
      patterns: [
        /\b(create|implement|add|build|write|make|develop|new)\b/i,
        /\bfunction|class|component|service|module|api|endpoint/i,
      ],
      weight: 0.9,
    },
    {
      type: IntentType.REFACTOR,
      patterns: [
        /\b(refactor|restructure|reorganize|rewrite|optimize|improve|clean up)\b/i,
        /\btechnical debt|code quality|best practice/i,
      ],
      weight: 0.85,
    },
    {
      type: IntentType.RESEARCH,
      patterns: [
        /\b(how|what|why|explain|understand|learn|find out|investigate)\b/i,
        /\b(how does|what is|can you explain|looking for documentation)\b/i,
        /\?$/,
      ],
      weight: 0.8,
    },
    {
      type: IntentType.PLAN,
      patterns: [
        /\b(design|architect|plan|architecture|structure|blueprint)\b/i,
        /\b(should we|let's plan|roadmap|milestone)\b/i,
      ],
      weight: 0.85,
    },
    {
      type: IntentType.REVIEW,
      patterns: [
        /\b(review|check|audit|inspect|validate|verify)\b/i,
        /\b(security|performance|quality|accessibility)\b/i,
      ],
      weight: 0.8,
    },
  ];

  classify(text: string): IntentType {
    return this.classifyWithConfidence(text).intent;
  }

  classifyWithConfidence(text: string): IntentResult {
    const scores: Map<IntentType, number> = new Map();
    const lowerText = text.toLowerCase();
    
    // Initialize scores
    for (const pattern of this.patterns) {
      scores.set(pattern.type, 0);
    }

    // Calculate match scores
    for (const pattern of this.patterns) {
      let matchCount = 0;
      for (const regex of pattern.patterns) {
        if (regex.test(lowerText)) {
          matchCount++;
        }
      }
      
      if (matchCount > 0) {
        const currentScore = scores.get(pattern.type) || 0;
        scores.set(pattern.type, currentScore + (pattern.weight * matchCount));
      }
    }

    // Find best match
    let bestIntent = IntentType.GENERAL;
    let bestScore = 0;

    for (const [intent, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    // Normalize confidence
    const confidence = Math.min(bestScore / 2, 1);
    
    // If no clear intent, default to GENERAL
    if (bestScore < 0.5) {
      return {
        intent: IntentType.GENERAL,
        confidence: 0.5,
        reason: "No clear intent pattern detected",
      };
    }

    return {
      intent: bestIntent,
      confidence,
      reason: `Matched ${bestIntent} patterns`,
    };
  }
}

export default IntentClassifier;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/pi-suggest && bun test test/core/intent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/pi-suggest
git add src/core/intent.ts test/core/intent.test.ts
git commit -m "feat(pi-suggest): add IntentClassifier for classifying user intent"
```

---

## Task 3: Create Suggestion Generator with Templates

**Files:**
- Create: `packages/pi-suggest/src/generator/templates.ts`
- Create: `packages/pi-suggest/src/generator/suggestion.ts`
- Test: `packages/pi-suggest/test/generator/suggestion.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/pi-suggest/test/generator/suggestion.test.ts
import { describe, test, expect } from "bun:test";
import { SuggestionGenerator } from "../src/generator/suggestion.js";
import { IntentType } from "../src/core/intent.js";
import type { SessionSummary } from "../src/core/session.js";

describe("Suggestion Generator", () => {
  let generator: SuggestionGenerator;

  beforeEach(() => {
    generator = new SuggestionGenerator();
  });

  test("generates suggestions for DEBUG intent", () => {
    const summary: SessionSummary = {
      topics: ["authentication", "login"],
      decisions: [],
      tasks_in_progress: ["fix login bug"],
      blockers: ["error in auth flow"],
      recent_files: ["/src/auth/login.ts"],
      intent: "DEBUG",
      last_action: "error",
    };

    const suggestions = generator.generate(summary, IntentType.DEBUG);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toHaveProperty("text");
    expect(suggestions[0]).toHaveProperty("type");
  });

  test("generates suggestions for IMPLEMENT intent", () => {
    const summary: SessionSummary = {
      topics: ["user", "service"],
      decisions: [],
      tasks_in_progress: ["create user service"],
      blockers: [],
      recent_files: [],
      intent: "IMPLEMENT",
      last_action: "completed",
    };

    const suggestions = generator.generate(summary, IntentType.IMPLEMENT);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  test("returns multiple suggestion types", () => {
    const summary: SessionSummary = {
      topics: ["api", "endpoint"],
      decisions: [],
      tasks_in_progress: [],
      blockers: [],
      recent_files: [],
      intent: "GENERAL",
      last_action: "completed",
    };

    const suggestions = generator.generate(summary, IntentType.GENERAL);
    const types = suggestions.map(s => s.type);
    
    // Should have variety of types
    expect(types).toContain("action");
    expect(types).toContain("question");
  });

  test("includes context in suggestions", () => {
    const summary: SessionSummary = {
      topics: ["database", "migration"],
      decisions: ["use postgres"],
      tasks_in_progress: ["run migration"],
      blockers: [],
      recent_files: ["/db/schema.sql"],
      intent: "IMPLEMENT",
      last_action: "completed",
    };

    const suggestions = generator.generate(summary, IntentType.IMPLEMENT);
    const hasContext = suggestions.some(s => 
      s.context && 
      (s.context.topic || s.context.file_path)
    );
    expect(hasContext).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pi-suggest && bun test test/generator/suggestion.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/pi-suggest/src/generator/templates.ts

export type SuggestionType = "action" | "question" | "observation" | "offer";

export interface SuggestionTemplate {
  type: SuggestionType;
  template: string | ((context: TemplateContext) => string);
  intent: string[];
  minConfidence?: number;
}

export interface TemplateContext {
  topic?: string;
  file?: string;
  decision?: string;
  task?: string;
  blocker?: string;
}

// Template definitions organized by intent and type
export const TEMPLATES: SuggestionTemplate[] = [
  // DEBUG Intent
  {
    type: "action",
    template: "Run the tests to verify the fix works",
    intent: ["DEBUG"],
  },
  {
    type: "question",
    template: "Should we add error handling for edge cases?",
    intent: ["DEBUG", "IMPLEMENT"],
  },
  {
    type: "action",
    template: (ctx) => `Check ${ctx.file || "the file"} with verbose logging`,
    intent: ["DEBUG"],
  },
  {
    type: "action",
    template: "Add a breakpoint to see where it fails",
    intent: ["DEBUG"],
  },
  {
    type: "action",
    template: "Run with debug flags to see the full error",
    intent: ["DEBUG"],
  },
  {
    type: "question",
    template: "Did this ever work, or is this a new regression?",
    intent: ["DEBUG"],
  },

  // IMPLEMENT Intent
  {
    type: "action",
    template: "Test the implementation",
    intent: ["IMPLEMENT"],
  },
  {
    type: "action",
    template: "Run tests for the new implementation",
    intent: ["IMPLEMENT"],
  },
  {
    type: "offer",
    template: "I can add input validation if you want",
    intent: ["IMPLEMENT"],
  },
  {
    type: "offer",
    template: "Should I add error handling too?",
    intent: ["IMPLEMENT"],
  },
  {
    type: "question",
    template: (ctx) => `Should we extract this to a ${ctx.topic || "service"} class?`,
    intent: ["IMPLEMENT"],
  },
  {
    type: "observation",
    template: (ctx) => `This ${ctx.topic || "function"} is getting complex, consider splitting it`,
    intent: ["IMPLEMENT", "REFACTOR"],
  },

  // REFACTOR Intent
  {
    type: "offer",
    template: "I can add documentation while we're here",
    intent: ["REFACTOR"],
  },
  {
    type: "action",
    template: "Run tests after refactoring to ensure nothing broke",
    intent: ["REFACTOR"],
  },
  {
    type: "question",
    template: "Should we update the tests too?",
    intent: ["REFACTOR"],
  },

  // RESEARCH Intent
  {
    type: "action",
    template: "Let me search for examples",
    intent: ["RESEARCH"],
  },
  {
    type: "question",
    template: "Would you like me to find the official documentation?",
    intent: ["RESEARCH"],
  },

  // PLAN Intent
  {
    type: "action",
    template: "Add this to the project backlog",
    intent: ["PLAN"],
  },
  {
    type: "question",
    template: "Should we write an ADR for this decision?",
    intent: ["PLAN"],
  },
  {
    type: "action",
    template: "Break this into smaller tasks first",
    intent: ["PLAN"],
  },

  // REVIEW Intent
  {
    type: "action",
    template: "Make any necessary fixes based on the review",
    intent: ["REVIEW"],
  },
  {
    type: "question",
    template: "Any security concerns to address?",
    intent: ["REVIEW"],
  },

  // GENERAL Intent (default)
  {
    type: "action",
    template: "Continue with the next step",
    intent: ["GENERAL"],
  },
  {
    type: "action",
    template: "Run the tests",
    intent: ["GENERAL"],
  },
  {
    type: "question",
    template: "What would you like to do next?",
    intent: ["GENERAL"],
  },
  {
    type: "action",
    template: "Commit the changes",
    intent: ["GENERAL"],
    minConfidence: 0.8,
  },
];

export default TEMPLATES;
```

```typescript
// packages/pi-suggest/src/generator/suggestion.ts

import { IntentType } from "../core/intent.js";
import { SessionSummary } from "../core/session.js";
import { TEMPLATES, type SuggestionType, type TemplateContext } from "./templates.js";

export interface Suggestion {
  id: string;
  type: SuggestionType;
  text: string;
  confidence: number;
  reason: string;
  context: {
    based_on: "template" | "session" | "file" | "pattern" | "preference";
    topic?: string;
    file_path?: string;
    pattern?: string;
    decision?: string;
  };
}

export class SuggestionGenerator {
  private templateContextCache: Map<string, TemplateContext> = new Map();

  generate(summary: SessionSummary, intent: IntentType, maxSuggestions = 3): Suggestion[] {
    const context = this.buildContext(summary);
    const relevantTemplates = TEMPLATES.filter(t => 
      t.intent.includes(intent) || t.intent.includes("GENERAL")
    );

    // Shuffle templates for variety
    const shuffled = this.shuffle([...relevantTemplates]);
    
    // Generate suggestions up to maxSuggestions
    const suggestions: Suggestion[] = [];
    
    for (const template of shuffled) {
      if (suggestions.length >= maxSuggestions) break;
      
      const text = this.renderTemplate(template, context);
      if (!text) continue;

      const suggestion: Suggestion = {
        id: this.generateId(),
        type: template.type,
        text,
        confidence: this.calculateConfidence(template, summary),
        reason: `Based on ${intent} intent and ${context.topic || "general"} context`,
        context: {
          based_on: "template",
          topic: context.topic,
          file_path: context.file,
          decision: context.decision,
        },
      };

      suggestions.push(suggestion);
    }

    // Sort by confidence
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  generateSingle(summary: SessionSummary, intent: IntentType): string | undefined {
    const suggestions = this.generate(summary, intent, 1);
    return suggestions[0]?.text;
  }

  private buildContext(summary: SessionSummary): TemplateContext {
    return {
      topic: summary.topics[0],
      file: summary.recent_files[0],
      decision: summary.decisions[0],
      task: summary.tasks_in_progress[0],
      blocker: summary.blockers[0],
    };
  }

  private renderTemplate(template: typeof TEMPLATES[0], context: TemplateContext): string | undefined {
    const { template: tpl } = template;
    
    if (typeof tpl === "string") {
      return tpl;
    }
    
    return tpl(context);
  }

  private calculateConfidence(
    template: typeof TEMPLATES[0],
    summary: SessionSummary
  ): number {
    let confidence = 0.6; // Base confidence

    // Boost if topic matches
    if (template.intent.includes(summary.intent)) {
      confidence += 0.2;
    }

    // Boost if context is rich
    if (summary.topics.length > 0) confidence += 0.1;
    if (summary.recent_files.length > 0) confidence += 0.05;
    if (summary.decisions.length > 0) confidence += 0.05;

    // Cap at 1.0
    return Math.min(confidence, 1);
  }

  private generateId(): string {
    return `suggest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

export default SuggestionGenerator;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/pi-suggest && bun test test/generator/suggestion.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/pi-suggest
git add src/generator/templates.ts src/generator/suggestion.ts test/generator/suggestion.test.ts
git commit -m "feat(pi-suggest): add SuggestionGenerator with templates"
```

---

## Task 4: Create Persistence Layer - SQLite Store

**Files:**
- Create: `packages/pi-suggest/src/store/sqlite.ts`
- Create: `packages/pi-suggest/src/store/cache.ts`
- Test: `packages/pi-suggest/test/store/sqlite.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/pi-suggest/test/store/sqlite.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SuggestionStore } from "../src/store/sqlite.js";
import type { Suggestion } from "../src/generator/suggestion.js";
import * as path from "node:path";
import * as os from "node:os";

const TEST_DB_PATH = path.join(os.tmpdir(), `pi-suggest-test-${Date.now()}.db`);

describe("Suggestion Store", () => {
  let store: SuggestionStore;

  beforeEach(async () => {
    store = new SuggestionStore(TEST_DB_PATH);
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    // Clean up test db
    const { unlinkSync } = await import("node:fs");
    try { unlinkSync(TEST_DB_PATH); } catch {}
  });

  test("initializes database", async () => {
    const result = await store.getStats();
    expect(result).toHaveProperty("total_suggestions");
    expect(result).toHaveProperty("accepted_count");
  });

  test("records accepted suggestion", async () => {
    const suggestion: Suggestion = {
      id: "test_1",
      type: "action",
      text: "Run the tests",
      confidence: 0.9,
      reason: "test",
      context: { based_on: "template" },
    };

    await store.recordSuggestion(suggestion);
    await store.recordOutcome(suggestion.id, "accepted");

    const stats = await store.getStats();
    expect(stats.accepted_count).toBe(1);
  });

  test("records dismissed suggestion", async () => {
    const suggestion: Suggestion = {
      id: "test_2",
      type: "question",
      text: "Should we add tests?",
      confidence: 0.7,
      reason: "test",
      context: { based_on: "template" },
    };

    await store.recordSuggestion(suggestion);
    await store.recordOutcome(suggestion.id, "dismissed");

    const stats = await store.getStats();
    expect(stats.dismissed_count).toBe(1);
  });

  test("calculates acceptance rate", async () => {
    // Add mix of accepted/dismissed
    for (let i = 0; i < 5; i++) {
      const s: Suggestion = {
        id: `test_${i}`,
        type: "action",
        text: `Suggestion ${i}`,
        confidence: 0.8,
        reason: "test",
        context: { based_on: "template" },
      };
      await store.recordSuggestion(s);
      await store.recordOutcome(s.id, i % 2 === 0 ? "accepted" : "dismissed");
    }

    const stats = await store.getStats();
    expect(stats.acceptance_rate).toBeGreaterThan(0);
    expect(stats.acceptance_rate).toBeLessThanOrEqual(1);
  });

  test("gets popular patterns", async () => {
    // Record same suggestion multiple times
    const baseText = "Run the tests";
    for (let i = 0; i < 3; i++) {
      const s: Suggestion = {
        id: `pattern_${i}`,
        type: "action",
        text: baseText,
        confidence: 0.9,
        reason: "test",
        context: { based_on: "template" },
      };
      await store.recordSuggestion(s);
      await store.recordOutcome(s.id, "accepted");
    }

    const patterns = await store.getPopularPatterns(2);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].text).toBe(baseText);
    expect(patterns[0].count).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pi-suggest && bun test test/store/sqlite.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/pi-suggest/src/store/sqlite.ts

import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import type { Suggestion } from "../generator/suggestion.js";

export interface SuggestionStats {
  total_suggestions: number;
  accepted_count: number;
  dismissed_count: number;
  acceptance_rate: number;
}

export interface PopularPattern {
  text: string;
  count: number;
  acceptance_rate: number;
}

export class SuggestionStore {
  private db: Database;
  private initialized = false;

  constructor(dbPath?: string) {
    const defaultPath = path.join(homedir(), ".0xkobold", "pi-suggest", "store.db");
    const finalPath = dbPath || defaultPath;
    
    // Ensure directory exists
    const dir = path.dirname(finalPath);
    fs.mkdir(dir, { recursive: true }).catch(() => {});

    this.db = new Database(finalPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS suggestions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        text TEXT NOT NULL,
        confidence REAL,
        reason TEXT,
        context_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        suggestion_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (suggestion_id) REFERENCES suggestions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_outcomes_suggestion ON outcomes(suggestion_id);
      CREATE INDEX IF NOT EXISTS idx_outcomes_created ON outcomes(created_at);
    `);

    this.initialized = true;
  }

  async recordSuggestion(suggestion: Suggestion): Promise<void> {
    await this.init();

    this.db.prepare(`
      INSERT OR REPLACE INTO suggestions (id, type, text, confidence, reason, context_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      suggestion.id,
      suggestion.type,
      suggestion.text,
      suggestion.confidence,
      suggestion.reason,
      JSON.stringify(suggestion.context)
    );
  }

  async recordOutcome(suggestionId: string, outcome: "accepted" | "dismissed"): Promise<void> {
    await this.init();

    this.db.prepare(`
      INSERT INTO outcomes (suggestion_id, outcome)
      VALUES (?, ?)
    `).run(suggestionId, outcome);
  }

  async getStats(): Promise<SuggestionStats> {
    await this.init();

    const total = this.db.query(`
      SELECT COUNT(*) as count FROM suggestions
    `).get() as { count: number };

    const accepted = this.db.query(`
      SELECT COUNT(*) as count FROM outcomes WHERE outcome = 'accepted'
    `).get() as { count: number };

    const dismissed = this.db.query(`
      SELECT COUNT(*) as count FROM outcomes WHERE outcome = 'dismissed'
    `).get() as { count: number };

    const total_outcomes = accepted.count + dismissed.count;
    const acceptance_rate = total_outcomes > 0 ? accepted.count / total_outcomes : 0;

    return {
      total_suggestions: total.count,
      accepted_count: accepted.count,
      dismissed_count: dismissed.count,
      acceptance_rate,
    };
  }

  async getPopularPatterns(minCount = 2): Promise<PopularPattern[]> {
    await this.init();

    const results = this.db.query(`
      SELECT 
        s.text,
        COUNT(*) as count,
        SUM(CASE WHEN o.outcome = 'accepted' THEN 1 ELSE 0 END) as accepted
      FROM suggestions s
      LEFT JOIN outcomes o ON s.id = o.suggestion_id
      GROUP BY s.text
      HAVING count >= ?
      ORDER BY count DESC
      LIMIT 10
    `).all(minCount) as Array<{ text: string; count: number; accepted: number }>;

    return results.map(r => ({
      text: r.text,
      count: r.count,
      acceptance_rate: r.accepted / r.count,
    }));
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export default SuggestionStore;
```

```typescript
// packages/pi-suggest/src/store/cache.ts

import type { Suggestion } from "../generator/suggestion.js";

interface CacheEntry {
  suggestion: Suggestion;
  timestamp: number;
  outcome?: "accepted" | "dismissed";
}

export class SuggestionCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_SIZE = 10;

  set(suggestion: Suggestion): void {
    // Evict old entries if cache is full
    if (this.cache.size >= this.MAX_SIZE) {
      this.evictOldest();
    }

    this.cache.set(suggestion.id, {
      suggestion,
      timestamp: Date.now(),
    });
  }

  get(id: string): Suggestion | undefined {
    const entry = this.cache.get(id);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(id);
      return undefined;
    }

    return entry.suggestion;
  }

  getLatest(): Suggestion | undefined {
    const entries = Array.from(this.cache.values())
      .sort((a, b) => b.timestamp - a.timestamp);

    const fresh = entries.find(e => Date.now() - e.timestamp < this.TTL_MS);
    return fresh?.suggestion;
  }

  markOutcome(id: string, outcome: "accepted" | "dismissed"): void {
    const entry = this.cache.get(id);
    if (entry) {
      entry.outcome = outcome;
    }
  }

  private evictOldest(): void {
    let oldest: string | undefined;
    let oldestTime = Infinity;

    for (const [id, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldest = id;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getSize(): number {
    return this.cache.size;
  }
}

export default SuggestionCache;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/pi-suggest && bun test test/store/sqlite.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/pi-suggest
git add src/store/sqlite.ts src/store/cache.ts test/store/sqlite.test.ts
git commit -m "feat(pi-suggest): add SQLite persistence and in-memory cache"
```

---

## Task 5: Integrate into Extension - Refactor index.ts

**Files:**
- Modify: `packages/pi-suggest/src/index.ts` (complete refactor)
- Test: `packages/pi-suggest/test/suggest.test.ts` (update existing tests)

- [ ] **Step 1: Write the failing test**

```typescript
// packages/pi-suggest/test/suggest.test.ts (update existing)
import { describe, test, expect, beforeEach } from "bun:test";
import { 
  GhostSuggestionEditor, 
  createSuggestionEngine,
  SuggestionEngine 
} from "../src/index.js";

describe("Ghost Suggestion Editor", () => {
  test("GhostSuggestionEditor class exists", () => {
    expect(GhostSuggestionEditor).toBeDefined();
    expect(typeof GhostSuggestionEditor).toBe("function");
  });
});

describe("Suggestion Engine Integration", () => {
  let engine: SuggestionEngine;

  beforeEach(async () => {
    engine = await createSuggestionEngine();
  });

  test("creates suggestion engine", () => {
    expect(engine).toBeDefined();
    expect(typeof engine.generate).toBe("function");
    expect(typeof engine.getLatest).toBe("function");
  });

  test("generates suggestions from messages", async () => {
    const messages = [
      { role: "user", content: "Fix the authentication bug" },
      { role: "assistant", content: "I've fixed the auth issue" },
    ];

    const suggestion = await engine.generate(messages);
    expect(suggestion).toBeDefined();
    expect(typeof suggestion).toBe("string");
    expect(suggestion!.length).toBeGreaterThan(0);
  });

  test("returns undefined for empty messages", async () => {
    const engine = await createSuggestionEngine();
    const suggestion = await engine.generate([]);
    expect(suggestion).toBeUndefined();
  });

  test("gets latest suggestion", async () => {
    const engine = await createSuggestionEngine();
    
    const messages = [
      { role: "user", content: "Create a new component" },
    ];
    
    await engine.generate(messages);
    const latest = engine.getLatest();
    expect(latest).toBeDefined();
  });
});

describe("Extension Export", () => {
  test("extension is exported as default", async () => {
    const module = await import("../src/index.js");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });

  test("registers suggest command", async () => {
    const mockPi = {
      registerCommand: (name: string, def: any) => {
        expect(name).toBe("suggest");
      },
      on: () => {},
    };

    const extension = (await import("../src/index.js")).default;
    await extension(mockPi as any);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pi-suggest && bun test test/suggest.test.ts`
Expected: FAIL - missing exports

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/pi-suggest/src/index.ts (complete refactor)

/**
 * pi-suggest - Context-Aware Suggestion Engine
 * 
 * Phase 1 Implementation: Session analysis, intent classification,
 * template-based suggestions, and SQLite persistence.
 */

import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { Message } from "@mariozechner/pi-coding-agent";

// Core modules
import { SessionAnalyzer, type SessionSummary } from "./core/session.js";
import { IntentClassifier, IntentType } from "./core/intent.js";
import { SuggestionGenerator } from "./generator/suggestion.js";
import { SuggestionStore } from "./store/sqlite.js";
import { SuggestionCache } from "./store/cache.js";

// Types re-export
export type { Suggestion, SuggestionType } from "./generator/suggestion.js";
export { IntentType } from "./core/intent.js";

// Ghost text constants
const GHOST_COLOR = "\x1b[38;5;244m";
const RESET = "\x1b[0m";
const END_CURSOR = /(?:\x1b\[[0-9;]*m \x1b\[[0-9;]*m|█|▌|▋|▉|▓)/;

// Runtime state
const runtimeState = {
  currentContext: undefined as ExtensionContext | undefined,
  currentSuggestion: undefined as string | undefined,
  suggestionRevision: 0,
  cache: new SuggestionCache(),
  store: undefined as SuggestionStore | undefined,
  sessionAnalyzer: new SessionAnalyzer(),
  intentClassifier: new IntentClassifier(),
  suggestionGenerator: new SuggestionGenerator(),
};

// GhostSuggestionEditor (existing, unchanged)
interface GhostState {
  text: string;
  suggestion: string;
  suffix: string;
  suffixLines: string[];
  multiline: boolean;
}

export class GhostSuggestionEditor extends CustomEditor {
  private suppressGhost = false;
  private suppressGhostArmedByNonEmptyText = false;
  private lastSuggestion: string | undefined;
  private lastSuggestionRevision = -1;

  public constructor(
    tui: any,
    theme: any,
    keybindings: any,
    private readonly getSuggestion: () => string | undefined,
    private readonly getSuggestionRevision: () => number,
  ) {
    super(tui, theme, keybindings);
  }

  public override handleInput(data: string): void {
    const ghost = this.getGhostState();

    if (ghost && ghost.text.length === 0) {
      if (matchesKey(data, Key.space)) {
        this.setText(ghost.suggestion);
        runtimeState.store?.recordOutcome(ghost.suggestion, "accepted");
        return;
      }
      this.suppressGhost = true;
      this.suppressGhostArmedByNonEmptyText = false;
      super.handleInput(data);
      this.updateGhostSuppressionLifecycle();
      return;
    }

    super.handleInput(data);
    this.updateGhostSuppressionLifecycle();
  }

  public override setText(text: string): void {
    super.setText(text);
  }

  public override insertTextAtCursor(text: string): void {
    super.insertTextAtCursor(text);
  }

  public render(width: number): string[] {
    const lines = super.render(width);
    const ghost = this.getGhostState();

    if (!ghost) return lines;

    if (lines.length > 0) {
      const firstLine = lines[0];
      const cursorMatch = firstLine.match(END_CURSOR);

      if (cursorMatch) {
        const cursor = cursorMatch[0];
        const firstLineGhost = ghost.multiline
          ? ghost.suffix
          : ghost.suffix.split("\n")[0];

        const firstSuffixWrapped = wrapTextWithAnsi(
          truncateToWidth(`${cursor}${GHOST_COLOR}${firstLineGhost}${RESET}`, width),
          width
        );

        const continuationLines: string[] = [];
        continuationLines.push(...firstSuffixWrapped.slice(1));

        for (let index = 1; index < ghost.suffixLines.length; index++) {
          const line = truncateToWidth(ghost.suffixLines[index], width);
          continuationLines.push(
            wrapTextWithAnsi(`${GHOST_COLOR}${line}${RESET}`, width)[0] ?? "",
          );
        }

        lines[0] = firstSuffixWrapped[0] ?? firstLine;
        lines.push(...continuationLines);
      }
    }

    return lines;
  }

  private updateGhostSuppressionLifecycle(): void {
    const text = this.getText();

    if (text.length > 0) {
      // User typed something - mark latest suggestion as dismissed
      const latest = runtimeState.cache.getLatest();
      if (latest) {
        runtimeState.store?.recordOutcome(latest.id, "dismissed");
      }
      this.suppressGhostArmedByNonEmptyText = true;
      return;
    }

    if (this.suppressGhostArmedByNonEmptyText) {
      this.suppressGhost = false;
      this.suppressGhostArmedByNonEmptyText = false;
    }
  }

  private getGhostState(): GhostState | undefined {
    const revision = this.getSuggestionRevision();
    const suggestion = this.getSuggestion()?.trim();

    if (revision !== this.lastSuggestionRevision || suggestion !== this.lastSuggestion) {
      this.lastSuggestionRevision = revision;
      this.lastSuggestion = suggestion;
      this.suppressGhost = false;
      this.suppressGhostArmedByNonEmptyText = false;
    }

    if (!suggestion || this.suppressGhost) return undefined;

    const text = this.getText();
    const cursor = this.getCursor();

    if (text.includes("\n")) return undefined;
    if (cursor.line !== 0 || cursor.col !== text.length) return undefined;
    if (!suggestion.startsWith(text)) return undefined;

    const suffix = suggestion.slice(text.length);
    if (!suffix) return undefined;

    const suffixLines = suffix.split("\n");
    const multiline = suffixLines.length > 1;
    if (multiline && text.length > 0) return undefined;

    return { text, suggestion, suffix, suffixLines, multiline };
  }
}

// Suggestion Engine - Main integration point
export class SuggestionEngine {
  private analyzer: SessionAnalyzer;
  private classifier: IntentClassifier;
  private generator: SuggestionGenerator;
  private store: SuggestionStore;
  private cache: SuggestionCache;

  constructor(
    analyzer: SessionAnalyzer,
    classifier: IntentClassifier,
    generator: SuggestionGenerator,
    store: SuggestionStore,
    cache: SuggestionCache,
  ) {
    this.analyzer = analyzer;
    this.classifier = classifier;
    this.generator = generator;
    this.store = store;
    this.cache = cache;
  }

  async generate(messages: Message[]): Promise<string | undefined> {
    if (!messages || messages.length === 0) return undefined;

    // Extract recent user prompts
    const recentPrompts = messages
      .filter((m) => m.role === "user")
      .slice(-5)
      .map((m) => m.content)
      .filter((content): content is string => typeof content === "string" && content.length > 0);

    if (recentPrompts.length === 0) return undefined;

    // Analyze session
    const summary = this.analyzer.summarize(messages as any);
    
    // Classify intent
    const lastPrompt = recentPrompts[recentPrompts.length - 1];
    const intent = this.classifier.classifyWithConfidence(lastPrompt);
    
    // Update summary with intent
    summary.intent = intent.intent;

    // Generate suggestions
    const suggestions = this.generator.generate(summary, intent.intent, 1);
    
    if (suggestions.length === 0) return undefined;

    const topSuggestion = suggestions[0];
    
    // Store for persistence
    await this.store.recordSuggestion(topSuggestion);
    
    // Cache for quick access
    this.cache.set(topSuggestion);

    return topSuggestion.text;
  }

  getLatest(): string | undefined {
    return this.cache.getLatest()?.text;
  }

  async getStats() {
    return this.store.getStats();
  }
}

export async function createSuggestionEngine(): Promise<SuggestionEngine> {
  const store = new SuggestionStore();
  await store.init();
  
  return new SuggestionEngine(
    runtimeState.sessionAnalyzer,
    runtimeState.intentClassifier,
    runtimeState.suggestionGenerator,
    store,
    runtimeState.cache,
  );
}

// Extension entry point
export default async function suggester(pi: ExtensionAPI) {
  // Initialize store
  runtimeState.store = new SuggestionStore();
  await runtimeState.store.init();

  function installGhostEditor(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    
    ctx.ui.setEditorComponent((tui: any, theme: any, kb: any) => 
      new GhostSuggestionEditor(
        tui,
        theme,
        kb,
        () => runtimeState.currentSuggestion,
        () => runtimeState.suggestionRevision,
      ),
    );
  }

  function scheduleGhostEditorReassertion(ctx: ExtensionContext): void {
    const delaysMs = [50, 250, 1000, 3000, 8000];
    for (const delay of delaysMs) {
      setTimeout(() => {
        if (runtimeState.currentContext !== ctx) return;
        installGhostEditor(ctx);
      }, delay);
    }
  }

  // Session start handler
  pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
    runtimeState.currentContext = ctx;
    runtimeState.suggestionRevision++;

    if (ctx.hasUI) {
      installGhostEditor(ctx);
      scheduleGhostEditorReassertion(ctx);
    }
  });

  // Agent end handler - generate suggestion
  pi.on("agent_end", async (event: any, ctx: ExtensionContext) => {
    runtimeState.currentContext = ctx;
    
    if (ctx.hasUI) {
      installGhostEditor(ctx);
    }

    try {
      const messages = event.messages || [];
      const engine = await createSuggestionEngine();
      const suggestion = await engine.generate(messages as any);
      
      if (suggestion) {
        runtimeState.currentSuggestion = suggestion;
        runtimeState.suggestionRevision++;
      }
    } catch (error) {
      console.error("[pi-suggest] Error generating suggestion:", error);
    }
  });

  // User submit handler
  pi.on("input", async (_event: any, ctx: ExtensionContext) => {
    runtimeState.currentContext = ctx;
    runtimeState.suggestionRevision++;
  });

  // Register commands
  pi.registerCommand("suggest", {
    description: "suggester controls: status | stats | refresh | ghost",
    handler: async (args: string, _ctx: ExtensionContext) => {
      const trimmed = args.trim();
      const [subcommand, ...rest] = trimmed.length > 0 ? trimmed.split(/\s+/) : ["status"];

      if (subcommand === "status") {
        const suggestion = runtimeState.currentSuggestion;
        if (suggestion) {
          console.log(`👻 Suggestion ready:\n\`\`\`\n${suggestion}\n\`\`\`\nPress Space to accept, or type to override`);
        } else {
          console.log("👻 No suggestion available yet. Keep chatting!");
        }
        return;
      }

      if (subcommand === "stats") {
        const stats = await runtimeState.store?.getStats();
        if (stats) {
          console.log(`📊 Suggestion Stats:
  Total: ${stats.total_suggestions}
  Accepted: ${stats.accepted_count}
  Dismissed: ${stats.dismissed_count}
  Acceptance Rate: ${(stats.acceptance_rate * 100).toFixed(1)}%`);
        }
        return;
      }

      if (subcommand === "ghost") {
        const suggestion = runtimeState.currentSuggestion;
        if (suggestion) {
          console.log(`👻 Current ghost:\n\`\`\`\n${suggestion}\n\`\`\``);
        } else {
          console.log("👻 No ghost text available");
        }
        return;
      }

      if (subcommand === "refresh") {
        console.log("👻 Refresh not yet implemented - suggestions auto-generate after agent responses");
        return;
      }

      console.log("👻 Usage: /suggest status | /suggest stats | /suggest ghost");
    },
  });

  console.log("[pi-suggest] Ghost text prompt suggester loaded (Phase 1)");
  console.log("[pi-suggest] Press Space to accept suggestion, type to override");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/pi-suggest && bun test test/suggest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/pi-suggest
git add src/index.ts test/suggest.test.ts
git commit -m "feat(pi-suggest): integrate core modules into extension"
```

---

## Task 6: Update types.ts and Build

**Files:**
- Modify: `packages/pi-suggest/src/types.ts`

- [ ] **Step 1: Update types.ts**

```typescript
// packages/pi-suggest/src/types.ts

// Message type from pi-coding-agent (re-exported for convenience)
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// Suggestion type
export interface Suggestion {
  id: string;
  type: "action" | "question" | "observation" | "offer";
  text: string;
  confidence: number;
  reason: string;
  context: SuggestionContext;
}

export interface SuggestionContext {
  based_on: "template" | "session" | "file" | "pattern" | "preference";
  topic?: string;
  file_path?: string;
  pattern?: string;
  decision?: string;
}

// Session types
export interface SessionSummary {
  topics: string[];
  decisions: string[];
  tasks_in_progress: string[];
  blockers: string[];
  recent_files: string[];
  intent: string;
  last_action: string;
}

// Intent types
export enum IntentType {
  IMPLEMENT = "IMPLEMENT",
  DEBUG = "DEBUG",
  REFACTOR = "REFACTOR",
  RESEARCH = "RESEARCH",
  PLAN = "PLAN",
  REVIEW = "REVIEW",
  GENERAL = "GENERAL",
}

// Configuration
export interface PiSuggestConfig {
  auto_suggest: boolean;
  min_response_length: number;
  max_suggestions: number;
  show_confidence: boolean;
  learn_from_dismissals: boolean;
  dismissal_memory_ttl: number;
  intent_detection: "basic" | "advanced";
  use_pi_learn: boolean;
  use_session_history: boolean;
}

export const DEFAULT_CONFIG: PiSuggestConfig = {
  auto_suggest: true,
  min_response_length: 100,
  max_suggestions: 3,
  show_confidence: false,
  learn_from_dismissals: true,
  dismissal_memory_ttl: 30,
  intent_detection: "basic",
  use_pi_learn: false,
  use_session_history: true,
};
```

- [ ] **Step 2: Run build**

Run: `cd packages/pi-suggest && bun run build`
Expected: Clean build with no errors

- [ ] **Step 3: Run all tests**

Run: `cd packages/pi-suggest && bun test`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
cd packages/pi-suggest
git add src/types.ts
git commit -m "feat(pi-suggest): update types and ensure clean build"
```

---

## Task 7: Integration with 0xKobold

**Files:**
- Modify: `src/pi-config.ts` (register pi-suggest extension)
- Test: Verify extension loads

- [ ] **Step 1: Check pi-config.ts structure**

Run: `head -100 /home/moikapy/code/0xkobolds/src/pi-config.ts`

- [ ] **Step 2: Add pi-suggest to extensions**

Look for the extensions array and add:
```typescript
// In extensions array:
piSuggest(),
```

And import at top:
```typescript
import piSuggest from "@0xkobold/pi-suggest";
```

Or if using dynamic loading:
```typescript
// In the extension loader section
const piSuggest = await import("@0xkobold/pi-suggest");
extensions.push({ name: "pi-suggest", fn: piSuggest.default });
```

- [ ] **Step 3: Test integration**

Run: `cd /home/moikapy/code/0xkobolds && bun run start`
Expected: See "[pi-suggest] Ghost text prompt suggester loaded (Phase 1)" in output

- [ ] **Step 4: Commit**

```bash
cd /home/moikapy/code/0xkobolds
git add src/pi-config.ts
git commit -m "feat: integrate pi-suggest extension"
```

---

## Summary

| Task | Description | Files Changed |
|------|-------------|---------------|
| 1 | Session Analyzer | `src/core/session.ts`, `test/core/session.test.ts` |
| 2 | Intent Classifier | `src/core/intent.ts`, `test/core/intent.test.ts` |
| 3 | Suggestion Generator | `src/generator/templates.ts`, `src/generator/suggestion.ts`, `test/generator/suggestion.test.ts` |
| 4 | Persistence Layer | `src/store/sqlite.ts`, `src/store/cache.ts`, `test/store/sqlite.test.ts` |
| 5 | Extension Integration | `src/index.ts`, `test/suggest.test.ts` |
| 6 | Types & Build | `src/types.ts` |
| 7 | 0xKobold Integration | `src/pi-config.ts` |

**After completion, you will have:**
- ✅ Session analysis (topics, decisions, tasks, blockers, files)
- ✅ Intent classification (IMPLEMENT, DEBUG, REFACTOR, RESEARCH, PLAN, REVIEW)
- ✅ Template-based suggestion generation with confidence scoring
- ✅ SQLite persistence for accepted/dismissed tracking
- ✅ Learning from user feedback (acceptance rate tracking)
- ✅ Ghost text UI with Space-to-accept
- ✅ `/suggest status`, `/suggest stats`, `/suggest ghost` commands

---

## Plan Review

Before execution, this plan should be reviewed by a subagent to ensure:
1. File paths are correct
2. Test expectations match implementations
3. Integration points are accurate
4. No breaking changes to existing functionality
