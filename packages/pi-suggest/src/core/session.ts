/**
 * Session Analyzer - Analyzes conversation history for context
 */

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface SessionSummary {
  topics: string[];
  decisions: string[];
  tasks_in_progress: string[];
  blockers: string[];
  recent_files: string[];
  intent: string;
  last_action: string;
}

export class SessionAnalyzer {
  private decisionPatterns = [
    /\b(agreed|decided|let's|we should|will use|going with|chose|selected)\b/i,
    /\b(use|using|implement with)\s+(typescript|python|react|vue|postgres|mongodb|redis)/i,
  ];

  private taskPatterns = [
    /\b(need to|should|have to|must|going to|planning to)\s+(\w+(?:\s+\w+){0,3})/gi,
    /\b(implement|create|build|add|fix|update|remove|delete|refactor)\s+(?:the\s+)?(\w+(?:\s+\w+){0,3})/gi,
  ];

  private blockerPatterns = [
    /\b(error|bug|issue|problem|failed|failing|crash|exception|broken)\b/i,
    /\b(can't|cannot|unable to|stuck|blocked|don't know how)\b/i,
    /\?$/m,
  ];

  private filePatterns = [
    /(?:\/[\w\-\.]+)+\.[a-z]{2,6}(?::\d+)?/i,
    /\b(?:src|lib|app|components|pages|hooks|utils)\/[\w\-\.\/]+/i,
  ];

  private topicKeywords = [
    "auth", "login", "user", "users", "database", "db", "api", "config", "test",
    "bug", "error", "component", "function", "class", "deploy", "build", "install", 
    "setup", "migration", "model", "schema", "route", "controller", "service",
    "repository", "module", "endpoint", "request", "response", "middleware",
  ];

  extractTopics(messages: Message[]): string[] {
    const topics = new Set<string>();
    const allText = messages.map(m => m.content).join(" ").toLowerCase();

    for (const keyword of this.topicKeywords) {
      if (allText.includes(keyword)) {
        topics.add(keyword);
      }
    }

    return Array.from(topics);
  }

  detectDecisions(messages: Message[]): string[] {
    const decisions: string[] = [];

    for (const msg of messages) {
      const content = msg.content;

      for (const pattern of this.decisionPatterns) {
        const match = content.match(pattern);
        if (match) {
          decisions.push(match[0]);
        }
      }
    }

    return decisions;
  }

  getTasksInProgress(messages: Message[]): string[] {
    const tasks: string[] = [];

    // Get last user message and assistant response
    const lastUser = messages.filter(m => m.role === "user").pop();
    const lastAssistant = messages.filter(m => m.role === "assistant").pop();

    if (lastUser) {
      for (const pattern of this.taskPatterns) {
        let match;
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        while ((match = pattern.exec(lastUser.content)) !== null) {
          tasks.push(match[0]);
        }
      }
    }

    // Check if assistant is working on something
    if (lastAssistant) {
      const workMatch = lastAssistant.content.match(
        /\b(writing|implementing|creating|fixing|building|adding|updating|working on)\s+(?:the\s+)?(\w+(?:\s+\w+){0,3})/i
      );
      if (workMatch) {
        tasks.push(workMatch[0]);
      }
    }

    return [...new Set(tasks)];
  }

  getBlockers(messages: Message[]): string[] {
    const blockers: string[] = [];

    for (const msg of messages) {
      for (const pattern of this.blockerPatterns) {
        if (pattern.test(msg.content)) {
          blockers.push(msg.content.slice(0, 100));
        }
      }
    }

    return blockers;
  }

  getRecentFiles(messages: Message[]): string[] {
    const files = new Set<string>();

    for (const msg of messages) {
      for (const pattern of this.filePatterns) {
        const matches = msg.content.match(pattern);
        if (matches) {
          for (const file of matches) {
            files.add(file);
          }
        }
      }
    }

    return Array.from(files);
  }

  summarize(messages: Message[]): SessionSummary {
    return {
      topics: this.extractTopics(messages),
      decisions: this.detectDecisions(messages),
      tasks_in_progress: this.getTasksInProgress(messages),
      blockers: this.getBlockers(messages),
      recent_files: this.getRecentFiles(messages),
      intent: "unknown",
      last_action: this.getLastAction(messages),
    };
  }

  private getLastAction(messages: Message[]): string {
    const lastAssistant = messages.filter(m => m.role === "assistant").pop();
    if (!lastAssistant) return "awaiting_user";

    const content = lastAssistant.content.toLowerCase();

    if (content.includes("created") || content.includes("generated")) return "created";
    if (content.includes("fixed") || content.includes("resolved")) return "fixed";
    if (content.includes("updated") || content.includes("modified")) return "updated";
    if (content.includes("deleted") || content.includes("removed")) return "deleted";
    if (content.includes("error") || content.includes("failed")) return "error";
    if (content.includes("running") || content.includes("executing")) return "running";

    return "completed";
  }
}

export default SessionAnalyzer;
