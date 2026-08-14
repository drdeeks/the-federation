// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// RetryManager — implements step-level retry with exponential backoff.
// Distinguishes between transient and permanent errors.

export class RetryManager {
  #config;

  /**
   * @param {Object} config
   * @param {number} config.maxRetries - Maximum retry attempts (default: 3)
   * @param {number} config.baseDelayMs - Base delay in milliseconds (default: 1000)
   * @param {number} config.maxDelayMs - Maximum delay cap (default: 30000)
   * @param {string[]} config.permanentErrorPatterns - Patterns indicating permanent errors
   */
  constructor(config = {}) {
    this.#config = {
      maxRetries: config.maxRetries ?? 3,
      baseDelayMs: config.baseDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 30000,
      permanentErrorPatterns: config.permanentErrorPatterns ?? [
        'validation_error',
        'not_found',
        'unauthorized',
        'forbidden',
        'bad_request',
      ],
    };
  }

  /**
   * Calculate retry delay with exponential backoff.
   * Delays: 1s, 2s, 4s (for max 3 retries)
   * @param {number} attempt - Current retry attempt (0-based)
   * @returns {number} Delay in milliseconds
   */
  calculateDelay(attempt) {
    const delay = this.#config.baseDelayMs * Math.pow(2, attempt);
    return Math.min(delay, this.#config.maxDelayMs);
  }

  /**
   * Check if an error is retryable.
   * @param {Error} error
   * @returns {boolean}
   */
  isRetryable(error) {
    const message = error?.message?.toLowerCase() || '';
    const category = error?.category?.toLowerCase() || '';

    // Check if it's a permanent error pattern
    for (const pattern of this.#config.permanentErrorPatterns) {
      if (message.includes(pattern) || category.includes(pattern)) {
        return false;
      }
    }

    // Transient errors are retryable
    const transientPatterns = [
      'timeout',
      'network',
      'connection',
      'econnreset',
      'econnrefused',
      'rate_limit',
      'server_error',
      '5xx',
    ];

    return transientPatterns.some(p => message.includes(p)) || error?.retryable === true;
  }

  /**
   * Get error category based on the error type.
   * @param {Error} error
   * @returns {string} 'transient' | 'permanent' | 'timeout' | 'approval_timeout'
   */
  categorizeError(error) {
    const message = error?.message?.toLowerCase() || '';

    if (message.includes('timeout')) return 'timeout';
    if (message.includes('approval') && message.includes('timeout')) {
      return 'approval_timeout';
    }
    if (this.isRetryable(error)) return 'transient';
    return 'permanent';
  }

  /**
   * Execute a function with retry logic.
   * @param {Function} fn - Async function to execute
   * @param {Object} context - Context for logging (workflowId, stepId)
   * @returns {Promise<{ success: boolean, result?: any, error?: Error, attempts: number }>}
   */
  async execute(fn, context = {}) {
    let lastError;
    const maxAttempts = this.#config.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const result = await fn();
        return {
          success: true,
          result,
          attempts: attempt + 1,
        };
      } catch (error) {
        lastError = error;
        error.category = this.categorizeError(error);

        // Don't retry permanent errors
        if (!this.isRetryable(error)) {
          return {
            success: false,
            error,
            attempts: attempt + 1,
          };
        }

        // If we have retries left, wait and try again
        if (attempt < this.#config.maxRetries) {
          const delay = this.calculateDelay(attempt);
          await this.#sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      attempts: maxAttempts,
    };
  }

  /**
   * Get retry configuration.
   * @returns {Object}
   */
  getConfig() {
    return { ...this.#config };
  }

  /**
   * Sleep for specified milliseconds.
   */
  #sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
