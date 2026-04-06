# 0xKobold Architecture Refactor: Plan & Specification

**Status:** Draft  
**Date:** 2026-04-04  
**Version:** 0.1.0

---

## Executive Summary

Refactor 0xKobold into a modular, publishable ecosystem inspired by Hermes Agent's self-improving architecture and pi-coding-agent's extension system. The goal is:

1. **Extract core tools as pi-extensions** publishable to npm
2. **Create a unified "pi-kobold" meta-extension** that bundles everything with consolidated logging
3. **Establish @0xkobold packages** as the standard for 0xKobold extensions

---

## Part 1: Research Analysis

### 1.1 Current State (0xKobold v0.8.1)

#### Architecture Overview
```
0xKobold (Monorepo)
├── src/
│   ├── index.ts              # Main entry (pi-coding-agent adapter)
│   ├── pi-config.ts          # Extension configuration
│   ├── extensions/core/      # 32+ extensions (NOT PUBLISHED)
│   ├── skills/               # Built-in + hot-reload skills
│   ├── gateway/              # WebSocket gateway
│   ├── llm/                  # LLM providers (Ollama, Anthropic, router)
│   └── ...                   # Sessions, memory, Discord, etc.
├── packages/                 # Published @0xkobold packages (11)
│   ├── pi-ollama/
│   ├── pi-gateway/
│   ├── pi-learn/
│   ├── pi-wallet/
│   └── ...
└── .agents/skills/           # Community skills
```

#### Current Extensions in `src/extensions/core/`

| Extension | Purpose | Extract? |
|----------|---------|----------|
| `agent-orchestrator-extension.ts` | Unified agent orchestration | ✅ **pi-orchestration** |
| `autonomy-extension.ts` | Autonomous delegation modes | ✅ **pi-orchestration** |
| `gateway-extension.ts` | WebSocket gateway server | ✅ **pi-gateway** |
| `discord-extension.ts` | Basic Discord bot | ⚠️ **pi-discord** |
| `discord-channel-extension.ts` | Multi-channel Discord | ⚠️ **pi-discord** |
| `perennial-memory-extension.ts` | Memory with embeddings | ✅ **pi-memory** |
| `learning-extension.ts` | Learning/reasoning engine | ✅ **pi-memory** |
| `heartbeat-extension.ts` | Heartbeat/monitoring | ✅ **pi-heartbeat** |
| `task-manager-extension.ts` | Task management | ✅ **pi-tasks** |
| `fileops-extension.ts` | File operations | ⚠️ Built-in (core) |
| `git-commit-extension.ts` | Git operations | ✅ **pi-git** |
| `mcp-extension.ts` | Model Context Protocol | ✅ **pi-mcp** |
| `intelligent-context-extension.ts` | Smart context | ✅ **pi-context** |
| `draconic-safety-extension.ts` | Safety/risk analysis | ✅ **pi-safety** |
| `draconic-lair-extension.ts` | Workspace management | ✅ **pi-draconic** |
| `draconic-hoard-extension.ts` | Code snippets | ✅ **pi-draconic** |
| `diagnostics-extension.ts` | Health/diagnostics | ✅ **pi-diagnostics** |
| `persona-loader-extension.ts` | Persona/personality | ✅ **pi-persona** |
| `onboarding-extension.ts` | First-run setup | ✅ **pi-setup** |
| `memory-bootstrap-extension.ts` | Memory initialization | ✅ **pi-memory** |
| `multi-channel-extension.ts` | Multi-platform messaging | ⚠️ **pi-discord** |
| `extension-scaffold-extension.ts` | Extension scaffolding | ✅ **pi-devtools** |
| `websearch-enhanced-extension.ts` | Web search | ✅ **pi-websearch** |
| `config-extension.ts` | Configuration management | ⚠️ Built-in |
| `gateway-status-extension.ts` | Gateway status display | ✅ **pi-gateway** |
| `workspace-footer-extension.ts` | TUI footer | ⚠️ Built-in |
| `self-update-extension.ts` | Self-update | ✅ **pi-updater** |
| `update-extension.ts` | Update management | ✅ **pi-updater** |
| `tui-integration-extension.ts` | TUI integration | ⚠️ Built-in |
| `routed-ollama-extension.ts` | Model routing (disabled) | ⚠️ Remove |
| `heartbeat-template.md` | Heartbeat template | ✅ **pi-heartbeat** |

### 1.2 Reference Projects

#### Hermes Agent (Nous Research)

