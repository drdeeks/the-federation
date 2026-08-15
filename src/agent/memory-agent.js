/**
 * MemoryAgent — Central orchestrator for all memory operations
 *
 * Coordinates IngestionEngine, RecallEngine, ForgetEngine, and LearningEngine
 * via dependency injection. Provides the unified interface used by the API layer.
 * Rollback Tag: [MEMORY-AGENT-v1]
 * Phase: 4 — API Layer & Integration
 */

import { randomUUID } from 'crypto';
import { MemoryStore } from './store/memory-store.js';
import { EmbeddingEngine } from './engines/embedding-engine.js';
import { IngestionEngine } from './engines/ingestion.js';
import { RecallEngine } from './engines/recall.js';
import { ForgetEngine } from './engines/forget.js';
import { LearningEngine } from './engines/learning.js';
import { configLoader } from './config/index.js';
import { logger } from './services/logger.js';
import { metrics } from './services/metrics.js';

// ---------------------------------------------------------------------------
// MemoryAgent
// ---------------------------------------------------------------------------

export class MemoryAgent {
  /**
   * @param {Object} [options]
   * @param {MemoryStore} [options.store]
   * @param {MemoryStore} [options.archiveStore]
   * @param {EmbeddingEngine} [options.embeddingEngine]
   */
  constructor(options = {}) {
    const cfg = configLoader.load();
    const log = logger.child({ module: 'memory-agent' });

    // Core stores
    this.store = options.store || new MemoryStore({
      maxSize: cfg.STORE_MAX_SIZE,
      snapshotPath: cfg.STORE_SNAPSHOT_PATH,
    });
    this.archiveStore = options.archiveStore || new MemoryStore({
      maxSize: cfg.STORE_MAX_SIZE,
      snapshotPath: cfg.STORE_SNAPSHOT_PATH?.replace('memories', 'archives'),
    });

    // Embedding engine
    this.embeddingEngine = options.embeddingEngine || new EmbeddingEngine();

    // Core engines
    this.ingestionEngine = new IngestionEngine({
      store: this.store,
      embeddingEngine: this.embeddingEngine,
    });

    this.recallEngine = new RecallEngine({
      store: this.store,
      embeddingEngine: this.embeddingEngine,
    });

    this.forgetEngine = new ForgetEngine({
      store: this.store,
      archiveStore: this.archiveStore,
      logger: log,
    });

    this.learningEngine = new LearningEngine({
      store: this.store,
      logger: log,
    });

    // Operation log
    this._operationLog = [];
    this._maxLogSize = 10000;

    log.info('MemoryAgent initialized with all engines');
  }

  // --------------------------------------------------------------------------
  // Ingest
  // --------------------------------------------------------------------------

