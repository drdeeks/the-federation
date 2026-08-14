// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// RateLimiter — in-memory sliding window rate limiter.
// Can be swapped for Redis-backed version without changing callers.

/**
 * Sliding window rate limiter.
 *
 * @param {Object} opts
 * @param {number} [opts.maxRequests=100]  - Max requests per window
 * @param {number} [opts.windowMs=60000]   - Window duration in ms
 */
export class RateLimiter {
  #maxRequests;
  #windowMs;
  #requests = new Map(); // key → { timestamps: number[], count: number }

  constructor({ maxRequests = 100, windowMs = 60_000 } = {}) {
    this.#maxRequests = maxRequests;
    this.#windowMs = windowMs;
  }

  /**
   * Check if a request for `key` is allowed.
   * @param {string} key - Rate limit key (e.g. connector name or IP)
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number|null }}
   */
  check(key = 'default') {
    const now = Date.now();
    const entry = this.#requests.get(key) || { timestamps: [] };

    // Purge expired timestamps
    const cutoff = now - this.#windowMs;
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);

    const remaining = Math.max(0, this.#maxRequests - entry.timestamps.length);

    if (entry.timestamps.length >= this.#maxRequests) {
      const oldest = entry.timestamps[0];
      const retryAfterMs = oldest + this.#windowMs - now;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    // Record this request
    entry.timestamps.push(now);
    this.#requests.set(key, entry);

    return { allowed: true, remaining: remaining - 1, retryAfterMs: null };
  }

  /**
   * Consume a token (check + record). Throws if not allowed.
   * @param {string} key
   */
  consume(key = 'default') {
    const result = this.check(key);
    if (!result.allowed) {
      throw new Error(`Rate limit exceeded for "${key}". Retry after ${result.retryAfterMs}ms`);
    }
    return result;
  }

  /**
   * Reset rate limit state for a key.
   */
  reset(key = 'default') {
    this.#requests.delete(key);
  }

  /**
   * Get current usage for a key.
   */
  getUsage(key = 'default') {
    const now = Date.now();
    const entry = this.#requests.get(key) || { timestamps: [] };
    const cutoff = now - this.#windowMs;
    const current = entry.timestamps.filter(t => t > cutoff).length;
    return {
      key,
      current,
      max: this.#maxRequests,
      remaining: Math.max(0, this.#maxRequests - current),
      windowMs: this.#windowMs,
    };
  }

  /**
   * Get config summary.
   */
  getConfig() {
    return {
      maxRequests: this.#maxRequests,
      windowMs: this.#windowMs,
      strategy: 'sliding-window',
    };
  }
}
