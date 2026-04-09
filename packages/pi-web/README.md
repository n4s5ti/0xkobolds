# pi-web

Web search and content extraction for [pi-coding-agent](https://github.com/badlobby/pi-mono) — cascade fetching, multi-engine search, deep research.

## Installation

```bash
pi install npm:@0xkobold/pi-web
```

Or as part of the meta-extension:

```bash
pi install npm:@0xkobold/pi-kobold
```

## Features

- **Cascade Fetching** — Fast HTML → Readability → Playwright for JS sites
- **Multi-Engine Search** — DuckDuckGo (default) + SearXNG (fallback)
- **Deep Research** — Search + fetch + synthesize from multiple sources
- **Playwright Pool** — Browser reuse with concurrency limits and retries
- **Optional Dependency** — Playwright is optional; fast fetch works without it

## Tools

| Tool | Description |
|------|-------------|
| `web_fetch` | Fetch and extract content from a URL |
| `web_search` | Search web, optionally fetch content from results |
| `web_research` | Deep research: search + fetch + multi-source synthesis |

## Commands

| Command | Description |
|---------|-------------|
| `/deep-fetch <url>` | Fetch JS-rendered content using Playwright |
| `/web-search-deep <query>` | Search + fetch from top results |

## Parameters

### web_fetch

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | Full URL to fetch |
| `max_length` | number | 5000 | Maximum characters to retrieve |
| `use_playwright` | boolean | false | Force Playwright for JS content |
| `timeout_ms` | number | 15000 | Timeout in ms (max: 60000) |

### web_search

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Search query |
| `limit` | number | 5 | Number of results (1-10) |
| `fetch_content` | boolean | false | Fetch full content from top results |
| `fetch_sources` | number | 3 | How many sources to fetch |

### web_research

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `question` | string | required | Research question |
| `sources` | number | 5 | Number of sources to analyze (1-10) |

## Architecture

```
┌────────────────────────────────────────┐
│              pi-web                     │
├─────────────┬──────────────────────────┤
│  Search     │  Content Extraction      │
│  ─────────  │  ──────────────────────  │
│  DuckDuckGo │  1. Fast fetch (HTML)    │
│  SearXNG    │  2. Readability (regex)  │
│             │  3. Playwright (JS)       │
├─────────────┴──────────────────────────┤
│        Playwright Browser Pool          │
│        (concurrency: 2, pool TTL: 2m)  │
└────────────────────────────────────────┘
```

## Development

```bash
cd packages/pi-web
bun install
bun run build
```

## Optional: Playwright

For JavaScript-rendered content, install Playwright:

```bash
npm install playwright
npx playwright install chromium
```

Without Playwright, `web_fetch` still works using fast HTML fetch and readability extraction.