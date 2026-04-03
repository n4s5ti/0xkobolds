/**
 * Context Assembler Module - Memory retrieval and context building
 * 
 * Supports hybrid architecture:
 * - Local (project) context: workspace-specific memories
 * - Global (user) context: cross-project traits, interests, goals
 */

import type { SQLiteStore } from "./store.js";
import type { PeerRepresentation, Conclusion, Summary, MemoryInsights, PeerCard } from "../shared.js";
import { GLOBAL_WORKSPACE_ID } from "../shared.js";
import { cosineSimilarity } from "../shared.js";

export function createContextAssembler(store: SQLiteStore): ContextAssembler {
  return new ContextAssembler(store);
}

export interface MemoryStats {
  conclusionCount: number;
  summaryCount: number;
  globalConclusionCount: number;
  hasPeerCard: boolean;
  hasGlobalPeerCard: boolean;
  lastReasonedAt: number | null;
  topInterests: string[];
  topTraits: string[];
}

export interface BlendedContext {
  global: {
    peerCard: PeerCard | null;
    conclusions: Conclusion[];
  };
  project: {
    peerCard: PeerCard | null;
    conclusions: Conclusion[];
    summaries: Summary[];
    observations: Array<{ role: string; content: string; processed: boolean }>;
  };
  blendedConclusions: Conclusion[];
  assembledString: string;
}

export class ContextAssembler {
  constructor(private store: SQLiteStore) {}

  /**
   * Get blended context: global (user-scope) + local (project-scope)
   * This is the main method for context assembly
   */
  assembleContext(workspaceId: string, peerId: string): string | null {
    const blended = this.getBlendedContext(workspaceId, peerId);
    return blended.assembledString;
  }

  /**
   * Get full blended context with structure
   */
  getBlendedContext(workspaceId: string, peerId: string): BlendedContext {
    // Get local (project) representation
    const localRep = this.store.getRepresentation(workspaceId, peerId, false);
    
    // Get global (user-scope) representation
    const globalRep = this.store.getRepresentation(GLOBAL_WORKSPACE_ID, peerId, false);
    
    // Blend the context strings
    const assembledString = this.buildBlendedContextString(
      globalRep,
      localRep
    );
    
    // Combine conclusions: project first, then global
    const blendedConclusions = [
      ...(localRep?.conclusions || []),
      ...(globalRep?.conclusions || [])
    ];
    
    return {
      global: {
        peerCard: globalRep?.peerCard || null,
        conclusions: globalRep?.conclusions || [],
      },
      project: {
        peerCard: localRep?.peerCard || null,
        conclusions: localRep?.conclusions || [],
        summaries: localRep?.summaries || [],
        observations: (localRep?.observations || [])
          .filter(o => !o.processed)
          .slice(0, 5)
          .map(o => ({ role: o.role, content: o.content, processed: o.processed })),
      },
      blendedConclusions,
      assembledString,
    };
  }

  /**
   * Get global context only (user-scope from __global__ workspace)
   */
  getGlobalContext(peerId: string): string | null {
    const rep = this.store.getRepresentation(GLOBAL_WORKSPACE_ID, peerId, false);
    if (!rep) return null;
    return this.buildGlobalContextString(rep);
  }

  /**
   * Get project-only context (local workspace, project scope)
   */
  getProjectContext(workspaceId: string, peerId: string): string | null {
    const rep = this.store.getRepresentation(workspaceId, peerId, false);
    if (!rep) return null;
    return this.buildProjectContextString(rep);
  }

