/**
 * Authentication — API key validation middleware
 *
 * Validates API key from X-Api-Key header or Authorization header
 * using constant-time comparison to prevent timing attacks.
 * Rollback Tag: [API-AUTH-v1]
 * Phase: 4 — API Layer & Integration
 */

import { timingSafeEqual } from 'crypto';
import { configLoader } from '../../config/index.js';
import { logger } from '../../services/logger.js';
import { metrics } from '../../services/metrics.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Constant-time string comparison to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * API Key authentication middleware.
 *
 * Checks for API key in:
 *   1. X-Api-Key header
 *   2. Authorization: Bearer <key> header
 *
 * If API_AUTH_KEY is not configured, auth is skipped (open access).
 */
export function apiKeyAuth(req, res, next) {
  const cfg = configLoader.load();
  const configuredKey = cfg.API_AUTH_KEY;

  // If no API key is configured, allow all requests (development mode)
  if (!configuredKey) {
    return next();
  }

  // Extract API key from request
  let providedKey = req.headers['x-api-key'];

  if (!providedKey) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      providedKey = authHeader.slice(7).trim();
    }
  }

  if (!providedKey) {
    metrics.increment('api.auth.missing');
    logger.warn({ correlationId: req.correlationId }, 'Authentication failed: no API key provided');
    return res.status(401).json({
      status: 'error',
      errors: [{ code: 'UNAUTHORIZED', message: 'API key required. Provide via X-Api-Key header or Authorization: Bearer <key>' }],
    });
  }

  // Constant-time comparison
  if (!safeCompare(providedKey, configuredKey)) {
    metrics.increment('api.auth.invalid');
    logger.warn({ correlationId: req.correlationId }, 'Authentication failed: invalid API key');
    return res.status(401).json({
      status: 'error',
      errors: [{ code: 'UNAUTHORIZED', message: 'Invalid API key' }],
    });
  }

  metrics.increment('api.auth.success');
  next();
}

/**
 * Optional auth middleware — sets req.authenticated = true if valid key provided.
 * Does not reject unauthenticated requests.
 */
export function optionalAuth(req, _res, next) {
  const cfg = configLoader.load();
  const configuredKey = cfg.API_AUTH_KEY;

  req.authenticated = false;

  if (!configuredKey) {
    return next();
  }

  let providedKey = req.headers['x-api-key'];
  if (!providedKey) {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      providedKey = authHeader.slice(7).trim();
    }
  }

  if (providedKey && safeCompare(providedKey, configuredKey)) {
    req.authenticated = true;
  }

  next();
}
