/**
 * Template Engine
 * 
 * Renders task templates with variable substitution.
 * Supports {task}, {previous}, {chain_dir}, {step:N} and custom variables.
 */

import { mkdir, writeFile as fsWriteFile } from "fs/promises";
import { dirname } from "path";

export interface TemplateContext {
  /** Original task from user */
  task?: string;
  /** Output from previous step in chain */
  previous?: string;
  /** Chain directory path */
  chain_dir?: string;
  /** Array of all step outputs (1-indexed) */
  step?: string[];
  /** Current working directory */
  cwd?: string;
  /** Timestamp */
  timestamp?: string;
  /** Custom variables */
  [key: string]: string | string[] | undefined;
}

/**
 * Render a template string with variable substitution
 */
export function renderTemplate(
  template: string,
  context: TemplateContext
): string {
  let result = template;
  
  // Replace standard variables
  const replacements: Record<string, string> = {
    "{task}": context.task || "",
    "{previous}": context.previous || "",
    "{chain_dir}": context.chain_dir || "",
    "{cwd}": context.cwd || "",
    "{timestamp}": context.timestamp || new Date().toISOString(),
  };
  
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(key).join(value);
  }
  
  // Replace {step:N} with 1-indexed step output
  if (context.step) {
    result = result.replace(/\{step:(\d+)\}/g, (match, index) => {
      const i = parseInt(index, 10) - 1; // Convert to 0-indexed
      if (i >= 0 && i < context.step!.length) {
        return context.step[i];
      }
      return match; // Keep original if out of bounds
    });
  }
  
  // Replace custom {variable} placeholders
  result = result.replace(/\{(\w+)\}/g, (match, key) => {
    const value = context[key];
    if (typeof value === "string") {
      return value;
    }
    return match; // Keep original for non-string values
  });
  
  return result;
}

/**
 * Extract variables from a template string
 */
export function extractTemplateVariables(template: string): string[] {
  const variables = new Set<string>();
  
  // Match {var} patterns
  const matches = template.matchAll(/\{(\w+)\}/g);
  for (const match of matches) {
    variables.add(match[1]);
  }
  
  // Match {step:N} patterns
  const stepMatches = template.matchAll(/\{step:(\d+)\}/g);
  for (const match of stepMatches) {
    variables.add(`step:${match[1]}`);
  }
  
  return Array.from(variables);
}

/**
 * Validate that all required variables are present in context
 */
export function validateTemplateContext(
  template: string,
  context: TemplateContext,
  requiredVars: string[] = ["task"]
): { valid: boolean; missing: string[] } {
  const variables = extractTemplateVariables(template);
  const missing: string[] = [];
  
  for (const required of requiredVars) {
    if (variables.includes(required)) {
      const value = context[required];
      if (value === undefined || value === "" || 
          (Array.isArray(value) && value.length === 0)) {
        missing.push(required);
      }
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Create a chain directory path
 */
export function createChainDir(basePath: string, prefix = "chain"): string {
  const timestamp = Date.now();
  const id = Math.random().toString(36).slice(2, 8);
  return `${basePath}/.${prefix}-${timestamp}-${id}`;
}

/**
 * Write file with automatic directory creation
 */
export async function writeFile(path: string, content: string): Promise<void> {
  const dir = dirname(path);
  if (dir && dir !== ".") {
    await mkdir(dir, { recursive: true });
  }
  await fsWriteFile(path, content, "utf-8");
}

/**
 * Parse step definitions from a template string
 * Supports: "agent1 -> agent2 -> agent3" or "agent1[task=...] -> agent2"
 */
export function parseStepDefinitions(
  chain: string
): Array<{ agent: string; overrides?: Record<string, string> }> {
  const steps: Array<{ agent: string; overrides?: Record<string, string> }> = [];
  
  const parts = chain.split("->").map(s => s.trim());
  
  for (const part of parts) {
    // Parse agent name and optional [key=value] overrides
    const match = part.match(/^(\w+)(?:\[(.*)\])?$/);
    if (match) {
      const agent = match[1];
      const overrides: Record<string, string> = {};
      
      if (match[2]) {
        // Parse key=value pairs
        const pairs = match[2].split(",");
        for (const pair of pairs) {
          const [key, value] = pair.split("=").map(s => s.trim());
          if (key && value) {
            overrides[key] = value;
          }
        }
      }
      
      steps.push({ agent, overrides });
    }
  }
  
  return steps;
}

/**
 * Format a result for display
 */
export function formatResult(
  content: string,
  maxLength = 500,
  truncateSuffix = "...\n[truncated]"
): string {
  if (content.length <= maxLength) {
    return content;
  }
  
  // Try to truncate at a sentence boundary
  const truncated = content.slice(0, maxLength);
  const lastSentence = truncated.lastIndexOf(".");
  const lastNewline = truncated.lastIndexOf("\n");
  const cutoff = Math.max(lastSentence, lastNewline);
  
  if (cutoff > maxLength * 0.7) {
    return content.slice(0, cutoff + 1) + truncateSuffix;
  }
  
  return truncated.trim() + truncateSuffix;
}