  /**
   * Search across both local and global contexts
   */
  async searchSimilar(
    workspaceId: string,
    peerId: string,
    query: string,
    topK = 5,
    minSimilarity = 0.0,
    searchGlobal = true
  ): Promise<Array<Conclusion & { confidence: number; scope: 'user' | 'project' }>> {
    // Get local conclusions
    const localConclusions = this.store.getConclusions(workspaceId, peerId, 100);
    
    // Get global conclusions if requested
    const globalConclusions = searchGlobal 
      ? this.store.getGlobalConclusions(peerId, 100)
      : [];
    
    const allConclusions = [
      ...localConclusions.map(c => ({ ...c, scope: 'project' as const })),
      ...globalConclusions.map(c => ({ ...c, scope: 'user' as const })),
    ];
    
    if (!allConclusions.length) return [];

    // Use embedding-based similarity when available, fallback to keyword
    const queryWords = query.toLowerCase().split(/\s+/);
    const scored = allConclusions.map((c) => {
      let confidence: number;

      if (c.embedding && c.embedding.length > 0) {
        // Hybrid approach: keyword + embedding presence boost
        const contentWords = c.content.toLowerCase().split(/\s+/);
        const overlap = queryWords.filter((w) =>
          contentWords.some((cw) => cw.includes(w) || w.includes(cw))
        ).length;
        const keywordScore = overlap / Math.max(queryWords.length, 1);
        confidence = keywordScore * 0.6 + (c.embedding ? 0.4 : 0);
      } else {
        // Keyword-only fallback
        const contentWords = c.content.toLowerCase().split(/\s+/);
        const overlap = queryWords.filter((w) =>
          contentWords.some((cw) => cw.includes(w) || w.includes(cw))
        ).length;
        confidence = overlap / Math.max(queryWords.length, 1);
      }

      return { ...c, confidence };
    });

    return scored
      .filter((c) => c.confidence >= minSimilarity)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, topK);
  }

  getConclusionsByType(workspaceId: string, peerId: string, type: Conclusion["type"], scope?: 'user' | 'project'): Conclusion[] {
    if (scope === 'user') {
      return this.store.getGlobalConclusions(peerId, 100).filter(c => c.type === type);
    }
    return this.store.getConclusions(workspaceId, peerId, 100).filter(c => c.type === type);
  }

  getSummaries(workspaceId: string, peerId: string, limit = 10): Summary[] {
    return this.store.getSummaries(workspaceId, peerId, limit);
  }

  getMemoryStats(workspaceId: string, peerId: string): MemoryStats {
    const rep = this.store.getRepresentation(workspaceId, peerId, false);
    const globalRep = this.store.getRepresentation(GLOBAL_WORKSPACE_ID, peerId, false);
    
    if (!rep) {
      return { 
        conclusionCount: 0, 
        summaryCount: 0,
        globalConclusionCount: globalRep?.conclusions.length || 0,
        hasPeerCard: false,
        hasGlobalPeerCard: !!globalRep?.peerCard,
        lastReasonedAt: null, 
        topInterests: globalRep?.peerCard?.interests?.slice(0, 5) || [],
        topTraits: globalRep?.peerCard?.traits?.slice(0, 5) || [],
      };
    }

    const card = rep.peerCard;
    const globalCard = globalRep?.peerCard;
    
    // Merge interests/traits from both local and global peer cards
    const allInterests = [...(card?.interests || []), ...(globalCard?.interests || [])];
    const allTraits = [...(card?.traits || []), ...(globalCard?.traits || [])];
    
    // Deduplicate
    const uniqueInterests = [...new Set(allInterests)];
    const uniqueTraits = [...new Set(allTraits)];

    return {
      conclusionCount: rep.conclusions.length,
      summaryCount: rep.summaries.length,
      globalConclusionCount: globalRep?.conclusions.length || 0,
      hasPeerCard: !!card,
      hasGlobalPeerCard: !!globalCard,
      lastReasonedAt: rep.lastReasonedAt || null,
      topInterests: uniqueInterests.slice(0, 5),
      topTraits: uniqueTraits.slice(0, 5),
    };
  }

  /**
   * Get comprehensive memory insights about a peer's learning patterns
   * Includes both local and global data
   */
  getInsights(workspaceId: string, peerId: string): MemoryInsights {
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
    
    // Get both local and global conclusions
    const localConclusions = this.store.getConclusions(workspaceId, peerId, 1000);
    const globalConclusions = this.store.getGlobalConclusions(peerId, 1000);
    const allConclusions = [...localConclusions, ...globalConclusions];
    
    const summaries = this.store.getSummaries(workspaceId, peerId, 100);
    const sessions = this.store.getAllSessions(workspaceId);
    
    // Merge peer cards
    const localCard = this.store.getPeerCard(workspaceId, peerId);
    const globalCard = this.store.getPeerCard(GLOBAL_WORKSPACE_ID, peerId);
    const peerCard = this.mergePeerCards(localCard, globalCard);

    // Learning velocity: conclusions per day over last week
    const recentConclusions = allConclusions.filter(c => c.createdAt > oneWeekAgo);
    const learningVelocity = recentConclusions.length / 7;

    // Topic distribution
    const topicDistribution = {
      deductive: allConclusions.filter(c => c.type === 'deductive').length,
      inductive: allConclusions.filter(c => c.type === 'inductive').length,
      abductive: allConclusions.filter(c => c.type === 'abductive').length,
    };

    // Interest evolution from peer card and conclusions
    const allConclusionsText = allConclusions.map(c => c.content.toLowerCase()).join(' ');
    const knownInterests = peerCard?.interests || [];
    
    const interestEvolution = knownInterests.map(interest => {
      const interestLower = interest.toLowerCase();
      const words = interestLower.split(/\s+/);
      
      // Count in all conclusions
      const totalCount = words.reduce((sum, word) => {
        const regex = new RegExp(word, 'gi');
        return sum + (allConclusionsText.match(regex)?.length || 0);
      }, 0);
      
      // Count in recent conclusions (last month)
      const recentText = recentConclusions.map(c => c.content.toLowerCase()).join(' ');
      const recentCount = words.reduce((sum, word) => {
        const regex = new RegExp(word, 'gi');
        return sum + (recentText.match(regex)?.length || 0);
      }, 0);
      
      // Determine trend
      let trend: 'up' | 'stable' | 'down' = 'stable';
      const oldCount = totalCount - recentCount;
      if (oldCount === 0 && recentCount > 0) {
        trend = 'up';
      } else if (recentCount > oldCount * 1.5) {
        trend = 'up';
      } else if (recentCount < oldCount * 0.5 && oldCount > 0) {
        trend = 'down';
      }
      
      return {
        interest,
        frequency: totalCount,
        trend,
      };
    }).sort((a, b) => b.frequency - a.frequency);

    // Engagement metrics
    const oneWeekSessions = sessions.filter(s => s.createdAt > oneWeekAgo);
    const uniqueDays = new Set(oneWeekSessions.map(s => new Date(s.createdAt).toDateString()));
    
    // Count total messages across all sessions
    let totalMessages = 0;
    for (const session of sessions) {
      const messages = this.store.getMessages(workspaceId, session.id, 10000);
      totalMessages += messages.length;
    }

    const engagementMetrics = {
      totalSessions: sessions.length,
      totalMessages,
      avgMessagesPerSession: sessions.length > 0 ? totalMessages / sessions.length : 0,
      sessionFrequencyPerWeek: oneWeekSessions.length,
      activeDaysLastWeek: uniqueDays.size,
    };

    // Recent activity
    const recentActivity = {
      conclusionsLastWeek: recentConclusions.length,
      conclusionsLastMonth: allConclusions.filter(c => c.createdAt > oneMonthAgo).length,
      sessionsLastWeek: oneWeekSessions.length,
    };

    return {
      learningVelocity,
      topicDistribution,
      interestEvolution,
      engagementMetrics,
      recentActivity,
    };
  }

  /**
   * Get perspective-based context: what peer A knows/thinks about peer B
   */
  getPerspective(workspaceId: string, observerPeerId: string, targetPeerId: string): string | null {
    // Get observations made BY observer ABOUT target
    const crossObservations = this.store.getObservationsAboutPeer(workspaceId, targetPeerId, 50)
      .filter(o => o.peerId === observerPeerId);
    
    // Get conclusions that observer has made about target
    const conclusions = this.store.getConclusions(workspaceId, observerPeerId, 100)
      .filter(c => c.content.toLowerCase().includes(targetPeerId.toLowerCase()));
    
    // Get target's peer card (public info)
    const targetCard = this.store.getPeerCard(workspaceId, targetPeerId);
    
    if (!crossObservations.length && !conclusions.length && !targetCard) {
      return null;
    }

    const parts: string[] = [];
    
    parts.push(`## Perspective: ${observerPeerId} on ${targetPeerId}`);
    
    if (crossObservations.length > 0) {
      parts.push("\n### Observations");
      crossObservations.slice(0, 10).forEach((o) => parts.push(`- ${o.content.slice(0, 200)}`));
    }
    
    if (conclusions.length > 0) {
      parts.push("\n### Conclusions");
      conclusions.slice(0, 5).forEach((c) => parts.push(`- [${c.type}] ${c.content}`));
    }
    
    if (targetCard) {
      parts.push("\n### Known Info");
      if (targetCard.name) parts.push(`- Name: ${targetCard.name}`);
      if (targetCard.occupation) parts.push(`- Occupation: ${targetCard.occupation}`);
      if (targetCard.interests.length) parts.push(`- Interests: ${targetCard.interests.join(", ")}`);
    }
    
    return parts.join("\n");
  }

  // ========================================================================
  // PRIVATE METHODS
  // ========================================================================

  /**
   * Merge two peer cards, preferring non-null values from the first
   */
  private mergePeerCards(local?: PeerCard | null, global?: PeerCard | null): Partial<PeerCard> {
    if (!local && !global) return {};
    
    return {
      name: local?.name || global?.name,
      occupation: local?.occupation || global?.occupation,
      interests: [...new Set([...(local?.interests || []), ...(global?.interests || [])])],
      traits: [...new Set([...(local?.traits || []), ...(global?.traits || [])])],
      goals: [...new Set([...(local?.goals || []), ...(global?.goals || [])])],
    };
  }

  /**
   * Build blended context string: global first, then project
   */
  private buildBlendedContextString(globalRep: PeerRepresentation | null, localRep: PeerRepresentation | null): string {
    const parts: string[] = [];
    
    // === GLOBAL (USER-SCOPE) ===
    // Global peer card first - interests, traits, goals
    if (globalRep?.peerCard) {
      const card = globalRep.peerCard;
      parts.push("## User Profile (Global)");
      if (card.name) parts.push(`- Name: ${card.name}`);
      if (card.occupation) parts.push(`- Occupation: ${card.occupation}`);
      if (card.interests.length) parts.push(`- Interests: ${card.interests.join(", ")}`);
      if (card.traits.length) parts.push(`- Traits: ${card.traits.join(", ")}`);
      if (card.goals.length) parts.push(`- Goals: ${card.goals.join(", ")}`);
    }
    
    // Global conclusions (user-scope)
    if (globalRep?.conclusions && globalRep.conclusions.length > 0) {
      parts.push("\n## Cross-Project Insights");
      globalRep.conclusions.slice(0, 5).forEach((c) => parts.push(`- [${c.type}] ${c.content}`));
    }
    
    // === PROJECT (LOCAL) ===
    // Recent unprocessed observations
    const recentObservations = (localRep?.observations || [])
      .filter(o => !o.processed)
      .slice(0, 3);
    if (recentObservations.length > 0) {
      parts.push("\n## Recent Observations");
      recentObservations.forEach((o) => parts.push(`- [${o.role}] ${o.content.slice(0, 150)}`));
    }
    
    // Local conclusions (project-scope)
    if (localRep?.conclusions && localRep.conclusions.length > 0) {
      parts.push("\n## Project Conclusions");
      localRep.conclusions.slice(0, 5).forEach((c) => parts.push(`- [${c.type}] ${c.content}`));
    }
    
    // Local summaries
    if (localRep?.summaries && localRep.summaries.length > 0) {
      parts.push("\n## Project Summaries");
      localRep.summaries.slice(0, 2).forEach((s) => parts.push(`- ${s.type}: ${s.content.slice(0, 150)}`));
    }
    
    // Project-specific peer card (always show if exists, since no global)
    if (localRep?.peerCard) {
      const card = localRep.peerCard;
      // Show the full profile if no global card OR if this is the only card
      const showFullProfile = !globalRep?.peerCard;
      
      if (showFullProfile) {
        parts.push("\n## User Profile");
        if (card.name) parts.push(`- Name: ${card.name}`);
        if (card.occupation) parts.push(`- Occupation: ${card.occupation}`);
        if (card.interests.length) parts.push(`- Interests: ${card.interests.join(", ")}`);
        if (card.traits.length) parts.push(`- Traits: ${card.traits.join(", ")}`);
        if (card.goals.length) parts.push(`- Goals: ${card.goals.join(", ")}`);
      } else {
        // Only show unique info beyond global
        const hasUniqueInfo = card.occupation || card.interests.length || card.traits.length;
        if (hasUniqueInfo) {
          parts.push("\n## Project-Specific Profile");
          if (card.occupation) parts.push(`- Occupation: ${card.occupation}`);
          if (card.interests.length) parts.push(`- Interests: ${card.interests.join(", ")}`);
        }
      }
    }
    
    return parts.join("\n") || "No memory context available.";
  }

  /**
   * Build global context string only
   */
  private buildGlobalContextString(rep: PeerRepresentation): string {
    const parts: string[] = [];
    
    if (rep.peerCard) {
      const card = rep.peerCard;
      parts.push("## User Profile (Global)");
      if (card.name) parts.push(`- Name: ${card.name}`);
      if (card.occupation) parts.push(`- Occupation: ${card.occupation}`);
      if (card.interests.length) parts.push(`- Interests: ${card.interests.join(", ")}`);
      if (card.traits.length) parts.push(`- Traits: ${card.traits.join(", ")}`);
      if (card.goals.length) parts.push(`- Goals: ${card.goals.join(", ")}`);
    }
    
    if (rep.conclusions.length > 0) {
      parts.push("\n## Cross-Project Insights");
      rep.conclusions.slice(0, 10).forEach((c) => parts.push(`- [${c.type}] ${c.content}`));
    }
    
    return parts.join("\n") || "No global context available.";
  }

  /**
   * Build project-only context string
   */
  private buildProjectContextString(rep: PeerRepresentation): string {
    const parts: string[] = [];
    
    // Recent unprocessed observations
    const recentObservations = rep.observations
      .filter(o => !o.processed)
      .slice(0, 5);
    if (recentObservations.length > 0) {
      parts.push("## Recent Observations");
      recentObservations.forEach((o) => parts.push(`- [${o.role}] ${o.content.slice(0, 200)}`));
    }
    
    if (rep.conclusions.length > 0) {
      parts.push("\n## Key Conclusions");
      rep.conclusions.slice(0, 10).forEach((c) => parts.push(`- [${c.type}] ${c.content}`));
    }
    
    if (rep.summaries.length > 0) {
      parts.push("\n## Recent Summaries");
      rep.summaries.slice(0, 3).forEach((s) => parts.push(`- ${s.type}: ${s.content.slice(0, 200)}`));
    }
    
    if (rep.peerCard) {
      const card = rep.peerCard;
      parts.push("\n## User Profile");
      if (card.name) parts.push(`- Name: ${card.name}`);
      if (card.occupation) parts.push(`- Occupation: ${card.occupation}`);
      if (card.interests.length) parts.push(`- Interests: ${card.interests.join(", ")}`);
      if (card.traits.length) parts.push(`- Traits: ${card.traits.join(", ")}`);
      if (card.goals.length) parts.push(`- Goals: ${card.goals.join(", ")}`);
    }
    
    return parts.join("\n") || "No project context available.";
  }
}
