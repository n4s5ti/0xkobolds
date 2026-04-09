/**
 * pi-web - Web Search and Content Extraction for Pi Agents
 *
 * Provides web search + advanced content extraction using:
 * 1. Standard fetch() for simple sites
 * 2. Readability-style extraction for articles
 * 3. Playwright for JavaScript-rendered content
 * 4. Cascade strategy: fast → detailed
 *
 * Search backends: DuckDuckGo (default), SearXNG (fallback)
 *
 * Tools:
 *   web_fetch    - Fetch and extract content from a URL
 *   web_search   - Search web, optionally fetch content from results
 *   web_research  - Deep research: search + fetch + synthesize from multiple sources
 *
 * Commands:
 *   /deep-fetch <url>         - Fetch JS-rendered content
 *   /web-search-deep <query>  - Search + fetch from top results
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import {
  cascadeFetch,
  playwrightFetch,
  webSearch,
  type ScrapingResult,
  type WebSearchResult,
} from "./search.js";

export default async function (pi: ExtensionAPI): Promise<void> {

  // ═══════════════════════════════════════════════════════════════════════════
  // Commands
  // ═══════════════════════════════════════════════════════════════════════════

  pi.registerCommand("deep-fetch", {
    description: "Fetch JavaScript-rendered content from a URL using Playwright",
    handler: async (args: string, ctx) => {
      const parts = args.split(/\s+/).filter(Boolean);
      const url = parts[0];
      const max = parseInt(parts[1]) || 8000;

      if (!url?.startsWith("http")) {
        ctx.ui?.notify?.("❌ URL must start with http:// or https://", "error");
        return;
      }

      ctx.ui?.notify?.(`🔍 Deep fetching: ${url}`, "info");

      const result = await cascadeFetch(url, max, true);

      if (!result) {
        ctx.ui?.notify?.("❌ Failed to fetch content", "error");
        return;
      }

      ctx.ui?.notify?.(
        `📄 ${result.title}\nMethod: ${result.method} | Source: ${result.url}\n─────────────────────────────────────────\n\n${result.content.slice(0, max)}${result.content.length > max ? `\n... (${result.content.length - max} more chars)` : ""}`,
        "info"
      );
    },
  });

  pi.registerCommand("web-search-deep", {
    description: "Search web + fetch content from top results",
    handler: async (args: string, ctx) => {
      const numResults = 3;

      ctx.ui?.notify?.(`🔍 Searching + fetching: "${args}"`, "info");

      const results = await webSearch(args, numResults * 2);

      if (results.length === 0) {
        ctx.ui?.notify?.("❌ No search results found", "error");
        return;
      }

      const fetched: ScrapingResult[] = [];
      for (let i = 0; i < Math.min(numResults, results.length); i++) {
        const r = results[i];
        ctx.ui?.notify?.(`  Fetching ${i + 1}/${numResults}: ${r.title.slice(0, 50)}...`, "info");
        const content = await cascadeFetch(r.url, 3000);
        if (content) fetched.push(content);
      }

      const lines = [
        `🔍 Research Results: "${args}"`,
        `Sources: ${fetched.length} / ${results.length} found`,
        "═══════════════════════════════════════════",
        "",
      ];

      for (let i = 0; i < fetched.length; i++) {
        const f = fetched[i];
        lines.push(`## ${i + 1}. ${f.title}`);
        lines.push(`Source: ${f.url} | Method: ${f.method}`);
        lines.push("");
        lines.push(f.content.slice(0, 2500));
        lines.push("");
        lines.push("─────────────────────────────────────────");
        lines.push("");
      }

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Tools
  // ═══════════════════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description: "Fetch and extract content from a web page. Uses cascade: fast HTML → readability → Playwright for JS sites.",
    parameters: Type.Object({
      url: Type.String({ description: "Full URL to fetch (must include http:// or https://)" }),
      max_length: Type.Optional(Type.Number({ description: "Maximum characters to retrieve (default: 5000)", default: 5000 })),
      use_playwright: Type.Optional(Type.Boolean({ description: "Force Playwright for JavaScript-rendered content (default: false)", default: false })),
      timeout_ms: Type.Optional(Type.Number({ description: "Timeout in milliseconds (default: 15000, max: 60000)", default: 15000 })),
    }),
    async execute(_toolCallId: string, params: any, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      const { url, max_length = 5000, use_playwright = false, timeout_ms = 15000 } = params;

      if (!url?.startsWith("http")) {
        return {
          content: [{ type: "text", text: "URL must start with http:// or https://" }],
          details: { error: "fetch_failed" } as const,
        };
      }

      const cappedTimeout = Math.min(timeout_ms, 60000);
      let result: ScrapingResult | null;

      if (use_playwright) {
        result = await playwrightFetch(url, max_length, cappedTimeout);
      } else {
        result = await cascadeFetch(url, max_length, use_playwright, cappedTimeout);
      }

      if (!result) {
        return {
          content: [{ type: "text", text: `Failed to fetch content from ${url}` }],
          details: { error: "fetch_failed", url } as any,
        };
      }

      return {
        content: [{
          type: "text",
          text: `# ${result.title}\n\n${result.content}\n\n[Source: ${result.url} | Method: ${result.method}]`,
        }],
        details: { url, title: result.title, method: result.method, length: result.content.length },
      };
    },
  });

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: "Search the web using DuckDuckGo and SearX. Optionally fetch content from top results.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query — be specific" }),
      limit: Type.Optional(Type.Number({ description: "Number of results (1-10, default: 5)", default: 5 })),
      fetch_content: Type.Optional(Type.Boolean({ description: "Fetch full content from top results (default: false)", default: false })),
      fetch_sources: Type.Optional(Type.Number({ description: "How many sources to fetch content from if fetch_content is true (default: 3)", default: 3 })),
    }),
    async execute(_toolCallId: string, params: any, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      const { query, limit = 5, fetch_content = false, fetch_sources = 3 } = params;

      if (!query) {
        return {
          content: [{ type: "text", text: "Invalid search query" }],
          details: { error: "fetch_failed" } as const,
        };
      }

      const results = await webSearch(query, Math.min(limit, 10));

      if (results.length === 0) {
        return {
          content: [{ type: "text", text: "No search results found" }],
          details: { query, error: "no_results" } as any,
        };
      }

      const basicFormatted = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? "\n   " + r.snippet : ""}`)
        .join("\n\n");

      if (fetch_content) {
        const fetchedContent: string[] = [];
        for (let i = 0; i < Math.min(fetch_sources, results.length); i++) {
          const result = await cascadeFetch(results[i].url, 3000);
          if (result) {
            fetchedContent.push(`## ${result.title}\n${result.content.slice(0, 2500)}...\n[Source: ${result.url}]`);
          }
        }

        return {
          content: [{
            type: "text",
            text: `Search results for "${query}":\n\n${basicFormatted}\n\nDetailed content from ${fetchedContent.length} sources:\n\n${fetchedContent.join("\n\n---\n\n")}`,
          }],
          details: { query, results: results.length, fetched: fetchedContent.length, urls: results.map(r => r.url) },
        };
      }

      return {
        content: [{ type: "text", text: `Search results for "${query}":\n\n${basicFormatted}` }],
        details: { query, results: results.length, urls: results.map(r => r.url) },
      };
    },
  });

  pi.registerTool({
    name: "web_research",
    label: "Web Research",
    description: "Deep research: search + fetch content from multiple sources with synthesis. Best for comprehensive answers.",
    parameters: Type.Object({
      question: Type.String({ description: "The research question" }),
      sources: Type.Optional(Type.Number({ description: "Number of sources to analyze (1-10, default: 5)", default: 5 })),
    }),
    async execute(_toolCallId: string, params: any, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      const { question, sources = 5 } = params;

      if (!question) {
        return {
          content: [{ type: "text", text: "Invalid question provided" }],
          details: { error: "fetch_failed" } as const,
        };
      }

      const searchResults = await webSearch(question, Math.min(sources, 10) * 2);

      if (searchResults.length === 0) {
        return {
          content: [{ type: "text", text: `Could not find information about: "${question}"` }],
          details: { question, error: "no_results" } as any,
        };
      }

      const fetched: ScrapingResult[] = [];
      for (let i = 0; i < Math.min(sources, searchResults.length); i++) {
        const result = await cascadeFetch(searchResults[i].url, 3000);
        if (result) fetched.push(result);
      }

      const summary = fetched.length > 0
        ? `Research on: "${question}"\n\nFound ${fetched.length} relevant sources:\n\n` +
          fetched.map((c, i) => `## ${i + 1}. ${c.title}\n${c.content.slice(0, 2000)}...\n(Source: ${c.url} | Method: ${c.method})`).join("\n\n---\n\n")
        : `Found ${searchResults.length} search results but could not fetch detailed content:\n\n` +
          searchResults.slice(0, sources).map(r => `- ${r.title}: ${r.url}`).join("\n");

      return {
        content: [{ type: "text", text: summary }],
        details: {
          question,
          sources_found: searchResults.length,
          sources_fetched: fetched.length,
        },
      };
    },
  });

  console.log("[pi-web] Extension loaded — tools: web_fetch, web_search, web_research");
}