/**
 * Suggestion Generator - Generates suggestions based on context and intent
 */

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
        confidence: this.calculateConfidence(template, summary, intent),
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
    summary: SessionSummary,
    intent: IntentType
  ): number {
    let confidence = 0.6; // Base confidence

    // Boost if topic matches
    if (template.intent.includes(intent)) {
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