  /**
   * Ingest one or more memories.
   * @param {string|Object|Array} input
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async ingest(input, options = {}) {
    const startTime = Date.now();
    const correlationId = randomUUID();

    try {
      // Handle batch array input
      if (Array.isArray(input)) {
        const results = [];
        for (const item of input) {
          const result = await this.ingestionEngine.ingest(item, options);
          results.push(result);
        }
        const allSuccess = results.every(r => r.success);
        this._logOperation('ingest_batch', {
          correlationId,
          count: input.length,
          success: allSuccess,
          durationMs: Date.now() - startTime,
        });
        metrics.increment('agent.ingest.batch');
        return { success: allSuccess, results };
      }

      // Single item
      const result = await this.ingestionEngine.ingest(input, options);
      this._logOperation('ingest', {
        correlationId,
        success: result.success,
        memoryId: result.memory?.id,
        durationMs: Date.now() - startTime,
      });
      metrics.increment('agent.ingest.single');
      return result;
    } catch (err) {
      this._logOperation('ingest_error', {
        correlationId,
        error: err.message,
        durationMs: Date.now() - startTime,
      });
      metrics.increment('agent.ingest.error');
      return { success: false, error: err.message };
    }
  }

  // --------------------------------------------------------------------------
  // Recall
  // --------------------------------------------------------------------------

  /**
   * Recall memories matching a query.
   * @param {string|Object} query
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async recall(query, options = {}) {
    const startTime = Date.now();
    const correlationId = randomUUID();

    try {
      const result = await this.recallEngine.recall(query, options);

      this._logOperation('recall', {
        correlationId,
        query: typeof query === 'string' ? query : query.text || query.query,
        resultCount: result.results?.length || 0,
        durationMs: Date.now() - startTime,
      });
      metrics.increment('agent.recall');

      // Record query for learning engine gap detection
      if (result.results) {
        this.learningEngine.recordQuery({
          query: typeof query === 'string' ? query : query.text || query.query,
          resultCount: result.results.length,
          topScore: result.results[0]?.score || 0,
        });
      }

      return result;
    } catch (err) {
      this._logOperation('recall_error', {
        correlationId,
        error: err.message,
        durationMs: Date.now() - startTime,
      });
      metrics.increment('agent.recall.error');
      return { success: false, error: err.message };
    }
  }

  // --------------------------------------------------------------------------
  // Forget
  // --------------------------------------------------------------------------

  /**
   * Forget a memory (soft-delete or hard-delete).
   * @param {string} cid
   * @param {Object} [options] — { mode: 'soft'|'hard', reason: string }
   * @returns {Promise<Object>}
   */
  async forget(cid, options = {}) {
    const startTime = Date.now();
    const correlationId = randomUUID();

    try {
      const result = await this.forgetEngine.forget(cid, {
        mode: options.mode || 'soft',
        operator: 'api',
      });

      this._logOperation('forget', {
        correlationId,
        cid,
        mode: options.mode || 'soft',
        success: result.success,
        durationMs: Date.now() - startTime,
      });
      metrics.increment('agent.forget');

      return result;
    } catch (err) {
      this._logOperation('forget_error', {
        correlationId,
        cid,
        error: err.message,
        durationMs: Date.now() - startTime,
      });
      metrics.increment('agent.forget.error');
      return { success: false, error: err.message };
    }
  }

  // --------------------------------------------------------------------------
  // Learn
  // --------------------------------------------------------------------------

  /**
   * Trigger a learning operation.
   * @param {Object} [options] — { scope, target_memory_ids, analysis_depth }
   * @returns {Promise<Object>}
   */
  async learn(options = {}) {
    const startTime = Date.now();
    const correlationId = randomUUID();

    try {
      const result = await this.learningEngine.learn({
        manualTrigger: true,
        force: true,
      });

      this._logOperation('learn', {
        correlationId,
        scope: options.scope || 'full',
        success: result.success,
        patternsFound: result.patterns?.themes?.length || 0,
        durationMs: Date.now() - startTime,
      });
      metrics.increment('agent.learn');

      return result;
    } catch (err) {
      this._logOperation('learn_error', {
        correlationId,
        error: err.message,
        durationMs: Date.now() - startTime,
      });
      metrics.increment('agent.learn.error');
      return { success: false, error: err.message };
    }
  }

  // --------------------------------------------------------------------------
  // CRUD helpers
  // --------------------------------------------------------------------------

  /**
   * Get a specific memory by ID (CID).
   * @param {string} cid
   * @returns {Object|null}
   */
  getMemory(cid) {
    return this.store.get(cid);
  }

  /**
   * List memories with pagination and sorting.
   * @param {Object} options — { limit, offset, sort, order, status }
   * @returns {Object}
   */
  listMemories(options = {}) {
    const limit = Math.min(50, Math.max(1, options.limit || 10));
    const offset = Math.max(0, options.offset || 0);
    const sort = options.sort || 'created_at';
    const order = options.order || 'desc';

    const allMemories = this.store.getAll({ limit: 10000 });

    // Sort
    allMemories.sort((a, b) => {
      let valA, valB;
      switch (sort) {
        case 'importance':
          valA = a.metadata?.importance_score ?? a.salience ?? 0.5;
          valB = b.metadata?.importance_score ?? b.salience ?? 0.5;
          break;
        case 'access_count':
          valA = a.accessCount || 0;
          valB = b.accessCount || 0;
          break;
        case 'created_at':
        default:
          valA = new Date(a.createdAt || a.timestamp || 0).getTime();
          valB = new Date(b.createdAt || b.timestamp || 0).getTime();
          break;
      }
      return order === 'asc' ? valA - valB : valB - valA;
    });

    const total = allMemories.length;
    const paginated = allMemories.slice(offset, offset + limit);

    return {
      memories: paginated,
      meta: {
        total,
        limit,
        offset,
        has_more: offset + limit < total,
        next_offset: offset + limit < total ? offset + limit : null,
      },
    };
  }

