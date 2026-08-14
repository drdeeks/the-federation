/**
 * RecallEngine — Phase 2: Memory Recall
 *
 * Retrieves memories using multi-strategy search including semantic vector
 * similarity, keyword matching, temporal filtering, and tag-based filtering.
 * Results are ranked by relevance score combining similarity, recency,
 * importance, and access frequency.
 *
 * Rollback Tag: [RECALL-ENGINE-v1]
 * Phase: 2 — Ingestion & Recall Engines
 */

import { createHash } from 'crypto';
import { EmbeddingEngine } from './embedding-engine.js';
import { MemoryStore } from '../store/memory-store.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MIN_QUERY_LENGTH = 2;
const SEMANTIC_THRESHOLD = 0.3;

const RANKING_WEIGHTS = {
  semantic: 0.4,
  recency: 0.3,
  importance: 0.2,
  accessFrequency: 0.1,
};

const INTENT_MARKERS = ['who', 'why', 'how', 'when did', 'what caused', 'explain', 'describe'];

// ---------------------------------------------------------------------------
// QueryProcessor — Parses and normalizes recall queries
// ---------------------------------------------------------------------------

class QueryProcessor {
  /**
   * Process a recall query.
   * @param {string|Object} query
   * @returns {{ text: string, tags?: string[], dateRange?: { start, end }, limit: number, offset: number, searchMode: string }}
   */
  static process(query) {
    if (!query) {
      throw new Error('Query must be at least 2 characters for meaningful recall');
    }

    let text, tags, dateRange, limit, offset, source;

    if (typeof query === 'string') {
      text = query;
    } else if (typeof query === 'object' && query !== null) {
      text = query.text || query.query || '';
      tags = query.tags;
      dateRange = query.dateRange || query.date_range;
      limit = query.limit;
      offset = query.offset;
      source = query.source;
    } else {
      throw new Error('Query must be a non-empty string or object with text/query field');
    }

    if (!text || text.trim().length < MIN_QUERY_LENGTH) {
      throw new Error('Query must be at least 2 characters for meaningful recall');
    }

    // Normalize text
    text = text.trim();

    // Determine search mode
    let searchMode = 'hybrid';
    if (query && typeof query === 'object') {
      searchMode = query.searchMode || query.search_mode || 'hybrid';
    }

    return {
      text,
      tags: Array.isArray(tags) ? tags.map(t => String(t).toLowerCase().trim()) : undefined,
      dateRange,
      source,
      limit: Math.max(1, Math.min(MAX_LIMIT, limit || DEFAULT_LIMIT)),
      offset: Math.max(0, offset || 0),
      searchMode,
    };
  }

  /**
   * Check if query has complex intent markers.
   */
  static hasComplexIntent(queryText) {
    const lower = queryText.toLowerCase();
    return INTENT_MARKERS.some(marker => lower.includes(marker));
  }
}

// ---------------------------------------------------------------------------
// SemanticSearcher — Cosine similarity search via vector index
// ---------------------------------------------------------------------------

class SemanticSearcher {
  /**
   * @param {EmbeddingEngine} embeddingEngine
   * @param {Object} vectorIndex
   */
  constructor(embeddingEngine, vectorIndex) {
    this.embeddingEngine = embeddingEngine;
    this.vectorIndex = vectorIndex;
  }

