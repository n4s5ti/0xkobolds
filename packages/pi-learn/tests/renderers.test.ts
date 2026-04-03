import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPeerCardRenderer, createListItem } from "../src/renderers";
import { visibleWidth } from "@mariozechner/pi-tui";

// Mock theme - no ANSI codes for easier testing
const mockTheme = {
  fg: (color: string, text: string) => text,
  bold: (text: string) => text,
  bg: (color: string, text: string) => text,
};

// Import the private truncateToWidth logic by testing indirectly
describe("createListItem truncation", () => {
  it("should truncate long values to fit maxValueWidth", () => {
    // Create list item with max width of 50
    const longValue = "Cognitive architectures for AI agents, Local-first AI infrastructure, Memory consolidation algorithms (dreaming), Functional programming paradigms";
    
    const item = createListItem("Interests", longValue, mockTheme, 50);
    const lines = item.render(83);
    
    // Each line should fit within 83 visible chars
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(83);
    }
    
    // Should contain ellipsis since value was truncated
    expect(lines.join("").includes("...")).toBe(true);
  });

  it("should not truncate values within limit", () => {
    const shortValue = "AI, Privacy, Testing";
    
    const item = createListItem("Interests", shortValue, mockTheme, 50);
    const lines = item.render(83);
    
    // Check all lines fit
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(83);
    }
    expect(lines.join("")).toContain(shortValue);
    expect(lines.join("").includes("...")).toBe(false);
  });
});

describe("createPeerCardRenderer", () => {
  it("should render peer card without exceeding terminal width", () => {
    const peerCard = {
      name: "Warren Gates",
      occupation: "Systems Architect / AI Infrastructure Engineer",
      interests: [
        "Cognitive architectures for AI agents",
        "Local-first AI infrastructure",
        "Memory consolidation algorithms (dreaming)",
        "Functional programming paradigms",
        "Privacy-preserving machine learning",
        "Agent persistence layers",
      ],
      traits: [
        "Perfectionist",
        "Methodical validator",
        "Architecture purist",
        "Impatient with friction",
        "Privacy-conscious",
      ],
      goals: [
        "Ship production-grade open-source agent memory system",
        "Achieve feature parity with Honcho",
        "Implement biological-inspired memory (dreaming/consolidation)",
      ],
    };

    const renderer = createPeerCardRenderer(peerCard, mockTheme);
    const lines = renderer.render(83);

    // Check that no line exceeds terminal width (using visibleWidth for ANSI-aware measurement)
    let hasOverflow = false;
    for (let i = 0; i < lines.length; i++) {
      const visible = visibleWidth(lines[i]);
      if (visible > 83) {
        console.log(`Line ${i} overflow: ${visible} visible chars`);
        hasOverflow = true;
      }
    }

    expect(hasOverflow).toBe(false);
  });
});
