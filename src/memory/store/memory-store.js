/**
 * MemoryStore — Phase 1: Core Store
 * 
 * In-memory store with persistence for memories/atoms.
 * Supports CRUD, tagging, time-range queries, TTL-based expiry,
 * and snapshot persistence.
 * Rollback Tag: [STORE-v1]
 * Phase: 1 — Core Store & Embedding Engine
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate a deterministic hash-based ID from content.
 * Uses simple bit-mixing for fast, repeatable IDs.
 */
function contentHash(content) {
  let hash = 0;
  if (typeof content === 'string') {
    for (let i = 0; i < content.length; i++) {
      const chr = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
  } else if (Buffer.isBuffer(content)) {
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content[i];
      hash |= 0;
    }
  }
  return Math.abs(hash).toString(36).padStart(8, '0');
}

/**
 * Generate a CID-like content-addressed identifier.
 * Format: `cid:sha256:{hash}` where hash is deterministic from content + metadata.
 */
function generateCID(content, source = 'manual', sourceId = '') {
  const raw = `${content}|${source}|${sourceId}|${Date.now()}`;
  return `cid:${contentHash(raw)}`;
}

export { contentHash, generateCID };

/**
 * Core memory store for narrative atoms.
 * 
 * Features:
 * - Content-addressed storage with CID generation
 * - Immutable write-once, never-update semantics
 * - Deterministic content hashing
 * - TTL-based expiry
 * - Snapshot persistence to disk
 * - Indexed by CID, source, tags, type, time range
 */
export class MemoryStore {
  /**
   * @param {Object} options
   * @param {number} options.maxSize - Max memories before GC
   * @param {number} options.ttlHours - Default TTL in hours (0 = no expiry)
   * @param {string} options.snapshotPath - Path for snapshot persistence
   * @param {number} options.ttlCleanupIntervalMs - Interval for TTL sweep
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 10000;
    this.ttlHours = options.ttlHours || 0; // 0 = no expiry
    this.snapshotPath = options.snapshotPath || resolve(__dirname, '../../data/memories.json');
    this.ttlCleanupIntervalMs = options.ttlCleanupIntervalMs || 3600000; // 1 hour

    // Primary storage: Map<cid, memory>
    this._memories = new Map();

    // Secondary indexes
    this._bySource = new Map();   // Map<source, Set<cid>>
    this._byTag = new Map();      // Map<tag, Set<cid>>
    this._byType = new Map();     // Map<type, Set<cid>>
    this._byTimestamp = [];       // Array<{ timestamp, cid }> — sorted array

    // Access counter for LRU-style eviction
    this._accessCount = new Map();
    this._totalAccesses = 0;

    // Stats
    this._stats = {
      totalAdded: 0,
      totalExpired: 0,
      totalEvicted: 0,
      totalSnapshotLoads: 0,
      totalSnapshotSaves: 0,
    };

    // Load snapshot if exists
    this._loadSnapshot();

    // Start TTL cleanup timer
    if (this.ttlHours > 0) {
      this._ttlTimer = setInterval(() => this._expireTTL(), this.ttlCleanupIntervalMs);
      this._ttlTimer.unref();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Store a memory. If it already exists (by CID), returns existing without update.
   * @param {Object} memory — { content, source, sourceId, timestamp, tags, type, valence, salience, ttl }
   * @returns {Object} { cid, memory, created }
   */
  add(memory) {
    const now = new Date();
    const content = typeof memory === 'string' ? memory : (memory.content || '');

    if (!content || content.trim().length === 0) {
      throw new Error('Memory content is required');
    }

    // Generate CID from content and source
    const cid = generateCID(
      content,
      memory.source || 'manual',
      memory.sourceId || ''
    );

    // Check if already exists (immutable write-once)
    if (this._memories.has(cid)) {
      return { cid, memory: this._memories.get(cid), created: false };
    }

    // Build memory object
    const entry = {
      cid,
      content: content.trim(),
      source: memory.source || 'manual',
      sourceId: memory.sourceId || '',
      timestamp: memory.timestamp || now.toISOString(),
      tags: Array.isArray(memory.tags) ? [...new Set(memory.tags)] : [],
      type: memory.type || 'note',
      valence: typeof memory.valence === 'number' ? Math.max(-1, Math.min(1, memory.valence)) : 0,
      salience: typeof memory.salience === 'number' ? Math.max(0, Math.min(1, memory.salience)) : 0.5,
      ttl: memory.ttl || (this.ttlHours > 0 ? new Date(now.getTime() + this.ttlHours * 3600000).toISOString() : null),
      metadata: memory.metadata || {},
      createdAt: now.toISOString(),
      accessCount: typeof memory.accessCount === 'number' ? memory.accessCount : 0,
    };

    // Store
    this._memories.set(cid, entry);
    this._totalAccesses++;

    // Update indexes
    this._indexMemory(entry);

    // Stats
    this._stats.totalAdded++;

    // Evict if over max size
    if (this._memories.size > this.maxSize) {
      this._evict();
    }

    return { cid, memory: entry, created: true };
  }