**Strengths to Adopt:**
- ✅ Self-improving: Agent creates skills from experience
- ✅ Persistent memory with FTS5 recall
- ✅ Multi-platform gateway (Telegram, Discord, Slack, WhatsApp)
- ✅ Cron scheduling with natural language
- ✅ Subagent delegation with isolated context
- ✅ Browser automation built-in
- ✅ Automated skill creation from solved problems

**Key Features:**
| Feature | Hermes Implementation | 0xKobold Status |
|---------|----------------------|----------------|
| Persistent Memory | SQLite + LLM summarization | ✅ pi-learn |
| Skill Creation | Auto-generates .md skills | ⚠️ Manual only |
| Multi-Platform | Single gateway, multiple platforms | ⚠️ Discord only |
| Cron Jobs | Built-in scheduler | ⚠️ Basic |
| Subagents | Up to 3 concurrent, isolated | ✅ Implemented |
| Browser Automation | Playwright-based | ✅ pi-cloudflare-browser |

#### pi-coding-agent Ecosystem

**Strengths:**
- ✅ Extension system with `pi install` command
- ✅ Packages registry at pi.dev
- ✅ Skill system with conditional activation
- ✅ Theme system
- ✅ Prompts system
- ✅ Community packages

**Current Published @0xkobold Packages:**
| Package | Status | Quality |
|---------|--------|---------|
| `@0xkobold/pi-ollama` | ✅ Production | Good |
| `@0xkobold/pi-gateway` | ⚠️ V2 in progress | Needs cleanup |
| `@0xkobold/pi-learn` | ✅ Production | Good |
| `@0xkobold/pi-wallet` | ✅ Production | Good |
| `@0xkobold/pi-erc8004` | ✅ Production | Good |
| `@0xkobold/pi-obsidian-bridge` | ⚠️ Unpublished | In progress |
| `@0xkobold/pi-cloudflare-browser` | ⚠️ Unpublished | In progress |
| `@0xkobold/pi-bridge` | ✅ Production | Good |
| `@0xkobold/pi-suggest` | ⚠️ Unpublished | In progress |

### 1.3 Problems to Solve

1. **Log Noise:** 32+ extensions = overwhelming console output
2. **Duplication:** Features exist in both `src/extensions/` and `packages/`
3. **Not Extensible:** Can't install 0xKobold features in other projects
4. **Monolithic:** Everything loads at startup even if unused
5. **No Self-Improvement:** No automated skill creation (unlike Hermes)

---

## Part 2: Proposed Architecture

### 2.1 The pi-kobold Omega Extension

**Concept:** One extension to install them all, but smarter.

