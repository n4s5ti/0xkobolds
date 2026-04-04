import { describe, test, expect } from "bun:test";
import { TemplateManager, type CustomTemplate } from "../../dist/config/templates.js";

describe("Template Manager", () => {
  test("loads custom templates", () => {
    const manager = new TemplateManager();
    
    manager.addTemplate({
      name: "custom-test",
      template: "Run custom tests for {topic}",
      intent: ["IMPLEMENT"],
    });
    
    const templates = manager.getTemplates();
    expect(templates.some(t => t.name === "custom-test")).toBe(true);
  });

  test("renders template with variables", () => {
    const manager = new TemplateManager();
    
    manager.addTemplate({
      name: "greet",
      template: "Hello {name}!",
      intent: ["GENERAL"],
    });
    
    const rendered = manager.renderTemplate("greet", { name: "World" });
    expect(rendered).toBe("Hello World!");
  });

  test("returns undefined for missing template", () => {
    const manager = new TemplateManager();
    const rendered = manager.renderTemplate("nonexistent", {});
    expect(rendered).toBeUndefined();
  });

  test("removes template", () => {
    const manager = new TemplateManager();
    
    manager.addTemplate({
      name: "temp",
      template: "Temporary",
      intent: ["GENERAL"],
    });
    
    manager.removeTemplate("temp");
    expect(manager.getTemplates().some(t => t.name === "temp")).toBe(false);
  });

  test("loads from JSON config", () => {
    const manager = new TemplateManager();
    
    const config: CustomTemplate[] = [
      { name: "test-first", template: "Write tests first", intent: ["IMPLEMENT"] },
      { name: "commit-msg", template: "Commit: {message}", intent: ["GENERAL"] },
    ];
    
    manager.loadFromConfig(config);
    expect(manager.getTemplates().length).toBeGreaterThanOrEqual(2);
  });
});
