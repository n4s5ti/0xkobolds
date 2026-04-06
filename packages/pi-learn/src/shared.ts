/**
 * Pi-Learn Shared Utilities
 * 
 * Common types and utilities for the pi-learn memory system.
 * Uses Ollama for embeddings and reasoning.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Scope classification for conclusions and other data
 * - 'user': Cross-project data (traits, interests, goals) - stored in __global__
 * - 'project': Project-specific data - stored in project workspace
 */
export type Scope = "user" | "project";

export interface Peer {
  id: string;
  name: string;
  type: "user" | "agent" | "entity";
  createdAt: number;
  metadata: Record<string, unknown>;
}

export interface Conclusion {
  id: string;
  peerId: string;
  type: "deductive" | "inductive" | "abductive";
  content: string;
  premises: string[];
  confidence: number;
  createdAt: number;
  sourceSessionId: string;
  embedding?: number[];
  scope: Scope;  // 'user' (global) or 'project' (local)
}

export interface Summary {
  id: string;
  sessionId: string;
  peerId: string;
  type: "short" | "long";
  content: string;
  messageCount: number;
  createdAt: number;
  embedding?: number[];
}

/**
 * Observation - raw messages stored before reasoning
 * Similar to Honcho's observation system
 */
export interface Observation {
  id: string;
  workspaceId: string;
  peerId: string;       // Who made the observation
  aboutPeerId?: string; // Cross-peer: who is being observed (optional for self-observations)
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  embedding?: number[];
  processed: boolean;  // Has this been through reasoning?
}

/**
 * Export format for backup/restore
 */
export interface ExportData {
  version: string;
  exportedAt: number;
  workspace: Workspace;
  peers: Peer[];
  conclusions: Conclusion[];
  summaries: Summary[];
  observations: Observation[];
  peerCards: PeerCard[];
}

export interface PeerCard {
  peerId: string;
  name?: string;
  occupation?: string;
  interests: string[];
  traits: string[];
  goals: string[];
  updatedAt: number;
}

export interface Session {
  id: string;
  workspaceId: string;
  peerIds: string[];
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  config: SessionConfig;
  tags: string[];  // Session tags for categorization
}

export interface SessionConfig {
  observeMe: boolean;      // Should others form representations of me?
  observeOthers: boolean;  // Should I form representations of others?
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  config: WorkspaceConfig;
}

export interface WorkspaceConfig {
  reasoningEnabled: boolean;
  reasoningModel?: string;
  embeddingModel?: string;
  tokenBatchSize: number;
  // Retention config
  retentionDays?: number;
  summaryRetentionDays?: number;
  conclusionRetentionDays?: number;
  // Dreaming config
  dreamingEnabled?: boolean;
  dreamIntervalMs?: number;
}

export interface PeerRepresentation {
  peerId: string;
  conclusions: Conclusion[];
  summaries: Summary[];
  peerCard: PeerCard | null;
  observations: Observation[];
  lastReasonedAt: number;
}

// ============================================================================
// INSIGHTS TYPES
// ============================================================================

export interface MemoryInsights {
  learningVelocity: number;        // Conclusions per day (last 7 days)
  topicDistribution: {
    deductive: number;
    inductive: number;
    abductive: number;
  };
  interestEvolution: Array<{
    interest: string;
    frequency: number;
    trend: "up" | "stable" | "down";
  }>;
  engagementMetrics: {
    totalSessions: number;
    totalMessages: number;
    avgMessagesPerSession: number;
    sessionFrequencyPerWeek: number;
    activeDaysLastWeek: number;
  };
  recentActivity: {
    conclusionsLastWeek: number;
    conclusionsLastMonth: number;
    sessionsLastWeek: number;
  };
}

// ============================================================================
// RETENTION CONFIG
// ============================================================================

export interface RetentionConfig {
  retentionDays: number;         // Default: forever (0 or undefined = keep forever)
  summaryRetentionDays: number;  // Default: 30 days
  conclusionRetentionDays: number; // Default: 90 days
  pruneOnStartup: boolean;      // Default: true
  pruneIntervalHours: number;    // Default: 24
}

export const DEFAULT_RETENTION: RetentionConfig = {
  retentionDays: 0,              // Forever by default
  summaryRetentionDays: 30,
  conclusionRetentionDays: 90,
  pruneOnStartup: true,
  pruneIntervalHours: 24,
};