```
┌─────────────────────────────────────────────────────────────────┐
│                      @0xkobold/pi-kobold                        │
│                    (Omega Extension - Meta)                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │pi-orchestration│  │  pi-memory  │  │ pi-discord  │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  pi-gateway  │  │  pi-safety   │  │  pi-heartbeat│           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
├─────────────────────────────────────────────────────────────────┤
│                    🔇 Unified Logger                             │
│            (Consolidated output, configurable levels)             │
├─────────────────────────────────────────────────────────────────┤
│                     📦 Shared Dependencies                       │
│            (Bun, TypeScript, Zod, SQLite via Bun)               │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Package Taxonomy

#### Tier 1: Core (Required)
```
@0xkobold/pi-kobold         # Meta-extension (installs all)
@0xkobold/pi-ollama          # Ollama LLM provider
@0xkobold/pi-memory          # Persistent memory + learning
@0xkobold/pi-orchestration   # Agent orchestration
```

#### Tier 2: Features (Optional)
```
@0xkobold/pi-gateway         # WebSocket messaging gateway
@0xkobold/pi-discord         # Discord bot + multi-channel
@0xkobold/pi-safety          # Safety/risk analysis
@0xkobold/pi-heartbeat       # Heartbeat/monitoring
@0xkobold/pi-tasks           # Task management
@0xkobold/pi-git             # Git operations
@0xkobold/pi-mcp             # Model Context Protocol
@0xkobold/pi-context         # Intelligent context
```

#### Tier 3: Integrations (Add-ons)
```
@0xkobold/pi-wallet          # CDP wallet + x402 payments
@0xkobold/pi-erc8004         # ERC-8004 agent identity
@0xkobold/pi-obsidian        # Obsidian vault sync
@0xkobold/pi-cloudflare      # Browser automation
@0xkobold/pi-websearch       # Web search enhancement
@0xkobold/pi-updater         # Auto-update system
```

#### Tier 4: Developer Tools
```
@0xkobold/pi-devtools        # Extension scaffolding
@0xkobold/pi-diagnostics      # Health checks
@0xkobold/pi-persona          # Persona management
@0xkobold/pi-setup            # Onboarding wizard
```

### 2.3 Skills Organization

```
skills/
├── builtin/                 # Core skills (always available)
│   ├── file.ts              # File operations
│   ├── shell.ts             # Shell commands
│   ├── subagent.ts          # Subagent spawning
│   └── orchestrate.ts       # Orchestration
├── optional/                # Installable skills
│   ├── git.md
│   ├── docker.md
│   ├── kubernetes.md
│   └── ...
└── user/                    # User-created skills (~/.0xkobold/skills)
```

---

## Part 3: Implementation Plan

### Phase 1: Consolidation (v0.9.0)

**Goal:** Extract src/extensions/core/ into packages/

#### Step 1.1: Create Extension Packages

| Package | Source | Priority |
|---------|--------|----------|
| `@0xkobold/pi-orchestration` | agent-orchestrator + autonomy | P0 |
| `@0xkobold/pi-gateway` | gateway-extension | P0 |
| `@0xkobold/pi-memory` | perennial-memory + learning | P1 |
| `@0xkobold/pi-discord` | discord + multi-channel | P1 |
| `@0xkobold/pi-safety` | draconic-safety | P2 |
| `@0xkobold/pi-heartbeat` | heartbeat | P2 |
| `@0xkobold/pi-tasks` | task-manager | P2 |
| `@0xkobold/pi-git` | git-commit | P3 |
| `@0xkobold/pi-mcp` | mcp | P3 |
| `@0xkobold/pi-context` | intelligent-context | P3 |
| `@0xkobold/pi-devtools` | extension-scaffold | P3 |
| `@0xkobold/pi-diagnostics` | diagnostics | P3 |
| `@0xkobold/pi-persona` | persona-loader | P3 |
| `@0xkobold/pi-setup` | onboarding | P3 |
| `@0xkobold/pi-updater` | self-update + update | P3 |

#### Step 1.2: Update pi-config.ts

```typescript
// New consolidated config
export const config = {
  ui: 'tui',
  extensions: [
    // Omega extension (loads all packages)
    '@0xkobold/pi-kobold',
    
    // Or individual packages
    // '@0xkobold/pi-ollama',
    // '@0xkobold/pi-orchestration',
    // '@0xkobold/pi-memory',
    // ...
  ],
};
```

#### Step 1.3: Update src/index.ts

```typescript
// Simplified - just load pi-kobold
const extensions = [
  '--extension', findPiKoboldExtension(),
];
```

### Phase 2: pi-kobold Omega Extension (v0.9.0)

**Goal:** Create the unified meta-extension

```typescript
// packages/pi-kobold/src/index.ts
export default async (pi: ExtensionAPI): Promise<void> => {
  // 1. Setup unified logging
  setupUnifiedLogger(pi);
  
  // 2. Load all sub-extensions
  await pi.loadExtension('@0xkobold/pi-ollama');
  await pi.loadExtension('@0xkobold/pi-orchestration');
  await pi.loadExtension('@0xkobold/pi-memory');
  await pi.loadExtension('@0xkobold/pi-gateway');
  await pi.loadExtension('@0xkobold/pi-discord');
  await pi.loadExtension('@0xkobold/pi-safety');
  await pi.loadExtension('@0xkobold/pi-heartbeat');
  // ... etc
  
  // 3. Register unified commands
  registerKoboldCommands(pi);
};

function setupUnifiedLogger(pi: ExtensionAPI): void {
  // Consolidate all extension logs
  // Provide single log level control
  // Reduce noise by default (show only warnings+)
}
```

### Phase 3: Self-Improvement (v1.0.0)

**Goal:** Add Hermes-style automated skill creation

```typescript
// New extension: @0xkobold/pi-auto-skill
interface AutoSkillConfig {
  enabled: boolean;
  minConfidence: number;      // 0.8 - Only create skills for high-confidence solutions
  maxSkillsPerDay: number;     // 5 - Rate limit skill creation
  skillDirectory: string;       // ~/.0xkobold/skills/auto/
  reviewBeforeSave: boolean;   // true - Human review before saving
}

