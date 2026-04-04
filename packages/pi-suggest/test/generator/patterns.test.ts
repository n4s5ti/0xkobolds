import { describe, test, expect } from "bun:test";
import { PatternRecognizer } from "../../dist/generator/patterns.js";

describe("Pattern Recognizer", () => {
  let recognizer: PatternRecognizer;

  test("detects implement-then-test pattern", () => {
    recognizer = new PatternRecognizer();
    const history = [
      "Create a new component",
      "Implement the feature",
      "Test the implementation",
    ];
    
    const patterns = recognizer.detectPatterns(history);
    expect(patterns.length).toBeGreaterThan(0);
  });

  test("detects commit-after-test pattern", () => {
    recognizer = new PatternRecognizer();
    const history = [
      "Run the tests",
      "All tests passed",
      "Commit the changes",
    ];
    
    const patterns = recognizer.detectPatterns(history);
    expect(patterns.some(p => p.name === "test_then_commit")).toBe(true);
  });

  test("extracts common sequences", () => {
    recognizer = new PatternRecognizer();
    const history = [
      "Create X",
      "Test X",
      "Commit X",
    ];
    
    const sequences = recognizer.extractCommonSequences(history);
    expect(sequences.length).toBeGreaterThan(0);
  });

  test("generates suggestion from pattern", () => {
    recognizer = new PatternRecognizer();
    const history = [
      "Create a new API endpoint",
      "Implement the feature",
    ];
    
    const suggestion = recognizer.suggestFromPattern(history);
    expect(suggestion).toBeTruthy();
    expect(typeof suggestion).toBe("string");
  });

  test("suggests test after create", () => {
    recognizer = new PatternRecognizer();
    const history = ["Create a new function"];
    const suggestion = recognizer.suggestFromPattern(history);
    expect(suggestion?.toLowerCase()).toContain("test");
  });

  test("suggests commit after test", () => {
    recognizer = new PatternRecognizer();
    const history = ["All tests passed"];
    const suggestion = recognizer.suggestFromPattern(history);
    expect(suggestion?.toLowerCase()).toContain("commit");
  });
});
