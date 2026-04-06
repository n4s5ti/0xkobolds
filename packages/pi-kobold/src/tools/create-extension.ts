/**
 * Create Extension Tool
 *
 * Meta-skill that generates boilerplate for new pi-coding-agent extensions.
 */

import { defineTool } from "@mariozechner/pi-coding-agent";
import type { ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const PACKAGE_TEMPLATE = `{
  "name": "{{name}}",
  "version": "0.1.0",
  "description": "{{description}}",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/", "src/", "README.md"],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "bun test",
    "prepublishOnly": "npm run build && npm test"
  },
  "pi": {
    "extensions": ["./dist/index.js"]
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": ">=0.65.0",
    "@sinclair/typebox": ">=0.32.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
`;

const INDEX_TEMPLATE = `/**
 * {{name}} Extension
 *
 * {{description}}
 */

import { defineTool } from "@mariozechner/pi-coding-agent";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const {{camelName}}Tool = defineTool({
  name: "{{toolName}}",
  label: "{{label}}",
  description: "{{description}}",
  parameters: Type.Object({
    input: Type.String({ description: "Input parameter" }),
  }),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    try {
      const result = { success: true, input: params.input };
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
});

export const tools: ToolDefinition[] = [{{camelName}}Tool];

export default tools;

console.log("[{{name}}] Extension loaded");
`;

const TSCONFIG_TEMPLATE = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "strict": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "noEmit": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
`;

const README_TEMPLATE = `# {{name}}

{{description}}

## Installation

\`\`\`bash
npm install {{name}}
# or
yarn add {{name}}
\`\`\`

## Usage

\`\`\`typescript
import { tools } from '{{name}}';
\`\`\`

## Tools

### {{toolName}}

{{description}}

## Development

\`\`\`bash
npm run build
npm test
\`\`\`
`;

export const createExtensionTool = defineTool({
  name: "kobold_create_extension",
  label: "Create Extension",
  description: "Generate boilerplate code for a new pi-coding-agent extension",
  parameters: Type.Object({
    name: Type.String({ description: "Extension package name" }),
    description: Type.String({ description: "Short description" }),
    path: Type.String({ description: "Directory to create extension in" }),
    toolName: Type.Optional(Type.String({ description: "Main tool name" })),
    label: Type.Optional(Type.String({ description: "Human-readable label" })),
  }),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    const {
      name,
      description,
      path: extPath,
      toolName = name.replace(/^@.*\//, "").replace(/-/g, "_"),
      label = name,
    } = params;

    try {
      const camelName = name.replace(/^@.*\//, "").replace(/[-_](.)/g, (_, c) => c.toUpperCase());

      const targetDir = join(extPath, name.replace(/^@.*\//, ""));
      const srcDir = join(targetDir, "src");

      // Create directories
      await mkdir(srcDir, { recursive: true });

      // Generate files
      const packageJson = PACKAGE_TEMPLATE
        .replace(/{{name}}/g, name)
        .replace(/{{description}}/g, description);

      const indexTs = INDEX_TEMPLATE
        .replace(/{{name}}/g, name)
        .replace(/{{camelName}}/g, camelName)
        .replace(/{{toolName}}/g, toolName)
        .replace(/{{label}}/g, label)
        .replace(/{{description}}/g, description);

      const tsconfig = TSCONFIG_TEMPLATE;

      const readme = README_TEMPLATE
        .replace(/{{name}}/g, name)
        .replace(/{{toolName}}/g, toolName)
        .replace(/{{description}}/g, description);

      // Write files
      await writeFile(join(targetDir, "package.json"), packageJson, "utf-8");
      await writeFile(join(srcDir, "index.ts"), indexTs, "utf-8");
      await writeFile(join(targetDir, "tsconfig.json"), tsconfig, "utf-8");
      await writeFile(join(targetDir, "README.md"), readme, "utf-8");

      return {
        content: [{
          type: "text" as const,
          text: `✅ Created extension "${name}" at ${targetDir}/\n\nFiles created:\n- package.json\n- src/index.ts\n- tsconfig.json\n- README.md\n\nNext steps:\n1. cd ${targetDir}\n2. npm install\n3. Implement your tool\n4. npm run build`
        }],
        details: { created: true, path: targetDir },
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed to create extension: ${error instanceof Error ? error.message : String(error)}`
        }],
        details: { error: true },
      };
    }
  }
});