// ============================================================================
// DREAMING CONFIG  
// ============================================================================

export interface DreamConfig {
  enabled: boolean;
  intervalMs: number;           // How often to dream (default: 1 hour)
  minMessagesSinceLastDream: number;  // Minimum messages before dreaming
  batchSize: number;            // Messages to include in dream
}

export const DEFAULT_DREAM: DreamConfig = {
  enabled: true,
  intervalMs: 60 * 60 * 1000,   // 1 hour
  minMessagesSinceLastDream: 5,
  batchSize: 50,
};

// ============================================================================
// CONSTANTS
// ============================================================================

export const DEFAULT_TOKEN_BATCH_SIZE = 1000;
export const DEFAULT_CONCURRENCY = 1;
export const SHORT_SUMMARY_INTERVAL = 20;
export const LONG_SUMMARY_INTERVAL = 60;
export const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text-v2-moe:latest";
export const DEFAULT_REASONING_MODEL = "qwen3.5:latest";

/**
 * Global workspace ID for cross-project (user-scope) data
 */
export const GLOBAL_WORKSPACE_ID = "__global__";

// ============================================================================
// EMBEDDINGS (Ollama)
// ============================================================================

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

/**
 * Generate embeddings using Ollama's embedding endpoint
 */
export async function generateEmbedding(
  text: string,
  baseUrl: string = "http://localhost:11434",
  model: string = DEFAULT_EMBEDDING_MODEL
): Promise<EmbeddingResult> {
  const response = await fetch(`${baseUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: text }),
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.statusText}`);
  }

  const data = await response.json() as { embedding?: number[] };
  return {
    embedding: data.embedding || [],
    model,
  };
}

/**
 * Generate embeddings for multiple texts
 */
export async function generateEmbeddings(
  texts: string[],
  baseUrl: string = "http://localhost:11434",
  model: string = DEFAULT_EMBEDDING_MODEL
): Promise<EmbeddingResult[]> {
  return Promise.all(texts.map((text) => generateEmbedding(text, baseUrl, model)));
}

/**
 * Cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================================
// REASONING PROMPTS
// ============================================================================

export const REASONING_PROMPT = `You are a memory analysis system. Analyze messages and extract insights about the peer.

Messages to analyze:
{messages}

{existing_context}

Provide your analysis as a JSON object with this structure:
{
  "explicit": [{"content": "explicit fact stated by peer"}],
  "deductive": [{"premises": ["premise1", "premise2"], "conclusion": "certain conclusion"}],
  "inductive": [{"pattern": "pattern observed", "evidence": ["evidence1", "evidence2"]}],
  "abductive": [{"observation": "what was observed", "inference": "simplest explanation", "simplest": true}],
  "peerCard": {"name": "name if mentioned", "occupation": "job if mentioned", "interests": ["interest1"], "traits": ["trait1"], "goals": ["goal1"]},
  "summary": {"type": "short|long", "content": "summary of key points"}
}

Focus on:
- Stated facts, preferences, and goals
- Behavioral patterns
- Contextual clues about who this person is
- Inconsistencies or contradictions
- Topics they care about

Respond ONLY with valid JSON, no additional text.`;

/**
 * Dream prompt - for background/creative reasoning
 */
export const DREAM_PROMPT = `You are a memory synthesis system. The peer has been conversing with an AI. 

Recent messages:
{messages}

Previous conclusions:
{conclusions}

Your task is to "dream" - synthesize deeper insights, find connections, and generate new hypotheses about the peer.

Provide your analysis as a JSON object:
{
  "newConclusions": [{"type": "deductive|inductive|abductive", "content": "insight", "premises": ["source1"], "confidence": 0.8}],
  "updatedPatterns": [{"pattern": "observed pattern", "evidence": ["evidence1"]}],
  "peerCardUpdates": {"name": "if changed", "occupation": "if changed", "interests": [], "traits": [], "goals": []},
  "dreamNarrative": "Optional: A creative synthesis narrative about who this person might be"
}

Be creative and insightful. Look for subtle patterns. Respond ONLY with valid JSON.`;

/**
 * Build reasoning prompt with context
 */