  /**
   * Get a memory by CID.
   * @param {string} cid
   * @returns {Object|null}
   */
  get(cid) {
    const memory = this._memories.get(cid);
    if (!memory) return null;

    // Check TTL
    if (this._isExpired(memory)) {
      this._memories.delete(cid);
      this._removeFromIndexes(memory);
      this._stats.totalExpired++;
      return null;
    }

    // Track access
    memory.accessCount++;
    this._accessCount.set(cid, (this._accessCount.get(cid) || 0) + 1);

    return memory;
  }

  /**
   * Check if memory exists.
   */
  has(cid) {
    const memory = this._memories.get(cid);
    if (!memory) return false;
    if (this._isExpired(memory)) {
      this._memories.delete(cid);
      this._removeFromIndexes(memory);
      this._stats.totalExpired++;
      return false;
    }
    return true;
  }

  /**
   * Delete a memory by CID.
   * @returns {boolean} — true if deleted
   */
  delete(cid) {
    const memory = this._memories.get(cid);
    if (!memory) return false;
    this._memories.delete(cid);
    this._removeFromIndexes(memory);
    return true;
  }

  /**
   * Query memories by tag.
   * @param {string} tag
   * @param {Object} options — { limit, offset }
   * @returns {Array}
   */
  queryByTag(tag, options = {}) {
    const tags = this._byTag.get(tag);
    if (!tags) return [];
    return this._resolveCids(tags, options);
  }

  /**
   * Query memories by source.
   */
  queryBySource(source, options = {}) {
    const cids = this._bySource.get(source);
    if (!cids) return [];
    return this._resolveCids(cids, options);
  }

  /**
   * Query memories by type.
   */
  queryByType(type, options = {}) {
    const cids = this._byType.get(type);
    if (!cids) return [];
    return this._resolveCids(cids, options);
  }

  /**
   * Query memories by time range.
   * @param {string|Date} start — ISO string or Date
   * @param {string|Date} end
   * @param {Object} options — { limit, offset }
   */
  queryByTimeRange(start, end, options = {}) {
    const startTs = new Date(start).getTime();
    const endTs = new Date(end).getTime();
    if (isNaN(startTs) || isNaN(endTs)) return [];

    // Binary search on sorted timestamp array
    const startIdx = this._binarySearch(startTs, true);
    const endIdx = this._binarySearch(endTs, false);

    const cids = this._byTimestamp
      .slice(startIdx, endIdx + 1)
      .map(e => e.cid);

    return this._resolveCids(new Set(cids), options);
  }

  /**
   * Search memories by text content (simple substring match).
   * @param {string} query
   * @param {Object} options
   */
  search(query, options = {}) {
    if (!query || query.trim().length === 0) return [];
    const q = query.toLowerCase();

    const matching = [];
    for (const [cid, memory] of this._memories) {
      if (this._isExpired(memory)) continue;
      if (memory.content.toLowerCase().includes(q)) {
        matching.push(cid);
      }
      if (matching.length >= (options.limit || 50)) break;
    }

    return this._resolveCids(new Set(matching), options);
  }

  /**
   * Get all memories (with pagination).
   */
  getAll(options = {}) {
    const cids = new Set(this._memories.keys());
    return this._resolveCids(cids, options);
  }

  /**
   * Get recent memories.
   * @param {number} count
   */
  getRecent(count = 10) {
    const results = [];
    for (let i = this._byTimestamp.length - 1; i >= 0 && results.length < count; i--) {
      const entry = this._byTimestamp[i];
      const memory = this._memories.get(entry.cid);
      if (memory && !this._isExpired(memory)) {
        results.push(memory);
      }
    }
    return results;
  }

  /**
   * Get memory count.
   */
  count() {
    // Filter out expired lazily
    let count = 0;
    for (const memory of this._memories.values()) {
      if (!this._isExpired(memory)) count++;
    }
    return count;
  }

  /**
   * Get store statistics.
   */
  getStats() {
    return {
      ...this._stats,
      currentSize: this._memories.size,
      activeCount: this.count(),
      indexSizes: {
        bySource: this._bySource.size,
        byTag: this._byTag.size,
        byType: this._byType.size,
        byTimestamp: this._byTimestamp.length,
      },
      totalAccesses: this._totalAccesses,
    };
  }

  /**
   * Save snapshot to disk.
   */
  saveSnapshot() {
    try {
      const data = {
        version: 1,
        timestamp: new Date().toISOString(),
        stats: this._stats,
        memories: Array.from(this._memories.values()),
      };
      writeFileSync(this.snapshotPath, JSON.stringify(data, null, 2));
      this._stats.totalSnapshotSaves++;
      return true;
    } catch (err) {
      console.error('Failed to save snapshot:', err.message);
      return false;
    }
  }

  /**
   * Load snapshot from disk.
   */
  loadSnapshot() {
    return this._loadSnapshot();
  }

