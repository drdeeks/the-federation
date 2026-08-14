// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// EventBuilder — constructs standardized audit event objects with consistent schema.
// Provides factory methods for common event types with required fields and HMAC preparation.

import { randomUUID } from 'crypto';

/**
 * Standard audit event schema fields:
 * - id: unique event identifier (UUID v4)
 * - timestamp: ISO 8601 UTC timestamp
 * - action: event action type (e.g., 'trigger_ingested', 'workflow_created', 'step_executed')
 * - actor: actor identifier (system, user ID, service name)
 * - chainId: correlation ID linking related events (workflow ID, trigger ID, approval chain ID)
 * - payload: event-specific data (JSON-serializable object)
 * - metadata: additional context (source IP, user agent, correlation IDs, etc.)
 * - prevHash: HMAC of previous event in chain (for tamper detection)
 * - hash: HMAC of this event (computed by TamperDetector)
 */

export class EventBuilder {
  #defaults = {};

  /**
   * Create a new EventBuilder with default values.
   * @param {Object} defaults - Default values applied to all built events
   */
  constructor(defaults = {}) {
    this.#defaults = {
      actor: 'system',
      metadata: {},
      ...defaults,
    };
  }

  /**
   * Build a raw event object with all required fields.
   * @param {Object} params - Event parameters
   * @param {string} params.action - Required action type
   * @param {string} params.chainId - Required correlation ID
   * @param {string} [params.actor] - Actor identifier
   * @param {Object} [params.payload] - Event payload data
   * @param {Object} [params.metadata] - Additional metadata
   * @param {string} [params.id] - Explicit event ID (auto-generated if omitted)
   * @param {string} [params.timestamp] - Explicit timestamp (auto-generated if omitted)
   * @param {string} [params.prevHash] - Previous event HMAC for chaining
   * @returns {Object} Complete audit event object
   */
  build({ action, chainId, actor, payload = {}, metadata = {}, id, timestamp, prevHash }) {
    if (!action) throw new Error('EventBuilder.build: action is required');
    if (!chainId) throw new Error('EventBuilder.build: chainId is required');

    const eventId = id || `evt_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const eventTimestamp = timestamp || new Date().toISOString();

    return {
      id: eventId,
      timestamp: eventTimestamp,
      action,
      chainId,
      actor: actor || this.#defaults.actor,
      payload,
      metadata: { ...this.#defaults.metadata, ...metadata },
      prevHash: prevHash || null,
      hash: null, // Computed by TamperDetector after persistence
    };
  }

  /**
   * Build a trigger ingestion event.
   */
  triggerIngested({ triggerId, source, type, urgency, classification, metadata = {} }) {
    return this.build({
      action: 'trigger_ingested',
      chainId: triggerId,
      actor: metadata.actor || 'trigger-ingestion',
      payload: { triggerId, source, type, urgency, classification },
      metadata: { ...metadata, component: 'trigger-ingestion' },
    });
  }

  /**
   * Build a trigger classification event.
   */
  triggerClassified({ triggerId, classification, confidence, model, tokens, latencyMs, metadata = {} }) {
    return this.build({
      action: 'trigger_classified',
      chainId: triggerId,
      actor: metadata.actor || 'trigger-classifier',
      payload: { triggerId, classification, confidence, model, tokens, latencyMs },
      metadata: { ...metadata, component: 'trigger-classifier' },
    });
  }

  /**
   * Build a workflow creation event.
   */
  workflowCreated({ workflowId, triggerId, name, steps, metadata = {} }) {
    return this.build({
      action: 'workflow_created',
      chainId: workflowId,
      actor: metadata.actor || 'workflow-orchestrator',
      payload: { workflowId, triggerId, name, stepCount: steps?.length || 0 },
      metadata: { ...metadata, component: 'workflow-orchestrator' },
    });
  }

  /**
   * Build a workflow step execution event.
   */
  stepExecuted({ workflowId, stepId, stepIndex, connector, action, inputParams, outputResult, status, durationMs, metadata = {} }) {
    return this.build({
      action: 'step_executed',
      chainId: workflowId,
      actor: metadata.actor || 'step-executor',
      payload: { workflowId, stepId, stepIndex, connector, action, status, durationMs },
      metadata: { ...metadata, component: 'step-executor', inputParams, outputResult },
    });
  }

  /**
   * Build a step approval request event.
   */
  approvalRequested({ workflowId, stepId, approvalId, chainId, requester, tier, timeoutMs, metadata = {} }) {
    return this.build({
      action: 'approval_requested',
      chainId: chainId || workflowId,
      actor: metadata.actor || 'approval-chain',
      payload: { workflowId, stepId, approvalId, requester, tier, timeoutMs },
      metadata: { ...metadata, component: 'approval-chain' },
    });
  }

  /**
   * Build an approval decision event.
   */
  approvalDecided({ approvalId, chainId, workflowId, stepId, decision, approver, reason, tier, metadata = {} }) {
    return this.build({
      action: 'approval_decided',
      chainId: chainId || workflowId,
      actor: approver || 'approval-chain',
      payload: { approvalId, workflowId, stepId, decision, approver, reason, tier },
      metadata: { ...metadata, component: 'approval-chain' },
    });
  }

  /**
   * Build a connector call event.
   */
  connectorCalled({ workflowId, stepId, connectorType, connectorAction, inputParams, outputResult, status, latencyMs, metadata = {} }) {
    return this.build({
      action: 'connector_called',
      chainId: workflowId,
      actor: metadata.actor || 'connector-registry',
      payload: { workflowId, stepId, connectorType, connectorAction, status, latencyMs },
      metadata: { ...metadata, component: 'connector-registry', inputParams, outputResult },
    });
  }

  /**
   * Build a workflow completion event.
   */
  workflowCompleted({ workflowId, triggerId, status, durationMs, stepResults, metadata = {} }) {
    return this.build({
      action: 'workflow_completed',
      chainId: workflowId,
      actor: metadata.actor || 'workflow-orchestrator',
      payload: { workflowId, triggerId, status, durationMs, stepCount: stepResults?.length || 0 },
      metadata: { ...metadata, component: 'workflow-orchestrator', stepResults },
    });
  }

  /**
   * Build a workflow failure event.
   */
  workflowFailed({ workflowId, triggerId, error, failedStepId, errorCategory, metadata = {} }) {
    return this.build({
      action: 'workflow_failed',
      chainId: workflowId,
      actor: metadata.actor || 'workflow-orchestrator',
      payload: { workflowId, triggerId, error, failedStepId, errorCategory },
      metadata: { ...metadata, component: 'workflow-orchestrator' },
    });
  }

  /**
   * Build a glitch detection event.
   */
  glitchDetected({ glitchId, workflowId, severity, category, title, findings, metadata = {} }) {
    return this.build({
      action: 'glitch_detected',
      chainId: glitchId,
      actor: metadata.actor || 'glitch-reporter',
      payload: { glitchId, workflowId, severity, category, title, findings },
      metadata: { ...metadata, component: 'glitch-reporter' },
    });
  }

  /**
   * Build a glitch analysis completion event.
   */
  glitchAnalyzed({ glitchId, workflowId, report, recommendations, metadata = {} }) {
    return this.build({
      action: 'glitch_analyzed',
      chainId: glitchId,
      actor: metadata.actor || 'glitch-reporter',
      payload: { glitchId, workflowId, report, recommendations },
      metadata: { ...metadata, component: 'glitch-reporter' },
    });
  }

  /**
   * Build a generic system event.
   */
  systemEvent({ action, chainId, actor, payload = {}, metadata = {} }) {
    return this.build({ action, chainId, actor, payload, metadata: { ...metadata, component: 'system' } });
  }

  /**
   * Set default values for all events built by this builder.
   */
  setDefaults(defaults) {
    this.#defaults = { ...this.#defaults, ...defaults };
    return this;
  }

  /**
   * Get current defaults.
   */
  getDefaults() {
    return { ...this.#defaults };
  }
}

export const defaultEventBuilder = new EventBuilder();
