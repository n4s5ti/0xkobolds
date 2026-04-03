/**
 * pi-suggest - Ghost Text Prompt Suggester
 * 
 * Forked from @guwidoe/pi-prompt-suggester architecture
 * Suggests user's likely next prompt as ghost text in the editor.
 * Press Space to accept, type to override.
 */

import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const GHOST_COLOR = "\x1b[38;5;244m";
const RESET = "\x1b[0m";

// Cursor rendering varies across themes/terminal modes
const END_CURSOR = /(?:\x1b\[[0-9;]*m \x1b\[[0-9;]*m|█|▌|▋|▉|▓)/;

interface GhostState {
  text: string;
  suggestion: string;
  suffix: string;
  suffixLines: string[];
  multiline: boolean;
}

class RuntimeRef {
  private currentContext: ExtensionContext | undefined;
  private generationEpoch = 0;
  private currentSuggestion: string | undefined;
  private suggestionRevision = 0;

  public setContext(ctx: ExtensionContext): void {
    this.currentContext = ctx;
  }

  public getContext(): ExtensionContext | undefined {
    return this.currentContext;
  }

  public bumpEpoch(): number {
    this.generationEpoch += 1;
    return this.generationEpoch;
  }

  public setSuggestion(text: string | undefined): void {
    this.currentSuggestion = text?.trim() || undefined;
    this.suggestionRevision += 1;
  }

  public getSuggestion(): string | undefined {
    return this.currentSuggestion;
  }

  public getSuggestionRevision(): number {
    return this.suggestionRevision;
  }
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

    // Accept ghost suggestion with Space when editor is still empty
    if (ghost && ghost.text.length === 0) {
      if (matchesKey(data, Key.space)) {
        this.setText(ghost.suggestion);
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

// Export the suggester extension
const runtimeRef = new RuntimeRef();

export default function suggester(pi: ExtensionAPI) {
  function installGhostEditor(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    
    ctx.ui.setEditorComponent((tui: any, theme: any, kb: any) => 
      new GhostSuggestionEditor(
        tui,
        theme,
        kb,
        () => runtimeRef.getSuggestion(),
        () => runtimeRef.getSuggestionRevision(),
      ),
    );
  }

  function scheduleGhostEditorReassertion(ctx: ExtensionContext): void {
    const delaysMs = [50, 250, 1000, 3000, 8000];
    for (const delay of delaysMs) {
      setTimeout(() => {
        const active = runtimeRef.getContext();
        if (active !== ctx) return;
        installGhostEditor(ctx);
      }, delay);
    }
  }

  // Register session start handler
  pi.on("session_start", async (_event: any, ctx: ExtensionContext) => {
    runtimeRef.setContext(ctx);
    runtimeRef.bumpEpoch();

    if (ctx.hasUI) {
      installGhostEditor(ctx);
      scheduleGhostEditorReassertion(ctx);
    }
  });

  // Register agent end handler - generate suggestion
  pi.on("agent_end", async (event: any, ctx: ExtensionContext) => {
    runtimeRef.setContext(ctx);
    
    if (ctx.hasUI) {
      installGhostEditor(ctx);
    }

    // Generate suggestion based on conversation context
    try {
      const messages = event.messages || [];
      const suggestion = await generateSuggestion(messages);
      if (suggestion) {
        runtimeRef.setSuggestion(suggestion);
      }
    } catch (error) {
      console.error("[pi-suggest] Error generating suggestion:", error);
    }
  });

  // Register user submit handler
  pi.on("input", async (event: any, ctx: ExtensionContext) => {
    runtimeRef.setContext(ctx);
    runtimeRef.bumpEpoch();
  });

  // Register commands
  pi.registerCommand("suggest", {
    description: "suggester controls: status | reseed | ghost",
    handler: async (args: string, ctx: ExtensionContext) => {
      const trimmed = args.trim();
      const [subcommand, ...rest] = trimmed.length > 0 ? trimmed.split(/\s+/) : ["status"];

      if (subcommand === "status") {
        const suggestion = runtimeRef.getSuggestion();
        if (suggestion) {
          console.log(`👻 Suggestion ready:\n\`\`\`\n${suggestion}\n\`\`\`\nPress Space to accept, or type to override`);
        } else {
          console.log("👻 No suggestion available yet. Keep chatting!");
        }
        return;
      }

      if (subcommand === "ghost") {
        const action = rest.join(" ");
        if (action === "on" || action === "enable") {
          console.log("👻 Ghost text enabled");
        } else if (action === "off" || action === "disable") {
          console.log("👻 Ghost text disabled");
        } else {
          const suggestion = runtimeRef.getSuggestion();
          if (suggestion) {
            console.log(`👻 Current ghost:\n\`\`\`\n${suggestion}\n\`\`\``);
          } else {
            console.log("👻 No ghost text available");
          }
        }
        return;
      }

      console.log("👻 Usage: /suggest status | /suggest ghost");
    },
  });

  console.log("[pi-suggest] Ghost text prompt suggester loaded");
  console.log("[pi-suggest] Press Space to accept suggestion, type to override");
}

/**
 * Generate a suggestion based on conversation messages
 */
async function generateSuggestion(messages: any[]): Promise<string | undefined> {
  if (!messages || messages.length === 0) return undefined;

  // Extract recent user prompts
  const recentPrompts = messages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content)
    .filter((content): content is string => typeof content === "string" && content.length > 0);

  if (recentPrompts.length === 0) return undefined;

  // Simple heuristic-based suggestion generation
  const lastPrompt = recentPrompts[recentPrompts.length - 1];
  const suggestion = inferNextPrompt(lastPrompt, recentPrompts);
  
  return suggestion;
}

/**
 * Infer the next prompt based on context
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
