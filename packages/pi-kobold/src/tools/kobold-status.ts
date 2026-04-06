/**
 * Kobold Status Tool
 *
 * Shows the status of pi-kobold extension and available features.
 */

import { defineTool } from "@mariozechner/pi-coding-agent";
import type { ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export const koboldStatusTool = defineTool({
  name: "kobold_status",
  label: "Kobold Status",
  description: "Show pi-kobold extension status and available capabilities",
  parameters: Type.Object({}),

  async execute(toolCallId, params, signal, onUpdate, ctx) {
    const lines: string[] = [
      "## 🦎 pi-kobold Status\n",
      "| Feature | Status | Description |",
      "|---------|--------|-------------|",
      "| 🔀 orchestrate | ✅ Active | Multi-agent orchestration |",
      "| 📝 create_skill | ✅ Active | Skill generation boilerplate |",
      "| 📦 create_extension | ✅ Active | Extension generation boilerplate |",
      "| 📊 status | ✅ Active | This command |\n",
      "### Available Agents",
      "| Type | Emoji | Purpose | Depth |",
      "|------|-------|---------|-------|",
      "| scout | 🔍 | Fast reconnaissance | 0 |",
      "| specialist | 🧠 | Domain expert | 1 |",
      "| worker | ⚒️ | Implementation | 1 |",
      "| reviewer | 👁️ | Quality validation | 0 |",
      "| coordinator | 🎯 | Task orchestration | ∞ |\n",
      "### Quick Commands",
      "```typescript",
      "// Run a single agent",
      "{ tool: 'orchestrate', agent: 'worker', task: 'Implement X' }\n",
      "// Run agents in sequence",
      "{ tool: 'orchestrate',",
      "  chain: [",
      "    { agent: 'scout', task: 'Analyze' },",
      "    { agent: 'worker', task: 'Implement' }",
      "  ]",
      "}\n",
      "// Create a new skill",
      "{ tool: 'kobold_create_skill',",
      "  name: 'my-skill',",
      "  description: 'What it does'",
      "}",
      "```",
    ];

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
      details: { status: "active", version: "0.1.0" },
    };
  }
});
