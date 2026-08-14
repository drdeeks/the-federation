// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// ApprovalChain — manages approval workflows with configurable chains,
// escalation policies, timeouts, and audit integration.

import { EventEmitter } from 'node:events';
import { AuditTrail } from './AuditTrail.js';

/**
 * Approval decision states
 * @readonly
 * @enum {string}
 */
export const ApprovalState = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ESCALATED: 'escalated',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

/**
 * Approval step types
 * @readonly
 * @enum {string}
 */
export const ApprovalStepType = {
  APPROVER: 'approver',           // Single approver
  GROUP: 'group',                 // Any one of group approves
  UNANIMOUS_GROUP: 'unanimous',   // All in group must approve
  QUORUM: 'quorum',               // N of M must approve
  AUTO_APPROVE: 'auto_approve',   // Automatic after timeout
  ESCALATION: 'escalation',       // Escalate to next level
};

/**
 * ApprovalChain — orchestrates multi-step approval workflows.
 * Features:
 * - Sequential and parallel approval steps
 * - Configurable approval policies (unanimous, quorum, any)
 * - Escalation chains with timeouts
 * - Auto-approval/expiry policies
 * - Integration with AuditTrail for compliance
 * - Event-driven for UI/notification integration
 */
export class ApprovalChain extends EventEmitter {
  #chains;
  #timers;

  /**
   * @param {Object} options
   * @param {Object} options.auditTrail - Optional AuditTrail instance for compliance logging
   * @param {number} options.defaultTimeoutMs - Default step timeout (default: 24h)
   * @param {Function} options.notifier - async (step, approvers, context) => void for notifications
   * @param {Object} options.escalationPolicy - Default escalation config
   */
  constructor({
    auditTrail = null,
    defaultTimeoutMs = 24 * 60 * 60 * 1000, // 24 hours
    notifier = null,
    escalationPolicy = { maxLevels: 3, delayMs: 60 * 60 * 1000 }, // 1 hour delay
  } = {}) {
    super();
    this.auditTrail = auditTrail;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.notifier = notifier;
    this.escalationPolicy = escalationPolicy;

    this.#chains = new Map(); // chainId -> chain state
    this.#timers = new Map(); // chainId -> Map<stepId, timeoutId>
  }

