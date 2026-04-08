/**
 * Reasoning Engine Module - LLM-based reasoning for pi-learn
 * 
 * Supports hybrid scope:
 * - 'user' scope: Cross-project insights (traits, interests, goals)
 * - 'project' scope: Project-specific insights (code patterns, decisions)
 */

import type { Conclusion, ReasoningOutput, DreamOutput, Scope } from "../shared.js";

export interface ReasonedConclusion {
  content: string;
  type: "deductive" | "inductive" | "abductive";
  premises: string[];
  scope: Scope;
  confidence: number;
  embedding?: number[];
  sourceSessionId: string;
}

export interface OnConclusionsCallback {
  (conclusions: ReasonedConclusion[], peerId: string, sessionFile: string): Promise<void>;
}

export interface ReasoningEngineConfig {
  ollamaBaseUrl: string;
  ollamaApiKey: string;
  reasoningModel: string;
  embeddingModel: string;
  tokenBatchSize: number;
  retry?: Partial<RetryConfig>;
  concurrency?: number;  // Max concurrent Ollama requests (default: 1)
  onConclusions?: OnConclusionsCallback; // Called when processQueue produces conclusions
}

export interface RetryConfig {
  maxRetries: number;        // Default: 3
  retryDelayMs: number;      // Base delay in ms (default: 2000)
  timeoutMs: number;          // Default: 120000 (2 min)
  maxBackoffMs: number;       // Max backoff cap (default: 30000)
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelayMs: 2000,
  timeoutMs: 120000,
  maxBackoffMs: 30000,
};

export function createReasoningEngine(config: ReasoningEngineConfig): ReasoningEngine {
  return new ReasoningEngine(config);
}

export interface ReasoningContext {
  globalConclusions?: Conclusion[];   // User-scope conclusions from __global__
  localConclusions?: Conclusion[];   // Project-scope conclusions
  globalPeerCard?: {
    name?: string;
    occupation?: string;
    interests: string[];
    traits: string[];
    goals: string[];
  };
}

export class ReasoningEngine {
  private messageQueue: Array<{ sessionFile: string; peerId: string; messages: Array<{ role: string; content: string }>; queuedAt: number }> = [];
  private isProcessing = false;
  private maxRetries: number;
  private retryDelayMs: number;
  private timeoutMs: number;
  private maxBackoffMs: number;
  private concurrency: number;
  private activeRequests = 0;
  private requestQueue: Array<() => void> = [];
  private lastProcessedAt = 0;

