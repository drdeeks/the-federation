/**
 * Working Memory (Daily Tier)
 * 
 * Short-term, high-volatility memories. TTL: 24-48 hours.
 * Captures immediate context, transient observations, scratchpad notes.
 * Automatically expires unless promoted.
 */

import { MemoryStore } from '../../shared/memory/store/memory-store.js';

const DEFAULT_TTL_HOURS = 36; // 1.5 days
const MAX_SIZE = 2000;

export class WorkingStore extends MemoryStore {
  constructor(options = {}) {
    super({
      maxSize: MAX_SIZE,
      ttlHours: DEFAULT_TTL_HOURS,
      snapshotPath: options.snapshotPath || './data/memory/working.json',
      ttlCleanupIntervalMs: options.ttlCleanupIntervalMs || 1800000, // 30 min
      ...options,
    });
    this.tier = 'working';
  }

  /**
   * Store a working memory with tier-specific defaults.
   * @param {Object} memory — { content, source, sourceId, tags, type, valence, salience, metadata }
   * @returns {Object} { cid, memory, created }
   */
  add(memory) {
    const entry = {
      ...memory,
      type: memory.type || 'observation',
      valence: typeof memory.valence === 'number' ? memory.valence : 0,
      salience: typeof memory.salience === 'number' ? memory.salience : 0.3,
      tier: 'working',
    };
    return super.add(entry);
  }

  /**
   * Get memories eligible for promotion (high salience, accessed recently).
   * @param {Object} options — { minSalience, minAccessCount, limit }
   */
  getPromotable(options = {}) {
    const { minSalience = 0.6, minAccessCount = 2, limit = 50 } = options;
    const all = this.getAll({ limit: 1000, sort: 'relevance' });
    return all
      .filter(m => m.salience >= minSalience && (m.accessCount || 0) >= minAccessCount)
      .slice(0, limit);
  }
}

export default WorkingStore;