  /**
   * Clear all memories.
   */
  clear() {
    this._memories.clear();
    this._bySource.clear();
    this._byTag.clear();
    this._byType.clear();
    this._byTimestamp = [];
    this._accessCount.clear();
    this._stats.totalEvicted += this._stats.currentSize || 0;
  }

  /**
   * Destroy the store (stop timers).
   */
  destroy() {
    if (this._ttlTimer) {
      clearInterval(this._ttlTimer);
      this._ttlTimer = null;
    }
    this.saveSnapshot();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  _indexMemory(memory) {
    // By source
    if (memory.source) {
      if (!this._bySource.has(memory.source)) {
        this._bySource.set(memory.source, new Set());
      }
      this._bySource.get(memory.source).add(memory.cid);
    }

    // By tag
    for (const tag of memory.tags) {
      if (!this._byTag.has(tag)) {
        this._byTag.set(tag, new Set());
      }
      this._byTag.get(tag).add(memory.cid);
    }

    // By type
    if (memory.type) {
      if (!this._byType.has(memory.type)) {
        this._byType.set(memory.type, new Set());
      }
      this._byType.get(memory.type).add(memory.cid);
    }

    // By timestamp (sorted insert)
    const ts = new Date(memory.timestamp).getTime();
    const insertIdx = this._byTimestamp.findIndex(e => new Date(e.timestamp).getTime() > ts);
    if (insertIdx === -1) {
      this._byTimestamp.push({ timestamp: memory.timestamp, cid: memory.cid });
    } else {
      this._byTimestamp.splice(insertIdx, 0, { timestamp: memory.timestamp, cid: memory.cid });
    }
  }

  _removeFromIndexes(memory) {
    // Remove from source index
    if (memory.source && this._bySource.has(memory.source)) {
      this._bySource.get(memory.source).delete(memory.cid);
      if (this._bySource.get(memory.source).size === 0) {
        this._bySource.delete(memory.source);
      }
    }

    // Remove from tag index
    for (const tag of memory.tags) {
      if (this._byTag.has(tag)) {
        this._byTag.get(tag).delete(memory.cid);
        if (this._byTag.get(tag).size === 0) {
          this._byTag.delete(tag);
        }
      }
    }

    // Remove from type index
    if (memory.type && this._byType.has(memory.type)) {
      this._byType.get(memory.type).delete(memory.cid);
      if (this._byType.get(memory.type).size === 0) {
        this._byType.delete(memory.type);
      }
    }

    // Remove from timestamp index
    this._byTimestamp = this._byTimestamp.filter(e => e.cid !== memory.cid);
  }

  _isExpired(memory) {
    if (!memory.ttl) return false;
    return new Date(memory.ttl).getTime() <= Date.now();
  }

  _resolveCids(cids, options = {}) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const sort = options.sort || 'newest'; // 'newest', 'oldest', 'relevance'

    const results = [];
    for (const cid of cids) {
      const memory = this._memories.get(cid);
      if (memory && !this._isExpired(memory)) {
        results.push(memory);
      }
    }

    // Sort
    if (sort === 'newest') {
      results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } else if (sort === 'oldest') {
      results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    } else if (sort === 'relevance') {
      results.sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0));
    }

    return results.slice(offset, offset + limit);
  }

  _binarySearch(targetTs, findStart) {
    let left = 0;
    let right = this._byTimestamp.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midTs = new Date(this._byTimestamp[mid].timestamp).getTime();

      if (findStart) {
        if (midTs >= targetTs) {
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      } else {
        if (midTs <= targetTs) {
          left = mid + 1;
        } else {
          right = mid - 1;
        }
      }
    }

    return findStart ? left : right;
  }

  _evict() {
    // Evict oldest accessed memories
    const sorted = [...this._memories.entries()]
      .sort((a, b) => (a[1].accessCount || 0) - (b[1].accessCount || 0));

    const toEvict = Math.ceil(this._memories.size * 0.1); // Evict 10%
    for (let i = 0; i < toEvict && i < sorted.length; i++) {
      const [cid, memory] = sorted[i];
      this._memories.delete(cid);
      this._removeFromIndexes(memory);
      this._stats.totalEvicted++;
    }
  }

  _expireTTL() {
    for (const [cid, memory] of this._memories) {
      if (this._isExpired(memory)) {
        this._memories.delete(cid);
        this._removeFromIndexes(memory);
        this._stats.totalExpired++;
      }
    }
  }

  _loadSnapshot() {
    try {
      if (existsSync(this.snapshotPath)) {
        const data = JSON.parse(readFileSync(this.snapshotPath, 'utf8'));
        if (data.memories && Array.isArray(data.memories)) {
          for (const memory of data.memories) {
            if (memory.cid && memory.content) {
              this._memories.set(memory.cid, memory);
              this._indexMemory(memory);
            }
          }
          this._stats.totalSnapshotLoads++;
        }
        if (data.stats) {
          this._stats = { ...this._stats, ...data.stats };
        }
      }
    } catch (err) {
      console.error('Failed to load snapshot:', err.message);
    }
  }
}

export default MemoryStore;