  /**
   * Update a memory's content, tags, or importance.
   * @param {string} cid
   * @param {Object} updates — { content, tags, importance, metadata }
   * @returns {{ success: boolean, memory?: Object, error?: string }}
   */
  updateMemory(cid, updates) {
    const memory = this.store.get(cid);
    if (!memory) {
      return { success: false, error: `Memory with ID ${cid} not found` };
    }

    // Build updated memory (immutable: create new version)
    const now = new Date().toISOString();
    const updatedMemory = {
      ...memory,
      ...(updates.content !== undefined && { content: updates.content }),
      ...(updates.tags !== undefined && { tags: updates.tags }),
      ...(updates.metadata !== undefined && {
        metadata: { ...memory.metadata, ...updates.metadata },
      }),
      updated_at: now,
    };

    if (updates.importance !== undefined) {
      updatedMemory.metadata = {
        ...updatedMemory.metadata,
        importance_score: Math.max(0, Math.min(1, updates.importance)),
      };
    }

    // Re-add to store (immutable update)
    this.store.delete(cid);
    this.store.add({
      content: updatedMemory.content,
      source: updatedMemory.source,
      sourceId: updatedMemory.sourceId,
      tags: updatedMemory.tags,
      type: updatedMemory.type,
      timestamp: updatedMemory.createdAt || updatedMemory.timestamp,
      metadata: {
        ...updatedMemory.metadata,
        id: updatedMemory.id || cid,
      },
    });

    metrics.increment('agent.memory.updated');
    return { success: true, memory: updatedMemory };
  }

  /**
   * Delete (archive) a memory.
   * @param {string} cid
   * @param {boolean} hard — if true, hard delete
   * @returns {Promise<Object>}
   */
  async deleteMemory(cid, hard = false) {
    return this.forget(cid, { mode: hard ? 'hard' : 'soft' });
  }

  /**
   * Recover an archived memory.
   * @param {string} cid
   * @returns {Promise<Object>}
   */
  async recoverMemory(cid) {
    return this.forgetEngine.recover(cid);
  }

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  /**
   * Get comprehensive system statistics.
   * @returns {Object}
   */
  getStats() {
    const storeStats = this.store.getStats?.() || { count: this.store.size || 0 };
    const archiveStats = this.archiveStore.getStats?.() || { count: this.archiveStore.size || 0 };

    return {
      total_memories: storeStats.count || storeStats.totalCount || 0,
      active_memories: storeStats.count || storeStats.totalCount || 0,
      archived_memories: archiveStats.count || archiveStats.totalCount || 0,
      storage_utilization: Math.min(1, (storeStats.count || 0) / (configLoader.get('STORE_MAX_SIZE') || 10000)),
      uptime_seconds: Math.floor((Date.now() - (this._startTime || Date.now())) / 1000),
      memory_growth_rate: 0, // calculated over time
      ingestion: this.ingestionEngine._stats,
      recall: this.recallEngine._stats,
      forget: this.forgetEngine.getStats(),
      learning: this.learningEngine.getStats(),
    };
  }

  /**
   * Get operation log entries.
   * @param {Object} options — { limit, offset, operation_type }
   * @returns {Array}
   */
  getOperationLog(options = {}) {
    let entries = [...this._operationLog];

    if (options.operation_type) {
      entries = entries.filter(e => e.operation === options.operation_type);
    }

    const offset = options.offset || 0;
    const limit = options.limit || 100;

    return entries.slice(offset, offset + limit);
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  _logOperation(operation, data) {
    const entry = {
      id: randomUUID(),
      operation,
      ...data,
      timestamp: new Date().toISOString(),
    };

    this._operationLog.push(entry);

    // Trim
    if (this._operationLog.length > this._maxLogSize) {
      this._operationLog = this._operationLog.slice(-this._maxLogSize);
    }
  }
}

// Singleton
let _agent = null;

export function getMemoryAgent(options) {
  if (!_agent) {
    _agent = new MemoryAgent(options);
  }
  return _agent;
}

export function resetMemoryAgent() {
  _agent = null;
}
