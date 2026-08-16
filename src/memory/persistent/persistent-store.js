/**
 * Persistent Memory (Long-term / Declarative Tier)
 * 
 * Long-term declarative memories. No automatic TTL.
 * Promoted from episodic; represents stable knowledge, facts, learned patterns.
 * Requires explicit promotion; audit trail maintained.
 */

import { MemoryStore } from '../../../shared/memory/store/memory-store.js';

const MAX_SIZE = 20000;

export class PersistentStore extends MemoryStore {
  constructor(options = {}) {
    super({
      maxSize: MAX_SIZE,
      ttlHours: 0, // No automatic expiry
      snapshotPath: options.snapshotPath || './data/memory/persistent.json',
      ttlCleanupIntervalMs: 0, // No TTL cleanup
      ...options,
    });
    this.tier = 'persistent';
  }

  /**
   * Store a persistent memory with tier-specific defaults.
   * @param {Object} memory — { content, source, sourceId, tags, type, valence, salience, promotion, metadata }
   * @returns {Object} { cid, memory, created }
   */
  add(memory) {
    const entry = {
      ...memory,
      type: memory.type || 'knowledge',
      valence: typeof memory.valence === 'number' ? memory.valence : 0,
      salience: typeof memory.salience === 'number' ? memory.salience : 0.8,
      promotion: memory.promotion || {
        fromTier: 'episodic',
        promotedAt: new Date().toISOString(),
        promotedBy: memory.promotedBy || 'system',
        reason: memory.promotionReason || 'explicit promotion',
      },
      tier: 'persistent',
    };
    return super.add(entry);
  }

  /**
   * Get all persistent memories (no TTL filtering).
   */
  getAll(options = {}) {
    // Override to not filter by TTL since ttlHours = 0
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const sort = options.sort || 'newest';

    const results = [];
    for (const [cid, memory] of this._memories) {
      results.push(memory);
    }

    if (sort === 'newest') {
      results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } else if (sort === 'oldest') {
      results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else if (sort === 'relevance') {
      results.sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0));
    }

    return results.slice(offset, offset + limit);
  }

  /**
   * Get memories by knowledge type (fact, skill, belief, pattern).
   */
  getByKnowledgeType(knowledgeType, options = {}) {
    return this.queryByTag(`knowledge:${knowledgeType}`, options);
  }

  /**
   * Search persistent memories by content.
   */
  search(query, options = {}) {
    if (!query || query.trim().length === 0) return [];
    const q = query.toLowerCase();

    const matching = [];
    for (const [cid, memory] of this._memories) {
      if (memory.content.toLowerCase().includes(q)) {
        matching.push(memory);
      }
      if (matching.length >= (options.limit || 50)) break;
    }

    if (options.sort === 'relevance') {
      matching.sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0));
    }

    return matching;
  }
}

export default PersistentStore;