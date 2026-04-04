import { describe, test, expect } from "bun:test";
import { LlmSuggester } from "../../dist/generator/llm.js";
import type { SessionSummary } from "../../dist/core/session.js";

describe("LLM Suggester", () => {

  test("generates suggestions from session context", async () => {
    const suggester = new LlmSuggester({
      baseUrl: "http://localhost:11434",
      model: "llama3.2",
      timeout: 5000,
    });

    const summary: SessionSummary = {
      topics: ["authentication", "login"],
      decisions: ["use JWT tokens"],
      tasks_in_progress: ["implement login flow"],
      blockers: [],
      recent_files: ["/src/auth/login.ts"],
      intent: "IMPLEMENT",
      last_action: "completed",
    };

    const suggestions = await suggester.generateSuggestions(summary);
    
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    expect(suggestions[0]).toHaveProperty("text");
    expect(suggestions[0]).toHaveProperty("confidence");
  });

  test("handles LLM errors gracefully", async () => {
    const suggester = new LlmSuggester({
      baseUrl: "http://localhost:99999",
      model: "llama3.2",
      timeout: 1000,
    });

    const summary: SessionSummary = {
      topics: ["test"],
      decisions: [],
      tasks_in_progress: [],
      blockers: [],
      recent_files: [],
      intent: "GENERAL",
      last_action: "completed",
    };

    const suggestions = await suggester.generateSuggestions(summary);
    expect(Array.isArray(suggestions)).toBe(true);
  });

  test("builds prompt from context", () => {
    const suggester = new LlmSuggester({
      baseUrl: "http://localhost:11434",
      model: "llama3.2",
      timeout: 5000,
    });

    const summary: SessionSummary = {
      topics: ["database", "migration"],
      decisions: ["use PostgreSQL"],
      tasks_in_progress: ["run migration"],
      blockers: [],
      recent_files: ["/db/schema.sql"],
      intent: "IMPLEMENT",
      last_action: "running",
    };

    const prompt = suggester.buildPrompt(summary);
    
    expect(prompt).toContain("database");
    expect(prompt).toContain("migration");
    expect(prompt).toContain("PostgreSQL");
  });
});
