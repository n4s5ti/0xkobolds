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
      .filter(p => p.confidence >= 0.7)
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
