import { describe, test, expect } from "bun:test";
import { PreferenceExtractor } from "../../dist/learn/preferences.js";

describe("Preference Extractor", () => {
  test("extracts testing preferences", () => {
    const extractor = new PreferenceExtractor();
    
    const messages = [
      "I prefer writing tests first",
      "Always run tests before committing",
    ];
    
    const prefs = extractor.extractPreferences(messages);
    expect(prefs.some(p => p.text.includes("test") || p.text.includes("Test"))).toBe(true);
  });

  test("extracts commit preferences", () => {
    const extractor = new PreferenceExtractor();
    
    const messages = [
      "I commit frequently with small changes",
      "Don't force me to commit",
    ];
    
    const prefs = extractor.extractPreferences(messages);
    expect(prefs.some(p => p.text.toLowerCase().includes("commit"))).toBe(true);
  });

  test("extracts code style preferences", () => {
    const extractor = new PreferenceExtractor();
    
    const messages = [
      "I prefer TypeScript over JavaScript",
      "Use async/await instead of callbacks",
    ];
    
    const prefs = extractor.extractPreferences(messages);
    expect(prefs.length).toBeGreaterThan(0);
  });

  test("returns empty for no preferences", () => {
    const extractor = new PreferenceExtractor();
    
    const messages = [
      "Create a new file",
      "Add some code",
    ];
    
    const prefs = extractor.extractPreferences(messages);
    expect(prefs.length).toBe(0);
  });
});