// When agent solves a complex problem:
// 1. Analyze the solution
// 2. Generate SKILL.md format
// 3. If confidence > minConfidence:
//    - If reviewBeforeSave: Save to review queue
//    - Else: Save directly to skills/
```

### Phase 4: Documentation & Registry (v1.0.0)

**Goal:** Full ecosystem documentation

- Update pi.dev registry with all packages
- Create docs.0xkobold.org
- Add video demos for each package
- Write migration guides

---

## Part 4: Technical Specifications

### 4.1 Package.json Template

```json
{
  "name": "@0xkobold/pi-{name}",
  "version": "0.1.0",
  "description": "{description}",
  "keywords": [
    "pi-package",
    "pi-extension",
    "0xkobold"
  ],
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist/",
    "src/",
    "README.md",
    "skills/"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "bun test",
    "lint": "echo 'No linter configured'",
    "prepublishOnly": "npm run build && npm test"
  },
  "pi": {
    "extensions": ["./dist/index.js"],
    "skills": ["./skills"]
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": ">=0.65.0",
    "@sinclair/typebox": ">=0.32.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^6.0.0"
  }
}
```

### 4.2 Unified Logger Specification

```typescript
// packages/pi-kobold/src/logger.ts

interface LoggerConfig {
  level: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  prefix?: boolean;           // [extension-name] prefix
  timestamp?: boolean;        // Show timestamps
  consolidate: boolean;        // Single output stream
}

class UnifiedLogger {
  private config: LoggerConfig;
  private extensions: Set<string>;
  
  constructor(config: LoggerConfig) {
    this.config = config;
    this.extensions = new Set();
  }
  
  registerExtension(name: string): void {
    this.extensions.add(name);
    console.log(`[${name}] Extension loaded`); // Always show on load
  }
  
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: any[]): void {
    if (!this.shouldLog(level)) return;
    
    const prefix = this.config.prefix ? `[${this.getExtensionName()}] ` : '';
    const timestamp = this.config.timestamp ? `${new Date().toISOString()} ` : '';
    
    const fullMessage = `${timestamp}${prefix}${message}`;
    
    switch (level) {
      case 'debug': console.debug(fullMessage, ...args); break;
      case 'info': console.info(fullMessage, ...args); break;
      case 'warn': console.warn(fullMessage, ...args); break;
      case 'error': console.error(fullMessage, ...args); break;
    }
  }
  
  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(this.config.level);
    const msgLevel = levels.indexOf(level);
    return msgLevel >= configLevel;
  }
}
```

### 4.3 Extension Loader Pattern

```typescript
// packages/pi-kobold/src/loader.ts

interface ExtensionManifest {
  name: string;
  version: string;
  dependencies?: string[];
  optionalDependencies?: string[];
  extensions: string[];
  skills?: string[];
}

async function loadExtension(name: string): Promise<void> {
  // 1. Check if already loaded
  if (loadedExtensions.has(name)) return;
  
  // 2. Resolve extension path
  const manifest = await getExtensionManifest(name);
  
  // 3. Load dependencies first
  for (const dep of manifest.dependencies || []) {
    await loadExtension(dep);
  }
  
  // 4. Load the extension
  const ext = await import(manifest.extensions[0]);
  await ext.default(pi); // pi is the global ExtensionAPI
  
  // 5. Mark as loaded
  loadedExtensions.add(name);
  
  // 6. Load skills if any
  for (const skill of manifest.skills || []) {
    await loadSkill(skill);
  }
}
```

---

## Part 5: Migration Guide

### From monolithic to modular

**Before (v0.8.x):**
```bash
# Install 0xKobold
npm install -g 0xkobold

# Everything loads: 32+ extensions, overwhelming logs
0xkobold
```

**After (v1.0+):**
```bash
# Install 0xKobold with pi-kobold
npm install -g 0xkobold

# pi-kobold auto-loads everything with unified logging
0xkobold

