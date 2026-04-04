import { describe, test, expect } from "bun:test";
import { TeamConfig } from "../../dist/config/sharing.js";

describe("Team Config", () => {
  test("creates team config", () => {
    const config = new TeamConfig("my-team");
    expect(config.teamId).toBe("my-team");
  });

  test("adds shared templates", () => {
    const config = new TeamConfig("test-team");
    
    config.addSharedTemplate({
      name: "team-test",
      template: "Run team tests",
      intent: ["IMPLEMENT"],
    });
    
    expect(config.getSharedTemplates().length).toBe(1);
  });

  test("exports config as JSON", () => {
    const config = new TeamConfig("export-team");
    
    config.addSharedTemplate({
      name: "export-test",
      template: "Export this",
      intent: ["GENERAL"],
    });
    
    const json = config.toJSON();
    expect(json).toContain("export-team");
    expect(json).toContain("export-test");
  });

  test("loads config from JSON", () => {
    const config = new TeamConfig("import-team");
    
    const json = JSON.stringify({
      teamId: "import-team",
      templates: [
        { name: "import-test", template: "Import this", intent: ["GENERAL"] },
      ],
    });
    
    config.fromJSON(json);
    expect(config.getSharedTemplates().length).toBe(1);
  });
});
