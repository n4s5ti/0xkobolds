import { Ollama } from 'ollama';
import type { SessionSummary } from "../core/session.js";
import type { FileContext } from "./file-context.js";
import type { SuggestionType } from "./templates.js";

export interface LlmConfig {
  baseUrl: string;
  model: string;
  timeout: number;
}

export interface LlmSuggestion {
  text: string;
  type: SuggestionType;
  confidence: number;
  reason: string;
}

const FALLBACK_SUGGESTIONS: LlmSuggestion[] = [
  { text: "Run the tests", type: "action", confidence: 0.6, reason: "general workflow" },
  { text: "Continue with the next step", type: "action", confidence: 0.5, reason: "general workflow" },
  { text: "What would you like to do next?", type: "question", confidence: 0.4, reason: "general workflow" },
];

const SYSTEM_PROMPT = `You are a helpful coding assistant that suggests next steps. Based on the conversation context, suggest 1-3 natural next prompts the user might want to say.

Format your response as a JSON array:
[{"text": "suggestion 1", "type": "action", "reason": "why this is relevant"}]

Types: "action" (do something), "question" (ask about something), "observation" (note something), "offer" (offer to help)

Respond only with valid JSON, no other text.`;

export class LlmSuggester {
  private client: Ollama | null = null;
  private config: LlmConfig;
  private initError: Error | null = null;

  constructor(config: LlmConfig) {
    this.config = config;
    try {
      this.client = new Ollama({ host: config.baseUrl });
    } catch (error) {
      this.initError = error as Error;
      this.client = null;
    }
  }

  async generateSuggestions(
    summary: SessionSummary,
    fileContext?: FileContext
  ): Promise<LlmSuggestion[]> {
    if (this.initError || !this.client) {
      console.error("[pi-suggest] LLM not initialized:", this.initError?.message);
      return FALLBACK_SUGGESTIONS;
    }

    try {
      const prompt = this.buildPrompt(summary, fileContext);
      
      const response = await this.client.chat({
        model: this.config.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        options: {
          temperature: 0.7,
          num_predict: 300,
        },
        format: "json",
      });

      const content = response.message.content;
      return this.parseResponse(content);
    } catch (error) {
      console.error("[pi-suggest] LLM suggestion error:", error);
      return FALLBACK_SUGGESTIONS;
    }
  }

  buildPrompt(summary: SessionSummary, fileContext?: FileContext): string {
    let prompt = `Current intent: ${summary.intent || "GENERAL"}
Topics: ${summary.topics.join(", ") || "none"}
Decisions: ${summary.decisions.join(", ") || "none"}
Tasks in progress: ${summary.tasks_in_progress.join(", ") || "none"}
Last action: ${summary.last_action || "completed"}
Recent files: ${summary.recent_files.join(", ") || "none"}`;

    if (fileContext) {
      prompt += `\n\nCurrent file (${fileContext.filePath}):
Language: ${fileContext.language}`;
      
      if (fileContext.todos.length > 0) {
        prompt += `\nTODOs: ${fileContext.todos.join(", ")}`;
      }
      if (fileContext.fixmes.length > 0) {
        prompt += `\nFIXMEs: ${fileContext.fixmes.join(", ")}`;
      }
      if (fileContext.functions.length > 0) {
        prompt += `\nFunctions: ${fileContext.functions.map(f => f.name).join(", ")}`;
      }
    }

    return prompt;
  }

  private parseResponse(content: string): LlmSuggestion[] {
    try {
      const parsed = JSON.parse(content);
      
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 3).map((item) => ({
          text: item.text || item.suggestion || "",
          type: (item.type || "action") as SuggestionType,
          confidence: item.confidence || 0.7,
          reason: item.reason || "LLM generated",
        }));
      }

      return this.extractFromText(content);
    } catch {
      return this.extractFromText(content);
    }
  }

  private extractFromText(content: string): LlmSuggestion[] {
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 10 && line.length < 100);

    return lines.slice(0, 3).map((text) => ({
      text,
      type: "action" as SuggestionType,
      confidence: 0.6,
      reason: "Extracted from response",
    }));
  }
}

export default LlmSuggester;
