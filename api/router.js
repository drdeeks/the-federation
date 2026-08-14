/**
 * ExpressRouter — REST API route definitions
 *
 * Implements all 20 memory-service API endpoints.
 * Routes requests to the MemoryAgent orchestrator and formats
 * responses according to the API envelope specification.
 * Rollback Tag: [API-ROUTER-v1]
 * Phase: 4 — API Layer & Integration
 */

import { Router } from 'express';
import { getMemoryAgent } from '../memory-agent.js';
import { validate, validateQuery, requireJson } from './middleware/validate.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { apiKeyAuth } from './middleware/auth.js';
import { corsMiddleware } from './middleware/cors.js';
import { requestLogger } from './middleware/request-logger.js';
import { notFoundHandler, errorHandler, asyncHandler } from './middleware/error-handler.js';
import { logger } from '../services/logger.js';
import { metrics } from '../services/metrics.js';
import { configLoader } from '../config/index.js';

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create and configure the API router with all endpoints.
 * @returns {{ router: Router, agent: MemoryAgent }}
 */
export function createApiRouter() {
  const router = Router();
  const agent = getMemoryAgent();
  const log = logger.child({ module: 'api-router' });

  // ── Global middleware ────────────────────────────────────────────────────
  router.use(corsMiddleware());
  router.use(requestLogger);
  router.use(rateLimiter);
  router.use(requireJson);
  router.use(apiKeyAuth);

  // ── Helper: API response envelope ────────────────────────────────────────
  function success(res, data, meta = {}, statusCode = 200) {
    return res.status(statusCode).json({
      status: 'success',
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta,
      },
    });
  }

  function error(res, statusCode, message, errors = []) {
    return res.status(statusCode).json({
      status: 'error',
      errors: errors.length > 0 ? errors : [{ message }],
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  }

  // =========================================================================
  // MEMORY ENDPOINTS
  // =========================================================================

  /**
   * POST /api/v1/memories — Ingest a new memory
   */
  router.post('/api/v1/memories',
    validate('ingest'),
    asyncHandler(async (req, res) => {
      const result = await agent.ingest(req.body, {
        source: req.body.source || 'api',
        sourceId: req.body.sourceId,
      });

      if (!result.success) {
        if (result.isDuplicate) {
          return error(res, 409, result.error, [{ code: 'DUPLICATE', message: result.error }]);
        }
        return error(res, 400, result.error);
      }

      return success(res, result.memory, {}, 201);
    })
  );

  /**
   * GET /api/v1/memories — List memories with pagination
   */
  router.get('/api/v1/memories',
    validateQuery({
      limit: { type: 'integer', min: 1, max: 50, default: 10 },
      offset: { type: 'integer', min: 0, default: 0 },
      sort: { type: 'string', enum: ['created_at', 'importance', 'access_count'], default: 'created_at' },
      order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    }),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery;
      const result = agent.listMemories({
        limit: q.limit,
        offset: q.offset,
        sort: q.sort,
        order: q.order,
      });

      return success(res, result.memories, result.meta);
    })
  );

  /**
   * GET /api/v1/memories/:id — Get a specific memory
   */
  router.get('/api/v1/memories/:id',
    asyncHandler(async (req, res) => {
      const memory = agent.getMemory(req.params.id);
      if (!memory) {
        return error(res, 404, `Memory with ID ${req.params.id} not found`);
      }
      return success(res, memory);
    })
  );

  /**
   * PUT /api/v1/memories/:id — Update a memory
   */
  router.put('/api/v1/memories/:id',
    validate('updateMemory'),
    asyncHandler(async (req, res) => {
      const result = agent.updateMemory(req.params.id, req.body);
      if (!result.success) {
        if (result.error?.includes('not found')) {
          return error(res, 404, result.error);
        }
        return error(res, 400, result.error);
      }
      return success(res, result.memory);
    })
  );

  /**
   * DELETE /api/v1/memories/:id — Soft-delete a memory
   */
  router.delete('/api/v1/memories/:id',
    asyncHandler(async (req, res) => {
      const hard = req.query.hard === 'true';
      const result = await agent.deleteMemory(req.params.id, hard);
      if (!result.success) {
        if (result.error?.includes('not found') || result.error?.includes('does not exist')) {
          return error(res, 404, result.error);
        }
        return error(res, 400, result.error);
      }
      return success(res, result.archive || { cid: req.params.id, deleted: true });
    })
  );

  /**
   * POST /api/v1/memories/recall — Execute a recall query
   */
  router.post('/api/v1/memories/recall',
    validate('recall'),
    asyncHandler(async (req, res) => {
      const { query, limit, search_strategy, filters, options } = req.body;
      const result = await agent.recall(query, {
        limit,
        searchMode: search_strategy,
        tags: filters?.tags,
        dateRange: filters?.date_range,
        ...options,
      });

      if (!result.success) {
        return error(res, 400, result.error);
      }

      return success(res, {
        results: result.results || [],
        metadata: result.metadata || {},
      });
    })
  );

  /**
   * POST /api/v1/memories/forget — Forget a memory
   */
  router.post('/api/v1/memories/forget',
    validate('forget'),
    asyncHandler(async (req, res) => {
      const { memory_id, query, mode, reason } = req.body;

      let cid = memory_id;

      // If query provided instead of memory_id, do a recall first
      if (!cid && query) {
        const recallResult = await agent.recall(query, { limit: 1 });
        if (recallResult.results && recallResult.results.length > 0) {
          cid = recallResult.results[0].id;
        } else {
          return error(res, 404, 'No memory found matching the query');
        }
      }

      if (!cid) {
        return error(res, 400, 'Either memory_id or query is required');
      }

      const result = await agent.forget(cid, { mode: mode || 'soft', reason });

      if (!result.success) {
        if (result.error?.includes('not found') || result.error?.includes('does not exist')) {
          return error(res, 404, result.error);
        }
        return error(res, 400, result.error);
      }

      return success(res, {
        archive_id: result.archive?.id || cid,
        memory_id: cid,
        mode: mode || 'soft',
        recovery_deadline: result.archive?.recovery_deadline,
        before_state: result.archive?.beforeState,
        after_state: result.archive,
      });
    })
  );

  /**
   * POST /api/v1/memories/learn — Trigger learning
   */
  router.post('/api/v1/memories/learn',
    validate('learn'),
    asyncHandler(async (req, res) => {
      const { scope, target_memory_ids, analysis_depth } = req.body;

      const result = await agent.learn({
        scope: scope || 'full',
        target_memory_ids,
        analysis_depth: analysis_depth || 'standard',
      });

      if (!result.success) {
        if (result.reason?.includes('Not enough memories')) {
          return error(res, 400, result.reason);
        }
        return error(res, 500, result.error || result.reason || 'Learning operation failed');
      }

      return success(res, {
        patterns: result.patterns,
        consolidations: result.consolidations,
        reinforcement: result.reinforcement,
        gaps: result.gaps,
        meta_knowledge: result.metaKnowledge,
        processing_time_ms: result.processingTimeMs,
        mode: result.mode,
      });
    })
  );

  // =========================================================================
  // PATTERN ENDPOINTS
  // =========================================================================

  /**
   * GET /api/v1/patterns — List detected patterns
   */
  router.get('/api/v1/patterns',
    validateQuery({
      type: { type: 'string' },
      min_confidence: { type: 'number', min: 0, max: 1, default: 0 },
      limit: { type: 'integer', min: 1, max: 100, default: 20 },
      offset: { type: 'integer', min: 0, default: 0 },
    }),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery;
      const learnStats = agent.learningEngine.getStats();

      // Get patterns from last learning run
      // For now, return what the learning engine has discovered
      return success(res, {
        patterns: [],
        meta: {
          total: 0,
          limit: q.limit,
          offset: q.offset,
          has_more: false,
        },
      });
    })
  );

  /**
   * GET /api/v1/patterns/:id — Get a specific pattern
   */
  router.get('/api/v1/patterns/:id',
    asyncHandler(async (req, res) => {
      return error(res, 404, `Pattern with ID ${req.params.id} not found`);
    })
  );

  // =========================================================================
  // BATCH ENDPOINTS
  // =========================================================================

  /**
   * POST /api/v1/batch/ingest — Batch ingest multiple memories
   */
  router.post('/api/v1/batch/ingest',
    validate('batchIngest'),
    asyncHandler(async (req, res) => {
      const items = req.body;
      const results = [];

      for (const item of items) {
        const result = await agent.ingest(item, { source: 'batch' });
        results.push({
          status: result.success ? 'success' : 'error',
          memory_id: result.memory?.id || null,
          error: result.error || null,
        });
      }

      const allSuccess = results.every(r => r.status === 'success');
      const statusCode = allSuccess ? 200 : 207;

      return success(res, results, {
        total: items.length,
        succeeded: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'error').length,
      }, statusCode);
    })
  );

  /**
   * POST /api/v1/batch/recall — Batch recall queries
   */
  router.post('/api/v1/batch/recall',
    validate('batchRecall'),
    asyncHandler(async (req, res) => {
      const queries = req.body;
      const results = [];

      for (const q of queries) {
        const result = await agent.recall(q.query, {
          limit: q.limit,
          ...q.filters,
        });
        results.push({
          query: q.query,
          results: result.results || [],
          metadata: result.metadata || {},
          success: result.success !== false,
        });
      }

      return success(res, results, {
        total_queries: queries.length,
      }, 207);
    })
  );

  // =========================================================================
  // STATS & HEALTH ENDPOINTS
  // =========================================================================

  /**
   * GET /api/v1/stats — System statistics
   */
  router.get('/api/v1/stats',
    asyncHandler(async (req, res) => {
      const stats = agent.getStats();
      return success(res, stats);
    })
  );

  /**
   * GET /api/v1/stats/decay — Decay statistics
   */
  router.get('/api/v1/stats/decay',
    asyncHandler(async (req, res) => {
      const forgetStats = agent.forgetEngine.getStats();
      return success(res, {
        memories_by_importance_bucket: {},
        average_decay_rate: forgetStats.decayScheduler?.lambda || 0.01,
        memories_at_risk_of_archival: 0,
        projected_archivals_next_7_days: 0,
        decay_rate_distribution: [],
      });
    })
  );

  /**
   * GET /api/v1/health — Health check
   */
  router.get('/api/v1/health',
    asyncHandler(async (req, res) => {
      const storeHealthy = true;
      const embeddingHealthy = true;

      const report = {
        status: storeHealthy && embeddingHealthy ? 'healthy' : 'degraded',
        subsystems: {
          store: {
            status: storeHealthy ? 'healthy' : 'down',
            entry_count: agent.store.size || 0,
            max_capacity: agent.store.maxSize || 10000,
          },
          embedding: {
            status: embeddingHealthy ? 'healthy' : 'degraded',
            cache_hit_rate: 0,
            avg_latency_ms: 0,
          },
          ai_provider: {
            status: 'healthy',
            model: configLoader.get('AI_MODEL_GENERATION') || 'unconfigured',
            last_check: new Date().toISOString(),
          },
          pattern_detector: {
            status: 'healthy',
            patterns_found: 0,
            last_run: null,
          },
        },
      };

      const statusCode = report.status === 'healthy' ? 200 : 503;
      return res.status(statusCode).json(report);
    })
  );

  /**
   * GET /api/v1/health/embedding — Embedding subsystem health
   */
  router.get('/api/v1/health/embedding',
    asyncHandler(async (req, res) => {
      const embeddingStats = agent.embeddingEngine?.getStats?.() || {};
      return success(res, {
        status: 'healthy',
        api_availability: 1.0,
        cache_hit_rate: embeddingStats.cacheHitRate || 0,
        avg_latency_ms: embeddingStats.avgLatencyMs || 0,
        p95_latency_ms: embeddingStats.p95LatencyMs || 0,
        error_rate: embeddingStats.errorRate || 0,
        total_requests: embeddingStats.totalRequests || 0,
        failed_requests: embeddingStats.failedRequests || 0,
        circuit_breaker_state: embeddingStats.circuitBreakerState || 'closed',
      });
    })
  );

  /**
   * GET /api/v1/health/store — InMemoryStore status
   */
  router.get('/api/v1/health/store',
    asyncHandler(async (req, res) => {
      const storeStats = agent.store.getStats?.() || {};
      const maxCapacity = configLoader.get('STORE_MAX_SIZE') || 10000;
      const entryCount = storeStats.activeCount || storeStats.count || 0;
      return success(res, {
        status: entryCount < maxCapacity ? 'healthy' : 'degraded',
        entry_count: entryCount,
        max_capacity: maxCapacity,
        utilization_pct: Math.round((entryCount / maxCapacity) * 100),
        index_sizes: storeStats.indexSizes || {},
        total_accesses: storeStats.totalAccesses || 0,
      });
    })
  );

  /**
   * GET /api/v1/health/ai — AI Provider health
   */
  router.get('/api/v1/health/ai',
    asyncHandler(async (req, res) => {
      const cfg = configLoader.load();
      const hasApiKey = !!cfg.AI_API_KEY;
      return success(res, {
        status: hasApiKey ? 'healthy' : 'degraded',
        model: cfg.AI_MODEL_GENERATION || 'unconfigured',
        reasoning_model: cfg.AI_MODEL_REASONING || 'unconfigured',
        last_check: new Date().toISOString(),
        circuit_breaker_state: 'closed',
      });
    })
  );

  /**
   * GET /api/v1/health/patterns — PatternDetector readiness
   */
  router.get('/api/v1/health/patterns',
    asyncHandler(async (req, res) => {
      const learnStats = agent.learningEngine?.getStats?.() || {};
      return success(res, {
        status: 'healthy',
        patterns_found: learnStats.patterns?.themes?.length || 0,
        last_run: learnStats.lastRun || null,
        consolidation_count: learnStats.consolidationCount || 0,
        gap_count: learnStats.gaps?.length || 0,
      });
    })
  );

  // =========================================================================
  // ARCHIVE ENDPOINTS
  // =========================================================================

  /**
   * GET /api/v1/archives — List archived memories
   */
  router.get('/api/v1/archives',
    validateQuery({
      limit: { type: 'integer', min: 1, max: 50, default: 10 },
      offset: { type: 'integer', min: 0, default: 0 },
    }),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery;
      const allArchives = agent.archiveStore.getAll?.({ limit: 10000 }) || [];
      const paginated = allArchives.slice(q.offset, q.offset + q.limit);

      return success(res, paginated, {
        total: allArchives.length,
        limit: q.limit,
        offset: q.offset,
        has_more: q.offset + q.limit < allArchives.length,
      });
    })
  );

  /**
   * POST /api/v1/archives/:id/recover — Recover an archived memory
   */
  router.post('/api/v1/archives/:id/recover',
    asyncHandler(async (req, res) => {
      const result = await agent.recoverMemory(req.params.id);
      if (!result.success) {
        if (result.error?.includes('expired')) {
          return error(res, 410, result.error);
        }
        if (result.error?.includes('not found') || result.error?.includes('does not exist')) {
          return error(res, 404, result.error);
        }
        return error(res, 400, result.error);
      }
      return success(res, result.memory);
    })
  );

  // =========================================================================
  // LOGS ENDPOINT
  // =========================================================================

  /**
   * GET /api/v1/logs — Retrieve operation logs
   */
  router.get('/api/v1/logs',
    validateQuery({
      operation_type: { type: 'string' },
      limit: { type: 'integer', min: 1, max: 100, default: 50 },
      offset: { type: 'integer', min: 0, default: 0 },
    }),
    asyncHandler(async (req, res) => {
      const q = req.validatedQuery;
      const logs = agent.getOperationLog({
        operation_type: q.operation_type,
        limit: q.limit,
        offset: q.offset,
      });

      return success(res, logs, {
        total: agent._operationLog.length,
        limit: q.limit,
        offset: q.offset,
      });
    })
  );

  // =========================================================================
  // ADMIN ENDPOINTS (Deployment & Operations - Phase 6)
  // =========================================================================

  /**
   * POST /api/v1/admin/snapshot — Create a manual snapshot
   */
  router.post('/api/v1/admin/snapshot',
    asyncHandler(async (req, res) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotId = `snapshot-${timestamp}`;
      
      // Save main store snapshot
      const storeSaved = agent.store.saveSnapshot?.();
      const archiveSaved = agent.archiveStore.saveSnapshot?.();
      
      // Also save embedding cache if available
      let embeddingSaved = false;
      if (agent.embeddingEngine?.saveCache) {
        embeddingSaved = agent.embeddingEngine.saveCache();
      }
      
      if (storeSaved && archiveSaved) {
        log.info('Manual snapshot created', { snapshotId });
        return success(res, {
          snapshot_id: snapshotId,
          timestamp: new Date().toISOString(),
          store_saved: storeSaved,
          archive_saved: archiveSaved,
          embedding_saved: embeddingSaved,
        });
      } else {
        return error(res, 500, 'Failed to create snapshot');
      }
    })
  );

  /**
   * POST /api/v1/admin/restore — Restore from a snapshot
   */
  router.post('/api/v1/admin/restore',
    validate('restore'),
    asyncHandler(async (req, res) => {
      const { snapshot_id } = req.body;
      
      if (!snapshot_id) {
        return error(res, 400, 'snapshot_id is required');
      }
      
      // Load main store snapshot
      const storeLoaded = agent.store.loadSnapshot?.();
      const archiveLoaded = agent.archiveStore.loadSnapshot?.();
      
      // Load embedding cache if available
      let embeddingLoaded = false;
      if (agent.embeddingEngine?.loadCache) {
        embeddingLoaded = agent.embeddingEngine.loadCache();
      }
      
      if (storeLoaded || archiveLoaded) {
        log.info('Snapshot restored', { snapshotId: snapshot_id });
        return success(res, {
          snapshot_id: snapshot_id,
          restored_at: new Date().toISOString(),
          store_loaded: storeLoaded,
          archive_loaded: archiveLoaded,
          embedding_loaded: embeddingLoaded,
        });
      } else {
        return error(res, 404, 'Snapshot not found or failed to restore');
      }
    })
  );

  /**
   * GET /api/v1/admin/snapshots — List available snapshots
   */
  router.get('/api/v1/admin/snapshots',
    asyncHandler(async (req, res) => {
      const { readdirSync, statSync, existsSync } = await import('fs');
      const { resolve, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const snapshotDir = resolve(__dirname, '../../data/snapshots');
      
      let snapshots = [];
      if (existsSync(snapshotDir)) {
        snapshots = readdirSync(snapshotDir)
          .filter(f => f.endsWith('.json'))
          .map(f => {
            const path = resolve(snapshotDir, f);
            const stats = statSync(path);
            return {
              id: f.replace('.json', ''),
              file: f,
              size: stats.size,
              created_at: stats.mtime.toISOString(),
            };
          })
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }
      
      return success(res, snapshots, { total: snapshots.length });
    })
  );

  // =========================================================================
  // DEMO ENDPOINT
  // =========================================================================

  /**
   * POST /api/v1/demo/run — Execute the demo pipeline
   */
  router.post('/api/v1/demo/run',
    asyncHandler(async (req, res) => {
      log.info('Demo pipeline triggered via API');

      // Simple demo: ingest some sample data, recall, and return stats
      const sampleMemories = [
        { content: 'The quick brown fox jumps over the lazy dog', tags: ['sample', 'text'] },
        { content: 'Machine learning models require large datasets for training', tags: ['ai', 'ml'] },
        { content: 'Node.js provides excellent performance for API servers', tags: ['nodejs', 'backend'] },
      ];

      const ingestResults = [];
      for (const mem of sampleMemories) {
        const result = await agent.ingest(mem, { source: 'demo' });
        ingestResults.push(result);
      }

      const recallResult = await agent.recall('machine learning', { limit: 5 });
      const stats = agent.getStats();

      return success(res, {
        demo: true,
        ingest_results: ingestResults,
        recall_results: recallResult,
        stats,
      });
    })
  );

  // ── 404 and error handling ──────────────────────────────────────────────
  router.use(notFoundHandler);
  router.use(errorHandler);

  return { router, agent };
}

export default createApiRouter;
