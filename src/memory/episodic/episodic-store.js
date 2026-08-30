/**
 * Episodic Memory (Weekly Tier)
 * 
 * Session/episode-based memories. TTL: 7-14 days.
 * Captures coherent episodes, interaction sequences, completed tasks.
 * Promoted from working; decays unless promoted to persistent.
 */

import { MemoryStore } from '../../shared/memory/store/memory-store.js';

const DEFAULT_TTL_HOURS = 168; // 7 days
const MAX_SIZE = 5000;

export class EpisodicStore extends MemoryStore {
  constructor(options = {}) {
    super({
      maxSize: MAX_SIZE,
      ttlHours: DEFAULT_TTL_HOURS,
      snapshotPath: options.snapshotPath || './data/memory/episodic.json',
      ttlCleanupIntervalMs: options.ttlCleanupIntervalMs || 3600000, // 1 hour
      ...options,
    });
    this.tier = 'episodic';
  }

  /**
   * Store an episodic memory with tier-specific defaults.
   * @param {Object} memory — { content, source, sourceId, tags, type, valence, salience, episodeId, metadata }
   * @returns {Object} { cid, memory, created }
   */
  add(memory) {
    const entry = {
      ...memory,
      type: memory.type || 'episode',
      valence: typeof memory.valence === 'number' ? memory.valence : 0,
      salience: typeof memory.salience === 'number' ? memory.salience : 0.5,
      episodeId: memory.episodeId || `ep-${Date.now()}`,
      tier: 'episodic',
    };
    return super.add(entry);
  }

  /**
   * Get memories for a specific episode.
   */
  getByEpisode(episodeId, options = {}) {
    const all = this.queryByTag(`episode:${episodeId}`, options);
    return all;
  }

  /**
   * Get memories eligible for promotion to persistent (high salience, validated).
   */
  getPromotable(options = {}) {
    const { minSalience = 0.7, minAccessCount = 3, limit = 50 } = options;
    const all = this.getAll({ limit: 1000, sort: 'relevance' });
    return all
      .filter(m => m.salience >= minSalience && (m.accessCount || 0) >= minAccessCount)
      .slice(0, limit);
  }

  /**
   * Get recent episodes (grouped by episodeId).
   */
  getRecentEpisodes(count = 10) {
    const recent = this.getRecent(count * 3); // Get more to group
    const episodes = new Map();
    for (const mem of recent) {
      const epId = mem.episodeId || mem.cid;
      if (!episodes.has(epId)) {
        episodes.set(epId, []);
      }
      episodes.get(epId).push(mem);
    }
    return Array.from(episodes.values()).slice(0, count);
  }
}

export default EpisodicStore;