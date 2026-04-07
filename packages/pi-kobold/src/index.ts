/**
 * pi-kobold Extension
 *
 * Meta-extension that bundles the 0xKobold ecosystem:
 * - pi-orchestration (multi-agent workflows)
 * - pi-gateway (multi-platform messaging)
 * - pi-ollama (unified Ollama providers)
 * - pi-learn (persistent memory & reasoning)
 * - Dev tools (skill/extension scaffolding)
 *
 * Architecture: Each pi-* package declares `pi.extensions` in its
 * package.json, so pi auto-discovers and loads them all independently.
 * pi-kobold just adds its own unique tools on top.
 *
 * Standalone use: `pi install @0xkobold/pi-ollama` → works independently
 * Bundle use: `pi install @0xkobold/pi-kobold` → pulls everything via deps
 * Pick & mix: `pi install @0xkobold/pi-kobold @0xkobold/pi-learn` → no conflicts
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

// Library imports — direct function access, no extension loading
import {
  setDefaultLLMExecutor,
  orchestrate,
  formatOrchestrateResult,
  type LLMExecutor,
} from "@0xkobold/pi-orchestration";

// Re-export orchestration types and functions for library consumers
export type { OrchestrateOptions, OrchestrateResult, ChainResult, ParallelResult } from "@0xkobold/pi-orchestration";
export { orchestrate, formatOrchestrateResult };

// Re-export LLM adapter utilities
export {
  createLLMExecutor,
  createAsyncLLMExecutor,
  createMockLLMExecutor,
  type Message,
  type ChatOptions,
  type ChatResponse,
} from "./utils/llm-adapter.js";

// ============================================================================
// LLM Executor Storage
// ============================================================================

let initializedLLMExecutor: LLMExecutor | null = null;
let initialized = false;

/**
 * Initialize pi-kobold with an LLM executor
 */
export function initializeKobold(executor: LLMExecutor): void {
  if (initialized) {
    console.warn("[pi-kobold] Already initialized, skipping");
    return;
  }

  initializedLLMExecutor = executor;
  setDefaultLLMExecutor(executor);
  initialized = true;

  console.log("[pi-kobold] Initialized with LLM executor");
}

export function getLLMExecutor(): LLMExecutor | null {
  return initializedLLMExecutor;
}

export function isKoboldInitialized(): boolean {
  return initialized;
}

// ============================================================================
// Skill Templates
// ============================================================================

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

const SKILL_INDEX_TEMPLATE = `import { {{name}} } from "@mariozechner/pi-coding-agent";
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

const SKILL_TEST_TEMPLATE = `import { describe, expect, test } from "bun:test";
import { {{name}} } from "../src/index.js";