  /**
   * Search by semantic similarity.
   * @param {string} queryText
   * @param {Object} options — { limit, threshold }
   * @returns {Promise<Array<{ cid: string, text: string, score: number }>>}
   */
  async search(queryText, options = {}) {
    const limit = options.limit || 10;
    const threshold = options.threshold || SEMANTIC_THRESHOLD;

    if (!this.vectorIndex || this.vectorIndex.size === 0) {
      return [];
    }

    try {
      const queryEmbedding = await this.embeddingEngine.embed(queryText);
      const results = this.vectorIndex.search(queryEmbedding, queryText, { limit, threshold });

      return results.map(r => ({
        cid: r.chunk.id,
        text: r.chunk.text,
        score: r.vectorScore,
        bm25Score: r.bm25Score,
        metadata: r.chunk.metadata || {},
      }));
    } catch (err) {
      // Semantic search failed — fall back gracefully
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// KeywordSearcher — Token-based BM25/TF-IDF matching
// ---------------------------------------------------------------------------

class KeywordSearcher {
  /**
   * @param {MemoryStore} store
   */
  constructor(store) {
    this.store = store;
  }

  /**
   * Search by keyword matching.
   * @param {string} queryText
   * @param {Object} options — { limit }
   * @returns {Array<{ cid: string, text: string, score: number }>}
   */
  search(queryText, options = {}) {
    const limit = options.limit || 10;
    const queryLower = queryText.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 1);

    const results = [];
    const allMemories = this.store.getAll({ limit: 1000 });

    for (const memory of allMemories) {
      if (!memory || !memory.content) continue;

      const contentLower = memory.content.toLowerCase();

      // Simple term frequency scoring
      let score = 0;
      for (const term of queryTerms) {
        // Count occurrences
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = contentLower.match(regex);
        if (matches) {
          score += matches.length;
        }
      }

      // Boost for exact phrase match
      if (contentLower.includes(queryLower)) {
        score += 5;
      }

      // Also check tags
      if (memory.tags) {
        for (const tag of memory.tags) {
          if (queryTerms.includes(tag.toLowerCase())) {
            score += 2;
          }
        }
      }

      if (score > 0) {
        // Normalize score to 0-1 range (roughly)
        const normalizedScore = Math.min(1.0, score / (queryTerms.length * 3 + 5));

        results.push({
          cid: memory.cid || memory.metadata?.id,
          text: memory.content.slice(0, 500),
          score: normalizedScore,
          metadata: {
            tags: memory.tags,
            source: memory.source,
            type: memory.type,
            timestamp: memory.timestamp || memory.createdAt,
            importance: memory.metadata?.importance_score || memory.salience || 0.5,
            accessCount: memory.accessCount || 0,
          },
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}

// ---------------------------------------------------------------------------
// TemporalFilterer — Time-based filtering and recency ranking
// ---------------------------------------------------------------------------

class TemporalFilterer {
  /**
   * Filter memories by time range and apply recency scoring.
   * @param {Array} results — Array of result objects
   * @param {Object} dateRange — { start?: string, end?: string }
   * @returns {Array}
   */
  static filter(results, dateRange) {
    if (!dateRange || (!dateRange.start && !dateRange.end)) {
      return results;
    }

    return results.filter(r => {
      const ts = r.metadata?.timestamp;
      if (!ts) return false;
      const t = new Date(ts).getTime();
      if (dateRange.start && t < new Date(dateRange.start).getTime()) return false;
      if (dateRange.end && t > new Date(dateRange.end).getTime()) return false;
      return true;
    });
  }

  /**
   * Compute recency score (0-1, higher = more recent).
   * @param {string} timestamp
   * @returns {number}
   */
  static recencyScore(timestamp) {
    if (!timestamp) return 0;
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const ageMs = now - then;
    // Half-life of 7 days
    const halfLifeMs = 7 * 24 * 60 * 60 * 1000;
    return Math.exp(-0.693 * ageMs / halfLifeMs);
  }
}

// ---------------------------------------------------------------------------
// TagFilterer — Tag-based filtering
// ---------------------------------------------------------------------------

class TagFilterer {
  /**
   * Filter results by tags.
   * @param {Array} results
   * @param {string[]} requiredTags
   * @returns {Array}
   */
  static filter(results, requiredTags) {
    if (!requiredTags || requiredTags.length === 0) return results;

    const tagsLower = requiredTags.map(t => t.toLowerCase());

    return results.filter(r => {
      const resultTags = (r.metadata?.tags || []).map(t => t.toLowerCase());
      // Match if any required tag is present
      return tagsLower.some(rt => resultTags.includes(rt));
    });
  }
}

// ---------------------------------------------------------------------------
// ResultRanker — Multi-strategy result ranking
// ---------------------------------------------------------------------------

class ResultRanker {
  /**
   * Merge and rank results from multiple search strategies.
   * @param {Object} strategyResults — { semantic: [], keyword: [], temporal: [] }
   * @param {Object} [weights]
   * @returns {Array}
   */
  static rank(strategyResults, weights = RANKING_WEIGHTS) {
    // Merge results by CID (deduplicate, take highest)
    const merged = new Map();

    // Process semantic results
    if (strategyResults.semantic) {
      for (const r of strategyResults.semantic) {
        const key = r.cid;
        if (!merged.has(key)) {
          merged.set(key, { ...r, semanticScore: r.score, keywordScore: 0, recencyScore: 0 });
        } else {
          const existing = merged.get(key);
          existing.semanticScore = Math.max(existing.semanticScore, r.score);
        }
      }
    }

    // Process keyword results
    if (strategyResults.keyword) {
      for (const r of strategyResults.keyword) {
        const key = r.cid;
        if (!merged.has(key)) {
          merged.set(key, { ...r, semanticScore: 0, keywordScore: r.score, recencyScore: 0 });
        } else {
          const existing = merged.get(key);
          existing.keywordScore = Math.max(existing.keywordScore, r.score);
        }
      }
    }

    // Compute composite scores
    const ranked = [];
    for (const [cid, result] of merged) {
      const recency = TemporalFilterer.recencyScore(result.metadata?.timestamp);
      const importance = result.metadata?.importance || 0.5;
      const accessFreq = Math.min(1.0, (result.metadata?.accessCount || 0) / 20);

      // Use semantic score if available, fall back to keyword
      const similarity = result.semanticScore || result.keywordScore || 0;

      const compositeScore =
        weights.semantic * similarity +
        weights.recency * recency +
        weights.importance * importance +
        weights.accessFrequency * accessFreq;

      ranked.push({
        ...result,
        score: compositeScore,
        similarity,
        recency,
        importance,
        accessFrequency: accessFreq,
      });
    }

    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }
}

// ---------------------------------------------------------------------------
// QueryExpander — Generates alternative query formulations
// ---------------------------------------------------------------------------

class QueryExpander {
  /**
   * Generate alternative queries for low-result searches.
   * @param {string} queryText
   * @returns {string[]}
   */
  static expand(queryText) {
    const words = queryText.split(/\s+/).filter(w => w.length > 2);
    const expansions = [];

    // Strategy 1: Remove stop words and keep key terms
    const stopWords = new Set(['the', 'is', 'was', 'are', 'were', 'what', 'how', 'why', 'when', 'where', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with']);
    const keyWords = words.filter(w => !stopWords.has(w.toLowerCase()));
    if (keyWords.length > 0 && keyWords.length < words.length) {
      expansions.push(keyWords.join(' '));
    }

    // Strategy 2: Use only nouns (longer words as proxy)
    const nouns = words.filter(w => w.length > 4);
    if (nouns.length > 0) {
      expansions.push(nouns.join(' '));
    }

    // Strategy 3: Individual significant words
    if (words.length > 1) {
      expansions.push(words[words.length - 1]); // Last word often most specific
    }

    return expansions.slice(0, 3);
  }
}

// ---------------------------------------------------------------------------
// ResultFormatter — Structures final results
// ---------------------------------------------------------------------------

class ResultFormatter {
  /**
   * Format results for output.
   * @param {Array} rankedResults
   * @param {Object} options — { limit, offset, includeMetadata }
   * @returns {{ results: Array, metadata: Object }}
   */
  static format(rankedResults, options = {}) {
    const limit = options.limit || DEFAULT_LIMIT;
    const offset = options.offset || 0;
    const includeMetadata = options.includeMetadata !== false;

    const paginated = rankedResults.slice(offset, offset + limit);

    const formatted = paginated.map(r => ({
      id: r.cid || r.metadata?.id,
      content: r.text?.slice(0, 200) || '',
      score: Math.round(r.score * 1000) / 1000,
      similarity: r.similarity !== undefined ? Math.round(r.similarity * 1000) / 1000 : null,
      ...(includeMetadata ? {
        tags: r.metadata?.tags || [],
        source: r.metadata?.source || 'unknown',
        type: r.metadata?.type || 'memory',
        timestamp: r.metadata?.timestamp || null,
        importance: r.metadata?.importance || null,
        accessCount: r.metadata?.accessCount || 0,
      } : {}),
    }));

    return {
      results: formatted,
      metadata: {
        total: rankedResults.length,
        returned: formatted.length,
        offset,
        limit,
        searchMode: options.searchMode || 'hybrid',
      },
    };
  }
}

// ---------------------------------------------------------------------------
// RecallEngine — Main recall orchestrator
// ---------------------------------------------------------------------------

export class RecallEngine {
  /**
   * @param {Object} options
   * @param {MemoryStore} options.store
   * @param {EmbeddingEngine} options.embeddingEngine
   */
  constructor(options = {}) {
    this.store = options.store || new MemoryStore();
    this.embeddingEngine = options.embeddingEngine || new EmbeddingEngine();
    this.vectorIndex = this.embeddingEngine.getOrCreateIndex();

    // Feedback store: Map<queryHash, { positive: number, negative: number }>
    this._feedbackStore = new Map();

    // Recall cache: Map<queryHash, { results, timestamp }>
    this._cache = new Map();
    this._cacheTTL = 300000; // 5 minutes

    // Stats
    this._stats = {
      totalQueries: 0,
      totalResults: 0,
      zeroResultQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      semanticUsed: 0,
      keywordUsed: 0,
    };
  }

  /**
   * Recall memories matching a query.
   * @param {string|Object} query
   * @param {Object} [options] — { limit, offset, tags, dateRange, searchMode }
   * @returns {Promise<{ success: boolean, results?: Array, metadata?: Object, error?: string }>}
   */
  async recall(query, options = {}) {
    const startTime = Date.now();
    this._stats.totalQueries++;

    try {
      // 1. Process query
      const processed = QueryProcessor.process(query);
      const limit = options.limit || processed.limit;
      const offset = options.offset || processed.offset;

      // Merge options with processed query
      const tags = options.tags || processed.tags;
      const dateRange = options.dateRange || processed.dateRange;
      const searchMode = options.searchMode || processed.searchMode;

      // 2. Check cache
      const cacheKey = this._cacheKey(processed.text, { tags, dateRange, limit, offset });
      const cached = this._getCache(cacheKey);
      if (cached) {
        this._stats.cacheHits++;
        return cached;
      }
      this._stats.cacheMisses++;

      // 3. Execute search strategies
      const strategyResults = {};
      const strategiesUsed = [];

      // Semantic search
      if (searchMode === 'hybrid' || searchMode === 'semantic') {
        try {
          const semanticResults = await this._semanticSearch(processed.text, { limit: limit * 2 });
          strategyResults.semantic = semanticResults;
          strategiesUsed.push('semantic');
          this._stats.semanticUsed++;
        } catch (err) {
          // Semantic search failed, continue with other strategies
        }
      }

      // Keyword search
      if (searchMode === 'hybrid' || searchMode === 'keyword') {
        try {
          const keywordResults = this._keywordSearch(processed.text, { limit: limit * 2 });
          strategyResults.keyword = keywordResults;
          strategiesUsed.push('keyword');
          this._stats.keywordUsed++;
        } catch (err) {
          // Keyword search failed, continue
        }
      }

      // If no results from any strategy, try tag-based as fallback
      if (strategiesUsed.length === 0 && tags && tags.length > 0) {
        const tagResults = this._tagSearch(tags, { limit });
        strategyResults.keyword = tagResults;
        strategiesUsed.push('tag');
      }

      // 4. Rank results
      let ranked = ResultRanker.rank(strategyResults);

      // 5. Apply temporal filter
      if (dateRange) {
        ranked = TemporalFilterer.filter(ranked, dateRange);
      }

      // 6. Apply tag filter
      if (tags && tags.length > 0) {
        ranked = TagFilterer.filter(ranked, tags);
      }

      // 7. Query expansion for low results
      if (ranked.filter(r => r.score > 0.5).length < 2 && ranked.length < 2) {
        const expansions = QueryExpander.expand(processed.text);
        for (const expandedQuery of expansions) {
          try {
            const expandedResults = await this._semanticSearch(expandedQuery, { limit });
            for (const er of expandedResults) {
              if (!ranked.find(r => r.cid === er.cid)) {
                ranked.push({ ...er, semanticScore: er.score, keywordScore: 0 });
              }
            }
          } catch (err) {
            // Expansion search failed, continue
          }
        }
        // Re-rank with expanded results
        ranked = ResultRanker.rank({ semantic: ranked });
      }

      // 8. Track access for returned results
      for (const r of ranked.slice(0, limit)) {
        this._trackAccess(r.cid);
      }

      // 9. Format results
      const formatted = ResultFormatter.format(ranked, {
        limit,
        offset,
        searchMode: strategiesUsed.join('+'),
      });

      // 10. Update stats
      this._stats.totalResults += formatted.results.length;
      if (formatted.results.length === 0) {
        this._stats.zeroResultQueries++;
      }

      // 11. Cache results
      const result = {
        success: true,
        ...formatted,
        strategies: strategiesUsed,
        queryTime: Date.now() - startTime,
      };
      this._setCache(cacheKey, result);

      return result;
    } catch (err) {
      this._stats.totalErrors = (this._stats.totalErrors || 0) + 1;
      return {
        success: false,
        error: err.message,
        results: [],
        metadata: { total: 0, returned: 0 },
        queryTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Record feedback for a recall operation.
   * @param {string} queryText
   * @param {boolean} positive — true for positive feedback, false for negative
   */
  recordFeedback(queryText, positive) {
    const queryHash = createHash('sha256').update(queryText.toLowerCase().trim()).digest('hex');
    const existing = this._feedbackStore.get(queryHash) || { positive: 0, negative: 0 };
    if (positive) {
      existing.positive++;
    } else {
      existing.negative++;
    }
    this._feedbackStore.set(queryHash, existing);
  }

  /**
   * Invalidate cache entries related to a memory.
   * @param {string} memoryCid
   */
  invalidateCache(memoryCid) {
    // Simple approach: clear all cache (could be smarter with dependency tracking)
    this._cache.clear();
  }

  /**
   * Get recall statistics.
   */
  getStats() {
    return {
      ...this._stats,
      cacheSize: this._cache.size,
      feedbackEntries: this._feedbackStore.size,
    };
  }

  // -------------------------------------------------------------------------
  // Internal methods
  // -------------------------------------------------------------------------

  /**
   * Semantic search using vector index.
   */
  async _semanticSearch(queryText, options = {}) {
    const searcher = new SemanticSearcher(this.embeddingEngine, this.vectorIndex);
    return await searcher.search(queryText, options);
  }

  /**
   * Keyword search using store.
   */
  _keywordSearch(queryText, options = {}) {
    const searcher = new KeywordSearcher(this.store);
    return searcher.search(queryText, options);
  }

  /**
   * Tag-based search.
   */
  _tagSearch(tags, options = {}) {
    const limit = options.limit || 10;
    const results = [];

    for (const tag of tags) {
      const memories = this.store.queryByTag(tag, { limit });
      for (const memory of memories) {
        if (memory) {
          results.push({
            cid: memory.cid || memory.metadata?.id,
            text: memory.content?.slice(0, 500) || '',
            score: 0.5,
            metadata: {
              tags: memory.tags,
              source: memory.source,
              type: memory.type,
              timestamp: memory.timestamp || memory.createdAt,
              importance: memory.metadata?.importance_score || memory.salience || 0.5,
              accessCount: memory.accessCount || 0,
            },
          });
        }
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Track access for a memory (increment access count).
   */
  _trackAccess(cid) {
    // This is a best-effort update; the store's get() already increments
    if (cid) {
      this.store.get(cid);
    }
  }

  /**
   * Generate cache key.
   */
  _cacheKey(text, options = {}) {
    const raw = JSON.stringify({ text: text.toLowerCase(), ...options });
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Get cached result if valid.
   */
  _getCache(key) {
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this._cacheTTL) {
      this._cache.delete(key);
      return null;
    }
    return entry.results;
  }

  /**
   * Set cache entry.
   */
  _setCache(key, results) {
    if (this._cache.size > 1000) {
      // Evict oldest entries
      const oldestKey = this._cache.keys().next().value;
      this._cache.delete(oldestKey);
    }
    this._cache.set(key, { results, timestamp: Date.now() });
  }
}

// Export sub-components for testing and reuse
export { QueryProcessor, SemanticSearcher, KeywordSearcher, TemporalFilterer, TagFilterer, ResultRanker, QueryExpander, ResultFormatter };
