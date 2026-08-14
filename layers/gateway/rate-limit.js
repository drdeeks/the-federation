// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
/**
 * RateLimiter — Per-client sliding window rate limiting middleware
 *
 * Tracks request counts per client IP with configurable window and limits.
 * Returns HTTP 429 with Retry-After header when limit exceeded.
 */

// TODO: wire real config module when composing layers. Falls back to env vars.
const configLoader = {
  load() {
    return {
      API_RATE_LIMIT_WINDOW_MS: Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 60000,
      API_RATE_LIMIT_MAX: Number(process.env.API_RATE_LIMIT_MAX) || 100,
    };
  },
};

// ---------------------------------------------------------------------------
// SlidingWindowRateLimiter
// ---------------------------------------------------------------------------

class SlidingWindowRateLimiter {
  /**
   * @param {Object} options
   * @param {number} options.windowMs — sliding window in milliseconds
   * @param {number} options.maxRequests — max requests per window
   */
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.maxRequests = options.maxRequests || 100;

    // Map<clientId, { count: number, windowStart: number }>
    this._clients = new Map();

    // Periodic cleanup every 5 minutes
    this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
    this._cleanupInterval.unref?.();
  }

  /**
   * Check if a request from the given client is allowed.
   * @param {string} clientId — usually the client IP
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs?: number }}
   */
  check(clientId) {
    const now = Date.now();
    const client = this._clients.get(clientId);

    if (!client || now - client.windowStart >= this.windowMs) {
      // New window
      this._clients.set(clientId, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    // Within window
    client.count++;

    if (client.count > this.maxRequests) {
      const retryAfterMs = this.windowMs - (now - client.windowStart);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    return { allowed: true, remaining: this.maxRequests - client.count };
  }

  /**
   * Clean up expired entries.
   */
  _cleanup() {
    const now = Date.now();
    for (const [clientId, client] of this._clients) {
      if (now - client.windowStart >= this.windowMs) {
        this._clients.delete(clientId);
      }
    }
  }

  /**
   * Get stats about rate limiting.
   */
  getStats() {
    return {
      activeClients: this._clients.size,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests,
    };
  }

  /**
   * Stop cleanup timer.
   */
  destroy() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let _instance = null;

function getLimiter() {
  if (!_instance) {
    const cfg = configLoader.load();
    _instance = new SlidingWindowRateLimiter({
      windowMs: cfg.API_RATE_LIMIT_WINDOW_MS,
      maxRequests: cfg.API_RATE_LIMIT_MAX,
    });
  }
  return _instance;
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * Rate limiting middleware.
 * Uses X-Forwarded-For header (behind proxy) or req.ip as client identifier.
 */
export function rateLimiter(req, res, next) {
  const limiter = getLimiter();
  const clientId = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';

  const result = limiter.check(clientId);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', limiter.maxRequests);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));

  if (!result.allowed) {
    const retryAfterSeconds = Math.ceil((result.retryAfterMs || 60000) / 1000);
    res.setHeader('Retry-After', retryAfterSeconds);
    res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + retryAfterSeconds);

    return res.status(429).json({
      status: 'error',
      errors: [{ message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.` }],
    });
  }

  next();
}

/**
 * Get the rate limiter instance (for stats/management).
 */
export function getRateLimiter() {
  return getLimiter();
}

export { SlidingWindowRateLimiter };
