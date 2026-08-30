/**
 * Identity-Context Memory (Permanent Tier)
 * 
 * Permanent identity, core beliefs, mission, constitutional knowledge.
 * No TTL, no eviction. Highest priority, never auto-deleted.
 * Core agent identity, values, constitutional commitments.
 */

import { MemoryStore } from '../../shared/memory/store/memory-store.js';

const MAX_SIZE = 1000; // Small, curated set

export class IdentityContextStore extends MemoryStore {
  constructor(options = {}) {
    super({
      maxSize: MAX_SIZE,
      ttlHours: 0, // No expiry ever
      snapshotPath: options.snapshotPath || './data/memory/identity-context.json',
      ttlCleanupIntervalMs: 0,
      ...options,
    });
    this.tier = 'identity-context';
  }

  /**
   * Store an identity-context memory. Highly restricted — core identity only.
   * @param {Object} memory — { content, source, sourceId, tags, type, valence, salience, authority, immutable, metadata }
   * @returns {Object} { cid, memory, created }
   */
  add(memory) {
    // Enforce high salience for identity context
    const entry = {
      ...memory,
      type: memory.type || 'identity',
      valence: typeof memory.valence === 'number' ? memory.valence : 0,
      salience: typeof memory.salience === 'number' ? memory.salience : 1.0,
      authority: memory.authority || 'foundational',
      immutable: memory.immutable !== false, // Default true
      promotion: {
        fromTier: 'persistent',
        promotedAt: new Date().toISOString(),
        promotedBy: memory.promotedBy || 'system',
        reason: memory.promotionReason || 'identity commitment',
      },
      tier: 'identity-context',
    };
    return super.add(entry);
  }

  /**
   * Override delete to respect immutability.
   */
  delete(cid) {
    const memory = this._memories.get(cid);
    if (!memory) return false;
    if (memory.immutable) {
      throw new Error(`Cannot delete immutable identity-context memory: ${cid}`);
    }
    return super.delete(cid);
  }

  /**
   * Get all identity memories (core beliefs, mission, values).
   */
  getIdentityCore(options = {}) {
    return this.queryByTag('identity:core', options);
  }

  /**
   * Get constitutional memories (habits, commitments, ACK rules).
   */
  getConstitutional(options = {}) {
    return this.queryByTag('identity:constitutional', options);
  }

  /**
   * Get all (no TTL filtering, no expiry).
   */
  getAll(options = {}) {
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    const sort = options.sort || 'oldest'; // Identity ordered by establishment

    const results = [];
    for (const [cid, memory] of this._memories) {
      results.push(memory);
    }

    if (sort === 'oldest') {
      results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    return results.slice(offset, offset + limit);
  }

  /**
   * Get stats including immutability count.
   */
  getStats() {
    const base = super.getStats();
    let immutableCount = 0;
    for (const memory of this._memories.values()) {
      if (memory.immutable) immutableCount++;
    }
    return {
      ...base,
      immutableCount,
      mutableCount: base.activeCount - immutableCount,
    };
  }
}

export default IdentityContextStore;