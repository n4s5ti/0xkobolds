export interface SuggestionItem {
  text: string;
  type: "action" | "question" | "observation" | "offer";
  confidence?: number;
}

const TYPE_INDICATORS: Record<string, string> = {
  action: "⚡",
  question: "❓",
  observation: "💡",
  offer: "🙋",
};

export class SuggestionWidget {
  private suggestions: SuggestionItem[] = [];
  private selectedIndex = 0;

  setSuggestions(suggestions: SuggestionItem[]): void {
    this.suggestions = suggestions;
    this.selectedIndex = 0;
  }

  getSuggestions(): SuggestionItem[] {
    return this.suggestions;
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  getSelectedText(): string | undefined {
    return this.suggestions[this.selectedIndex]?.text;
  }

  getSelectedItem(): SuggestionItem | undefined {
    return this.suggestions[this.selectedIndex];
  }

  selectIndex(index: number): void {
    if (this.suggestions.length === 0) {
      this.selectedIndex = 0;
      return;
    }
    
    // Clamp to valid range
    this.selectedIndex = Math.max(0, Math.min(index, this.suggestions.length - 1));
  }

  selectNext(): void {
    this.selectIndex(this.selectedIndex + 1);
  }

  selectPrevious(): void {
    this.selectIndex(this.selectedIndex - 1);
  }

  render(): string[] {
    if (this.suggestions.length === 0) {
      return [];
    }

    const lines: string[] = [];
    lines.push("👻 Suggestions:");
    
    for (let i = 0; i < this.suggestions.length; i++) {
      lines.push(this.renderSuggestion(i));
    }
    
    lines.push("");
    lines.push("↑↓ Navigate | Enter Select | Esc Close");
    
    return lines;
  }

  renderSuggestion(index: number): string {
    const suggestion = this.suggestions[index];
    if (!suggestion) return "";
    
    const indicator = TYPE_INDICATORS[suggestion.type] || "•";
    const prefix = index === this.selectedIndex ? "▶ " : "  ";
    const confidence = suggestion.confidence ? ` (${Math.round(suggestion.confidence * 100)}%)` : "";
    
    return `${prefix}${index + 1}. ${indicator} ${suggestion.text}${confidence}`;
  }

  isEmpty(): boolean {
    return this.suggestions.length === 0;
  }

  count(): number {
    return this.suggestions.length;
  }
}

export default SuggestionWidget;
