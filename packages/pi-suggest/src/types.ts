/**
 * pi-suggest Type Definitions
 */

// Message type (mirrors pi-coding-agent Message)
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
  based_on: "template" | "session" | "file" | "pattern" | "preference" | "llm";
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

// Intent types (re-exported)
export { IntentType } from "./core/intent.js";

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

// Re-export core classes
export { SessionAnalyzer } from "./core/session.js";
export type { SessionSummary as SessionSummaryType } from "./core/session.js";
export { IntentClassifier } from "./core/intent.js";
export { SuggestionGenerator } from "./generator/suggestion.js";
export { SuggestionStore } from "./store/sqlite.js";
export { SuggestionCache } from "./store/cache.js";