export function buildReasoningPrompt(
  messages: Array<{ role: string; content: string }>,
  existingContext?: {
    conclusions?: Conclusion[];
    summary?: string;
    peerCard?: PeerCard;
  }
): string {
  const messageList = messages
    .map((m) => `<${m.role}>\n${m.content}`)
    .join("\n\n");

  let existingCtx = "";

  if (existingContext?.conclusions?.length) {
    existingCtx += "\n\nExisting conclusions about this peer:\n";
    for (const c of existingContext.conclusions.slice(-10)) {
      existingCtx += `- [${c.type}] ${c.content}\n`;
    }
  }

  if (existingContext?.summary) {
    existingCtx += `\n\nPrevious summary:\n${existingContext.summary}`;
  }

  if (existingContext?.peerCard) {
    existingCtx += "\n\nKnown peer info:\n";
    if (existingContext.peerCard.name)
      existingCtx += `- Name: ${existingContext.peerCard.name}\n`;
    if (existingContext.peerCard.occupation)
      existingCtx += `- Occupation: ${existingContext.peerCard.occupation}\n`;
    if (existingContext.peerCard.interests?.length)
      existingCtx += `- Interests: ${existingContext.peerCard.interests.join(", ")}\n`;
    if (existingContext.peerCard.traits?.length)
      existingCtx += `- Traits: ${existingContext.peerCard.traits.join(", ")}\n`;
    if (existingContext.peerCard.goals?.length)
      existingCtx += `- Goals: ${existingContext.peerCard.goals.join(", ")}\n`;
  }

  return REASONING_PROMPT.replace("{messages}", messageList).replace(
    "{existing_context}",
    existingCtx || "\n\nNo existing context - this is a new peer."
  );
}

/**
 * Build dream prompt with context
 */
export function buildDreamPrompt(
  messages: Array<{ role: string; content: string }>,
  conclusions: Conclusion[]
): string {
  const messageList = messages
    .map((m) => `<${m.role}>\n${m.content}`)
    .join("\n\n");

  const conclusionList = conclusions
    .slice(-20)
    .map((c) => `- [${c.type}] ${c.content}`)
    .join("\n");

  return DREAM_PROMPT.replace("{messages}", messageList).replace(
    "{conclusions}",
    conclusionList || "No previous conclusions"
  );
}

// ============================================================================
// REASONING OUTPUT TYPES
// ============================================================================

export interface ReasoningOutput {
  explicit: Array<{ content: string; scope?: Scope }>;
  deductive: Array<{ premises: string[]; conclusion: string; scope?: Scope }>;
  conclusions?: Array<{ content: string; type: string; premises: string[]; scope: Scope; confidence: number }>;
}

export interface DreamOutput {
  newConclusions: Array<{
    type: "deductive" | "inductive" | "abductive";
    content: string;
    premises: string[];
    confidence: number;
    scope: Scope;
  }>;
  updatedPatterns?: Array<{ pattern: string; evidence: string[] }>;
}

/**
 * Parse reasoning output from JSON
 */
export function parseReasoningOutput(output: string): ReasoningOutput {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(output);
  } catch {
    return {
      explicit: [],
      deductive: [],
    };
  }
}

/**
 * Parse dream output from JSON
 */
export function parseDreamOutput(output: string): DreamOutput {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(output);
  } catch {
    return {
      newConclusions: [],
    };
  }
}

// ============================================================================
// TOKEN UTILITIES
// ============================================================================

/**
 * Estimate token count (rough: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for messages
 */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>
): number {
  return messages.reduce(
    (sum, m) => sum + estimateTokens(`${m.role}: ${m.content}`),
    0
  );
}

/**
 * Split messages into batches by token count
 */
export function batchByTokens(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = DEFAULT_TOKEN_BATCH_SIZE
): Array<Array<{ role: string; content: string }>> {
  const batches: Array<Array<{ role: string; content: string }>> = [];
  let currentBatch: Array<{ role: string; content: string }> = [];
  let currentTokens = 0;

  for (const msg of messages) {
    const msgTokens = estimateTokens(`${msg.role}: ${msg.content}`);

    if (currentTokens + msgTokens > maxTokens && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [msg];
      currentTokens = msgTokens;
    } else {
      currentBatch.push(msg);
      currentTokens += msgTokens;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique ID
 */
export function generateId(prefix: string = ""): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
