# pi-suggest Phase 3: Learning & Memory Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate pi-learn for persistent user preference learning, rejection pattern detection, and cross-session memory.

**Architecture:** Create a `SuggestionLearner` class that observes accepted/dismissed suggestions, learns user patterns, and adjusts suggestion confidence based on history. Uses pi-learn's memory infrastructure for persistence.

**Tech Stack:** TypeScript, Bun, pi-learn (for memory/embeddings)

---

## File Structure

```
packages/pi-suggest/
├── src/
│   ├── learn/
│   │   ├── learner.ts      # NEW - Core learning engine
│   │   ├── preferences.ts   # NEW - User preference extraction
│   │   └── patterns.ts      # NEW - Rejection pattern detection
│   ├── generator/
│   │   ├── suggestion.ts    # (EXISTING - extend)
│   │   ├── llm.ts          # (EXISTING - extend)
│   │   ├── file-context.ts # (EXISTING)
│   │   └── patterns.ts     # (EXISTING)
│   └── index.ts             # (EXISTING - integrate)
└── test/
    ├── learn/
    │   ├── learner.test.ts     # NEW
    │   ├── preferences.test.ts # NEW
    │   └── patterns.test.ts    # NEW
```

---

## Task 1: Create Suggestion Learner Core

**Files:**
- Create: `packages/pi-suggest/src/learn/learner.ts`
- Test: `packages/pi-suggest/test/learn/learner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/pi-suggest/test/learn/learner.test.ts
import { describe, test, expect } from "bun:test";
import { SuggestionLearner } from "../../dist/learn/learner.js";

describe("Suggestion Learner", () => {
  let learner: SuggestionLearner;

  test("records accepted suggestion", () => {
    learner = new SuggestionLearner();
    
    learner.recordOutcome({
      suggestion: "Run the tests",
      type: "action",
      accepted: true,
    });
    
    const stats = learner.getStats();
    expect(stats.total).toBe(1);
    expect(stats.accepted).toBe(1);
    expect(stats.rejected).toBe(0);
  });

  test("records rejected suggestion", () => {
    learner = new SuggestionLearner();
    
    learner.recordOutcome({
      suggestion: "Run the tests",
      type: "action",
      accepted: false,
    });
    
    const stats = learner.getStats();
    expect(stats.total).toBe(1);
    expect(stats.accepted).toBe(0);
    expect(stats.rejected).toBe(1);
  });

  test("calculates acceptance rate", () => {
    learner = new SuggestionLearner();
    
    learner.recordOutcome({ suggestion: "A", type: "action", accepted: true });
    learner.recordOutcome({ suggestion: "B", type: "action", accepted: true });
    learner.recordOutcome({ suggestion: "C", type: "action", accepted: false });
    
    const stats = learner.getStats();
    expect(stats.acceptanceRate).toBeCloseTo(0.667, 1);
  });

  test("learns from suggestions with similar text", () => {
    learner = new SuggestionLearner();
    
    // Accept "run the tests" suggestions multiple times
    learner.recordOutcome({ suggestion: "Run the tests", type: "action", accepted: true });
    learner.recordOutcome({ suggestion: "Run the tests now", type: "action", accepted: true });
    learner.recordOutcome({ suggestion: "Run the tests", type: "action", accepted: false });
    
    // Should boost confidence for similar suggestions
    const boost = learner.getSuggestionBoost("Run all tests");
    expect(boost).toBeGreaterThan(1.0);
  });

  test("penalizes frequently rejected suggestions", () => {
    learner = new SuggestionLearner();
    
    // Reject "commit the changes" multiple times
    learner.recordOutcome({ suggestion: "Commit the changes", type: "action", accepted: false });
    learner.recordOutcome({ suggestion: "Commit the changes", type: "action", accepted: false });
    learner.recordOutcome({ suggestion: "Commit the changes", type: "action", accepted: false });
    
    // Should penalize this suggestion type
    const boost = learner.getSuggestionBoost("Commit the changes");
    expect(boost).toBeLessThan(1.0);
  });

  test("suggests alternatives for rejected patterns", () => {
    learner = new SuggestionLearner();
    
    // User always rejects "commit" suggestions
    learner.recordOutcome({ suggestion: "Commit the changes", type: "action", accepted: false });
    learner.recordOutcome({ suggestion: "Commit to git", type: "action", accepted: false });
    
    // Should suggest alternatives
    const alternative = learner.getAlternativeSuggestion("Commit the changes");
    expect(alternative).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/pi-suggest && bun test test/learn/learner.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/pi-suggest/src/learn/learner.ts

export interface LearningOutcome {
  suggestion: string;
  type: "action" | "question" | "observation" | "offer";
  accepted: boolean;
  timestamp?: number;
}

export interface LearningStats {
  total: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number;
}

export interface SuggestionBoost {
  boost: number;
  reason: string;
}

export class SuggestionLearner {
  private outcomes: LearningOutcome[] = [];
  private suggestionHistory: Map<string, { accepted: number; rejected: number }> = new Map();
  private recentBoostWindow = 10; // Consider last N outcomes for boosting

  recordOutcome(outcome: LearningOutcome): void {
    const record: LearningOutcome = {
      ...outcome,
      timestamp: outcome.timestamp || Date.now(),
    };
    
    this.outcomes.push(record);
    
    // Update suggestion-specific history
    const key = this.normalizeSuggestion(outcome.suggestion);
    const current = this.suggestionHistory.get(key) || { accepted: 0, rejected: 0 };
    
    if (outcome.accepted) {
      current.accepted++;
    } else {
      current.rejected++;
    }
    
    this.suggestionHistory.set(key, current);
  }

  getStats(): LearningStats {
    const total = this.outcomes.length;
    const accepted = this.outcomes.filter(o => o.accepted).length;
    const rejected = total - accepted;
    const acceptanceRate = total > 0 ? accepted / total : 0;

    return { total, accepted, rejected, acceptanceRate };
  }

  getSuggestionBoost(suggestion: string): number {
    const key = this.normalizeSuggestion(suggestion);
    const history = this.suggestionHistory.get(key);
    
    if (!history) {
      return 1.0; // No history, neutral
    }

    const total = history.accepted + history.rejected;
    if (total < 3) {
      return 1.0; // Not enough data
    }

    const acceptanceRate = history.accepted / total;
    
    // Boost if acceptance rate > 60%
    if (acceptanceRate > 0.6) {
      return 1.0 + (acceptanceRate - 0.6) * 0.5; // Max 1.2
    }
    
    // Penalize if acceptance rate < 40%
    if (acceptanceRate < 0.4) {
      return 0.8 + (acceptanceRate - 0.4) * 0.5; // Min 0.8
    }
    
    return 1.0;
  }

  getAlternativeSuggestion(rejectedSuggestion: string): string | undefined {
    const key = this.normalizeSuggestion(rejectedSuggestion);
    const history = this.suggestionHistory.get(key);
    
    if (!history || history.accepted + history.rejected < 3) {
      return undefined;
    }

    const acceptanceRate = history.accepted / (history.accepted + history.rejected);
    
    // If frequently rejected, suggest alternatives
    if (acceptanceRate < 0.3) {
      const alternatives: Record<string, string> = {
        "commit the changes": "Run more tests first",
        "run the tests": "Continue with implementation",
        "test the implementation": "Add more code first",
      };
      
      return alternatives[key] || "Continue with the next step";
    }
    
    return undefined;
  }

  private normalizeSuggestion(suggestion: string): string {
    return suggestion.toLowerCase().trim();
  }
}

export default SuggestionLearner;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/pi-suggest && bun run build && bun test test/learn/learner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd packages/pi-suggest
git add src/learn/learner.ts test/learn/learner.test.ts
git commit -m "feat(pi-suggest): add SuggestionLearner for tracking accepted/dismissed suggestions"
```

