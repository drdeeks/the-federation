// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
/**
 * MetricsCollector — Application metrics with counter, histogram, and gauge support
 *
 * Features:
 * - Counter: monotonic counters (request counts, error counts)
 * - Histogram: value distributions with configurable buckets (latency, sizes)
 * - Gauge: point-in-time values (active connections, memory usage)
 * - Rolling window statistics for histograms
 * - Structured log export
 */

import { logger } from './logger.js';

class MetricsCollector {
  constructor() {
    this._counters = new Map();
    this._gauges = new Map();
    this._histograms = new Map();
    this._startTime = Date.now();
  }

  // ── Counter ──

  /**
   * Increment a counter by the given value (default 1).
   * @param {string} name - Counter name
   * @param {number} [value=1] - Increment amount
   * @param {Object} [tags={}] - Optional tags
   */
  increment(name, value = 1, tags = {}) {
    const key = this._taggedKey(name, tags);
    if (!this._counters.has(key)) {
      this._counters.set(key, { name, tags, value: 0, created: Date.now() });
    }
    this._counters.get(key).value += value;
  }

  /**
   * Get counter value.
   */
  getCounter(name, tags = {}) {
    const key = this._taggedKey(name, tags);
    return this._counters.get(key)?.value ?? 0;
  }

  /**
   * Reset a counter to zero.
   */
  resetCounter(name, tags = {}) {
    const key = this._taggedKey(name, tags);
    this._counters.delete(key);
  }

  // ── Gauge ──

  /**
   * Set a gauge to a specific value.
   * @param {string} name - Gauge name
   * @param {number} value - Current value
   * @param {Object} [tags={}] - Optional tags
   */
  gauge(name, value, tags = {}) {
    const key = this._taggedKey(name, tags);
    this._gauges.set(key, { name, tags, value, timestamp: Date.now() });
  }

  /**
   * Get gauge value.
   */
  getGauge(name, tags = {}) {
    const key = this._taggedKey(name, tags);
    return this._gauges.get(key)?.value ?? 0;
  }

  /**
   * Increment a gauge (for active connection tracking, etc.)
   */
  incrementGauge(name, value = 1, tags = {}) {
    const current = this.getGauge(name, tags);
    this.gauge(name, current + value, tags);
  }

  /**
   * Decrement a gauge.
   */
  decrementGauge(name, value = 1, tags = {}) {
    const current = this.getGauge(name, tags);
    this.gauge(name, Math.max(0, current - value), tags);
  }

  // ── Histogram ──

  /**
   * Record a value in a histogram.
   * @param {string} name - Histogram name
   * @param {number} value - Value to record (e.g., latency in ms)
   * @param {Object} [tags={}] - Optional tags
   */
  histogram(name, value, tags = {}) {
    const key = this._taggedKey(name, tags);
    if (!this._histograms.has(key)) {
      this._histograms.set(key, { name, tags, values: [], count: 0, sum: 0, min: Infinity, max: -Infinity });
    }
    const h = this._histograms.get(key);
    h.values.push(value);
    h.count++;
    h.sum += value;
    if (value < h.min) h.min = value;
    if (value > h.max) h.max = value;
  }

  /**
   * Get histogram statistics.
   * @returns {{ count: number, sum: number, min: number, max: number, avg: number, p50: number, p95: number, p99: number } | null}
   */
  getHistogram(name, tags = {}) {
    const key = this._taggedKey(name, tags);
    const h = this._histograms.get(key);
    if (!h || h.count === 0) return null;

    const sorted = [...h.values].sort((a, b) => a - b);
    const avg = h.sum / h.count;

    return {
      count: h.count,
      sum: h.sum,
      min: h.min,
      max: h.max,
      avg: Math.round(avg * 100) / 100,
      p50: this._percentile(sorted, 50),
      p95: this._percentile(sorted, 95),
      p99: this._percentile(sorted, 99),
    };
  }

  /**
   * Clear histogram data (e.g., for rolling window reset).
   */
  resetHistogram(name, tags = {}) {
    const key = this._taggedKey(name, tags);
    this._histograms.delete(key);
  }

  // ── System Metrics ──

  /**
   * Record system metrics (memory, cpu).
   */
  recordSystemMetrics() {
    const mem = process.memoryUsage();
    this.gauge('system.memory.rss_bytes', mem.rss, { unit: 'bytes' });
    this.gauge('system.memory.heap_used_bytes', mem.heapUsed, { unit: 'bytes' });
    this.gauge('system.memory.heap_total_bytes', mem.heapTotal, { unit: 'bytes' });
    this.gauge('system.uptime_seconds', Math.floor((Date.now() - this._startTime) / 1000));
    this.gauge('system.cpu_usage_percent', process.cpuUsage().user / 1000000, { unit: 'percent' });
  }

  // ── Export ──

  /**
   * Export all metrics as a plain object for logging or /metrics endpoint.
   */
  export() {
    const counters = {};
    for (const [, entry] of this._counters) {
      const key = entry.tags && Object.keys(entry.tags).length
        ? `${entry.name}:${JSON.stringify(entry.tags)}`
        : entry.name;
      counters[key] = entry.value;
    }

    const gauges = {};
    for (const [, entry] of this._gauges) {
      const key = entry.tags && Object.keys(entry.tags).length
        ? `${entry.name}:${JSON.stringify(entry.tags)}`
        : entry.name;
      gauges[key] = entry.value;
    }

    const histograms = {};
    for (const [, entry] of this._histograms) {
      const key = entry.tags && Object.keys(entry.tags).length
        ? `${entry.name}:${JSON.stringify(entry.tags)}`
        : entry.name;
      histograms[key] = this.getHistogram(entry.name, entry.tags);
    }

    return {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this._startTime,
      counters,
      gauges,
      histograms,
    };
  }

  /**
   * Log metrics to the application logger.
   */
  logMetrics() {
    logger.info({ metrics: this.export() }, 'Metrics snapshot');
  }

  // ── Internal ──

  _taggedKey(name, tags) {
    if (!tags || Object.keys(tags).length === 0) return name;
    return `${name}:${JSON.stringify(tags, Object.keys(tags).sort())}`;
  }

  _percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Get the uptime in milliseconds.
   */
  get uptime() {
    return Date.now() - this._startTime;
  }
}

const metrics = new MetricsCollector();

export { MetricsCollector, metrics };
export default metrics;
