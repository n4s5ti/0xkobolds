import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { SuggestionStore } from "../../dist/store/sqlite.js";
import type { Suggestion } from "../../dist/generator/suggestion.js";
import * as path from "node:path";
import * as os from "node:os";

const TEST_DB_PATH = path.join(os.tmpdir(), `pi-suggest-test-${Date.now()}.db`);

describe("Suggestion Store", () => {
  let store: SuggestionStore;

  beforeEach(async () => {
    store = new SuggestionStore(TEST_DB_PATH);
    await store.init();
  });

  afterEach(async () => {
    await store.close();
    // Clean up test db
    const { unlinkSync } = await import("node:fs");
    try { unlinkSync(TEST_DB_PATH); } catch {}
  });

  test("initializes database", async () => {
    const result = await store.getStats();
    expect(result).toHaveProperty("total_suggestions");
    expect(result).toHaveProperty("accepted_count");
  });

  test("records accepted suggestion", async () => {
    const suggestion: Suggestion = {
      id: "test_1",
      type: "action",
      text: "Run the tests",
      confidence: 0.9,
      reason: "test",
      context: { based_on: "template" },
    };

    await store.recordSuggestion(suggestion);
    await store.recordOutcome(suggestion.id, "accepted");

    const stats = await store.getStats();
    expect(stats.accepted_count).toBe(1);
  });

  test("records dismissed suggestion", async () => {
    const suggestion: Suggestion = {
      id: "test_2",
      type: "question",
      text: "Should we add tests?",
      confidence: 0.7,
      reason: "test",
      context: { based_on: "template" },
    };

    await store.recordSuggestion(suggestion);
    await store.recordOutcome(suggestion.id, "dismissed");

    const stats = await store.getStats();
    expect(stats.dismissed_count).toBe(1);
  });

  test("calculates acceptance rate", async () => {
    // Add mix of accepted/dismissed
    for (let i = 0; i < 5; i++) {
      const s: Suggestion = {
        id: `test_${i}`,
        type: "action",
        text: `Suggestion ${i}`,
        confidence: 0.8,
        reason: "test",
        context: { based_on: "template" },
      };
      await store.recordSuggestion(s);
      await store.recordOutcome(s.id, i % 2 === 0 ? "accepted" : "dismissed");
    }

    const stats = await store.getStats();
    expect(stats.acceptance_rate).toBeGreaterThan(0);
    expect(stats.acceptance_rate).toBeLessThanOrEqual(1);
  });
});