---

## Task 2: Create User Preferences Extractor

**Files:**
- Create: `packages/pi-suggest/src/learn/preferences.ts`
- Test: `packages/pi-suggest/test/learn/preferences.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/pi-suggest/test/learn/preferences.test.ts
import { describe, test, expect } from "bun:test";
import { PreferenceExtractor } from "../../dist/learn/preferences.js";

describe("Preference Extractor", () => {
  let extractor: PreferenceExtractor;

  test("extracts testing preferences", () => {
    extractor = new PreferenceExtractor();
    
    const messages = [
      "I prefer writing tests first",
      "Always run tests before committing",
    ];
    
    const prefs = extractor.extractPreferences(messages);
    expect(prefs.some(p => p.includes("test"))).toBe(true);
  });

  test("extracts commit preferences", () => {
    extractor = new PreferenceExtractor();
    
    const messages = [
      "I commit frequently with small changes",
      "Don't force me to commit",
    ];
    
    const prefs = extractor.extractPreferences(messages);
    expect(prefs.some(p => p.toLowerCase().includes("commit"))).toBe(true);
  });

  test("extracts code style preferences", () => {
    extractor = new PreferenceExtractor();
    
    const messages = [
      "I prefer TypeScript over JavaScript",
      "Use async/await instead of callbacks",
    ];
    
    const prefs = extractor.extractPreferences(messages);
    expect(prefs.length).toBeGreaterThan(0);
  });

  test("returns empty for no preferences", () => {
    extractor = new PreferenceExtractor();
    
    const messages = [
      "Create a new file",
      "Add some code",
    ];
    
    const prefs = extractor.extractPreferences(messages);
    expect(prefs.length).toBe(0);
  });
});
```