describe("{{name}}", () => {
  test("should execute successfully", async () => {
    const ctx = { cwd: process.cwd() } as any;
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

const EXT_PACKAGE_TEMPLATE = `{
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
    "prepublishOnly": "rm -rf dist && tsc"
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

const EXT_INDEX_TEMPLATE = `/**
 * {{name}} Extension
 *
 * {{description}}
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default async (pi: ExtensionAPI): Promise<void> => {
  pi.registerTool({
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

  console.log("[{{name}}] Extension loaded");
};
`;

const EXT_TSCONFIG_TEMPLATE = `{
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

const EXT_README_TEMPLATE = `# {{name}}

{{description}}

## Installation

\`\`\`bash
npm install {{name}}
# or
yarn add {{name}}
\`\`\`

## Usage

\`\`\`typescript
import extension from '{{name}}';
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

// ============================================================================
// Extension Entry Point
// ============================================================================

export default async (pi: ExtensionAPI): Promise<void> => {
  console.log("[pi-kobold] Meta-extension loading (orchestration, gateway, ollama, learn auto-loaded via pi)");

  // Check which sub-extensions pi auto-loaded
  const allTools = pi.getAllTools();
  const toolNames = new Set(allTools.map(t => t.name));

  const has = (prefix: string) => [...toolNames].some(name => name.startsWith(prefix));

  const orchestrationLoaded = has("orchestrate");
  const gatewayLoaded = has("gateway_");
  const ollamaLoaded = has("ollama") || has("ollama-status") || has("ollama_info");
  const learnLoaded = has("learn_");

  console.log(`[pi-kobold] Auto-detected extensions: orchestration=${orchestrationLoaded}, gateway=${gatewayLoaded}, ollama=${ollamaLoaded}, learn=${learnLoaded}`);

  // --------------------------------------------------------------------------
  // kobold_initialize - Initialize Kobold with LLM
  // --------------------------------------------------------------------------
  pi.registerTool({
    name: "kobold_initialize",
    label: "Initialize Kobold",
    description: "Initialize pi-kobold with LLM configuration (admin only)",
    parameters: Type.Object({
      model: Type.Optional(Type.String({ description: "Default model" })),
      temperature: Type.Optional(Type.Number({ description: "Default temperature" })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (initialized) {
        return {
          content: [{
            type: "text" as const,
            text: "✅ pi-kobold is already initialized",
          }],
          details: { initialized: true },
        };
      }

      // The placeholder executor — pi-ollama's provider registration handles
      // actual LLM calls through pi's routing, and pi-orchestration's
      // orchestrate tool self-initializes with pi-ollama/shared
      const executor: LLMExecutor = async (opts) => {
        console.log("[pi-kobold] Warning: Using placeholder LLM executor");
        return {
          content: "Error: LLM executor not properly initialized. pi-ollama should handle model routing.",
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        };
      };

      initializeKobold(executor);

      return {
        content: [{
          type: "text" as const,
          text: `✅ pi-kobold initialized\n\nExtensions detected:\n- Orchestration: ${orchestrationLoaded ? "✅" : "❌"}\n- Gateway: ${gatewayLoaded ? "✅" : "❌"}\n- Ollama: ${ollamaLoaded ? "✅" : "❌"}\n- Learn: ${learnLoaded ? "✅" : "❌"}`,
        }],
        details: {
          initialized: true,
          orchestration: orchestrationLoaded,
          gateway: gatewayLoaded,
          ollama: ollamaLoaded,
          learn: learnLoaded,
        },
      };
    },
  });

  // --------------------------------------------------------------------------
  // kobold_create_skill - Create Skill
  // --------------------------------------------------------------------------
  pi.registerTool({
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
        notes = "Add implementation details here",
      } = params;

      try {
        const pascalName = name
          .replace(/-./g, (m: string) => m[1].toUpperCase())
          .replace(/^./, (m: string) => m.toUpperCase());

        const targetDir = join(skillPath, name);

        await mkdir(targetDir, { recursive: true });

        const schemaProps: Record<string, any> = {};
        const required: string[] = [];

        for (const param of parameters) {
          schemaProps[param.name] = {
            type: param.type === "number" ? "number" : "string",
            description: param.description,
          };
          if (param.required) required.push(param.name);
        }

        const parametersSchema = JSON.stringify(
          { type: "object", properties: schemaProps, required },
          null,
          2
        );

        const paramTable = parameters.map(
          (p: any) => `| ${p.name} | ${p.type} | ${p.required ? "Yes" : "No"} | ${p.description} |`
        ).join("\n");

        const skillDoc = SKILL_TEMPLATE
          .replace(/{{name}}/g, name)
          .replace(/{{description}}/g, description)
          .replace(/{{label}}/g, label)
          .replace(/{{notes}}/g, notes)
          .replace(/{{#parameters}}[\s\S]*?{{\/parameters}}/g, paramTable || "| (none) | - | - | - |");

        const indexCode = SKILL_INDEX_TEMPLATE
          .replace(/{{name}}/g, name)
          .replace(/{{pascalName}}/g, pascalName)
          .replace(/{{description}}/g, description)
          .replace(/{{label}}/g, label)
          .replace(/{{parametersSchema}}/g, parametersSchema);

        const testCode = SKILL_TEST_TEMPLATE.replace(/{{name}}/g, name);

        await writeFile(join(targetDir, "SKILL.md"), skillDoc, "utf-8");
        await writeFile(join(targetDir, "index.ts"), indexCode, "utf-8");
        await writeFile(join(targetDir, "test.ts"), testCode, "utf-8");

        return {
          content: [{
            type: "text" as const,
            text: `✅ Created skill "${name}" at ${targetDir}/\n\nFiles created:\n- SKILL.md\n- index.ts\n- test.ts\n\nNext steps:\n1. Open ${targetDir}/index.ts\n2. Implement the execute function\n3. Run tests: bun test ${targetDir}/test.ts`,
          }],
          details: { created: true, path: targetDir },
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ Failed to create skill: ${error instanceof Error ? error.message : String(error)}`,
          }],
          details: { error: true },
        };
      }
    },
  });

  // --------------------------------------------------------------------------
  // kobold_create_extension - Create Extension
  // --------------------------------------------------------------------------
  pi.registerTool({
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
        const targetDir = join(extPath, name.replace(/^@.*\//, ""));
        const srcDir = join(targetDir, "src");

        await mkdir(srcDir, { recursive: true });

        const packageJson = EXT_PACKAGE_TEMPLATE
          .replace(/{{name}}/g, name)
          .replace(/{{description}}/g, description);

        const indexTs = EXT_INDEX_TEMPLATE
          .replace(/{{name}}/g, name)
          .replace(/{{toolName}}/g, toolName)
          .replace(/{{label}}/g, label)
          .replace(/{{description}}/g, description);

        const tsconfig = EXT_TSCONFIG_TEMPLATE;
        const readme = EXT_README_TEMPLATE
          .replace(/{{name}}/g, name)
          .replace(/{{toolName}}/g, toolName)
          .replace(/{{description}}/g, description);

        await writeFile(join(targetDir, "package.json"), packageJson, "utf-8");
        await writeFile(join(srcDir, "index.ts"), indexTs, "utf-8");
        await writeFile(join(targetDir, "tsconfig.json"), tsconfig, "utf-8");
        await writeFile(join(targetDir, "README.md"), readme, "utf-8");

        return {
          content: [{
            type: "text" as const,
            text: `✅ Created extension "${name}" at ${targetDir}/\n\nFiles created:\n- package.json\n- src/index.ts\n- tsconfig.json\n- README.md\n\nNext steps:\n1. cd ${targetDir}\n2. npm install\n3. Implement your tool\n4. npm run build`,
          }],
          details: { created: true, path: targetDir },
        };
      } catch (error) {
        return {
          content: [{
            type: "text" as const,
            text: `❌ Failed to create extension: ${error instanceof Error ? error.message : String(error)}`,
          }],
          details: { error: true },
        };
      }
    },
  });

  // --------------------------------------------------------------------------
  // kobold_status - Kobold Status
  // --------------------------------------------------------------------------
  pi.registerTool({
    name: "kobold_status",
    label: "Kobold Status",
    description: "Show pi-kobold extension status and available capabilities",
    parameters: Type.Object({}),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const tools = pi.getAllTools().map(t => t.name);
      const has = (prefix: string) => tools.some(name => name.startsWith(prefix));

      const lines: string[] = [
        "## 🦎 pi-kobold Status\n",
        "| Subsystem | Status |",
        "|-----------|--------|",
        `| 🔀 Orchestration | ${has("orchestrate") ? "✅ Loaded" : "⚠️ Not found"} |`,
        `| 🌐 Gateway | ${has("gateway_") ? "✅ Loaded" : "⚠️ Not found"} |`,
        `| 🦙 Ollama | ${has("ollama") ? "✅ Loaded" : "⚠️ Not found"} |`,
        `| 🧠 Learn | ${has("learn_") ? "✅ Loaded" : "⚠️ Not found"} |`,
        `| 🔧 Dev Tools | ✅ Active |`,
        `| 📊 Status | ✅ Active |\n`,
        "### All Registered Tools\n",
        ...tools.sort().map(name => `- \`${name}\``),
      ];

      return {
        content: [{ type: "text" as const, text: lines.filter(Boolean).join("\n") }],
        details: {
          status: "active",
          tools,
          orchestration: has("orchestrate"),
          gateway: has("gateway_"),
          ollama: has("ollama"),
          learn: has("learn_"),
        },
      };
    },
  });

  console.log("[pi-kobold] Extension loaded — 4 unique tools registered (kobold_initialize, kobold_create_skill, kobold_create_extension, kobold_status)");
  console.log(`[pi-kobold] Auto-detected: orchestration=${orchestrationLoaded}, gateway=${gatewayLoaded}, ollama=${ollamaLoaded}, learn=${learnLoaded}`);
};