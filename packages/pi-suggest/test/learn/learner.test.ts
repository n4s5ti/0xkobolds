import { describe, test, expect } from "bun:test";
import { SuggestionLearner } from "../../dist/learn/learner.js";

describe("Suggestion Learner", () => {
  test("records accepted suggestion", () => {
    const learner = new SuggestionLearner();
    
    learner.recordOutcome({
      suggestion: "Run the tests",
      type: "action",
      accepted: true,
    });
    
    const stats = learner.getStats();
    expect(stats.total).toBe(1);
    expect(stats.accepted).toBe(1);
    expect(stats.rejected).toBe(0);
  });

  test("records rejected suggestion", () => {
    const learner = new SuggestionLearner();
    
    learner.recordOutcome({
      suggestion: "Run the tests",
      type: "action",
      accepted: false,
    });
    
    const stats = learner.getStats();
    expect(stats.total).toBe(1);
    expect(stats.accepted).toBe(0);
    expect(stats.rejected).toBe(1);
  });

  test("calculates acceptance rate", () => {
    const learner = new SuggestionLearner();
    
    learner.recordOutcome({ suggestion: "A", type: "action", accepted: true });
    learner.recordOutcome({ suggestion: "B", type: "action", accepted: true });
    learner.recordOutcome({ suggestion: "C", type: "action", accepted: false });
    
    const stats = learner.getStats();
    expect(stats.acceptanceRate).toBeCloseTo(0.667, 1);
  });

  test("learns from suggestions with similar text", () => {
    const learner = new SuggestionLearner();
    
    // Accept "run the tests" multiple times
    learner.recordOutcome({ suggestion: "Run the tests", type: "action", accepted: true });
    learner.recordOutcome({ suggestion: "Run the tests", type: "action", accepted: true });
    learner.recordOutcome({ suggestion: "Run the tests", type: "action", accepted: true });
    
    // Should boost confidence for exact matches
    const boost = learner.getSuggestionBoost("Run the tests");
    expect(boost).toBeGreaterThan(1.0);
  });

  test("penalizes frequently rejected suggestions", () => {
    const learner = new SuggestionLearner();
    
    // Reject "commit the changes" multiple times
    learner.recordOutcome({ suggestion: "Commit the changes", type: "action", accepted: false });
    learner.recordOutcome({ suggestion: "Commit the changes", type: "action", accepted: false });
    learner.recordOutcome({ suggestion: "Commit the changes", type: "action", accepted: false });
    
    // Should penalize this suggestion type
    const boost = learner.getSuggestionBoost("Commit the changes");
    expect(boost).toBeLessThan(1.0);
  });

  test("suggests alternatives for rejected patterns", () => {
    const learner = new SuggestionLearner();
    
    // User always rejects "commit" suggestions (need 3+)
    learner.recordOutcome({ suggestion: "Commit the changes", type: "action", accepted: false });
    learner.recordOutcome({ suggestion: "Commit the changes", type: "action", accepted: false });
    learner.recordOutcome({ suggestion: "Commit the changes", type: "action", accepted: false });
    
    // Should suggest alternatives when rejection rate is high
    const alternative = learner.getAlternativeSuggestion("Commit the changes");
    expect(alternative).toBeTruthy();
  });
});
