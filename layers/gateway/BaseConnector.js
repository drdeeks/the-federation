// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// BaseConnector — contract specification for all connectors.
// Every connector MUST implement execute(), healthCheck(), getCapabilities(), getRateLimit().
// Validated at registration time; missing methods cause registration to fail.

/**
 * @typedef {Object} ConnectorResult
 * @property {boolean} success - Whether the action completed successfully
 * @property {*} data - Result data (format depends on connector type)
 * @property {string} [error] - Error message if action failed
 * @property {Object} [metadata] - Additional metadata (timing, provider info)
 * @property {number} [metadata.latencyMs] - Execution latency in milliseconds
 * @property {string} [metadata.provider] - External service provider name
 * @property {number} [metadata.statusCode] - HTTP status code if applicable
 */

/**
 * @typedef {Object} ConnectorCapabilities
 * @property {string[]} actions - List of supported action types
 * @property {boolean} readOnly - Whether connector only performs read operations
 * @property {boolean} supportsStreaming - Whether connector supports streaming responses
 * @property {number} maxConcurrentExecutions - Max concurrent execution limit
 */

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} maxRequests - Maximum requests per window
 * @property {number} windowMs - Window duration in milliseconds
 * @property {string} strategy - 'sliding-window' | 'fixed-window'
 */

/**
 * @typedef {Object} HealthCheckResult
 * @property {boolean} healthy - Whether the connector is healthy
 * @property {number} latencyMs - Latency of the health check in milliseconds
 * @property {Object} details - Additional health check details
 */

/**
 * Create a standardized ConnectorResult.
 * @param {Object} opts
 * @param {boolean} opts.success
 * @param {*} [opts.data]
 * @param {string} [opts.error]
 * @param {Object} [opts.metadata]
 * @returns {ConnectorResult}
 */
export function createResult({ success, data = null, error = null, metadata = {} }) {
  return { success, data, error, metadata };
}

/**
 * Validate that a connector object implements the BaseConnector interface.
 * Returns { valid: boolean, missing: string[] }.
 * @param {Object} connector
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateConnector(connector) {
  const requiredMethods = ['execute', 'healthCheck', 'getCapabilities', 'getRateLimit'];
  const missing = requiredMethods.filter(m => typeof connector[m] !== 'function');
  return { valid: missing.length === 0, missing };
}

/**
 * Default capabilities for a connector (can be overridden).
 */
export const DEFAULT_CAPABILITIES = Object.freeze({
  actions: [],
  readOnly: false,
  supportsStreaming: false,
  maxConcurrentExecutions: 10,
});

/**
 * Default rate limit (100 req/min).
 */
export const DEFAULT_RATE_LIMIT = Object.freeze({
  maxRequests: 100,
  windowMs: 60_000,
  strategy: 'sliding-window',
});
