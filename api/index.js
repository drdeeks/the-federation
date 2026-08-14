/**
 * Memory Agent — persistent cross-session memory service
 * Server Entry Point
 *
 * Orchestrates Express server startup, graceful shutdown,
 * health check endpoints, and signal handling.
 * Rollback Tag: [SRC-INDEX-v1]
 */

import express from 'express';
import { configLoader } from './config/index.js';
import { featureFlags } from './config/feature-flags.js';
import { logger } from './services/logger.js';
import { metrics } from './services/metrics.js';
import { healthChecker } from './services/health.js';
import { createApiRouter } from './api/router.js';

// ---------------------------------------------------------------------------
// App Setup
// ---------------------------------------------------------------------------

const app = express();
let server = null;
const startTime = Date.now();

// In-flight request tracking for graceful shutdown
const inFlight = new Set();
let isShuttingDown = false;

// ---------------------------------------------------------------------------
// Core Middleware
// ---------------------------------------------------------------------------

app.use(express.json({ limit: '1mb' }));

// Request logging with correlation ID
app.use((req, res, next) => {
  const start = Date.now();
  const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || crypto.randomUUID();

  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);

  // Track in-flight request
  inFlight.add(correlationId);
  res.on('close', () => {
    inFlight.delete(correlationId);
    const duration = Date.now() - start;
    metrics.histogram('http.request.duration_ms', duration, { method: req.method, path: req.route?.path || req.path });

    // Log slow requests
    const cfg = configLoader.load();
    if (duration > cfg.PERFORMANCE_SLOW_REQUEST_THRESHOLD_MS) {
      logger.warn({ correlationId, method: req.method, path: req.path, durationMs: duration }, 'Slow request detected');
    }
  });

  metrics.increment('http.requests.total', 1, { method: req.method });
  next();
});

// ---------------------------------------------------------------------------
// API Routes (Phase 4)
// ---------------------------------------------------------------------------

const { router: apiRouter, agent: memoryAgent } = createApiRouter();

// ---------------------------------------------------------------------------
// Core Routes (health, flags, metrics)
// Registered before apiRouter: the router ends in its own catch-all
// notFoundHandler, which would otherwise swallow these paths first.
// ---------------------------------------------------------------------------

/**
 * GET /health — Full health check with subsystem status
 */
app.get('/health', async (req, res) => {
  const report = await healthChecker.checkAll();
  metrics.increment('health.checks');
  res.status(report.status === 'healthy' ? 200 : 503).json(report);
});

/**
 * GET /ready — Readiness probe (lightweight)
 */
app.get('/ready', async (req, res) => {
  const ready = await healthChecker.isReady();
  if (ready) {
    res.status(200).json({ ready: true, timestamp: new Date().toISOString() });
  } else {
    res.status(503).json({ ready: false, timestamp: new Date().toISOString() });
  }
});

/**
 * GET / — Root endpoint
 */
app.get('/', (req, res) => {
  res.json({
    service: 'memory',
    version: '1.0.0',
    status: 'running',
    uptime: Date.now() - startTime,
    phases: [
      'Phase 0: Foundation & Infrastructure',
      'Phase 1: Core Store & Embedding Engine',
      'Phase 2: Ingestion & Recall Engines',
      'Phase 3: Forget & Learning Engines',
      'Phase 4: API Layer & Integration',
      'Phase 5: Demo Pipeline & Polish',
      'Phase 6: Deployment & Operations',
    ],
    phaseFlags: featureFlags.getAllSimple(),
    api: {
      base_url: '/api/v1',
      endpoints: [
        'POST /api/v1/memories',
        'GET /api/v1/memories',
        'GET /api/v1/memories/:id',
        'PUT /api/v1/memories/:id',
        'DELETE /api/v1/memories/:id',
        'POST /api/v1/memories/recall',
        'POST /api/v1/memories/forget',
        'POST /api/v1/memories/learn',
        'GET /api/v1/patterns',
        'GET /api/v1/patterns/:id',
        'POST /api/v1/batch/ingest',
        'POST /api/v1/batch/recall',
        'GET /api/v1/stats',
        'GET /api/v1/stats/decay',
        'GET /api/v1/health',
        'GET /api/v1/health/embedding',
        'GET /api/v1/archives',
        'POST /api/v1/archives/:id/recover',
        'GET /api/v1/logs',
        'POST /api/v1/demo/run',
      ],
    },
  });
});

/**
 * GET /flags — Feature flag status
 */
app.get('/flags', (req, res) => {
  res.json(featureFlags.getAll());
});

/**
 * POST /flags/:name/toggle — Toggle a feature flag
 */
app.post('/flags/:name/toggle', (req, res) => {
  const { name } = req.params;
  const newState = featureFlags.toggle(name);
  res.json({ flag: name, enabled: newState });
});

/**
 * GET /metrics — Application metrics
 */
app.get('/metrics', (req, res) => {
  metrics.recordSystemMetrics();
  res.json(metrics.export());
});

// ---------------------------------------------------------------------------
// API Router (mounted last: ends in its own catch-all 404 handler)
// ---------------------------------------------------------------------------

app.use(apiRouter);

// ---------------------------------------------------------------------------
// Shutdown Handler
// ---------------------------------------------------------------------------

/**
 * Graceful shutdown: stop accepting new requests, wait for in-flight requests to complete.
 */
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal, inFlight: inFlight.size }, `Received ${signal} — starting graceful shutdown`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  // Wait for in-flight requests with timeout
  if (inFlight.size > 0) {
    const waitMs = 10000; // max 10 seconds for in-flight
    const pollInterval = 100;
    let waited = 0;

    while (inFlight.size > 0 && waited < waitMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }

    if (inFlight.size > 0) {
      logger.warn({ pending: inFlight.size }, 'Shutdown proceeding with in-flight requests still pending');
    }
  }

  logger.info('Graceful shutdown complete');
  metrics.logMetrics();
  logger.flush?.();
  process.exit(0);
}

// Register signal handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions and unhandled rejections gracefully
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  metrics.increment('system.uncaught_exceptions');
  shutdown('SIGUSR2').catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
  metrics.increment('system.unhandled_rejections');
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start() {
  const cfg = configLoader.load();
  const log = logger.child({ module: 'entry' });

  log.info(
    { port: cfg.PORT, env: cfg.NODE_ENV, phase: 'Phase 0: Foundation & Infrastructure' },
    'Starting memory agent'
  );

  // Validate config
  const errors = configLoader.validate();
  if (errors.length > 0) {
    for (const err of errors) {
      log.warn({ error: err }, 'Configuration warning');
    }
  }

  // Log feature flag states
  log.info({ flags: featureFlags.getAllSimple() }, 'Feature flags initialized');

  server = app.listen(cfg.PORT, cfg.HOST, () => {
    log.info(
      { port: cfg.PORT, host: cfg.HOST, url: `http://${cfg.HOST}:${cfg.PORT}` },
      'Memory service started'
    );
  });

  return server;
}

// ---------------------------------------------------------------------------
// Auto-start when run directly
// ---------------------------------------------------------------------------

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start memory service');
  process.exit(1);
});

export { app, start, shutdown };
