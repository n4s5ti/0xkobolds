export interface KeyboardShortcut {
  key: string;
  description: string;
}

export type ShortcutEvent = "select" | "previous" | "next" | "accept" | "dismiss";

export class ShortcutHandler {
  private handlers: Map<string, ShortcutEvent> = new Map();
  private listeners: ((event: ShortcutEvent, data?: number) => void)[] = [];

  constructor() {
    // Register default shortcuts
    this.register("1", "select", 0);
    this.register("2", "select", 1);
    this.register("3", "select", 2);
    this.register("4", "select", 3);
    this.register("5", "select", 4);
    this.register("arrowup", "previous");
    this.register("arrowdown", "next");
    this.register("enter", "accept");
    this.register("escape", "dismiss");
  }

  register(key: string, event: ShortcutEvent, data?: number): void {
    this.handlers.set(key.toLowerCase(), event);
  }

  handle(key: string): ShortcutEvent | undefined {
    const event = this.handlers.get(key.toLowerCase());
    if (event) {
      this.emit(event);
      return event;
    }
    return undefined;
  }

  onShortcut(callback: (event: ShortcutEvent, data?: number) => void): void {
    this.listeners.push(callback);
  }

  getShortcuts(): KeyboardShortcut[] {
    const shortcuts: KeyboardShortcut[] = [];
    const seen = new Set<string>();
    
    for (const [key, event] of this.handlers.entries()) {
      if (!seen.has(event)) {
        seen.add(event);
        shortcuts.push({
          key,
          description: this.getDescription(event),
        });
      }
    }
    
    return shortcuts;
  }

  private emit(event: ShortcutEvent, data?: number): void {
    for (const listener of this.listeners) {
      listener(event, data);
    }
  }

  private getDescription(event: ShortcutEvent): string {
    switch (event) {
      case "select": return "Select suggestion";
      case "previous": return "Previous suggestion";
      case "next": return "Next suggestion";
      case "accept": return "Accept suggestion";
      case "dismiss": return "Dismiss suggestions";
    }
  }
}

export default ShortcutHandler;
