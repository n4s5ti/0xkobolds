/**
 * pi-suggest - Context-Aware Suggestion Engine
 * 
 * Phase 1 Implementation: Session analysis, intent classification,
 * template-based suggestions, and SQLite persistence.
 */

import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// Message type definition
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// Core modules
import { SessionAnalyzer } from "./core/session.js";
import { IntentClassifier, IntentType } from "./core/intent.js";
import { SuggestionGenerator } from "./generator/suggestion.js";
import { SuggestionStore } from "./store/sqlite.js";
import { SuggestionCache } from "./store/cache.js";
import { LlmSuggester, type LlmConfig } from "./generator/llm.js";
import { FileContextExtractor, type FileContext } from "./generator/file-context.js";
import { SuggestionLearner } from "./learn/learner.js";
import { PreferenceExtractor } from "./learn/preferences.js";
import { RejectionPatternDetector } from "./learn/rejections.js";
import { SuggestionWidget, type SuggestionItem } from "./ui/widget.js";
import { ShortcutHandler } from "./ui/shortcuts.js";
import { type ProactiveConfig, DEFAULT_PROACTIVE_CONFIG } from "./types.js";

// Ghost text constants
const GHOST_COLOR = "\x1b[38;5;244m";
const RESET = "\x1b[0m";
const END_CURSOR = /(?:\x1b\[[0-9;]*m \x1b\[[0-9;]*m|█|▌|▋|▉|▓)/;

// LLM Configuration
const DEFAULT_LLM_CONFIG: LlmConfig = {
  baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  model: process.env.OLLAMA_MODEL || "llama3.2",
  timeout: 5000,
};

// Runtime state
interface RuntimeState {
  currentContext: ExtensionContext | undefined;
  currentSuggestion: string | undefined;
  suggestionRevision: number;
  cache: SuggestionCache;
  store: SuggestionStore | undefined;
  sessionAnalyzer: SessionAnalyzer;
  intentClassifier: IntentClassifier;
  suggestionGenerator: SuggestionGenerator;
  llmConfig: LlmConfig;
  llmSuggester: LlmSuggester | null;
  fileExtractor: FileContextExtractor;
  // Learning modules
  learner: SuggestionLearner;
  preferenceExtractor: PreferenceExtractor;
  rejectionDetector: RejectionPatternDetector;
  // UI
  proactiveConfig: ProactiveConfig;
  widget: SuggestionWidget;
  shortcutHandler: ShortcutHandler;
  lastResponseTime: number;
}

const runtime: RuntimeState = {
  currentContext: undefined,
  currentSuggestion: undefined,
  suggestionRevision: 0,
  cache: new SuggestionCache(),
  store: undefined,
  sessionAnalyzer: new SessionAnalyzer(),
  intentClassifier: new IntentClassifier(),
  suggestionGenerator: new SuggestionGenerator(),
  llmConfig: DEFAULT_LLM_CONFIG,
  llmSuggester: null,
  fileExtractor: new FileContextExtractor(),
  // Learning modules
  learner: new SuggestionLearner(),
  preferenceExtractor: new PreferenceExtractor(),
  rejectionDetector: new RejectionPatternDetector(),
  // UI
  proactiveConfig: DEFAULT_PROACTIVE_CONFIG,
  widget: new SuggestionWidget(),
  shortcutHandler: new ShortcutHandler(),
  lastResponseTime: 0,
};

// GhostSuggestionEditor (existing, unchanged)
interface GhostState {
  text: string;
  suggestion: string;
  suffix: string;
  suffixLines: string[];
  multiline: boolean;
}

export class GhostSuggestionEditor extends CustomEditor {
  private suppressGhost = false;
  private suppressGhostArmedByNonEmptyText = false;
  private lastSuggestion: string | undefined;
  private lastSuggestionRevision = -1;

  public constructor(
    tui: any,
    theme: any,
    keybindings: any,
    private readonly getSuggestion: () => string | undefined,
    private readonly getSuggestionRevision: () => number,
  ) {
    super(tui, theme, keybindings);
  }

  public override handleInput(data: string): void {
    const ghost = this.getGhostState();

    if (ghost && ghost.text.length === 0) {
      if (matchesKey(data, Key.space)) {
        this.setText(ghost.suggestion);
        // Record acceptance
        const latest = runtime.cache.getLatest();
        if (latest && runtime.store) {
          runtime.store.recordOutcome(latest.id, "accepted").catch(console.error);
        }
        return;
      }
      this.suppressGhost = true;
      this.suppressGhostArmedByNonEmptyText = false;
      super.handleInput(data);
      this.updateGhostSuppressionLifecycle();
      return;
    }

    super.handleInput(data);
    this.updateGhostSuppressionLifecycle();
  }

  public override setText(text: string): void {
    super.setText(text);
  }

  public override insertTextAtCursor(text: string): void {
    super.insertTextAtCursor(text);
  }

  public render(width: number): string[] {
    const lines = super.render(width);
    const ghost = this.getGhostState();

    if (!ghost) return lines;

    if (lines.length > 0) {
      const firstLine = lines[0];
      const cursorMatch = firstLine.match(END_CURSOR);

      if (cursorMatch) {
        const cursor = cursorMatch[0];
        const firstLineGhost = ghost.multiline
          ? ghost.suffix
          : ghost.suffix.split("\n")[0];

        const firstSuffixWrapped = wrapTextWithAnsi(
          truncateToWidth(`${cursor}${GHOST_COLOR}${firstLineGhost}${RESET}`, width),
          width
        );

        const continuationLines: string[] = [];
        continuationLines.push(...firstSuffixWrapped.slice(1));

        for (let index = 1; index < ghost.suffixLines.length; index++) {
          const line = truncateToWidth(ghost.suffixLines[index], width);
          continuationLines.push(
            wrapTextWithAnsi(`${GHOST_COLOR}${line}${RESET}`, width)[0] ?? "",
          );
        }

        lines[0] = firstSuffixWrapped[0] ?? firstLine;
        lines.push(...continuationLines);
      }
    }

    return lines;
  }

  private updateGhostSuppressionLifecycle(): void {
    const text = this.getText();

    if (text.length > 0) {
      // User typed something - mark latest suggestion as dismissed
      const latest = runtime.cache.getLatest();
      if (latest && runtime.store) {
        runtime.store.recordOutcome(latest.id, "dismissed").catch(console.error);
      }
      this.suppressGhostArmedByNonEmptyText = true;
      return;
    }

    if (this.suppressGhostArmedByNonEmptyText) {
      this.suppressGhost = false;
      this.suppressGhostArmedByNonEmptyText = false;
    }
  }

  private getGhostState(): GhostState | undefined {
    const revision = this.getSuggestionRevision();
    const suggestion = this.getSuggestion()?.trim();

    if (revision !== this.lastSuggestionRevision || suggestion !== this.lastSuggestion) {
      this.lastSuggestionRevision = revision;
      this.lastSuggestion = suggestion;
      this.suppressGhost = false;
      this.suppressGhostArmedByNonEmptyText = false;
    }

    if (!suggestion || this.suppressGhost) return undefined;

    const text = this.getText();
    const cursor = this.getCursor();

    if (text.includes("\n")) return undefined;
    if (cursor.line !== 0 || cursor.col !== text.length) return undefined;
    if (!suggestion.startsWith(text)) return undefined;

    const suffix = suggestion.slice(text.length);
    if (!suffix) return undefined;

    const suffixLines = suffix.split("\n");
    const multiline = suffixLines.length > 1;
    if (multiline && text.length > 0) return undefined;

    return { text, suggestion, suffix, suffixLines, multiline };
  }
}

// Extension entry point
export default async function suggester(pi: ExtensionAPI) {
  // Initialize store
  runtime.store = new SuggestionStore();
  await runtime.store.init();

  function installGhostEditor(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    
    ctx.ui.setEditorComponent((tui: any, theme: any, kb: any) => 
      new GhostSuggestionEditor(
        tui,
        theme,
        kb,
        () => runtime.currentSuggestion,
        () => runtime.suggestionRevision,
      ),
    );
  }

  function scheduleGhostEditorReassertion(ctx: ExtensionContext): void {
    const delaysMs = [50, 250, 1000, 3000, 8000];
    for (const delay of delaysMs) {
      setTimeout(() => {
        if (runtime.currentContext !== ctx) return;
        installGhostEditor(ctx);
      }, delay);
    }
  }

  // Session start handler
  pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
    runtime.currentContext = ctx;
    runtime.suggestionRevision++;

    if (ctx.hasUI) {
      installGhostEditor(ctx);
      scheduleGhostEditorReassertion(ctx);
    }
  });

  // Agent end handler - generate suggestion
  pi.on("agent_end", async (event: any, ctx: ExtensionContext) => {
    runtime.currentContext = ctx;
    
    if (ctx.hasUI) {
      installGhostEditor(ctx);
    }

    try {
      const messages: Message[] = event.messages || [];
      const suggestion = await generateSuggestion(messages);
      
      if (suggestion) {
        runtime.currentSuggestion = suggestion;
        runtime.suggestionRevision++;
      }
    } catch (error) {
      console.error("[pi-suggest] Error generating suggestion:", error);
    }
  });

  // User submit handler
  pi.on("input", async (_event: any, ctx: ExtensionContext) => {
    runtime.currentContext = ctx;
    runtime.suggestionRevision++;
  });

  // Register commands
  pi.registerCommand("suggest", {
    description: "suggester controls: status | stats | ghost",
    handler: async (args: string, _ctx: ExtensionContext) => {
      const trimmed = args.trim();
      const [subcommand, ...rest] = trimmed.length > 0 ? trimmed.split(/\s+/) : ["status"];

      if (subcommand === "status") {
        const suggestion = runtime.currentSuggestion;
        if (suggestion) {
          console.log(`👻 Suggestion ready:\n\`\`\`\n${suggestion}\n\`\`\`\nPress Space to accept, or type to override`);
        } else {
          console.log("👻 No suggestion available yet. Keep chatting!");
        }
        return;
      }

      if (subcommand === "stats") {
        const stats = await runtime.store?.getStats();
        if (stats) {
          console.log(`📊 Suggestion Stats:
  Total: ${stats.total_suggestions}
  Accepted: ${stats.accepted_count}
  Dismissed: ${stats.dismissed_count}
  Acceptance Rate: ${(stats.acceptance_rate * 100).toFixed(1)}%`);
        }
        return;
      }

      if (subcommand === "ghost") {
        const suggestion = runtime.currentSuggestion;
        if (suggestion) {
          console.log(`👻 Current ghost:\n\`\`\`\n${suggestion}\n\`\`\``);
        } else {
          console.log("👻 No ghost text available");
        }
        return;
      }

      if (subcommand === "configure") {
        console.log(`⚙️  LLM Configuration:
  Base URL: ${runtime.llmConfig.baseUrl}
  Model: ${runtime.llmConfig.model}
  Timeout: ${runtime.llmConfig.timeout}ms`);
        return;
      }

      if (subcommand === "learn") {
        const stats = runtime.learner.getStats();
        const patterns = runtime.rejectionDetector.detectPatterns();
        
        console.log(`📚 Learning Stats:
  Total suggestions: ${stats.total}
  Acceptance rate: ${(stats.acceptanceRate * 100).toFixed(1)}%
  
  Rejection patterns: ${patterns.length}`);
        
        if (patterns.length > 0) {
          console.log("\nTop patterns:");
          for (const p of patterns.slice(0, 3)) {
            console.log(`  - ${p.category}: ${p.count} rejections (${(p.confidence * 100).toFixed(0)}% confident)`);
          }
        }
        return;
      }

      console.log("👻 Usage: /suggest status | /suggest stats | /suggest ghost | /suggest configure | /suggest learn");
    },
  });

  console.log("[pi-suggest] Ghost text prompt suggester loaded (Phase 3)");
  console.log("[pi-suggest] Learning: enabled");
  console.log("[pi-suggest] Press Space to accept suggestion, type to override");
}

