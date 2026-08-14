// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// CircuitBreaker — prevents cascading failures by tracking failure rates
// and temporarily blocking requests to failing connectors.
// States: CLOSED (normal) → OPEN (blocking) → HALF_OPEN (probing)

export const CircuitState = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half-open',
});

/**
 * Circuit breaker with configurable thresholds.
 *
 * @param {Object} opts
 * @param {number} [opts.failureThreshold=5]     - Failures before opening circuit
 * @param {number} [opts.recoveryTimeoutMs=30000] - Time in ms before half-open probe
 * @param {number} [opts.successThreshold=2]      - Successes in half-open before closing
 */
export class CircuitBreaker {
  #state = CircuitState.CLOSED;
  #failureCount = 0;
  #successCount = 0;
  #lastFailureTime = 0;
  #failureThreshold;
  #recoveryTimeoutMs;
  #successThreshold;

  constructor({
    failureThreshold = 5,
    recoveryTimeoutMs = 30_000,
    successThreshold = 2,
  } = {}) {
    this.#failureThreshold = failureThreshold;
    this.#recoveryTimeoutMs = recoveryTimeoutMs;
    this.#successThreshold = successThreshold;
  }

  /** Current state. */
  get state() {
    // Auto-transition OPEN → HALF_OPEN after recovery window
    if (this.#state === CircuitState.OPEN) {
      if (Date.now() - this.#lastFailureTime >= this.#recoveryTimeoutMs) {
        this.#state = CircuitState.HALF_OPEN;
        this.#successCount = 0;
      }
    }
    return this.#state;
  }

  /** Record a successful call. */
  recordSuccess() {
    if (this.#state === CircuitState.HALF_OPEN) {
      this.#successCount++;
      if (this.#successCount >= this.#successThreshold) {
        this.#state = CircuitState.CLOSED;
        this.#failureCount = 0;
        this.#successCount = 0;
      }
    } else {
      this.#failureCount = 0;
    }
  }

  /** Record a failed call. */
  recordFailure() {
    this.#failureCount++;
    this.#lastFailureTime = Date.now();

    if (this.#state === CircuitState.HALF_OPEN) {
      // Probe failed — re-open
      this.#state = CircuitState.OPEN;
      this.#successCount = 0;
    } else if (this.#failureCount >= this.#failureThreshold) {
      this.#state = CircuitState.OPEN;
    }
  }

  /**
   * Whether a request should be allowed through.
   * @returns {boolean}
   */
  allowRequest() {
    const current = this.state; // triggers auto-transition check
    if (current === CircuitState.CLOSED) return true;
    if (current === CircuitState.HALF_OPEN) return true; // allow probe
    return false; // OPEN — block
  }

  /**
   * Reset circuit breaker to initial state.
   */
  reset() {
    this.#state = CircuitState.CLOSED;
    this.#failureCount = 0;
    this.#successCount = 0;
    this.#lastFailureTime = 0;
  }

  /**
   * Get current metrics.
   */
  getMetrics() {
    return {
      state: this.state,
      failureCount: this.#failureCount,
      successCount: this.#successCount,
      lastFailureTime: this.#lastFailureTime,
      failureThreshold: this.#failureThreshold,
      recoveryTimeoutMs: this.#recoveryTimeoutMs,
      successThreshold: this.#successThreshold,
    };
  }
}
