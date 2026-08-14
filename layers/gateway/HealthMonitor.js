// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// HealthMonitor — background health checker for all registered connectors.
// Polls connectors at configurable intervals, updates circuit breakers.

import { CircuitBreaker, CircuitState } from './CircuitBreaker.js';

/**
 * Health monitor that periodically checks connector health.
 *
 * @param {Object} opts
 * @param {number} [opts.pollIntervalMs=60000] - How often to poll (default 60s)
 * @param {number} [opts.checkTimeoutMs=5000]  - Timeout per health check
 */
export class HealthMonitor {
  #registry;
  #circuitBreakers = new Map();
  #pollIntervalMs;
  #checkTimeoutMs;
  #timer = null;
  #status = new Map(); // connector → { healthy, latencyMs, lastCheck, details }

  constructor(registry, { pollIntervalMs = 60_000, checkTimeoutMs = 5_000 } = {}) {
    this.#registry = registry;
    this.#pollIntervalMs = pollIntervalMs;
    this.#checkTimeoutMs = checkTimeoutMs;
  }

  /**
   * Start background health monitoring.
   */
  start() {
    if (this.#timer) return;
    this.#timer = setInterval(() => this.#runChecks(), this.#pollIntervalMs);
    this.#timer.unref?.(); // don't keep process alive
  }

  /**
   * Stop background monitoring.
   */
  stop() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /**
   * Run a single round of health checks on all registered connectors.
   */
  async #runChecks() {
    const connectors = this.#registry.all();
    for (const [name, connector] of connectors) {
      try {
        await this.checkConnector(name, connector);
      } catch {
        // Swallow — errors are recorded in status
      }
    }
  }

  /**
   * Check a single connector's health.
   * @param {string} name
   * @param {Object} connector
   */
  async checkConnector(name, connector) {
    const start = Date.now();
    let healthy = false;
    let details = {};

    try {
      if (typeof connector.healthCheck === 'function') {
        const result = await Promise.race([
          connector.healthCheck(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), this.#checkTimeoutMs)
          ),
        ]);
        healthy = result?.healthy ?? true;
        details = result?.details ?? {};
      } else {
        // No healthCheck method — assume healthy if connected
        healthy = typeof connector.isConnected === 'function' ? connector.isConnected() : true;
      }
    } catch (err) {
      healthy = false;
      details = { error: err.message };
    }

    const latencyMs = Date.now() - start;
    const entry = { healthy, latencyMs, lastCheck: new Date().toISOString(), details };
    this.#status.set(name, entry);

    // Update circuit breaker
    const cb = this.getCircuitBreaker(name);
    if (healthy) {
      cb.recordSuccess();
    } else {
      cb.recordFailure();
    }

    return entry;
  }

  /**
   * Get circuit breaker for a connector (creates if needed).
   * @param {string} name
   * @returns {CircuitBreaker}
   */
  getCircuitBreaker(name) {
    if (!this.#circuitBreakers.has(name)) {
      this.#circuitBreakers.set(name, new CircuitBreaker());
    }
    return this.#circuitBreakers.get(name);
  }

  /**
   * Get health status for a connector.
   * @param {string} name
   */
  getStatus(name) {
    return this.#status.get(name) || null;
  }

  /**
   * Get health status for all connectors.
   */
  getAllStatus() {
    const result = {};
    for (const [name, entry] of this.#status) {
      result[name] = entry;
    }
    return result;
  }

  /**
   * Get circuit breaker state for a connector.
   * @param {string} name
   */
  getCircuitState(name) {
    return this.getCircuitBreaker(name).state;
  }

  /**
   * Get all circuit breaker metrics.
   */
  getCircuitMetrics() {
    const metrics = {};
    for (const [name, cb] of this.#circuitBreakers) {
      metrics[name] = cb.getMetrics();
    }
    return metrics;
  }

  /**
   * Whether the monitor is currently running.
   */
  isRunning() {
    return this.#timer !== null;
  }

  /**
   * Get monitor configuration.
   */
  getConfig() {
    return {
      pollIntervalMs: this.#pollIntervalMs,
      checkTimeoutMs: this.#checkTimeoutMs,
      running: this.isRunning(),
      monitoredConnectors: this.#registry.list(),
    };
  }
}
