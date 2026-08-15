/**
 * Request Logger — Structured access logging middleware
 *
 * Logs every request with timing, correlation IDs, and structured context.
 * Rollback Tag: [API-REQUEST-LOGGER-v1]
 * Phase: 4 — API Layer & Integration
 */

import { logger } from '../../services/logger.js';
import { metrics } from '../../services/metrics.js';

/**
 * Structured request logging middleware.
 * Logs request method, path, status, duration, and correlation ID.
 */
export function requestLogger(req, res, next) {
  const start = Date.now();
  const correlationId = req.correlationId;

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      correlationId,
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.ip,
      contentLength: res.getHeader('content-length'),
    };

    // Use appropriate log level based on status
    if (res.statusCode >= 500) {
      logger.error(logData, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    } else if (res.statusCode >= 400) {
      logger.warn(logData, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    } else {
      logger.info(logData, `${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }

    // Track metrics
    metrics.increment('api.requests.total', 1, {
      method: req.method,
      status_code: String(res.statusCode),
      path: req.route?.path || req.path,
    });

    metrics.histogram('api.request.duration_ms', duration, {
      method: req.method,
      path: req.route?.path || req.path,
    });
  });

  next();
}
