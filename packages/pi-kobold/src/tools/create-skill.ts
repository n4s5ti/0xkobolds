/**
 * Create Skill Tool
 * 
 * Meta-skill that generates boilerplate for new pi-coding-agent skills.
 * Creates the SKILL.md, index.ts, and template files.
 */

import { defineTool } from "@mariozechner/pi-coding-agent";
import type { 
  ExtensionContext, 
  AgentToolResult 
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";

// Skill template
const SKILL_TEMPLATE = `# {{name}}

## Description

{{description}}

## Usage

\`\`\`typescript
import { {{name}} } from '@0xkobold/pi-kobold/skills/{{name}}';

const result = await {{name}}.execute({
  {{#parameters}}
  {{name}}: "value"
  {{/parameters}}
});
\`\`\`

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
{{#parameters}}
| {{name}} | {{type}} | {{required}} | {{description}} |
{{/parameters}}

## Returns

\`\`\`typescript
{
  success: boolean;
  data?: any;
  error?: string;
}
\`\`\`

## Examples

### Example 1: Basic usage

\`\`\`typescript
const result = await {{name}}.execute({
  input: "value"
});
\`\`\`

## Notes

- {{notes}}
`;

const INDEX_TEMPLATE = `import { {{name}} } from "@mariozechner/pi-coding-agent";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

/**
 * {{description}}
 */
export const {{name}}: ToolDefinition = {
  name: "{{name}}",
  label: "{{label}}",
  description: "{{description}}",
  parameters: {{parametersSchema}},
  
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    try {
      // Implementation here
      const result = await execute{{pascalName}}(params);
      
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: \`Error: \${error instanceof Error ? error.message : String(error)}\` 
        }],
        details: { error: true },
      };
    }
  }
};

async function execute{{pascalName}}(params: any) {
  // TODO: Implement
  return { success: true, data: params };
}

export default {{name}};
`;

const TEST_TEMPLATE = `import { describe, expect, test } from "bun:test";
import { {{name}} } from "../src/index.js";

describe("{{name}}", () => {
  test("should execute successfully", async () => {
    // Mock context
    const ctx = {
      cwd: process.cwd(),
    } as any;
    
    const result = await {{name}}.execute(
      "test-call",
      { input: "test" },
      undefined,
      undefined,
      ctx
    );
    
    expect(result.success).toBe(true);
  });
});
`;

export const createSkillTool = defineTool({
  name: "kobold_create_skill",
  label: "Create Skill",
  description: "Generate boilerplate code for a new pi-coding-agent skill",
  parameters: Type.Object({
    name: Type.String({ description: "Skill name (kebab-case)" }),
    description: Type.String({ description: "Short description of what the skill does" }),
    path: Type.String({ description: "Directory to create skill in (default: .pi/skills/)" }),
    label: Type.Optional(Type.String({ description: "Human-readable label" })),
    parameters: Type.Optional(Type.Array(Type.Object({
      name: Type.String(),
      type: Type.String(),
      description: Type.String(),
      required: Type.Boolean(),
    }), { description: "Skill parameters" })),
    notes: Type.Optional(Type.String({ description: "Additional notes for SKILL.md" })),
  }),
  
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    const { 
      name, 
      description, 
      path: skillPath = ".pi/skills/",
      label = name,
      parameters = [],
      notes = "Add implementation details here" 
    } = params;
    
    try {
      const pascalName = name.replace(/-./g, m => m[1].toUpperCase())
        .replace(/^./, m => m.toUpperCase());
      
      const targetDir = join(skillPath, name);
      
      // Create directory
      await mkdir(targetDir, { recursive: true });
      
      // Generate parameter schema
      const schemaProps: Record<string, any> = {};
      const required: string[] = [];
      
      for (const param of parameters) {
        schemaProps[param.name] = { 
          type: param.type === "number" ? "number" : "string",
          description: param.description 
        };
        if (param.required) required.push(param.name);
      }
      
      const parametersSchema = JSON.stringify({
        type: "object",
        properties: schemaProps,
        required,
      }, null, 2);
      
      // Generate SKILL.md
      const skillDoc = SKILL_TEMPLATE
        .replace(/{{name}}/g, name)
        .replace(/{{description}}/g, description)
        .replace(/{{label}}/g, label)
        .replace(/{{notes}}/g, notes)
        .replace(/{{#parameters}}([\s\S]*?){{\/parameters}}/g, parameters.map(p => 
          `| ${p.name} | ${p.type} | ${p.required ? "Yes" : "No"} | ${p.description} |`
        ).join("\n"));
      
      // Generate index.ts
      const indexCode = INDEX_TEMPLATE
        .replace(/{{name}}/g, name)
        .replace(/{{pascalName}}/g, pascalName)
        .replace(/{{description}}/g, description)
        .replace(/{{label}}/g, label)
        .replace(/{{parametersSchema}}/g, parametersSchema);
      
      // Generate test file
      const testCode = TEST_TEMPLATE
        .replace(/{{name}}/g, name);
      
      // Write files
      await writeFile(join(targetDir, "SKILL.md"), skillDoc, "utf-8");
      await writeFile(join(targetDir, "index.ts"), indexCode, "utf-8");
      await writeFile(join(targetDir, "test.ts"), testCode, "utf-8");
      
      return {
        content: [{ 
          type: "text" as const, 
          text: `✅ Created skill "${name}" at ${targetDir}/\n\nFiles created:\n- SKILL.md\n- index.ts\n- test.ts\n\nNext steps:\n1. Open ${targetDir}/index.ts\n2. Implement the execute function\n3. Run tests: bun test ${targetDir}/test.ts`
        }],
        details: { created: true, path: targetDir },
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text" as const, 
          text: `❌ Failed to create skill: ${error instanceof Error ? error.message : String(error)}`
        }],
        details: { error: true },
      };
    }
  }
});
