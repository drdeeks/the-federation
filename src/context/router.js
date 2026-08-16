/**
 * Context Router — MOD-004
 * 
 * Read-only composition layer above both memory planes:
 * - Episodic/Experiential (MOD-002: src/memory/)
 * - Knowledge/Semantic (MOD-003: src/knowledge/)
 * 
 * Does NOT own data. Does NOT modify either plane.
 * Only composes context packages for task execution.
 */

import { MemoryManager } from '../memory/memory-manager.js';
import { KnowledgeRetrieval } from '../knowledge/index.js';

export class ContextRouter {
  constructor(options = {}) {
    this.episodicMemory = options.episodicMemory || new MemoryManager();
    this.knowledgeMemory = options.knowledgeMemory || new KnowledgeRetrieval();
    this.embedFn = options.embedFn || null;
    
    if (this.embedFn) {
      this.knowledgeMemory.setEmbedFunction(this.embedFn);
    }
  }

  /**
   * Compose context package for a task contract.
   * Returns normalized context with provenance and confidence.
   */
  async composeContext(taskContract, options = {}) {
    const { 
      episodicLimit = 20, 
      knowledgeLimit = 30,
      includeEpisodic = true,
      includeKnowledge = true,
      timeRange,
      tags,
    } = options;

    const context = {
      taskContract: this._sanitizeContract(taskContract),
      episodic: [],
      knowledge: [],
      provenance: [],
      confidence: 0,
      composedAt: new Date().toISOString(),
    };

    let totalConfidence = 0;
    let totalItems = 0;

    // 1. Episodic memory retrieval (what happened)
    if (includeEpisodic) {
      const episodicResults = this._retrieveEpisodic(taskContract, { 
        limit: episodicLimit, 
        timeRange, 
        tags 
      });
      context.episodic = episodicResults.map(r => ({
        ...r,
        plane: 'episodic',
        source: 'memory',
        type: r.tier || 'memory',
      }));
      
      for (const r of episodicResults) {
        context.provenance.push({
          source: 'episodic',
          tier: r.tier,
          cid: r.cid,
          timestamp: r.timestamp,
          confidence: r.salience || 0.5,
        });
        totalConfidence += (r.salience || 0.5);
        totalItems++;
      }
    }

    // 2. Knowledge retrieval (what is known)
    if (includeKnowledge) {
      const knowledgeResults = await this.knowledgeMemory.getContextForTask(taskContract, { 
        limit: knowledgeLimit 
      });
      context.knowledge = knowledgeResults.map(r => ({
        ...r,
        plane: 'knowledge',
        source: r.source, // 'graph' | 'corpus' | 'vectors'
      }));

      for (const r of knowledgeResults) {
        context.provenance.push({
          source: 'knowledge',
          subsystem: r.source,
          identifier: r.metadata?.entityId || r.metadata?.documentId || r.metadata?.vectorId,
          confidence: r.score || r.confidence || 0.7,
        });
        totalConfidence += (r.score || r.confidence || 0.7);
        totalItems++;
      }
    }

    // 3. Compute aggregate confidence
    context.confidence = totalItems > 0 ? totalConfidence / totalItems : 0;

    // 4. Deduplicate across planes by content similarity
    context.episodic = this._deduplicate(context.episodic);
    context.knowledge = this._deduplicate(context.knowledge);

    return context;
  }

  /**
   * Retrieve from episodic memory based on task contract.
   */
  _retrieveEpisodic(taskContract, options) {
    const { limit, timeRange, tags } = options;
    const results = [];

    // Search by task-related terms
    const terms = this._extractTerms(taskContract);
    for (const term of terms.slice(0, 3)) {
      const termResults = this.episodicMemory.queryAll({
        search: term,
        limit: Math.ceil(limit / 3),
      });
      results.push(...termResults);
    }

    // Also query by agent/project if specified
    if (taskContract.agentId) {
      const agentResults = this.episodicMemory.queryAll({
        tags: [`agent:${taskContract.agentId}`],
        limit: Math.ceil(limit / 2),
      });
      results.push(...agentResults);
    }

    if (taskContract.projectId) {
      const projectResults = this.episodicMemory.queryAll({
        tags: [`project:${taskContract.projectId}`],
        limit: Math.ceil(limit / 2),
      });
      results.push(...projectResults);
    }

    // Apply time range filter
    let filtered = results;
    if (timeRange) {
      filtered = results.filter(r => {
        const ts = new Date(r.timestamp).getTime();
        return ts >= new Date(timeRange.start).getTime() && ts <= new Date(timeRange.end).getTime();
      });
    }

    // Sort by relevance (salience * recency)
    filtered.sort((a, b) => {
      const scoreA = (a.salience || 0.5) * (1 / (1 + (Date.now() - new Date(a.timestamp).getTime()) / 86400000));
      const scoreB = (b.salience || 0.5) * (1 / (1 + (Date.now() - new Date(b.timestamp).getTime()) / 86400000));
      return scoreB - scoreA;
    });

    return filtered.slice(0, limit);
  }

  /**
   * Sanitize task contract - remove sensitive/internal fields.
   */
  _sanitizeContract(contract) {
    return {
      taskId: contract.taskId || contract.id,
      agentId: contract.agentId,
      projectId: contract.projectId,
      title: contract.title,
      description: contract.description,
      priority: contract.priority,
      status: contract.status,
      scope: contract.scope, // What the task is authorized to do
      constraints: contract.constraints, // Explicit boundaries
      createdAt: contract.createdAt,
    };
  }

  /**
   * Extract key terms from task contract for search.
   */
  _extractTerms(contract) {
    const text = `${contract.title || ''} ${contract.description || ''} ${contract.scope || ''}`;
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those']);
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));
    
    const freq = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w);
  }

  /**
   * Simple deduplication by content similarity.
   */
  _deduplicate(items) {
    const seen = new Set();
    const unique = [];
    for (const item of items) {
      const key = `${item.source || item.plane}:${item.cid || item.metadata?.entityId || item.metadata?.documentId || item.content?.slice(0, 100) || JSON.stringify(item).slice(0, 100)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }
    return unique;
  }

  /**
   * Get stats for both planes.
   */
  getStats() {
    return {
      episodic: this.episodicMemory.getStats(),
      knowledge: this.knowledgeMemory.getStats(),
    };
  }
}

export default ContextRouter;