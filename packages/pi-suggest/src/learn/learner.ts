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

export class SuggestionLearner {
  private outcomes: LearningOutcome[] = [];
  private suggestionHistory: Map<string, { accepted: number; rejected: number }> = new Map();

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
        "commit to git": "Run more tests first",
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
