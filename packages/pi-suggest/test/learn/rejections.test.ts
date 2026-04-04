import { describe, test, expect } from "bun:test";
import { RejectionPatternDetector } from "../../dist/learn/rejections.js";

describe("Rejection Pattern Detector", () => {
  test("detects repeated rejections of same suggestion type", () => {
    const detector = new RejectionPatternDetector();
    
    detector.record({
      suggestion: "Commit the changes",
      accepted: false,
    });
    detector.record({
      suggestion: "Commit to git",
      accepted: false,
    });
    detector.record({
      suggestion: "Save changes",
      accepted: false,
    });
    
    const patterns = detector.detectPatterns();
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].category).toBe("committing");
  });

  test("returns confidence based on rejection count", () => {
    const detector = new RejectionPatternDetector();
    
    // Reject "commit" 5 times
    for (let i = 0; i < 5; i++) {
      detector.record({ suggestion: "Commit the changes", accepted: false });
    }
    
    const patterns = detector.detectPatterns();
    expect(patterns[0].confidence).toBeGreaterThan(0.5);
  });

  test("does not flag occasional rejections", () => {
    const detector = new RejectionPatternDetector();
    
    detector.record({ suggestion: "Run the tests", accepted: false });
    
    const patterns = detector.detectPatterns();
    // Single rejection should not create a pattern
    expect(patterns.filter(p => p.category === "testing").length).toBe(0);
  });

  test("generates avoid list from patterns", () => {
    const detector = new RejectionPatternDetector();
    
    // Need 5+ rejections for confidence > 0.7
    for (let i = 0; i < 5; i++) {
      detector.record({ suggestion: "Commit the changes", accepted: false });
    }
    
    const avoidList = detector.getAvoidList();
    expect(avoidList.length).toBeGreaterThan(0);
  });
});