/**
 * Generate a suggestion based on conversation messages
 */
/**
 * Generate multiple suggestions based on conversation messages
 */
async function generateSuggestions(messages: Message[]): Promise<SuggestionItem[]> {
  if (!messages || messages.length === 0) return [];

  // Extract recent user prompts
  const recentPrompts = messages
    .filter((m) => m.role === "user")
    .slice(-5)
    .map((m) => m.content)
    .filter((content): content is string => typeof content === "string" && content.length > 0);

  if (recentPrompts.length === 0) return [];

  // Analyze session using SessionAnalyzer
  const summary = runtime.sessionAnalyzer.summarize(messages as any);
  
  // Classify intent using IntentClassifier
  const lastPrompt = recentPrompts[recentPrompts.length - 1];
  const intentResult = runtime.intentClassifier.classifyWithConfidence(lastPrompt);
  
  // Update summary with detected intent
  summary.intent = intentResult.intent;

  const items: SuggestionItem[] = [];

  // Try LLM generation first
  try {
    if (!runtime.llmSuggester) {
      runtime.llmSuggester = new LlmSuggester(runtime.llmConfig);
    }
    
    const llmSuggestions = await runtime.llmSuggester.generateSuggestions(summary);
    
    for (const s of llmSuggestions.slice(0, 2)) {
      items.push({ text: s.text, type: s.type, confidence: s.confidence });
    }
  } catch (error) {
    console.error("[pi-suggest] LLM generation failed:", error);
  }

  // Add template-based suggestions
  const maxSuggestions = runtime.proactiveConfig.maxSuggestions;
  const templateSuggestions = runtime.suggestionGenerator.generate(summary, intentResult.intent, maxSuggestions);
  
  for (const s of templateSuggestions) {
    // Check if we should avoid this suggestion
    if (runtime.rejectionDetector.shouldAvoid(s.text)) {
      const alternative = runtime.learner.getAlternativeSuggestion(s.text);
      if (alternative) {
        items.push({ text: alternative, type: s.type, confidence: s.confidence * 0.8 });
        continue;
      }
    }
    
    // Apply learning boost
    const boost = runtime.learner.getSuggestionBoost(s.text);
    items.push({ text: s.text, type: s.type, confidence: s.confidence * boost });
  }

  return items.slice(0, maxSuggestions);
}

