import { describe, test, expect } from "bun:test";
import { SuggestionWidget } from "../../dist/ui/widget.js";

describe("Suggestion Widget", () => {
  test("renders multiple suggestions", () => {
    const widget = new SuggestionWidget();
    
    const suggestions = [
      { text: "Run the tests", type: "action" as const },
      { text: "Add documentation", type: "offer" as const },
      { text: "Should we add tests?", type: "question" as const },
    ];
    
    widget.setSuggestions(suggestions);
    
    expect(widget.getSuggestions().length).toBe(3);
  });

  test("selects suggestion by index", () => {
    const widget = new SuggestionWidget();
    
    widget.setSuggestions([
      { text: "A", type: "action" as const },
      { text: "B", type: "action" as const },
      { text: "C", type: "action" as const },
    ]);
    
    widget.selectIndex(1);
    expect(widget.getSelectedText()).toBe("B");
  });

  test("returns undefined when no suggestions", () => {
    const widget = new SuggestionWidget();
    expect(widget.getSelectedText()).toBeUndefined();
  });

  test("clamps index to valid range", () => {
    const widget = new SuggestionWidget();
    
    widget.setSuggestions([
      { text: "A", type: "action" as const },
    ]);
    
    widget.selectIndex(10); // Out of bounds
    expect(widget.getSelectedIndex()).toBe(0);
    
    widget.selectIndex(-1); // Negative
    expect(widget.getSelectedIndex()).toBe(0);
  });

  test("renders suggestion with type indicator", () => {
    const widget = new SuggestionWidget();
    
    widget.setSuggestions([
      { text: "Test this", type: "action" as const },
      { text: "Should we?", type: "question" as const },
    ]);
    
    const rendered = widget.renderSuggestion(0);
    expect(rendered).toContain("1.");
    expect(rendered).toContain("Test this");
  });
});
