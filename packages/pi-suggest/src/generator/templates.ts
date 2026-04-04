/**
 * Suggestion Templates - Pre-defined suggestion templates by intent and type
 */

export type SuggestionType = "action" | "question" | "observation" | "offer";

export interface SuggestionTemplate {
  type: SuggestionType;
  template: string | ((context: TemplateContext) => string);
  intent: string[];
  minConfidence?: number;
}

export interface TemplateContext {
  topic?: string;
  file?: string;
  decision?: string;
  task?: string;
  blocker?: string;
}

// Template definitions organized by intent and type
export const TEMPLATES: SuggestionTemplate[] = [
  // DEBUG Intent
  {
    type: "action",
    template: "Run the tests to verify the fix works",
    intent: ["DEBUG"],
  },
  {
    type: "question",
    template: "Should we add error handling for edge cases?",
    intent: ["DEBUG", "IMPLEMENT"],
  },
  {
    type: "action",
    template: (ctx) => `Check ${ctx.file || "the file"} with verbose logging`,
    intent: ["DEBUG"],
  },
  {
    type: "action",
    template: "Add a breakpoint to see where it fails",
    intent: ["DEBUG"],
  },
  {
    type: "action",
    template: "Run with debug flags to see the full error",
    intent: ["DEBUG"],
  },
  {
    type: "question",
    template: "Did this ever work, or is this a new regression?",
    intent: ["DEBUG"],
  },

  // IMPLEMENT Intent
  {
    type: "action",
    template: "Test the implementation",
    intent: ["IMPLEMENT"],
  },
  {
    type: "action",
    template: "Run tests for the new implementation",
    intent: ["IMPLEMENT"],
  },
  {
    type: "offer",
    template: "I can add input validation if you want",
    intent: ["IMPLEMENT"],
  },
  {
    type: "offer",
    template: "Should I add error handling too?",
    intent: ["IMPLEMENT"],
  },
  {
    type: "question",
    template: (ctx) => `Should we extract this to a ${ctx.topic || "service"} class?`,
    intent: ["IMPLEMENT"],
  },
  {
    type: "observation",
    template: (ctx) => `This ${ctx.topic || "function"} is getting complex, consider splitting it`,
    intent: ["IMPLEMENT", "REFACTOR"],
  },

  // REFACTOR Intent
  {
    type: "offer",
    template: "I can add documentation while we're here",
    intent: ["REFACTOR"],
  },
  {
    type: "action",
    template: "Run tests after refactoring to ensure nothing broke",
    intent: ["REFACTOR"],
  },
  {
    type: "question",
    template: "Should we update the tests too?",
    intent: ["REFACTOR"],
  },

  // RESEARCH Intent
  {
    type: "action",
    template: "Let me search for examples",
    intent: ["RESEARCH"],
  },
  {
    type: "question",
    template: "Would you like me to find the official documentation?",
    intent: ["RESEARCH"],
  },

  // PLAN Intent
  {
    type: "action",
    template: "Add this to the project backlog",
    intent: ["PLAN"],
  },
  {
    type: "question",
    template: "Should we write an ADR for this decision?",
    intent: ["PLAN"],
  },
  {
    type: "action",
    template: "Break this into smaller tasks first",
    intent: ["PLAN"],
  },

  // REVIEW Intent
  {
    type: "action",
    template: "Make any necessary fixes based on the review",
    intent: ["REVIEW"],
  },
  {
    type: "question",
    template: "Any security concerns to address?",
    intent: ["REVIEW"],
  },

  // GENERAL Intent (default)
  {
    type: "action",
    template: "Continue with the next step",
    intent: ["GENERAL"],
  },
  {
    type: "action",
    template: "Run the tests",
    intent: ["GENERAL"],
  },
  {
    type: "question",
    template: "What would you like to do next?",
    intent: ["GENERAL"],
  },
  {
    type: "action",
    template: "Commit the changes",
    intent: ["GENERAL"],
    minConfidence: 0.8,
  },
];

export default TEMPLATES;
