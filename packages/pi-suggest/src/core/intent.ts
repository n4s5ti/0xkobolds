/**
 * Intent Classifier - Classifies user intent from prompts
 */

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
        /\b(function|class|component|service|module|api|endpoint)\b/i,
      ],
      weight: 0.9,
    },
    {
      type: IntentType.REFACTOR,
      patterns: [
        /\b(refactor|restructure|reorganize|rewrite|optimize|improve|clean up)\b/i,
        /\b(technical debt|code quality|best practice)\b/i,
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
