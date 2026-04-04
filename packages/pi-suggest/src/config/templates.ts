export interface CustomTemplate {
  name: string;
  template: string;
  intent: string[];
  type?: "action" | "question" | "observation" | "offer";
}

export class TemplateManager {
  private templates: Map<string, CustomTemplate> = new Map();

  addTemplate(template: CustomTemplate): void {
    this.templates.set(template.name, template);
  }

  removeTemplate(name: string): boolean {
    return this.templates.delete(name);
  }

  getTemplate(name: string): CustomTemplate | undefined {
    return this.templates.get(name);
  }

  getTemplates(): CustomTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplatesForIntent(intent: string): CustomTemplate[] {
    return this.getTemplates().filter(t => 
      t.intent.includes(intent) || t.intent.includes("GENERAL")
    );
  }

  renderTemplate(name: string, variables: Record<string, string>): string | undefined {
    const template = this.getTemplate(name);
    if (!template) return undefined;

    let rendered = template.template;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`\\{${key}\\}`, "g"), value);
    }
    return rendered;
  }

  loadFromConfig(config: CustomTemplate[]): void {
    for (const template of config) {
      this.addTemplate(template);
    }
  }

  exportToConfig(): CustomTemplate[] {
    return this.getTemplates();
  }
}

export default TemplateManager;
