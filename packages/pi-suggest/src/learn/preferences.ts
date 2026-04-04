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
