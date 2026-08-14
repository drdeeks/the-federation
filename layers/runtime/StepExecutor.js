// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// StepExecutor — executes individual workflow steps by dispatching to connectors.
// Manages step input/output transformation and timeout enforcement.

import { RetryManager } from './RetryManager.js';

export class StepExecutor {
  #connectorRegistry;
  #retryManager;
  #auditRecorder;

  /**
   * @param {Object} connectorRegistry - Registry of available connectors
   * @param {Object} auditRecorder - Audit trail recorder
   * @param {Object} retryConfig - RetryManager configuration
   */
  constructor(connectorRegistry, auditRecorder, retryConfig = {}) {
    this.#connectorRegistry = connectorRegistry;
    this.#auditRecorder = auditRecorder;
    this.#retryManager = new RetryManager(retryConfig);
  }

  /**
   * Execute a workflow step.
   * @param {Object} step - The step to execute
   * @param {Object} context - Execution context (workflowId, previousResults)
   * @returns {Promise<{ success: boolean, result?: any, error?: string }>}
   */
  async execute(step, context = {}) {
    const startTime = Date.now();
    const { workflowId, stepId = step.id } = context;

    // Record execution start
    await this.#recordAudit('step_execution_start', {
      workflowId,
      stepId,
      connectorType: step.connector_type,
      action: step.connector_action,
    });

    // Execute with retry
    const retryResult = await this.#retryManager.execute(
      async () => {
        return await this.#executeStep(step, context);
      },
      { workflowId, stepId }
    );

    const duration = Date.now() - startTime;
    const result = {
      success: retryResult.success,
      result: retryResult.result,
      error: retryResult.error?.message,
      duration,
      attempts: retryResult.attempts,
    };

    // Record execution completion
    await this.#recordAudit('step_execution_complete', {
      workflowId,
      stepId,
      success: result.success,
      duration,
      attempts: result.attempts,
      error: result.error,
    });

    return result;
  }

  /**
   * Internal step execution logic.
   */
  async #executeStep(step, context) {
    const { connector_type, connector_action, input_params } = step;

    // Get the connector from registry
    const connector = this.#connectorRegistry.get(connector_type);
    if (!connector) {
      throw new Error(
        `Connector "${connector_type}" not registered. ` +
        `Available: ${Array.from(this.#connectorRegistry.list()).join(', ')}`
      );
    }

    // Prepare input parameters with context substitution
    const params = this.#prepareParams(input_params, context);

    // Execute with timeout
    const timeoutMs = step.timeout_ms || 30000;
    const result = await this.#executeWithTimeout(
      () => connector.execute(connector_action, params),
      timeoutMs
    );

    return result;
  }

  /**
   * Execute a function with a timeout.
   */
  async #executeWithTimeout(fn, timeoutMs) {
    return Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * Prepare input parameters by substituting context values.
   * Supports ${previousResults.stepId} placeholders.
   */
  #prepareParams(params, context) {
    if (!params || typeof params !== 'object') return params;

    const prepared = { ...params };
    const { previousResults = {} } = context;

    for (const [key, value] of Object.entries(prepared)) {
      if (typeof value === 'string' && value.startsWith('${')) {
        // Resolve ${previousResults.stepId} references
        const match = value.match(/\$\{previousResults\.(\w+)\}/);
        if (match) {
          const stepId = match[1];
          prepared[key] = previousResults[stepId] || value;
        }
      }
    }

    return prepared;
  }

  /**
   * Record audit event.
   */
  async #recordAudit(eventType, data) {
    if (this.#auditRecorder) {
      try {
        await this.#auditRecorder.record({
          eventType,
          ...data,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // Audit recording is best-effort
      }
    }
  }

  /**
   * Get the retry manager for external use.
   * @returns {RetryManager}
   */
  getRetryManager() {
    return this.#retryManager;
  }
}
