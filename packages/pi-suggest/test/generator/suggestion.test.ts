import { describe, test, expect } from "bun:test";
import { SuggestionGenerator } from "../../dist/generator/suggestion.js";
import { IntentType } from "../../dist/core/intent.js";
import type { SessionSummary } from "../../dist/core/session.js";

describe("Suggestion Generator", () => {

  test("generates suggestions for DEBUG intent", () => {
    const generator = new SuggestionGenerator();
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
    const generator = new SuggestionGenerator();
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
    const generator = new SuggestionGenerator();
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
  });

  test("includes context in suggestions", () => {
    const generator = new SuggestionGenerator();
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

  test("generates single suggestion", () => {
    const generator = new SuggestionGenerator();
    const summary: SessionSummary = {
      topics: ["test"],
      decisions: [],
      tasks_in_progress: [],
      blockers: [],
      recent_files: [],
      intent: "GENERAL",
      last_action: "completed",
    };

    const suggestion = generator.generateSingle(summary, IntentType.GENERAL);
    expect(typeof suggestion).toBe("string");
  });

  test("suggestion has id, confidence, reason", () => {
    const generator = new SuggestionGenerator();
    const summary: SessionSummary = {
      topics: ["code"],
      decisions: [],
      tasks_in_progress: [],
      blockers: [],
      recent_files: [],
      intent: "IMPLEMENT",
      last_action: "completed",
    };

    const suggestions = generator.generate(summary, IntentType.IMPLEMENT);
    expect(suggestions[0]).toHaveProperty("id");
    expect(suggestions[0]).toHaveProperty("confidence");
    expect(suggestions[0]).toHaveProperty("reason");
  });
});
