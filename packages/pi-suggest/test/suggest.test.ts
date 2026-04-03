import { describe, test, expect } from "bun:test";
import { GhostSuggestionEditor } from "../src/index.js";

describe("Ghost Suggestion Editor", () => {
  test("GhostSuggestionEditor class exists", () => {
    expect(GhostSuggestionEditor).toBeDefined();
    expect(typeof GhostSuggestionEditor).toBe("function");
  });
});

describe("Suggestion Inference", () => {
  test("infers test suggestion after fix", async () => {
    const { inferNextPrompt } = await import("../src/index.js");
    
    // @ts-ignore - importing private function for testing
    const suggestion = inferNextPrompt("Fix the error in the code", ["Fix the error"]);
    expect(suggestion).toBe("Test the changes");
  });

  test("infers run tests after create", async () => {
    const { inferNextPrompt } = await import("../src/index.js");
    
    // @ts-ignore
    const suggestion = inferNextPrompt("Create a new component", ["Create a new component"]);
    expect(suggestion).toBe("Test the implementation");
  });

  test("returns undefined for unknown context", async () => {
    const { inferNextPrompt } = await import("../src/index.js");
    
    // @ts-ignore
    const suggestion = inferNextPrompt("Hello there", []);
    expect(suggestion).toBeUndefined();
  });
});

describe("Extension Export", () => {
  test("extension is exported as default", async () => {
    const module = await import("../src/index.js");
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe("function");
  });
});
