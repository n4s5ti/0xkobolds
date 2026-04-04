import type { CustomTemplate } from "./templates.js";

export interface TeamConfigData {
  teamId: string;
  templates: CustomTemplate[];
  preferences?: {
    defaultIntent?: string;
    maxSuggestions?: number;
  };
  patterns?: string[];
}

export class TeamConfig {
  private teamId: string;
  private sharedTemplates: CustomTemplate[] = [];
  private preferences: TeamConfigData["preferences"] = {};
  private patterns: string[] = [];

  constructor(teamId: string) {
    this.teamId = teamId;
  }

  addSharedTemplate(template: CustomTemplate): void {
    this.sharedTemplates.push(template);
  }

  removeSharedTemplate(name: string): boolean {
    const index = this.sharedTemplates.findIndex(t => t.name === name);
    if (index >= 0) {
      this.sharedTemplates.splice(index, 1);
      return true;
    }
    return false;
  }

  getSharedTemplates(): CustomTemplate[] {
    return [...this.sharedTemplates];
  }

  setPreference(key: string, value: unknown): void {
    this.preferences = { ...this.preferences, [key]: value as never };
  }

  getPreference<T>(key: string): T | undefined {
    return this.preferences?.[key as keyof typeof this.preferences] as T | undefined;
  }

  addPattern(pattern: string): void {
    if (!this.patterns.includes(pattern)) {
      this.patterns.push(pattern);
    }
  }

  getPatterns(): string[] {
    return [...this.patterns];
  }

  toJSON(): string {
    const data: TeamConfigData = {
      teamId: this.teamId,
      templates: this.sharedTemplates,
      preferences: this.preferences,
      patterns: this.patterns,
    };
    return JSON.stringify(data, null, 2);
  }

  fromJSON(json: string): void {
    try {
      const data = JSON.parse(json) as TeamConfigData;
      this.teamId = data.teamId;
      this.sharedTemplates = data.templates || [];
      this.preferences = data.preferences || {};
      this.patterns = data.patterns || [];
    } catch (error) {
      console.error("[pi-suggest] Failed to parse team config:", error);
    }
  }

  getTeamId(): string {
    return this.teamId;
  }
}

export default TeamConfig;
