/**
 * Four-Tier Memory Manager
 * 
 * Coordinates working → episodic → persistent → identity-context tiers.
 * Handles promotion, cross-tier queries, and tier-specific policies.
 */

import { WorkingStore } from '../working/working-store.js';
import { EpisodicStore } from '../episodic/episodic-store.js';
import { PersistentStore } from '../persistent/persistent-store.js';
import { IdentityContextStore } from '../schemas/identity-context-store.js';

export class MemoryManager {
  constructor(options = {}) {
    this.working = new WorkingStore(options.working);
    this.episodic = new EpisodicStore(options.episodic);
    this.persistent = new PersistentStore(options.persistent);
    this.identity = new IdentityContextStore(options.identity);
    this.tiers = {
      working: this.working,
      episodic: this.episodic,
      persistent: this.persistent,
      'identity-context': this.identity,
    };
  }

  /**
   * Add memory to a specific tier.
   */
  add(tier, memory) {
    const store = this.tiers[tier];
    if (!store) throw new Error(`Unknown tier: ${tier}`);
    return store.add(memory);
  }

  /**
   * Get memory from any tier by CID (searches all).
   */
  get(cid) {
    for (const tier of ['working', 'episodic', 'persistent', 'identity-context']) {
      const mem = this.tiers[tier].get(cid);
      if (mem) return { ...mem, tier };
    }
    return null;
  }

  /**
   * Query across all tiers.
   */
  queryAll(options = {}) {
    const { tags, type, timeRange, search, limit = 50 } = options;
    const results = [];

    for (const [tierName, store] of Object.entries(this.tiers)) {
      let tierResults = [];
      
      if (search) {
        tierResults = store.search(search, { limit });
      } else if (tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        for (const tag of tagArray) {
          tierResults.push(...store.queryByTag(tag, { limit }));
        }
      } else if (type) {
        tierResults = store.queryByType(type, { limit });
      } else if (timeRange) {
        tierResults = store.queryByTimeRange(timeRange.start, timeRange.end, { limit });
      } else {
        tierResults = store.getAll({ limit });
      }

      for (const mem of tierResults) {
        results.push({ ...mem, tier: tierName });
      }
    }

    // Sort by timestamp desc
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return results.slice(0, limit);
  }

  /**
   * Promote memory from one tier to the next.
   * working → episodic → persistent → identity-context
   */
  async promote(cid, fromTier, options = {}) {
    const tierOrder = ['working', 'episodic', 'persistent', 'identity-context'];
    const fromIdx = tierOrder.indexOf(fromTier);
    
    if (fromIdx === -1 || fromIdx === tierOrder.length - 1) {
      throw new Error(`Cannot promote from tier: ${fromTier}`);
    }

    const toTier = tierOrder[fromIdx + 1];
    const fromStore = this.tiers[fromTier];
    const toStore = this.tiers[toTier];

    const memory = fromStore.get(cid);
    if (!memory) {
      throw new Error(`Memory not found in ${fromTier}: ${cid}`);
    }

    // Create promoted entry
    const promoted = {
      ...memory,
      tier: toTier,
      promotion: {
        fromTier,
        promotedAt: new Date().toISOString(),
        promotedBy: options.promotedBy || 'system',
        reason: options.reason || 'explicit promotion',
        originalCid: cid,
      },
      // Reset access count for new tier
      accessCount: 0,
      // Increase salience on promotion
      salience: Math.min(1, (memory.salience || 0) + 0.1),
    };

    // Add to target tier
    const result = toStore.add(promoted);

    // Optionally remove from source tier (or keep for audit trail)
    if (options.removeSource !== false) {
      fromStore.delete(cid);
    }

    return { promoted: result.memory, fromTier, toTier, originalCid: cid };
  }

  /**
   * Auto-promote eligible memories based on tier policies.
   * Returns array of promotion results.
   */
  async autoPromote() {
    const results = [];

    // Working → Episodic
    const workingPromotable = this.working.getPromotable();
    for (const mem of workingPromotable) {
      try {
        const result = await this.promote(mem.cid, 'working', { 
          reason: 'auto-promotion: high salience + access', 
          promotedBy: 'auto-promoter' 
        });
        results.push(result);
      } catch (err) {
        console.warn(`Failed to promote ${mem.cid}:`, err.message);
      }
    }

    // Episodic → Persistent
    const episodicPromotable = this.episodic.getPromotable();
    for (const mem of episodicPromotable) {
      try {
        const result = await this.promote(mem.cid, 'episodic', {
          reason: 'auto-promotion: validated episode',
          promotedBy: 'auto-promoter'
        });
        results.push(result);
      } catch (err) {
        console.warn(`Failed to promote ${mem.cid}:`, err.message);
      }
    }

    return results;
  }

  /**
   * Get stats for all tiers.
   */
  getStats() {
    return {
      working: this.working.getStats(),
      episodic: this.episodic.getStats(),
      persistent: this.persistent.getStats(),
      'identity-context': this.identity.getStats(),
    };
  }

  /**
   * Save all snapshots.
   */
  saveAllSnapshots() {
    this.working.saveSnapshot();
    this.episodic.saveSnapshot();
    this.persistent.saveSnapshot();
    this.identity.saveSnapshot();
  }

  /**
   * Destroy all stores (cleanup).
   */
  destroy() {
    this.working.destroy();
    this.episodic.destroy();
    this.persistent.destroy();
    this.identity.destroy();
  }
}

export default MemoryManager;