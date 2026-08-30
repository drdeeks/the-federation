/**
 * Federation Foundation Console — Server Entry Point
 *
 * Express + ws server mounting:
 * - layers/gateway middleware (cors, requestLogger, rateLimiter, apiKeyAuth)
 * - console routers: fleet, agents, memory, control, observability
 * - ws terminal stream
 * - static UI serving (prod)
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import dotenv from 'dotenv';

import { createApiRouter } from '../../layers/gateway/router.js';
import { corsMiddleware } from '../../layers/gateway/cors.js';
import { rateLimiter } from '../../layers/gateway/rate-limit.js';
import { apiKeyAuth } from '../../layers/gateway/auth.js';
import { logger } from '../../layers/observability/logger.js';

import fleetRouter, { setRegistry as setFleetRegistry } from './routers/fleet.js';
import agentsRouter, { setRegistry as setAgentsRegistry } from './routers/agents.js';
import memoryRouter, { setMemoryStore } from './routers/memory.js';
import controlRouter, { setAdapterClient } from './routers/control.js';
import observabilityRouter, { setProvider } from './routers/observability.js';
import { handleConnection } from './routers/terminal.js';
import contextRouter from '../context/router.js';
import { observabilityProvider } from '../observability/provider.js';
import { adapterClient } from '../integrations/adapter-client.js';
import { MemoryAgent } from './memory-agent.js';
import { AgentRegistry } from '../../layers/registry/agent-registry.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/api/ws/terminal' });

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const startTime = Date.now();
const inFlight = new Set();
let isShuttingDown = false;

// --- Global middleware ---
app.use(express.json({ limit: '1mb' }));
app.use(corsMiddleware());
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({ method: req.method, url: req.url, status: res.statusCode, duration }, 'request');
  });
  next();
});
app.use(rateLimiter);
app.use(apiKeyAuth);

// --- Request tracking for graceful shutdown ---
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || crypto.randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);

  inFlight.add(correlationId);
  res.on('close', () => {
    inFlight.delete(correlationId);
  });
  next();
});

// --- Health / root ---
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Date.now() - startTime,
    version: '0.1.0',
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'federation-console',
    version: '0.1.0',
    status: 'running',
    uptime: Date.now() - startTime,
    endpoints: {
      fleet: '/api/federation/fleet',
      agents: '/api/federation/agents',
      memory: '/api/federation/memory',
      control: '/api/federation/control',
      observability: '/api/federation/observability',
      context: '/api/federation/context',
      terminal: '/api/ws/terminal',
    },
  });
});

// --- Initialize providers ---
const memoryAgent = new MemoryAgent();
const agentRegistry = new AgentRegistry({
  federationUrl: process.env.FEDERATION_API_URL,
  projectId: process.env.FEDERATION_PROJECT_ID || 'federation-console',
});

await agentRegistry.initialize();

setFleetRegistry(agentRegistry);
setAgentsRegistry(agentRegistry);
setMemoryStore(memoryAgent.store);
setAdapterClient(adapterClient);
setProvider(observabilityProvider);

// Initialize observability with local fallback
observabilityProvider.setWatchtowerClient(null); // Will be set when Watchtower creds available

await adapterClient.init();

// Mount context router
app.use('/api/federation/context', contextRouter);

// --- Console API routes ---
app.use('/api/federation/fleet', fleetRouter);
app.use('/api/federation/agents', agentsRouter);
app.use('/api/federation/memory', memoryRouter);
app.use('/api/federation/control', controlRouter);
app.use('/api/federation/observability', observabilityRouter);

// --- WebSocket: live terminal ---
wss.on('connection', (ws, req) => {
  handleConnection(ws, req);
});

// --- Serve UI in production ---
const uiDist = resolve(__dirname, '../../ui/dist');
app.use(express.static(uiDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) return;
  res.sendFile(join(uiDist, 'index.html'));
});

// --- 404 / error handling ---
app.use((req, res) => {
  res.status(404).json({ status: 'error', errors: [{ message: 'Not found' }] });
});

app.use((err, req, res, next) => {
  console.error('[server] error:', err);
  res.status(500).json({ status: 'error', errors: [{ message: 'Internal server error' }] });
});

// --- Graceful shutdown ---
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[server] Received ${signal} — starting graceful shutdown`);

  wss.close();
  server.close(() => {
    console.log('[server] HTTP server closed');
  });

  const waitMs = 10000;
  const pollInterval = 100;
  let waited = 0;
  while (inFlight.size > 0 && waited < waitMs) {
    await new Promise(r => setTimeout(r, pollInterval));
    waited += pollInterval;
  }

  if (inFlight.size > 0) {
    console.warn(`[server] Shutdown proceeding with ${inFlight.size} in-flight requests pending`);
  }

  console.log('[server] Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  shutdown('SIGUSR2').catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});

server.listen(PORT, HOST, () => {
  console.log(`[server] Federation console listening on http://${HOST}:${PORT}`);
  console.log(`[server] WebSocket terminal on ws://${HOST}:${PORT}/api/ws/terminal`);
});

export { app, server, wss };