  constructor(private config: ReasoningEngineConfig) {
    const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retry };
    this.maxRetries = retryConfig.maxRetries;
    this.retryDelayMs = retryConfig.retryDelayMs;
    this.timeoutMs = retryConfig.timeoutMs;
    this.maxBackoffMs = retryConfig.maxBackoffMs ?? DEFAULT_RETRY_CONFIG.maxBackoffMs;
    this.concurrency = config.concurrency ?? 1;
  }

  queue(item: { sessionFile: string; peerId: string; messages: Array<{ role: string; content: string }>; queuedAt: number }): void {
    this.messageQueue.push(item);
    
    // Process if we have enough items OR if items have been waiting too long (30 seconds)
    const oldestWaitMs = Date.now() - this.messageQueue[0]?.queuedAt;
    const shouldProcess = 
      this.messageQueue.length >= 3 ||  // Batch when we have 3+ items
      oldestWaitMs > 30000 ||             // Or if oldest item waiting > 30s
      !this.isProcessing;                 // Or if not currently processing
    
    if (shouldProcess && !this.isProcessing) {
      // Use setImmediate to avoid blocking
      setImmediate(() => this.processQueue());
    }
  }

  getQueueSize(): number { return this.messageQueue.length; }
  isReasoning(): boolean { return this.isProcessing; }

  /**
   * Process unprocessed observations through reasoning and return conclusions.
   * Used by learn_reason_now to bridge the observation → conclusion gap.
   */
  async reasonOnObservations(
    observations: Array<{ id: string; content: string; role: string; sessionId: string }>,
    peerId: string,
    existingContext?: ReasoningContext
  ): Promise<ReasonedConclusion[]> {
    if (observations.length === 0) return [];

    const messages = observations.map(o => ({ role: o.role, content: o.content }));
    const result = await this.reason(messages, peerId, existingContext);

    if (!result.conclusions || result.conclusions.length === 0) return [];

    // Generate embeddings for each conclusion
    const conclusionsWithEmbeddings: ReasonedConclusion[] = [];
    
    for (const c of result.conclusions) {
      let embedding: number[] | undefined;
      try {
        embedding = await this.generateEmbedding(c.content);
      } catch {
        // Non-fatal
        console.warn(`[ReasoningEngine] Failed to generate embedding for: ${c.content.slice(0, 50)}...`);
      }
      conclusionsWithEmbeddings.push({
        content: c.content,
        type: c.type as "deductive" | "inductive" | "abductive",
        premises: c.premises,
        scope: c.scope,
        confidence: c.confidence,
        embedding,
        sourceSessionId: observations[0]?.sessionId || "reasoning",
      });
    }

    return conclusionsWithEmbeddings;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.callOllama<{ embedding: number[] }>("/api/embeddings", { model: this.config.embeddingModel, prompt: text });
    return response.embedding;
  }

  /**
   * Reason about messages with optional context
   * @param messages Messages to reason about
   * @param _peerId Peer ID (unused, context determines scope)
   * @param context Optional context for informed reasoning
   */
  async reason(
    messages: Array<{ role: string; content: string }>, 
    _peerId: string,
    context?: ReasoningContext
  ): Promise<ReasoningOutput> {
    const prompt = this.buildReasoningPrompt(messages, context);
    const content = await this.callOllamaChat(prompt);
    return this.parseReasoningOutput(content);
  }

  /**
   * Dream - consolidate memories with scope classification
   * @param messages Recent messages
   * @param existingConclusions Existing conclusions (can be mixed scope)
   * @param context Optional context for informed dreaming
   */
  async dream(
    messages: Array<{ role: string; content: string }>, 
    existingConclusions: Conclusion[],
    context?: ReasoningContext
  ): Promise<DreamOutput> {
    const prompt = this.buildDreamPrompt(messages, existingConclusions, context);
    const content = await this.callOllamaChat(prompt);
    return this.parseDreamOutput(content);
  }

  /**
   * Call Ollama chat endpoint with proper format for Ollama API
   */
  private async callOllamaChat(prompt: string): Promise<string> {
    const response = await this.callOllama<{ message?: { content?: string }; choices?: Array<{ message?: { content?: string } }> }>("/api/chat", {
      model: this.config.reasoningModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,  // Disable streaming to get complete response
    });
    
    // Support both Ollama format (message.content) and OpenAI format (choices[0].message.content)
    return response.message?.content ?? response.choices?.[0]?.message?.content ?? "";
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.messageQueue.length === 0) return;
    this.isProcessing = true;
    
    try {
      // Process all items in the queue continuously
      while (this.messageQueue.length > 0) {
        const item = this.messageQueue.shift()!;
        try {
          const result = await this.reason(item.messages, item.peerId);
          
          // Save conclusions via callback if provided
          if (result.conclusions && result.conclusions.length > 0 && this.config.onConclusions) {
            const mapped = result.conclusions.map(c => ({
              ...c,
              type: c.type as "deductive" | "inductive" | "abductive",
              sourceSessionId: item.sessionFile,
            }));
            await this.config.onConclusions(mapped, item.peerId, item.sessionFile);
          }
          
          console.log(`[ReasoningEngine] Processed ${item.messages.length} messages, found ${result.conclusions?.length || 0} conclusions`);
        } catch (error) {
          console.error(`[ReasoningEngine] Failed to process queued item: ${error}`);
          // Continue with next item rather than stopping the entire queue
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async callOllama<T>(endpoint: string, body: any): Promise<T> {
    await this.acquireSemaphore();
    let lastError: Error | null = null;
    
    try {
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
          
          try {
            const response = await fetch(`${this.config.ollamaBaseUrl}${endpoint}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...(this.config.ollamaApiKey && { Authorization: `Bearer ${this.config.ollamaApiKey}` }) },
              body: JSON.stringify(body),
              signal: controller.signal,
            });
            
            if (!response.ok) {
              throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
            }
            
            return response.json();
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const classifiedError = this.classifyError(lastError);
          
          if (attempt < this.maxRetries) {
            const backoffMs = this.calculateBackoff(attempt);
            console.warn(`[ReasoningEngine] Attempt ${attempt} failed: ${classifiedError}. Retrying in ${Math.round(backoffMs)}ms...`);
            await this.sleep(backoffMs);
          }
        }
      }
      
      throw new Error(`[ReasoningEngine] All ${this.maxRetries} attempts failed. Last error: ${this.classifyError(lastError!)}`);
    } finally {
      this.releaseSemaphore();
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff with jitter
   */
  private calculateBackoff(attempt: number): number {
    const exponential = Math.min(this.retryDelayMs * Math.pow(2, attempt - 1), this.maxBackoffMs);
    const jitter = Math.random() * 1000; // 0-1s random jitter
    return exponential + jitter;
  }

  /**
   * Classify error for better debugging
   */
  private classifyError(error: Error): string {
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      return `Request timeout after ${this.timeoutMs}ms - Ollama may be overloaded or slow`;
    }
    if (error.message.includes('fetch') && error.message.includes('network')) {
      return `Network error - check Ollama connectivity: ${error.message}`;
    }
    return error.message;
  }

  /**
   * Acquire semaphore slot for concurrency control
   */
  private async acquireSemaphore(): Promise<void> {
    if (this.activeRequests < this.concurrency) {
      this.activeRequests++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.requestQueue.push(resolve);
      this.activeRequests++;
    });
  }

  /**
   * Release semaphore slot
   */
  private releaseSemaphore(): void {
    this.activeRequests--;
    const next = this.requestQueue.shift();
    if (next) {
      this.activeRequests++;
      next();
    }
  }

  /**
   * Build reasoning prompt with scope classification guidance
   */
  private buildReasoningPrompt(
    messages: Array<{ role: string; content: string }>,
    context?: ReasoningContext
  ): string {
    const formatted = messages.map((m) => `[${m.role}] ${m.content}`).join("\n\n");
    
    // Build context string
    let contextStr = "";
    if (context) {
      if (context.globalPeerCard) {
        const card = context.globalPeerCard;
        contextStr += "\n\n## Known User Profile (Global)\n";
        if (card.name) contextStr += `- Name: ${card.name}\n`;
        if (card.occupation) contextStr += `- Occupation: ${card.occupation}\n`;
        if (card.interests.length) contextStr += `- Interests: ${card.interests.join(", ")}\n`;
        if (card.traits.length) contextStr += `- Traits: ${card.traits.join(", ")}\n`;
        if (card.goals.length) contextStr += `- Goals: ${card.goals.join(", ")}\n`;
      }
      
      if (context.globalConclusions?.length) {
        contextStr += "\n\n## Cross-Project Insights\n";
        context.globalConclusions.slice(0, 5).forEach((c) => {
          contextStr += `- [${c.type}] ${c.content}\n`;
        });
      }
    }

    return `You are analyzing conversation messages to extract key conclusions about the user.

Messages to analyze:
${formatted}
${contextStr}

For each conclusion, classify its SCOPE:
- "user": Cross-project insights about the peer's traits, interests, goals, preferences, or personality. These apply across ALL projects.
  Examples: "Perfectionist", "Prefers TypeScript over JavaScript", "Interested in AI", "Values code quality"
  
- "project": Project-specific insights about code, architecture, or decisions unique to THIS project.
  Examples: "Used SQLite for local storage", "Implemented React hooks for state", "Chose this API design"

Format each conclusion as:
SCOPE: <user|project>
CONCLUSION: <type>
Type: deductive, inductive, or abductive
Content: <what you concluded>
Premises: <what led to this conclusion>
Confidence: <0.0-1.0>

RULES:
- If in doubt, prefer "project" scope (keeps user profile focused)
- "user" scope: personality, preferences, stated interests, goals
- "project" scope: technical decisions, code patterns, implementation details

Conclusion types:
- deductive: Logical certainty
- inductive: Probable inference
- abductive: Best explanation

Respond with 1-5 conclusions, focusing on the most important insights.`;
  }

  /**
   * Parse reasoning output with scope classification
   */
  private parseReasoningOutput(text: string): ReasoningOutput {
    const conclusions: Array<{ content: string; type: string; premises: string[]; scope: Scope; confidence: number }> = [];
    
    // Match blocks that start with SCOPE and CONCLUSION
    const blocks = text.split(/(?=SCOPE:)/i).filter(Boolean);
    
    for (const block of blocks) {
      const scopeMatch = block.match(/SCOPE:\s*(\w+)/i);
      const typeMatch = block.match(/Type:\s*(\w+)/i);
      const contentMatch = block.match(/Content:\s*(.+?)(?=Premises:|Confidence:|$)/s);
      const premisesMatch = block.match(/Premises:\s*(.+?)(?=Confidence:|Type:|SCOPE:|$)/s);
      const confidenceMatch = block.match(/Confidence:\s*([\d.]+)/);
      
      if (scopeMatch && contentMatch) {
        const scope = (scopeMatch[1].toLowerCase() as Scope) || 'project';
        const type = typeMatch?.[1] || 'inductive';
        const content = contentMatch[1].trim();
        const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;
        let premises: string[] = [];
        
        if (premisesMatch) {
          premises = premisesMatch[1].split(/[,;]/).map((p) => p.trim()).filter(Boolean);
        }
        
        conclusions.push({ content, type, premises, scope, confidence });
      }
    }
    
    // Fallback: if no scoped conclusions found, try original parsing with default scope
    if (conclusions.length === 0) {
      const legacyBlocks = text.split(/CONCLUSION:/i).filter(Boolean);
      for (const block of legacyBlocks) {
        const typeMatch = block.match(/Type:\s*(\w+)/i);
        const contentMatch = block.match(/Content:\s*(.+?)(?=Premises:|$)/s);
        
        if (contentMatch) {
          conclusions.push({
            content: contentMatch[1].trim(),
            type: typeMatch?.[1] || 'inductive',
            premises: [],
            scope: 'project', // Default to project scope
            confidence: 0.5,
          });
        }
      }
    }
    
    // Convert to ReasoningOutput format
    const explicit = conclusions.map((c) => ({ content: c.content, scope: c.scope }));
    const deductive = conclusions
      .filter((c) => c.type === "deductive")
      .map((c) => ({ premises: c.premises, conclusion: c.content, scope: c.scope }));
    
    return { explicit, deductive, conclusions };
  }

  /**
   * Build dream prompt with scope classification
   */
  private buildDreamPrompt(
    messages: Array<{ role: string; content: string }>, 
    existingConclusions: Conclusion[],
    context?: ReasoningContext
  ): string {
    const recent = messages.slice(-50).map((m) => `[${m.role}] ${m.content}`).join("\n");
    
    // Separate conclusions by scope
    const userConclusions = existingConclusions.filter((c) => c.scope === 'user');
    const projectConclusions = existingConclusions.filter((c) => c.scope === 'project');
    
    let contextStr = "";
    
    if (context?.globalPeerCard) {
      const card = context.globalPeerCard;
      contextStr += "\n\n## Known User Profile\n";
      if (card.name) contextStr += `- Name: ${card.name}\n`;
      if (card.interests.length) contextStr += `- Interests: ${card.interests.join(", ")}\n`;
      if (card.traits.length) contextStr += `- Traits: ${card.traits.join(", ")}\n`;
      if (card.goals.length) contextStr += `- Goals: ${card.goals.join(", ")}\n`;
    }
    
    return `You are dreaming - consolidating memories and generating new insights.

Recent messages:
${recent}
${contextStr}

Prior conclusions by scope:
## Cross-Project (user scope):
${userConclusions.slice(0, 10).map((c) => `- [${c.type}] ${c.content}`).join("\n") || "None"}

## Project-Specific (project scope):
${projectConclusions.slice(0, 10).map((c) => `- [${c.type}] ${c.content}`).join("\n") || "None"}

Generate NEW conclusions by analyzing patterns in the messages.
Classify each as SCOPE: user (cross-project) or project (local).

Respond with:
NEW_CONCLUSIONS:
- SCOPE: user
  Type: inductive
  Content: <insight about user traits/interests/goals>
- SCOPE: project  
  Type: abductive
  Content: <insight about this project's direction>

IMPORTANT: Use ONLY these types: inductive, abductive, deductive
Use EXACT scope values: "user" or "project"

UPDATED_PATTERNS:
- <existing pattern>: <updated understanding if needed, or "unchanged">`;
  }

  /**
   * Parse dream output with scope classification
   */
  private parseDreamOutput(text: string): DreamOutput {
    const newConclusions: Array<{
      type: "deductive" | "inductive" | "abductive";
      content: string;
      premises: string[];
      confidence: number;
      scope: Scope;
    }> = [];
    const updatedPatterns: Array<{ pattern: string; evidence: string[] }> = [];
    
    // Parse new conclusions
    const newMatch = text.match(/NEW_CONCLUSIONS:(.+?)(?=UPDATED_PATTERNS:|$)/si);
    if (newMatch) {
      // Split by SCOPE: to get individual conclusions
      const conclusionBlocks = newMatch[1].split(/(?=^\s*SCOPE:)/m).filter(Boolean);
      
      for (const block of conclusionBlocks) {
        const scopeMatch = block.match(/SCOPE:\s*(\w+)/i);
        const typeMatch = block.match(/Type:\s*(\w+)/i);
        const contentMatch = block.match(/Content:\s*(.+?)(?=$)/s);
        
        if (scopeMatch && contentMatch) {
          const scope = (scopeMatch[1].toLowerCase() as Scope) || 'project';
          const type = (typeMatch?.[1]?.toLowerCase() as "deductive" | "inductive" | "abductive") || 'inductive';
          const content = contentMatch[1].trim();
          
          if (content && content.length > 5) {
            newConclusions.push({
              type,
              content,
              premises: [],
              confidence: 0.6,
              scope,
            });
          }
        }
      }
    }
    
    // Fallback: try simpler format
    if (newConclusions.length === 0) {
      const lines = text.split("\n").filter((l) => l.trim().startsWith("-"));
      for (const line of lines) {
        const match = line.match(/-\s*(deductive|inductive|abductive)[\s:]+(.+)/i);
        if (match) {
          newConclusions.push({
            type: match[1].toLowerCase() as "deductive" | "inductive" | "abductive",
            content: match[2].trim(),
            premises: [],
            confidence: 0.6,
            scope: 'project', // Default to project scope
          });
        }
      }
    }
    
    // Parse updated patterns
    const updatedMatch = text.match(/UPDATED_PATTERNS:(.+?)$/si);
    if (updatedMatch) {
      const lines = updatedMatch[1].split("\n").filter((l) => l.includes(":"));
      for (const line of lines) {
        const [pattern, evidence] = line.split(":").map((s) => s.trim());
        if (pattern && evidence && evidence !== "unchanged") {
          updatedPatterns.push({ pattern, evidence: [evidence] });
        }
      }
    }
    
    return { newConclusions, updatedPatterns };
  }
}