# Or install just what you need
npm install -g @0xkobold/pi-ollama
npm install -g @0xkobold/pi-memory
```

### For Existing Users

1. **Backup config:** `~/.0xkobold/` is preserved
2. **Update packages:** `0xkobold update`
3. **New config options:** `0xkobold config set logging.level=warn`
4. **Gradual migration:** Old extensions still work, deprecated with warnings

---

## Part 6: Open Questions

1. **Breaking changes?** Minimize - pi-kobold should be backward compatible
2. **Bundle size?** Each package should be tree-shakeable
3. **Load order?** Dependencies must load before dependents
4. **Config conflicts?** pi-kobold config takes precedence
5. **Skills location?** ~/.0xkobold/skills/ or ~/.agents/skills/?
6. **Self-improvement?** Opt-in or opt-out by default?
7. **Registry?** Self-host or use pi.dev?

---

## Appendix A: File Inventory

### Current: src/extensions/core/ (35 files)

```
agent-orchestrator-extension.ts  → @0xkobold/pi-orchestration
autonomy-extension.ts            → @0xkobold/pi-orchestration
gateway-extension.ts             → @0xkobold/pi-gateway
gateway-status-extension.ts     → @0xkobold/pi-gateway
discord-extension.ts            → @0xkobold/pi-discord
discord-channel-extension.ts    → @0xkobold/pi-discord
perennial-memory-extension.ts   → @0xkobold/pi-memory
learning-extension.ts           → @0xkobold/pi-memory
memory-bootstrap-extension.ts    → @0xkobold/pi-memory
heartbeat-extension.ts          → @0xkobold/pi-heartbeat
heartbeat-template.md           → @0xkobold/pi-heartbeat
task-manager-extension.ts       → @0xkobold/pi-tasks
fileops-extension.ts            → KEEP (built-in)
git-commit-extension.ts         → @0xkobold/pi-git
mcp-extension.ts               → @0xkobold/pi-mcp
intelligent-context-extension.ts→ @0xkobold/pi-context
draconic-safety-extension.ts    → @0xkobold/pi-safety
draconic-lair-extension.ts      → @0xkobold/pi-draconic
draconic-hoard-extension.ts     → @0xkobold/pi-draconic
diagnostics-extension.ts        → @0xkobold/pi-diagnostics
persona-loader-extension.ts     → @0xkobold/pi-persona
onboarding-extension.ts         → @0xkobold/pi-setup
multi-channel-extension.ts      → @0xkobold/pi-discord
extension-scaffold-extension.ts  → @0xkobold/pi-devtools
websearch-enhanced-extension.ts → @0xkobold/pi-websearch
config-extension.ts             → KEEP (core)
workspace-footer-extension.ts   → KEEP (TUI only)
self-update-extension.ts        → @0xkobold/pi-updater
update-extension.ts             → @0xkobold/pi-updater
tui-integration-extension.ts    → KEEP (TUI only)
routed-ollama-extension.ts      → REMOVE (unused)
draconic-extension-loader.ts    → REMOVE (unused)
ext-manager.ts                  → REMOVE (unused)
```

### Proposed: packages/ (new structure)

```
packages/
├── pi-kobold/                  # NEW: Meta-extension
├── pi-ollama/                  # EXISTING
├── pi-gateway/                 # EXISTING (needs cleanup)
├── pi-gateway-v2/              # MERGE with pi-gateway
├── pi-learn/                   # EXISTING (rename to pi-memory?)
├── pi-orchestration/           # NEW: Extract from src/
├── pi-memory/                  # NEW: pi-learn + learning
├── pi-discord/                 # NEW: Multi-channel Discord
├── pi-safety/                  # NEW: Safety analysis
├── pi-heartbeat/               # NEW: Heartbeat + monitoring
├── pi-tasks/                   # NEW: Task management
├── pi-git/                     # NEW: Git operations
├── pi-mcp/                     # NEW: MCP support
├── pi-context/                 # NEW: Intelligent context
├── pi-devtools/                # NEW: Extension scaffolding
├── pi-diagnostics/             # NEW: Health checks
├── pi-persona/                 # NEW: Persona management
├── pi-setup/                   # NEW: Onboarding
├── pi-updater/                 # NEW: Auto-updates
├── pi-websearch/               # NEW: Web search
├── pi-draconic/                # NEW: Lair + Hoard
├── pi-wallet/                  # EXISTING
├── pi-erc8004/                 # EXISTING
├── pi-obsidian-bridge/         # EXISTING
├── pi-cloudflare-browser/      # EXISTING
├── pi-bridge/                  # EXISTING
├── pi-suggest/                 # EXISTING
├── mission-control/            # KEEP (standalone)
└── kobold-desktop-pet/         # KEEP (standalone)
```

---

## Appendix B: Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Log noise reduction | 80% fewer console lines | Log line count |
| Package count | 20+ published packages | npm registry |
| Installation time | < 30 seconds | Fresh install benchmark |
| Memory usage | < 200MB baseline | heapUsed |
| Extension load time | < 2 seconds | Extension load timing |
| Community contributions | 5+ PRs/month | GitHub insights |
| pi.dev downloads | 1000+ downloads/month | npm trends |

---

## Appendix C: Timeline

| Phase | Version | Target | Deliverables |
|-------|---------|--------|--------------|
| 1 | v0.9.0-alpha | 2 weeks | pi-orchestration, pi-gateway extracted |
| 1 | v0.9.0-beta | 3 weeks | 10 packages extracted |
| 2 | v0.9.0 | 4 weeks | pi-kobold released |
| 3 | v1.0.0-alpha | 6 weeks | Self-improvement prototype |
| 3 | v1.0.0 | 8 weeks | Auto-skill creation stable |
| 4 | v1.0.0 | 10 weeks | Documentation, registry, videos |

---

*Document generated by Claude Code - 0xKobold Research Agent*
*Last updated: 2026-04-04*
