// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
/**
 * CORS — Cross-Origin Resource Sharing middleware configuration
 *
 * Configurable allowed origins, methods, headers, and credentials.
 */

// TODO: wire real config module when composing layers. Falls back to env vars.
const configLoader = {
  load() {
    return {
      API_CORS_ORIGIN: process.env.API_CORS_ORIGIN || '*',
    };
  },
};

/**
 * Create CORS middleware with configuration from environment.
 * @returns {Function} Express middleware
 */
export function corsMiddleware() {
  const cfg = configLoader.load();
  const allowedOrigins = cfg.API_CORS_ORIGIN || '*';

  return (req, res, next) => {
    const origin = req.headers.origin;

    // Determine the Access-Control-Allow-Origin value
    if (allowedOrigins === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      const origins = allowedOrigins.split(',').map(o => o.trim());
      if (origin && origins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
    }

    // Standard CORS headers
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', [
      'Content-Type',
      'Authorization',
      'X-Correlation-Id',
      'X-Request-Id',
      'X-Api-Key',
      'Accept',
    ].join(', '));
    res.setHeader('Access-Control-Expose-Headers', [
      'X-Correlation-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
    ].join(', '));
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    next();
  };
}

/**
 * Create CORS middleware with custom options.
 * @param {Object} options
 * @param {string} options.origin — allowed origins (comma-separated or '*')
 * @param {string} options.methods — allowed methods
 * @param {string} options.allowedHeaders — allowed headers
 * @returns {Function} Express middleware
 */
export function createCors(options = {}) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = options.origin || '*';

    if (allowedOrigins === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      const origins = allowedOrigins.split(',').map(o => o.trim());
      if (origin && origins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
    }

    res.setHeader('Access-Control-Allow-Methods', options.methods || 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', options.allowedHeaders || 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    next();
  };
}
