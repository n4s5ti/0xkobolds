import { describe, test, expect } from "bun:test";
import { SessionAnalyzer } from "../../dist/core/session.js";

describe("Session Analyzer", () => {

  test("extracts topics from messages", () => {
    const analyzer = new SessionAnalyzer();
    const messages = [
      { role: "user", content: "Fix the authentication bug" },
      { role: "assistant", content: "I'll fix the auth issue" },
      { role: "user", content: "Create a new component" },
    ] as any[];

    const topics = analyzer.extractTopics(messages);
    expect(topics).toContain("auth");
    expect(topics).toContain("component");
  });

  test("detects decisions made", () => {
    const analyzer = new SessionAnalyzer();
    const messages = [
      { role: "user", content: "Let's use TypeScript for this" },
      { role: "assistant", content: "Agreed, TypeScript is a good choice" },
    ] as any[];

    const decisions = analyzer.detectDecisions(messages);
    expect(decisions.length).toBeGreaterThan(0);
  });

  test("tracks tasks in progress", () => {
    const analyzer = new SessionAnalyzer();
    const messages = [
      { role: "user", content: "I need to implement user login" },
      { role: "assistant", content: "Starting the login implementation" },
    ] as any[];

    const tasks = analyzer.getTasksInProgress(messages);
    expect(tasks.length).toBeGreaterThan(0);
  });

  test("summarizes session", () => {
    const analyzer = new SessionAnalyzer();
    const messages = [
      { role: "user", content: "Fix the bug" },
      { role: "assistant", content: "Fixed" },
      { role: "user", content: "Run tests" },
    ] as any[];

    const summary = analyzer.summarize(messages);
    expect(summary).toHaveProperty("topics");
    expect(summary).toHaveProperty("decisions");
    expect(summary).toHaveProperty("tasks_in_progress");
    expect(summary).toHaveProperty("intent");
    expect(summary).toHaveProperty("last_action");
  });

  test("extracts recent files from messages", () => {
    const analyzer = new SessionAnalyzer();
    const messages = [
      { role: "user", content: "Check src/auth/login.ts for errors" },
    ] as any[];

    const files = analyzer.getRecentFiles(messages);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toContain("login.ts");
  });

  test("identifies blockers", () => {
    const analyzer = new SessionAnalyzer();
    const messages = [
      { role: "user", content: "I'm stuck on this error: cannot read property 'x'" },
    ] as any[];

    const blockers = analyzer.getBlockers(messages);
    expect(blockers.length).toBeGreaterThan(0);
  });
});
