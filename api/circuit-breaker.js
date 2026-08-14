/**
 * CircuitBreaker — Three-state machine (closed/open/half-open) with configurable thresholds
 *
 * Features:
 * - Three states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing recovery)
 * - Configurable failure threshold to trip to OPEN
 * - Configurable timeout before transitioning to HALF_OPEN
 * - Configurable max requests in HALF_OPEN state
 * - Fallback activation on OPEN/HALF_OPEN failure
 * - Event hooks for state transitions
 *
 * Rollback Tag: [CIRCUIT-BREAKER-v1]
 */

import { configLoader } from '../config/index.js';
import { logger } from './logger.js';

const STATES = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
};

class CircuitBreaker {
  /**
   * @param {Object} [options]
   * @param {string} name - Circuit breaker name
   * @param {number} [threshold] - Failure count to trip circuit
   * @param {number} [timeoutMs] - Time in OPEN before transitioning to HALF_OPEN
   * @param {number} [halfOpenMaxRequests] - Max calls allowed in HALF_OPEN before deciding
   */
  constructor(options = {}) {
    const cfg = configLoader.load();

    this.name = options.name || 'default';
    this._threshold = options.threshold ?? cfg.CIRCUIT_BREAKER_THRESHOLD;
    this._timeoutMs = options.timeoutMs ?? cfg.CIRCUIT_BREAKER_TIMEOUT_MS;
    this._halfOpenMaxRequests = options.halfOpenMaxRequests ?? cfg.CIRCUIT_BREAKER_HALF_OPEN_MAX;

    this._state = STATES.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._lastFailureTime = null;
    this._lastStateChange = Date.now();
    this._halfOpenCallCount = 0;
    this._totalCalls = 0;
    this._totalFailures = 0;
    this._totalSuccesses = 0;

    // Event hooks
    this._onStateChange = null;
    this._onFailure = null;
  }

  // ── State Getters ──

  get state() { return this._state; }
  get isClosed() { return this._state === STATES.CLOSED; }
  get isOpen() { return this._state === STATES.OPEN; }
  get isHalfOpen() { return this._state === STATES.HALF_OPEN; }
  get failureCount() { return this._failureCount; }
  get successCount() { return this._successCount; }

  // ── Lifecycle Hooks ──

  onStateChange(callback) {
    this._onStateChange = callback;
  }

  onFailure(callback) {
    this._onFailure = callback;
  }

  // ── Core Logic ──

  /**
   * Execute a guarded action through the circuit breaker.
   * @param {Function} action - Async function to execute
   * @param {Function} [fallback] - Fallback function if circuit is open or action fails
   * @returns {Promise<any>} Result of action or fallback
   * @throws {Error} If circuit is open and no fallback provided
   */
  async call(action, fallback = null) {
    this._totalCalls++;

    // Check current state and possibly transition
    this._evaluateState();

    if (this._state === STATES.OPEN) {
      logger.warn({ circuit: this.name, state: this._state }, 'Circuit breaker is OPEN — rejecting call');
      if (fallback) {
        return fallback();
      }
      throw new Error(`Circuit breaker "${this.name}" is OPEN`);
    }

    if (this._state === STATES.HALF_OPEN) {
      if (this._halfOpenCallCount >= this._halfOpenMaxRequests) {
        // Too many trial requests in half-open — reject
        if (fallback) {
          return fallback();
        }
        throw new Error(`Circuit breaker "${this.name}" is HALF_OPEN with maximum trial requests`);
      }
      this._halfOpenCallCount++;
    }

    try {
      const result = await action();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailureOccurred(err);
      if (fallback) {
        return fallback();
      }
      throw err;
    }
  }

  /**
   * Check if the circuit allows a call (without executing it).
   * Useful for fast fail checks.
   */
  allowsCall() {
    this._evaluateState();
    if (this._state === STATES.OPEN) return false;
    if (this._state === STATES.HALF_OPEN && this._halfOpenCallCount >= this._halfOpenMaxRequests) return false;
    return true;
  }

  // ── Internal ──

  _evaluateState() {
    if (this._state === STATES.OPEN) {
      const elapsed = Date.now() - this._lastStateChange;
      if (elapsed >= this._timeoutMs) {
        this._transitionTo(STATES.HALF_OPEN);
      }
    }
  }

  _onSuccess() {
    this._totalSuccesses++;
    this._failureCount = 0;

    if (this._state === STATES.HALF_OPEN) {
      this._successCount++;
      // If we've had enough successful trial requests, close the circuit
      if (this._successCount >= Math.ceil(this._halfOpenMaxRequests / 2)) {
        this._transitionTo(STATES.CLOSED);
      }
    }
  }

  _onFailureOccurred(err) {
    this._totalFailures++;
    this._failureCount++;
    this._lastFailureTime = Date.now();

    if (this._onFailure) {
      this._onFailure({ circuit: this.name, error: err.message, failureCount: this._failureCount });
    }

    if (this._state === STATES.CLOSED && this._failureCount >= this._threshold) {
      this._transitionTo(STATES.OPEN);
    } else if (this._state === STATES.HALF_OPEN) {
      // Any failure in half-open immediately re-opens
      this._transitionTo(STATES.OPEN);
    }
  }

  _transitionTo(newState) {
    const oldState = this._state;
    this._state = newState;
    this._lastStateChange = Date.now();

    if (newState === STATES.CLOSED) {
      this._failureCount = 0;
      this._successCount = 0;
      this._halfOpenCallCount = 0;
    } else if (newState === STATES.HALF_OPEN) {
      this._halfOpenCallCount = 0;
      this._successCount = 0;
    } else if (newState === STATES.OPEN) {
      this._halfOpenCallCount = 0;
      this._successCount = 0;
    }

    logger.info(
      { circuit: this.name, fromState: oldState, toState: newState, failureCount: this._failureCount },
      `Circuit breaker "${this.name}" transitioned: ${oldState} → ${newState}`
    );

    if (this._onStateChange) {
      this._onStateChange({ circuit: this.name, from: oldState, to: newState });
    }
  }

  // ── Reset ──

  /**
   * Force reset the circuit breaker to CLOSED state.
   */
  reset() {
    this._state = STATES.CLOSED;
    this._failureCount = 0;
    this._successCount = 0;
    this._halfOpenCallCount = 0;
    this._lastStateChange = Date.now();
    logger.info({ circuit: this.name }, `Circuit breaker "${this.name}" manually reset`);
  }

  /**
   * Force open the circuit breaker.
   */
  forceOpen() {
    this._transitionTo(STATES.OPEN);
  }

  // ── Stats ──

  /**
   * Get circuit breaker statistics.
   */
  getStats() {
    return {
      name: this.name,
      state: this._state,
      failureCount: this._failureCount,
      successCount: this._successCount,
      halfOpenCallCount: this._halfOpenCallCount,
      totalCalls: this._totalCalls,
      totalFailures: this._totalFailures,
      totalSuccesses: this._totalSuccesses,
      threshold: this._threshold,
      timeoutMs: this._timeoutMs,
      halfOpenMaxRequests: this._halfOpenMaxRequests,
      lastFailureTime: this._lastFailureTime,
      lastStateChange: new Date(this._lastStateChange).toISOString(),
      uptime: this._totalCalls > 0 ? Math.floor((Date.now() - this._lastStateChange) / 1000) : 0,
    };
  }
}

export { CircuitBreaker, STATES };
export default CircuitBreaker;