/**
 * Generate a single suggestion (legacy compatibility)
 */
async function generateSuggestion(messages: Message[]): Promise<string | undefined> {
  const items = await generateSuggestions(messages);
  return items[0]?.text;
}

/**
 * Legacy inference function for backward compatibility
 */
export function inferNextPrompt(lastPrompt: string, history: string[]): string | undefined {
  if (typeof lastPrompt !== "string" || lastPrompt.length === 0) return undefined;
  const lower = lastPrompt.toLowerCase();

  // Debug/fix patterns
  if (lower.includes("error") || lower.includes("fix") || lower.includes("bug")) {
    if (lower.includes("test")) {
      return "Run the tests to verify the fix works";
    }
    return "Test the changes";
  }

  // Implementation patterns
  if (lower.includes("create") || lower.includes("implement") || lower.includes("add")) {
    if (lower.includes("test")) {
      return "Run tests for the new implementation";
    }
    return "Test the implementation";
  }

  // After running tests
  if (lower.includes("test passed") || lower.includes("all tests")) {
    return "Commit the changes";
  }

  // Review patterns
  if (lower.includes("review") || lower.includes("check")) {
    return "Make any necessary fixes based on the review";
  }

  // Default suggestions based on common workflows
  if (history.length > 1) {
    return "Continue with the next step";
  }

  return undefined;
}
