export interface Pattern {
  name: string;
  sequence: string[];
  confidence: number;
}

export class PatternRecognizer {
  // Known patterns that developers follow
  private knownPatterns: Array<{ 
    name: string; 
    triggers: RegExp[]; 
    followUps: string[];
    nextAction: string;
  }> = [
    {
      name: "implement_then_test",
      triggers: [/\b(create|implement|add|build|new)\b/i],
      followUps: ["test", "verify"],
      nextAction: "Test the implementation",
    },
    {
      name: "test_then_commit",
      triggers: [/\b(test passed|all tests|running tests|tested)\b/i],
      followUps: ["commit", "save", "deploy"],
      nextAction: "Commit the changes",
    },
    {
      name: "fix_then_test",
      triggers: [/\b(fix|bug fix|resolved|fixed|patch)\b/i],
      followUps: ["test", "verify"],
      nextAction: "Run the tests to verify the fix",
    },
    {
      name: "refactor_then_test",
      triggers: [/\b(refactor|clean up|restructure|improved)\b/i],
      followUps: ["test", "verify"],
      nextAction: "Run tests after refactoring",
    },
    {
      name: "design_then_implement",
      triggers: [/\b(design|plan|architecture|structure)\b/i],
      followUps: ["implement", "create", "build"],
      nextAction: "Start implementing the design",
    },
  ];

  detectPatterns(history: string[]): Pattern[] {
    const patterns: Pattern[] = [];
    
    if (history.length < 2) return patterns;

    for (const known of this.knownPatterns) {
      for (let i = 0; i < history.length - 1; i++) {
        const current = history[i];
        const next = history[i + 1];

        // Check if current matches a trigger
        const matchesTrigger = known.triggers.some((r) => r.test(current));
        if (matchesTrigger) {
          // Check if next matches a follow-up
          const matchesFollowUp = known.followUps.some(
            (f) => next.toLowerCase().includes(f.toLowerCase())
          );

          if (matchesFollowUp) {
            patterns.push({
              name: known.name,
              sequence: [current, next],
              confidence: 0.8,
            });
          }
        }
      }
    }

    return patterns;
  }

  extractCommonSequences(history: string[]): string[][] {
    if (history.length < 3) return [];

    const sequences: string[][] = [];
    const seen = new Set<string>();

    for (let i = 0; i < history.length - 2; i++) {
      const seq = [
        this.categorize(history[i]),
        this.categorize(history[i + 1]),
        this.categorize(history[i + 2]),
      ];
      const key = seq.join("|");
      
      if (!seen.has(key)) {
        seen.add(key);
        sequences.push(seq);
      }
    }

    return sequences;
  }

  suggestFromPattern(history: string[]): string | undefined {
    if (history.length === 0) return undefined;

    const last = history[history.length - 1].toLowerCase();

    // Check for known patterns
    for (const known of this.knownPatterns) {
      const matchesTrigger = known.triggers.some((r) => r.test(last));
      
      if (matchesTrigger) {
        return known.nextAction;
      }
    }

    // Check for action words to suggest next logical step
    if (/\b(create|implement|add|build)\b/.test(last)) {
      return "Test the implementation";
    }
    if (/\b(fix|bug)\b/.test(last)) {
      return "Run the tests";
    }
    if (/\btest\b/.test(last) && !last.includes("failed")) {
      return "Commit the changes";
    }
    if (/\bdesign|plan\b/.test(last)) {
      return "Start implementing";
    }

    return undefined;
  }

  private categorize(text: string): string {
    const lower = text.toLowerCase();
    
    if (/\b(create|implement|add|build|new)\b/.test(lower)) return "Create";
    if (/\b(test|verify|check)\b/.test(lower)) return "Test";
    if (/\b(fix|bug|patch)\b/.test(lower)) return "Fix";
    if (/\b(commit|save|deploy)\b/.test(lower)) return "Commit";
    if (/\b(refactor|clean|restructure)\b/.test(lower)) return "Refactor";
    if (/\b(review|check|audit)\b/.test(lower)) return "Review";
    if (/\b(design|plan|architecture)\b/.test(lower)) return "Design";
    
    return "Other";
  }
}

export default PatternRecognizer;