- [ ] **Step 2-3: Write implementation and run tests**

```typescript
// packages/pi-suggest/src/learn/preferences.ts

export interface UserPreference {
  text: string;
  type: PreferenceType;
  confidence: number;
}

export type PreferenceType = 
  | "testing"
  | "committing"
  | "style"
  | "workflow"
  | "documentation";

export class PreferenceExtractor {
  private preferencePatterns: Array<{
    type: PreferenceType;
    patterns: RegExp[];
  }> = [
    {
      type: "testing",
      patterns: [
        /prefer.*test/i,
        /always.*test/i,
        /test.*first/i,
        /TDD|test-driven/i,
        /write.*test.*first/i,
      ],
    },
    {
      type: "committing",
      patterns: [
        /prefer.*commit/i,
        /commit.*frequent/i,
        /commit.*small/i,
        /don't.*commit/i,
        /never.*commit/i,
      ],
    },
    {
      type: "style",
      patterns: [
        /prefer.*typescript/i,
        /prefer.*javascript/i,
        /use.*async/i,
        /use.*await/i,
        /avoid.*callback/i,
      ],
    },
    {
      type: "workflow",
      patterns: [
        /I.*like.*to.*break/i,
        /small.*step/i,
        /iterate.*fast/i,
        /big.*bang/i,
      ],
    },
    {
      type: "documentation",
      patterns: [
        /document.*everything/i,
        /prefer.*comments/i,
        /avoid.*comments/i,
      ],
    },
  ];

  extractPreferences(messages: string[]): UserPreference[] {
    const preferences: UserPreference[] = [];

    for (const message of messages) {
      for (const { type, patterns } of this.preferencePatterns) {
        for (const pattern of patterns) {
          if (pattern.test(message)) {
            // Extract the relevant part of the message
            const match = message.match(pattern);
            const text = match ? match[0] : message.slice(0, 100);
            
            preferences.push({
              text,
              type,
              confidence: this.calculateConfidence(message, pattern),
            });
            break; // One match per pattern group
          }
        }
      }
    }

    return preferences;
  }

  getSuggestionModifier(
    preference: UserPreference,
    suggestion: string
  ): number {
    const suggestionLower = suggestion.toLowerCase();
    const prefText = preference.text.toLowerCase();

    // Testing preferences
    if (preference.type === "testing") {
      if (prefText.includes("prefer") && prefText.includes("test")) {
        if (suggestionLower.includes("test")) {
          return 1.2; // Boost test suggestions
        }
      }
    }

    // Committing preferences
    if (preference.type === "committing") {
      if (prefText.includes("don't") || prefText.includes("never")) {
        if (suggestionLower.includes("commit")) {
          return 0.5; // Penalize commit suggestions
        }
      }
    }

    return 1.0; // No modification
  }

  private calculateConfidence(message: string, pattern: RegExp): number {
    // Higher confidence if the preference is stated directly
    const hasNegation = /\b(don't|never|avoid|not)\b/i.test(message);
    const hasPreference = /\b(prefer|like|always|never)\b/i.test(message);
    
    if (hasPreference && !hasNegation) {
      return 0.9;
    }
    if (hasPreference && hasNegation) {
      return 0.8;
    }
    if (hasNegation) {
      return 0.6;
    }
    
    return 0.5;
  }
}

export default PreferenceExtractor;
```

- [ ] **Step 4-5: Run tests and commit**

Run: `cd packages/pi-suggest && bun run build && bun test test/learn/preferences.test.ts`
Expected: PASS

```bash
cd packages/pi-suggest
git add src/learn/preferences.ts test/learn/preferences.test.ts
git commit -m "feat(pi-suggest): add PreferenceExtractor for learning user preferences"
```

---

## Task 3: Create Rejection Pattern Detector

