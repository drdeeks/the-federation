// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
/**
 * HealthChecker — Subsystem health status reporting
 *
 * Provides aggregate health determination with per-subsystem status,
 * latency tracking, and last-check timestamps.
 */

// TODO: wire a real project-wide config loader when composing layers.
// Falls back to env vars directly so this module works standalone.
const configLoader = {
  load() {
    return {
      AI_API_KEY: process.env.AI_API_KEY || '',
      NODE_ENV: process.env.NODE_ENV || 'development',
    };
  },
  validate() {
    const cfg = this.load();
    const errors = [];
    if (!cfg.AI_API_KEY && cfg.NODE_ENV === 'production') {
      errors.push('AI_API_KEY is required in production mode');
    }
    return errors;
  },
};

class HealthChecker {
  constructor() {
    this._checks = new Map();
    this._startTime = Date.now();
    this._registerDefaults();
  }

  /**
   * Register default subsystems.
   */
  _registerDefaults() {
    this.registerSubsystem('config', async () => {
      const errors = configLoader.validate();
      return errors.length === 0;
    }, 'Configuration validation');

    this.registerSubsystem('ai_provider', async () => {
      const cfg = configLoader.load();
      // We just verify the API key is configured; connectivity is checked elsewhere.
      return { healthy: !!cfg.AI_API_KEY };
    }, 'AI provider connectivity');

    this.registerSubsystem('memory', async () => {
      // Memory store check — no persistent store wired in this layer yet.
      return { healthy: true };
    }, 'In-memory store health');
  }

  /**
   * Register a subsystem health check.
   * @param {string} name - Subsystem name
   * @param {Function} checkFn - Async function returning boolean or { healthy: boolean }
   * @param {string} [description] - Human-readable description
   */
  registerSubsystem(name, checkFn, description = '') {
    this._checks.set(name, {
      name,
      checkFn,
      description,
      lastStatus: null,
      lastChecked: null,
      lastLatencyMs: null,
    });
  }

  /**
   * Run a single health check.
   */
  async _runCheck(name) {
    const check = this._checks.get(name);
    if (!check) return null;

    const start = Date.now();
    try {
      const result = await check.checkFn();
      const healthy = typeof result === 'boolean' ? result : result.healthy === true;
      check.lastStatus = healthy ? 'healthy' : 'unhealthy';
      check.lastChecked = new Date().toISOString();
      check.lastLatencyMs = Date.now() - start;
      return { name, status: check.lastStatus, latencyMs: check.lastLatencyMs, description: check.description };
    } catch (err) {
      check.lastStatus = 'unhealthy';
      check.lastChecked = new Date().toISOString();
      check.lastLatencyMs = Date.now() - start;
      return { name, status: 'unhealthy', latencyMs: check.lastLatencyMs, error: err.message, description: check.description };
    }
  }

  /**
   * Run all registered health checks.
   * @returns {Promise<Object>} Full health report
   */
  async checkAll() {
    const checks = [];
    for (const name of this._checks.keys()) {
      checks.push(this._runCheck(name));
    }
    const results = await Promise.all(checks);
    const subsystems = {};
    let allHealthy = true;

    for (const result of results) {
      if (result) {
        subsystems[result.name] = {
          status: result.status,
          latencyMs: result.latencyMs,
          lastChecked: this._checks.get(result.name).lastChecked,
          description: result.description,
          ...(result.error ? { error: result.error } : {}),
        };
        if (result.status !== 'healthy') allHealthy = false;
      }
    }

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      service: 'memory-service',
      version: '1.0.0',
      uptime: Date.now() - this._startTime,
      timestamp: new Date().toISOString(),
      subsystems,
    };
  }

  /**
   * Fast readiness check — returns true if all subsystems are healthy.
   */
  async isReady() {
    const report = await this.checkAll();
    return report.status === 'healthy';
  }

  /**
   * Check a specific subsystem.
   */
  async checkSubsystem(name) {
    return this._runCheck(name);
  }

  /**
   * Get the result of the last check for a subsystem (without running a new one).
   */
  getLastStatus(name) {
    const check = this._checks.get(name);
    if (!check) return null;
    return {
      name: check.name,
      status: check.lastStatus,
      lastChecked: check.lastChecked,
      lastLatencyMs: check.lastLatencyMs,
      description: check.description,
    };
  }

  /**
   * Register a custom health check at runtime.
   */
  addCheck(name, checkFn, description) {
    this.registerSubsystem(name, checkFn, description);
  }
}

const healthChecker = new HealthChecker();

export { HealthChecker, healthChecker };
export default healthChecker;