  /**
   * Define and start an approval chain.
   * @param {Object} definition
   * @param {string} definition.chainId - Unique identifier
   * @param {string} definition.requestId - Associated request/resource ID
   * @param {string} definition.requesterId - Who initiated the request
   * @param {Object} definition.context - Arbitrary context data for approvers
   * @param {Array<Object>} definition.steps - Ordered approval steps
   * @param {string} definition.steps[].stepId - Unique step identifier
   * @param {string} definition.steps[].type - ApprovalStepType
   * @param {string[]} definition.steps[].approvers - User/group IDs
   * @param {number} definition.steps[].quorum - Required approvals (for QUORUM type)
   * @param {number} definition.steps[].timeoutMs - Step timeout (overrides default)
   * @param {Object} definition.steps[].escalation - Escalation config for this step
   * @param {boolean} definition.steps[].parallel - Run in parallel with next step
   * @returns {Promise<Object>} Chain execution result
   */
  async start(definition) {
    const chainId = definition.chainId || `chain-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const chain = {
      id: chainId,
      requestId: definition.requestId,
      requesterId: definition.requesterId,
      context: definition.context || {},
      steps: definition.steps.map((s, i) => ({
        ...s,
        order: i,
        state: ApprovalState.PENDING,
        decisions: new Map(), // approverId -> { decision, timestamp, comment }
        startedAt: null,
        completedAt: null,
      })),
      state: ApprovalState.PENDING,
      currentStepIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      result: null,
    };

    this.#chains.set(chainId, chain);
    this.#timers.set(chainId, new Map());

    this.#audit(chainId, 'chain_created', { requestId: chain.requestId, requesterId: chain.requesterId });
    this.emit('chain:created', { chainId, requestId: chain.requestId });

    // Start first step(s)
    this.#advanceChain(chainId);

    return this.getChain(chainId);
  }

  /**
   * Submit an approval decision.
   * @param {string} chainId
   * @param {string} stepId
   * @param {string} approverId
   * @param {string} decision - 'approve' | 'reject'
   * @param {string} [comment] - Optional comment
   * @returns {Promise<Object>} Updated chain state
   */
  async decide(chainId, stepId, approverId, decision, comment = '') {
    const chain = this.#chains.get(chainId);
    if (!chain) throw new Error(`Chain "${chainId}" not found`);

    const step = chain.steps.find(s => s.stepId === stepId);
    if (!step) throw new Error(`Step "${stepId}" not found in chain "${chainId}"`);

    if (step.state !== ApprovalState.PENDING) {
      throw new Error(`Step "${stepId}" is not pending (current: ${step.state})`);
    }

    // Validate approver is authorized for this step
    if (!this.#isAuthorizedApprover(step, approverId)) {
      throw new Error(`User "${approverId}" is not an authorized approver for step "${stepId}"`);
    }

    // Record decision
    step.decisions.set(approverId, {
      decision,
      timestamp: new Date().toISOString(),
      comment,
    });

    this.#audit(chainId, 'decision_recorded', {
      stepId,
      approverId,
      decision,
      comment,
    });

    this.emit('step:decision', { chainId, stepId, approverId, decision, comment });

    // Check if step is complete
    const stepResult = this.#evaluateStep(step);
    if (stepResult.complete) {
      await this.#completeStep(chain, step, stepResult);
    }

    chain.updatedAt = new Date().toISOString();
    return this.getChain(chainId);
  }

  /**
   * Cancel an approval chain.
   * @param {string} chainId
   * @param {string} reason
   * @returns {Promise<Object>}
   */
  async cancel(chainId, reason = 'Cancelled by user') {
    const chain = this.#chains.get(chainId);
    if (!chain) throw new Error(`Chain "${chainId}" not found`);

    if (chain.state === ApprovalState.APPROVED || chain.state === ApprovalState.REJECTED) {
      throw new Error(`Chain already completed with state: ${chain.state}`);
    }

    // Clear all pending timers
    this.#clearChainTimers(chainId);

    // Mark pending steps as cancelled
    for (const step of chain.steps) {
      if (step.state === ApprovalState.PENDING) {
        step.state = ApprovalState.CANCELLED;
        step.completedAt = new Date().toISOString();
      }
    }

    chain.state = ApprovalState.CANCELLED;
    chain.result = { decision: 'cancelled', reason };
    chain.updatedAt = new Date().toISOString();

    this.#audit(chainId, 'chain_cancelled', { reason });
    this.emit('chain:cancelled', { chainId, reason });

    return this.getChain(chainId);
  }

  /**
   * Get current chain state.
   * @param {string} chainId
   * @returns {Object|null}
   */
  getChain(chainId) {
    const chain = this.#chains.get(chainId);
    if (!chain) return null;

    // Return a sanitized copy
    return {
      id: chain.id,
      requestId: chain.requestId,
      requesterId: chain.requesterId,
      context: chain.context,
      state: chain.state,
      currentStepIndex: chain.currentStepIndex,
      steps: chain.steps.map(s => ({
        stepId: s.stepId,
        type: s.type,
        order: s.order,
        state: s.state,
        approvers: s.approvers,
        quorum: s.quorum,
        decisions: Object.fromEntries(s.decisions),
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      })),
      result: chain.result,
      createdAt: chain.createdAt,
      updatedAt: chain.updatedAt,
    };
  }

  /**
   * List all chains (optionally filtered).
   * @param {Object} filter - { state?, requesterId?, requestId? }
   * @returns {Array<Object>}
   */
  listChains(filter = {}) {
    return [...this.#chains.values()]
      .filter(chain => {
        if (filter.state && chain.state !== filter.state) return false;
        if (filter.requesterId && chain.requesterId !== filter.requesterId) return false;
        if (filter.requestId && chain.requestId !== filter.requestId) return false;
        return true;
      })
      .map(chain => this.getChain(chain.id));
  }

  /**
   * Evaluate if a step is complete based on its type and decisions.
   * @private
   */
  #evaluateStep(step) {
    const decisions = [...step.decisions.values()];
    const approveCount = decisions.filter(d => d.decision === 'approve').length;
    const rejectCount = decisions.filter(d => d.decision === 'reject').length;
    const totalApprovers = step.approvers?.length || 0;

    switch (step.type) {
      case ApprovalStepType.APPROVER:
        // Single approver - first decision wins
        if (decisions.length > 0) {
          return { complete: true, approved: decisions[0].decision === 'approve' };
        }
        return { complete: false };

      case ApprovalStepType.GROUP:
        // Any one approves
        if (approveCount > 0) return { complete: true, approved: true };
        if (rejectCount === totalApprovers && totalApprovers > 0) return { complete: true, approved: false };
        return { complete: false };

      case ApprovalStepType.UNANIMOUS_GROUP:
        // All must approve
        if (rejectCount > 0) return { complete: true, approved: false };
        if (approveCount === totalApprovers && totalApprovers > 0) return { complete: true, approved: true };
        return { complete: false };

      case ApprovalStepType.QUORUM:
        // N of M must approve
        const required = step.quorum || Math.ceil(totalApprovers / 2);
        if (approveCount >= required) return { complete: true, approved: true };
        if (rejectCount > totalApprovers - required) return { complete: true, approved: false };
        return { complete: false };

      case ApprovalStepType.AUTO_APPROVE:
        // Handled by timeout
        return { complete: false };

      case ApprovalStepType.ESCALATION:
        // Handled by timeout/escalation logic
        return { complete: false };

      default:
        return { complete: false };
    }
  }

  /**
   * Complete a step and advance chain.
   * @private
   */
  async #completeStep(chain, step, stepResult) {
    step.state = stepResult.approved ? ApprovalState.APPROVED : ApprovalState.REJECTED;
    step.completedAt = new Date().toISOString();

    this.#clearStepTimer(chain.id, step.stepId);
    this.#audit(chain.id, 'step_completed', {
      stepId: step.stepId,
      approved: stepResult.approved,
      decisions: Object.fromEntries(step.decisions),
    });

    this.emit('step:completed', {
      chainId: chain.id,
      stepId: step.stepId,
      approved: stepResult.approved,
    });

    if (!stepResult.approved) {
      // Rejection stops the chain
      chain.state = ApprovalState.REJECTED;
      chain.result = { decision: 'rejected', rejectedAtStep: step.stepId };
      this.#audit(chain.id, 'chain_rejected', { rejectedAtStep: step.stepId });
      this.emit('chain:rejected', { chainId: chain.id, rejectedAtStep: step.stepId });
      return;
    }

    // Advance to next step(s)
    this.#advanceChain(chain.id);
  }

  /**
   * Advance chain to next step(s).
   * @private
   */
  #advanceChain(chainId) {
    const chain = this.#chains.get(chainId);
    if (!chain) return;

    // Find next pending step(s)
    let nextIndex = chain.currentStepIndex;
    while (nextIndex < chain.steps.length && chain.steps[nextIndex].state !== ApprovalState.PENDING) {
      nextIndex++;
    }

    if (nextIndex >= chain.steps.length) {
      // All steps complete - chain approved
      chain.state = ApprovalState.APPROVED;
      chain.result = { decision: 'approved' };
      chain.updatedAt = new Date().toISOString();
      this.#audit(chainId, 'chain_approved', {});
      this.emit('chain:approved', { chainId });
      return;
    }

    chain.currentStepIndex = nextIndex;

    // Start current step and any parallel steps
    let i = nextIndex;
    while (i < chain.steps.length) {
      const step = chain.steps[i];
      if (step.state !== ApprovalState.PENDING) break;

      this.#startStep(chain, step);

      // If not parallel, stop here
      if (!step.parallel) break;
      i++;
    }
  }

  /**
   * Start a single step.
   * @private
   */
  #startStep(chain, step) {
    step.state = ApprovalState.PENDING;
    step.startedAt = new Date().toISOString();

    this.#audit(chain.id, 'step_started', {
      stepId: step.stepId,
      type: step.type,
      approvers: step.approvers,
    });

    this.emit('step:started', {
      chainId: chain.id,
      stepId: step.stepId,
      type: step.type,
      approvers: step.approvers,
    });

    // Notify approvers
    if (this.notifier && step.approvers?.length) {
      this.notifier(step, step.approvers, chain.context).catch(err => {
        this.emit('error', { chainId: chain.id, stepId: step.stepId, error: err });
      });
    }

    // Set timeout
    const timeoutMs = step.timeoutMs || this.defaultTimeoutMs;
    if (timeoutMs > 0) {
      const timerId = setTimeout(() => this.#onStepTimeout(chain.id, step.stepId), timeoutMs);
      this.#timers.get(chain.id).set(step.stepId, timerId);
    }

    // Handle auto-approve steps
    if (step.type === ApprovalStepType.AUTO_APPROVE) {
      // Auto-approve after timeout (handled by timeout)
      step.state = ApprovalState.PENDING; // waiting for timeout
    }

    // Handle escalation steps
    if (step.type === ApprovalStepType.ESCALATION) {
      // Escalation steps auto-trigger after timeout
      step.state = ApprovalState.PENDING;
    }
  }

  /**
   * Handle step timeout.
   * @private
   */
  async #onStepTimeout(chainId, stepId) {
    const chain = this.#chains.get(chainId);
    if (!chain) return;

    const step = chain.steps.find(s => s.stepId === stepId);
    if (!step || step.state !== ApprovalState.PENDING) return;

    this.#audit(chainId, 'step_timeout', { stepId, type: step.type });
    this.emit('step:timeout', { chainId, stepId });

    switch (step.type) {
      case ApprovalStepType.AUTO_APPROVE:
        // Auto-approve on timeout
        await this.decide(chainId, stepId, 'system:auto', 'approve', 'Auto-approved after timeout');
        break;

      case ApprovalStepType.ESCALATION:
        // Escalate to next level
        await this.#escalate(chain, step);
        break;

      default:
        // Default: expire step (treat as rejection if no decision)
        const hasDecisions = step.decisions.size > 0;
        if (!hasDecisions) {
          step.state = ApprovalState.EXPIRED;
          step.completedAt = new Date().toISOString();
          chain.state = ApprovalState.REJECTED;
          chain.result = { decision: 'rejected', reason: 'timeout', expiredAtStep: stepId };
          this.#audit(chainId, 'chain_expired', { expiredAtStep: stepId });
          this.emit('chain:expired', { chainId, expiredAtStep: stepId });
        }
        break;
    }
  }

  /**
   * Escalate to next level.
   * @private
   */
  async #escalate(chain, step) {
    const escalation = step.escalation || this.escalationPolicy;
    const currentLevel = step.escalationLevel || 0;

    if (currentLevel >= (escalation.maxLevels || 3)) {
      // Max escalation reached - expire
      step.state = ApprovalState.EXPIRED;
      step.completedAt = new Date().toISOString();
      chain.state = ApprovalState.REJECTED;
      chain.result = { decision: 'rejected', reason: 'max_escalation_reached' };
      this.#audit(chain.id, 'chain_rejected', { reason: 'max_escalation_reached' });
      this.emit('chain:rejected', { chainId: chain.id, reason: 'max_escalation_reached' });
      return;
    }

    step.state = ApprovalState.ESCALATED;
    step.escalationLevel = currentLevel + 1;

    this.#audit(chain.id, 'step_escalated', {
      stepId: step.stepId,
      newLevel: step.escalationLevel,
    });

    this.emit('step:escalated', {
      chainId: chain.id,
      stepId: step.stepId,
      newLevel: step.escalationLevel,
    });

    // Find or create next escalation step
    const nextStepIndex = chain.steps.findIndex(s => s.stepId === step.stepId) + 1;
    if (nextStepIndex < chain.steps.length) {
      const nextStep = chain.steps[nextStepIndex];
      if (nextStep.type === ApprovalStepType.ESCALATION || nextStep.type === ApprovalStepType.APPROVER) {
        nextStep.escalationLevel = step.escalationLevel;
        this.#startStep(chain, nextStep);
      }
    } else {
      // Create implicit escalation step
      const escalationStep = {
        stepId: `${step.stepId}_escalation_${step.escalationLevel}`,
        type: ApprovalStepType.APPROVER,
        approvers: escalation.approvers || [],
        escalationLevel: step.escalationLevel,
        state: ApprovalState.PENDING,
        order: chain.steps.length,
        decisions: new Map(),
      };
      chain.steps.push(escalationStep);
      this.#startStep(chain, escalationStep);
    }
  }

  /**
   * Check if user is authorized approver for step.
   * @private
   */
  #isAuthorizedApprover(step, approverId) {
    if (!step.approvers || step.approvers.length === 0) return false;
    return step.approvers.includes(approverId) || step.approvers.includes('*');
  }

  /**
   * Clear timer for a specific step.
   * @private
   */
  #clearStepTimer(chainId, stepId) {
    const timers = this.#timers.get(chainId);
    if (timers) {
      const timerId = timers.get(stepId);
      if (timerId) {
        clearTimeout(timerId);
        timers.delete(stepId);
      }
    }
  }

  /**
   * Clear all timers for a chain.
   * @private
   */
  #clearChainTimers(chainId) {
    const timers = this.#timers.get(chainId);
    if (timers) {
      for (const timerId of timers.values()) {
        clearTimeout(timerId);
      }
      timers.clear();
    }
  }

  /**
   * Audit logging helper.
   * @private
   */
  #audit(chainId, action, data) {
    if (this.auditTrail) {
      this.auditTrail.log({
        chainId,
        action,
        ...data,
        timestamp: new Date().toISOString(),
      }).catch(() => {}); // Don't let audit failures break flow
    }
  }
}