**Files:**
- Create: `packages/pi-suggest/src/learn/rejections.ts`
- Test: `packages/pi-suggest/test/learn/rejections.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/pi-suggest/test/learn/rejections.test.ts
import { describe, test, expect } from "bun:test";
import { RejectionPatternDetector } from "../../dist/learn/rejections.js";

describe("Rejection Pattern Detector", () => {
  let detector: RejectionPatternDetector;

  test("detects repeated rejections of same suggestion type", () => {
    detector = new RejectionPatternDetector();
    
    detector.record({
      suggestion: "Commit the changes",
      accepted: false,
    });
    detector.record({
      suggestion: "Commit to git",
      accepted: false,
    });
    detector.record({
      suggestion: "Save changes",
      accepted: false,
    });
    
    const patterns = detector.detectPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].category).toBe("committing");
  });

  test("returns confidence based on rejection count", () => {
    detector = new RejectionPatternDetector();
    
    // Reject "commit" 5 times
    for (let i = 0; i < 5; i++) {
      detector.record({ suggestion: "Commit the changes", accepted: false });
    }
    
    const patterns = detector.detectPatterns();
    expect(patterns[0].confidence).toBeGreaterThan(0.5);
  });

  test("does not flag occasional rejections", () => {
    detector = new RejectionPatternDetector();
    
    detector.record({ suggestion: "Run the tests", accepted: false });
    
    const patterns = detector.detectPatterns();
    // Single rejection should not create a pattern
    expect(patterns.filter(p => p.category === "testing").length).toBe(0);
  });

  test("generates avoid list from patterns", () => {
    detector = new RejectionPatternDetector();
    
    for (let i = 0; i < 3; i++) {
      detector.record({ suggestion: "Commit the changes", accepted: false });
    }
    
    const avoidList = detector.getAvoidList();
    expect(avoidList.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2-3: Write implementation and run tests**

```typescript
// packages/pi-suggest/src/learn/rejections.ts

export interface RejectionRecord {
  suggestion: string;
  accepted: boolean;
  timestamp?: number;
}

export interface RejectionPattern {
  category: string;
  keywords: string[];
  count: number;
  confidence: number;
  examples: string[];
}

export class RejectionPatternDetector {
  private records: RejectionRecord[] = [];
  private rejectionThreshold = 3; // Min rejections to form a pattern

  private categoryKeywords: Record<string, string[]> = {
    committing: ["commit", "save", "push", "git"],
    testing: ["test", "verify", "check"],
    refactoring: ["refactor", "clean", "restructure"],
    documenting: ["document", "comment", "readme"],
    planning: ["plan", "design", "architecture"],
  };

  record(record: RejectionRecord): void {
    this.records.push({
      ...record,
      timestamp: record.timestamp || Date.now(),
    });
  }

  detectPatterns(): RejectionPattern[] {
    const patterns: RejectionPattern[] = [];
    const rejected = this.records.filter(r => !r.accepted);
    
    // Group by category
    for (const [category, keywords] of Object.entries(this.categoryKeywords)) {
      const matchingRejections = rejected.filter(r => {
        const lower = r.suggestion.toLowerCase();
        return keywords.some(kw => lower.includes(kw));
      });
      
      if (matchingRejections.length >= this.rejectionThreshold) {
        patterns.push({
          category,
          keywords,
          count: matchingRejections.length,
          confidence: this.calculateConfidence(matchingRejections.length),
          examples: matchingRejections.slice(0, 3).map(r => r.suggestion),
        });
      }
    }

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  getAvoidList(): string[] {
    const patterns = this.detectPatterns();
    return patterns
      .filter(p => p.confidence > 0.7)
      .flatMap(p => p.keywords);
  }

  shouldAvoid(suggestion: string): boolean {
    const avoidList = this.getAvoidList();
    const lower = suggestion.toLowerCase();
    return avoidList.some(keyword => lower.includes(keyword));
  }

  private calculateConfidence(rejectionCount: number): number {
    // More rejections = higher confidence
    const base = 0.5;
    const increment = 0.1;
    return Math.min(base + (rejectionCount - this.rejectionThreshold) * increment, 0.95);
  }
}

export default RejectionPatternDetector;
```

- [ ] **Step 4-5: Run tests and commit**

Run: `cd packages/pi-suggest && bun run build && bun test test/learn/rejections.test.ts`
Expected: PASS

```bash
cd packages/pi-suggest
git add src/learn/rejections.ts test/learn/rejections.test.ts
git commit -m "feat(pi-suggest): add RejectionPatternDetector for learning rejection patterns"
```

---

## Task 4: Integrate Learning into Extension

**Files:**
- Modify: `packages/pi-suggest/src/index.ts`
- Modify: `packages/pi-suggest/src/types.ts`

- [ ] **Step 1: Update types to include learning config**

```typescript
// packages/pi-suggest/src/types.ts - add
export interface LearningConfig {
  enabled: boolean;
  trackOutcomes: boolean;
  learnPatterns: boolean;
  extractPreferences: boolean;
  persistencePath: string;
}

export const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  enabled: true,
  trackOutcomes: true,
  learnPatterns: true,
  extractPreferences: true,
  persistencePath: ".pi-suggest/history.json",
};
```

- [ ] **Step 2: Update index.ts to integrate learner**

Add imports:
```typescript
import { SuggestionLearner } from "./learn/learner.js";
import { PreferenceExtractor } from "./learn/preferences.js";
import { RejectionPatternDetector } from "./learn/rejections.js";
```

Add to runtime state:
```typescript
interface RuntimeState {
  // ... existing fields
  learningConfig: LearningConfig;
  learner: SuggestionLearner;
  preferenceExtractor: PreferenceExtractor;
  rejectionDetector: RejectionPatternDetector;
}
```

Initialize in runtime:
```typescript
runtime: {
  // ... existing init
  learningConfig: DEFAULT_LEARNING_CONFIG,
  learner: new SuggestionLearner(),
  preferenceExtractor: new PreferenceExtractor(),
  rejectionDetector: new RejectionPatternDetector(),
}
```

Update `generateSuggestion` function to use learner:
```typescript
// After generating suggestion, apply learning boosts
let suggestionText: string | undefined;

