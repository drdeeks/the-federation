// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// ConnectorRegistry — manages pluggable I/O connectors (APIs, files, streams).
// Returns null (not throws) for missing connectors to support graceful fallback.
// Enhanced with health check, unregister, and circuit breaker integration.

import { validateConnector } from './BaseConnector.js';
import { CircuitBreaker } from './CircuitBreaker.js';
import { RateLimiter } from './RateLimiter.js';

export class ConnectorRegistry {
  #connectors = new Map();
  #connected = new Map();
  #circuitBreakers = new Map();
  #rateLimiter = new RateLimiter();

  /**
   * Register a connector with optional validation.
   * @param {string} name
   * @param {Object} connector
   * @param {Object} [opts] - { validate: boolean }
   */
  register(name, connector, { validate = false } = {}) {
    if (validate) {
      const result = validateConnector(connector);
      if (!result.valid) {
        throw new Error(`Connector "${name}" missing required methods: ${result.missing.join(', ')}`);
      }
    }
    this.#connectors.set(name, connector);
    this.#connected.set(name, false);
    this.#circuitBreakers.set(name, new CircuitBreaker());
    return this;
  }

  /**
   * Unregister a connector.
   * @param {string} name
   * @returns {boolean}
   */
  unregister(name) {
    const existed = this.#connectors.has(name);
    this.#connectors.delete(name);
    this.#connected.delete(name);
    this.#circuitBreakers.delete(name);
    return existed;
  }

  /**
   * Get a connector by name.
   * Returns null if not found (does NOT throw).
   */
  get(name) {
    return this.#connectors.get(name) || null;
  }

  /**
   * Get a connector, throwing if not found (for explicit lookups).
   */
  require(name) {
    const c = this.#connectors.get(name);
    if (!c) throw new Error(`Connector "${name}" not registered`);
    return c;
  }

  /**
   * Auto-connect a connector if it has a connect() method and isn't connected.
   * Returns the connector (connected) or null on failure.
   */
  async ensureConnected(name) {
    const connector = this.#connectors.get(name);
    if (!connector) return null;
    if (this.#connected.get(name)) return connector;
    if (typeof connector.connect === 'function') {
      try {
        await connector.connect();
        this.#connected.set(name, true);
      } catch {
        // Mark as "attempted" to avoid repeated connect failures
        this.#connected.set(name, true);
      }
    }
    return connector;
  }

  /**
   * Check if a connector exists.
   */
  has(name) {
    return this.#connectors.has(name);
  }

  /**
   * List all registered connector names.
   */
  list() {
    return [...this.#connectors.keys()];
  }

  /**
   * Get all connectors as entries iterator.
   */
  all() {
    return this.#connectors.entries();
  }

  /**
   * Get number of registered connectors.
   */
  size() {
    return this.#connectors.size;
  }

  /**
   * Run health check on a single connector.
   * @param {string} name
   * @returns {Object|null}
   */
  async healthCheck(name) {
    const connector = this.#connectors.get(name);
    if (!connector) return null;

    const cb = this.#circuitBreakers.get(name);
    const start = Date.now();

    let healthy = false;
    let details = {};

    try {
      if (typeof connector.healthCheck === 'function') {
        const result = await connector.healthCheck();
        healthy = result?.healthy ?? true;
        details = result?.details ?? {};
      } else {
        healthy = typeof connector.isConnected === 'function' ? connector.isConnected() : true;
      }
    } catch (err) {
      healthy = false;
      details = { error: err.message };
    }

    const latencyMs = Date.now() - start;

    // Update circuit breaker
    if (cb) {
      if (healthy) cb.recordSuccess(); else cb.recordFailure();
    }

    return {
      name,
      healthy,
      latencyMs,
      connected: this.#connected.get(name) || false,
      circuitBreaker: cb?.getMetrics() || null,
      details,
    };
  }

  /**
   * Run health check on all connectors.
   */
  async healthCheckAll() {
    const results = {};
    for (const name of this.list()) {
      results[name] = await this.healthCheck(name);
    }
    return results;
  }

  /**
   * Get circuit breaker for a connector.
   * @param {string} name
   * @returns {CircuitBreaker|null}
   */
  getCircuitBreaker(name) {
    return this.#circuitBreakers.get(name) || null;
  }

  /**
   * Get rate limiter instance.
   * @returns {RateLimiter}
   */
  getRateLimiter() {
    return this.#rateLimiter;
  }

  /**
   * Check if a request to the named connector is allowed by rate limiter.
   * @param {string} name
   */
  isAllowed(name) {
    return this.#rateLimiter.check(name).allowed;
  }

  /**
   * Check if circuit breaker allows requests for a connector.
   * @param {string} name
   */
  isCircuitOpen(name) {
    const cb = this.#circuitBreakers.get(name);
    return cb ? !cb.allowRequest() : false;
  }
}
