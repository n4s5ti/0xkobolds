import { describe, test, expect } from "bun:test";
import { IntentClassifier, IntentType } from "../../dist/core/intent.js";

describe("Intent Classifier", () => {

  test("classifies DEBUG intent", () => {
    const classifier = new IntentClassifier();
    const intent = classifier.classify("Fix the error in authentication");
    expect(intent).toBe(IntentType.DEBUG);
  });

  test("classifies IMPLEMENT intent", () => {
    const classifier = new IntentClassifier();
    const intent = classifier.classify("Create a new user service");
    expect(intent).toBe(IntentType.IMPLEMENT);
  });

  test("classifies REFACTOR intent", () => {
    const classifier = new IntentClassifier();
    const intent = classifier.classify("Refactor this code to be cleaner");
    expect(intent).toBe(IntentType.REFACTOR);
  });

  test("classifies RESEARCH intent", () => {
    const classifier = new IntentClassifier();
    const intent = classifier.classify("How does this library work?");
    expect(intent).toBe(IntentType.RESEARCH);
  });

  test("classifies REVIEW intent", () => {
    const classifier = new IntentClassifier();
    const intent = classifier.classify("Review this code for security issues");
    expect(intent).toBe(IntentType.REVIEW);
  });

  test("classifies PLAN intent", () => {
    const classifier = new IntentClassifier();
    const intent = classifier.classify("Let's plan the architecture");
    expect(intent).toBe(IntentType.PLAN);
  });

  test("returns confidence score", () => {
    const classifier = new IntentClassifier();
    const result = classifier.classifyWithConfidence("Fix the bug");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test("returns result with intent, confidence, and reason", () => {
    const classifier = new IntentClassifier();
    const result = classifier.classifyWithConfidence("Create a new component");
    expect(result).toHaveProperty("intent");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("reason");
  });
});