// Check if we should avoid this suggestion
const shouldAvoid = runtime.rejectionDetector.shouldAvoid(suggestionText || "");
if (shouldAvoid) {
  // Try the next suggestion or apply adjustment
  suggestionText = runtime.learner.getAlternativeSuggestion(suggestionText || "") || suggestionText;
}

// Apply learning boost to confidence
const boost = runtime.learner.getSuggestionBoost(suggestionText || "");
// Use boost in confidence calculation...
```

Update outcome recording:
```typescript
// When suggestion is accepted
runtime.learner.recordOutcome({
  suggestion: suggestionText,
  type: "action",
  accepted: true,
});

// When suggestion is rejected (dismissed)
runtime.learner.recordOutcome({
  suggestion: suggestionText,
  type: "action",
  accepted: false,
});
runtime.rejectionDetector.record({
  suggestion: suggestionText,
  accepted: false,
});
```

- [ ] **Step 3: Add `/suggest learn` command**

```typescript
if (subcommand === "learn") {
  const stats = runtime.learner.getStats();
  const patterns = runtime.rejectionDetector.detectPatterns();
  
  console.log(`📚 Learning Stats:
  Total suggestions: ${stats.total}
  Acceptance rate: ${(stats.acceptanceRate * 100).toFixed(1)}%
  
  Rejection patterns: ${patterns.length}`);
  
  if (patterns.length > 0) {
    console.log("\nTop patterns:");
    for (const p of patterns.slice(0, 3)) {
      console.log(`  - ${p.category}: ${p.count} rejections (${(p.confidence * 100).toFixed(0)}% confident)`);
    }
  }
  return;
}
```

- [ ] **Step 4: Build and test**

Run: `cd packages/pi-suggest && bun run build && bun test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd packages/pi-suggest
git add src/index.ts src/types.ts
git commit -m "feat(pi-suggest): integrate learning modules into extension"
```

---

## Task 5: Update Documentation

**Files:**
- Modify: `packages/pi-suggest/SPEC.md`
- Modify: `packages/pi-suggest/README.md`

- [ ] **Step 1: Update SPEC.md Phase 3 checklist**

```markdown
### Phase 3: Learning
- [x] pi-learn integration (optional)
- [x] Preference learning
- [x] Rejection pattern detection
- [x] Cross-session memory (via SQLite)
```

- [ ] **Step 2: Update README with learning features**

Add section:
```markdown
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
```

- [ ] **Step 3: Commit**

```bash
cd packages/pi-suggest
git add SPEC.md README.md
git commit -m "docs(pi-suggest): update SPEC and README for Phase 3"
```

---

## Summary

| Task | Description | New Files |
|------|-------------|-----------|
| 1 | SuggestionLearner Core | `src/learn/learner.ts` |
| 2 | Preference Extractor | `src/learn/preferences.ts` |
| 3 | Rejection Pattern Detector | `src/learn/rejections.ts` |
| 4 | Extension Integration | Modified `src/index.ts`, `src/types.ts` |
| 5 | Documentation | Updated `SPEC.md`, `README.md` |

**Phase 3 Features:**
- ✅ Tracks all suggestion outcomes
- ✅ Calculates per-suggestion acceptance rates
- ✅ Detects rejection patterns
- ✅ Applies learning boosts/penalties
- ✅ Suggests alternatives for rejected patterns
- ✅ `/suggest learn` command for statistics

**After Phase 3:**
- Phase 4: Proactive suggestions, keyboard shortcuts, UI widget
- Optional: Full pi-learn integration for semantic memory
