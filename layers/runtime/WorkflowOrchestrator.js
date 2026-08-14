// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// WorkflowOrchestrator — central workflow engine that builds DAGs from triggers,
// manages lifecycle state transitions, coordinates step execution, and aggregates results.
//
// NOTE ON WHAT WAS NOT PORTED:
// The original orchestrator depended on two sibling modules that are out of scope
// for this port:
//   - WorkflowPlanValidator (Zod-schema plan validation) — generic, but not on the
//     ported-file list for this pass.
//   - ReasoningPipeline (AI chain-of-thought trigger decomposition) — its CORE
//     function was vendor-model routing (hardcoded vendor-specific model IDs and
//     prompts), which sanitization rules explicitly exclude from this port.
// Both are replaced below with minimal structural stubs that preserve the
// orchestrator's control flow. Real implementations should be wired in via the
// `planValidator` and `decomposer` constructor options.

import { createHash } from 'crypto';
import { StateMachine } from './StateMachine.js';
import { DependencyGraphBuilder } from './DependencyGraphBuilder.js';
import { StepScheduler } from './StepScheduler.js';
import { StepExecutor } from './StepExecutor.js';
import { ResultAggregator } from './ResultAggregator.js';
import { ProgressTracker } from './ProgressTracker.js';

// TODO: wire a real plan-validation module (schema-based) in place of this stub.
// Preserves the { valid, errors, plan } contract the orchestrator expects.
class StructuralPlanValidatorStub {
  constructor(connectorRegistry) {
    this._connectorRegistry = connectorRegistry;
  }

  validate(plan) {
    const errors = [];
    if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      errors.push('plan must include at least one step');
      return { valid: false, errors };
    }
    if (!plan.workflowId) errors.push('workflowId is required');
    if (!plan.triggerId) errors.push('triggerId is required');
    return { valid: errors.length === 0, errors, plan: errors.length === 0 ? plan : undefined };
  }
}

// TODO: wire a real trigger-decomposition module (AI-driven or rule-based).
// This stub intentionally does not perform decomposition — the original
// implementation's decomposition logic was vendor-model-specific and was
// excluded from this port. Supply a real decomposer via the `decomposer`
// constructor option.
class NullDecomposerStub {
  async decompose(trigger) {
    throw new Error(
      'No decomposition strategy configured. Pass options.decomposer to WorkflowOrchestrator ' +
      '(an object exposing decompose(trigger, context) and decomposeFallback(trigger, context)).'
    );
  }

  async decomposeFallback(trigger) {
    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      workflowId,
      triggerId: trigger?.id || workflowId,
      name: `Fallback workflow for ${trigger?.type || 'trigger'}`,
      description: 'Auto-generated fallback plan (no decomposition strategy configured)',
      steps: [],
      metadata: {
        decompositionVersion: 'stub',
        modelUsed: 'none',
      },
    };
  }
}

export class WorkflowOrchestrator {
  #stateMachine;
  #dependencyGraph;
  #planValidator;
  #stepScheduler;
  #stepExecutor;
  #resultAggregator;
  #progressTracker;
  #decomposer;
  #connectorRegistry;
  #auditRecorder;
  #db;
  #workflows = new Map();

  /**
   * @param {Object} options
   * @param {Object} options.connectorRegistry - Connector registry
   * @param {Object} options.decomposer - Trigger decomposition strategy, exposing
   *   decompose(trigger, context) and decomposeFallback(trigger, context). Falls
   *   back to a no-op stub if omitted (see NullDecomposerStub above).
   * @param {Object} options.planValidator - Workflow plan validator exposing
   *   validate(plan). Falls back to a minimal structural check if omitted.
   * @param {Object} options.db - SQLite database
   * @param {Object} options.auditRecorder - Audit trail recorder
   * @param {Object} options.retryConfig - RetryManager configuration
   * @param {Object} options.schedulerConfig - StepScheduler configuration
   * @param {Object} options.aggregatorConfig - ResultAggregator configuration
   */
  constructor(options = {}) {
    this.#connectorRegistry = options.connectorRegistry;
    this.#auditRecorder = options.auditRecorder;
    this.#db = options.db;

    this.#stateMachine = new StateMachine();
    this.#planValidator = options.planValidator || new StructuralPlanValidatorStub(options.connectorRegistry);
    this.#stepExecutor = new StepExecutor(
      options.connectorRegistry,
      options.auditRecorder,
      options.retryConfig
    );
    this.#resultAggregator = new ResultAggregator(options.aggregatorConfig);
    this.#progressTracker = new ProgressTracker();
    this.#decomposer = options.decomposer || new NullDecomposerStub();
  }

  /**
   * Create a workflow from a trigger.
   * @param {Object} trigger - The classified trigger
   * @returns {Promise<Object>} Created workflow
   */
  async createWorkflow(trigger) {
    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Initialize state machine
    this.#stateMachine.initWorkflow(workflowId);

    // Decompose trigger into workflow plan
    let plan;
    try {
      plan = await this.#decomposer.decompose(trigger, {
        connectors: this.#connectorRegistry,
      });
    } catch (error) {
      // Fallback to simplified decomposition
      plan = await this.#decomposer.decomposeFallback(trigger, {
        connectors: this.#connectorRegistry,
      });
    }

    // Validate the plan
    const validation = this.#planValidator.validate(plan);
    if (!validation.valid) {
      throw new Error(`Workflow plan validation failed: ${validation.errors.join(', ')}`);
    }

    // Store workflow
    const workflow = {
      id: plan.workflowId,
      triggerId: plan.triggerId,
      name: plan.name,
      description: plan.description,
      status: 'created',
      steps: validation.plan.steps,
      metadata: plan.metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.#workflows.set(workflow.id, workflow);

    // Persist to database if available
    if (this.#db) {
      this.#persistWorkflow(workflow);
    }

    // Transition to planned state
    this.#stateMachine.transitionWorkflow(workflow.id, 'planned');
    workflow.status = 'planned';

    return workflow;
  }

  /**
   * Execute a workflow.
   * @param {string} workflowId
   * @returns {Promise<Object>} Execution result
   */
  async executeWorkflow(workflowId) {
    const workflow = this.#workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Initialize progress tracking
    this.#progressTracker.initWorkflow(workflowId, workflow.steps);

    // Initialize step states
    for (const step of workflow.steps) {
      this.#stateMachine.initStep(workflowId, step.id);
    }

    // Initialize step scheduler
    this.#stepScheduler = new StepScheduler({
      concurrencyLimit: 5,
      onStepReady: (step) => {
        // Mark step as queued
        this.#stateMachine.transitionStep(workflowId, step.id, 'queued');
      },
    });
    this.#stepScheduler.initialize(workflow.steps);

    // Transition workflow to running
    this.#stateMachine.transitionWorkflow(workflowId, 'running');
    workflow.status = 'running';
    workflow.updated_at = new Date().toISOString();

    // Execute steps
    const context = {
      workflowId,
      previousResults: {},
    };

    try {
      while (!this.#stepScheduler.isComplete()) {
        const readySteps = this.#stepScheduler.getReadySteps();

        if (readySteps.length === 0) {
          // Wait a bit for steps to complete
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        // Execute ready steps in parallel
        const promises = readySteps.map(step => this.#executeStep(step, context));
        await Promise.allSettled(promises);
      }

      // Aggregate results
      const stepResults = workflow.steps.map(step => ({
        id: step.id,
        status: this.#stateMachine.getStepState(workflowId, step.id),
        result: context.previousResults[step.id],
      }));

      const { result, conflicts, metadata } = this.#resultAggregator.aggregateWithMetadata(stepResults);

      // Determine final status
      const failedSteps = this.#stepScheduler.getFailedSteps();
      const completedSteps = this.#stepScheduler.getCompletedSteps();

      let finalStatus;
      if (failedSteps.size === 0 && completedSteps.size === workflow.steps.length) {
        finalStatus = 'completed';
      } else if (failedSteps.size > 0 && completedSteps.size > 0) {
        finalStatus = 'partial';
      } else {
        finalStatus = 'failed';
      }

      // Update workflow
      workflow.status = finalStatus;
      workflow.result = result;
      workflow.metadata = { ...workflow.metadata, aggregation: metadata };
      workflow.updated_at = new Date().toISOString();

      // Transition state machine
      if (this.#stateMachine.canTransitionWorkflow(workflowId, finalStatus)) {
        this.#stateMachine.transitionWorkflow(workflowId, finalStatus);
      }

      // Persist updated workflow
      if (this.#db) {
        this.#persistWorkflow(workflow);
      }

      return {
        workflowId,
        status: finalStatus,
        result,
        conflicts,
        metadata,
        progress: this.#progressTracker.getProgress(workflowId),
      };
    } catch (error) {
      // Mark workflow as failed
      workflow.status = 'failed';
      workflow.error = error.message;
      workflow.updated_at = new Date().toISOString();

      if (this.#stateMachine.canTransitionWorkflow(workflowId, 'failed')) {
        this.#stateMachine.transitionWorkflow(workflowId, 'failed');
      }

      throw error;
    }
  }

  /**
   * Execute a single step with state management.
   */
  async #executeStep(step, context) {
    const { workflowId } = context;

    try {
      // Transition to running
      this.#stateMachine.transitionStep(workflowId, step.id, 'running');
      this.#progressTracker.updateStep(workflowId, step.id, 'running');

      // Check for approval requirement
      if (step.requires_approval) {
        this.#stateMachine.transitionStep(workflowId, step.id, 'waiting_approval');
        this.#progressTracker.updateStep(workflowId, step.id, 'waiting_approval');

        // For demo, auto-approve
        // In production, this would wait for ApprovalChain
        this.#stateMachine.transitionStep(workflowId, step.id, 'running');
      }

      // Execute the step
      const result = await this.#stepExecutor.execute(step, {
        workflowId,
        stepId: step.id,
        previousResults: context.previousResults,
      });

      if (result.success) {
        // Mark as completed
        this.#stateMachine.transitionStep(workflowId, step.id, 'completed');
        this.#stepScheduler.markCompleted(step.id);
        this.#progressTracker.updateStep(workflowId, step.id, 'completed');
        context.previousResults[step.id] = result.result;
      } else {
        // Mark as failed
        this.#stateMachine.transitionStep(workflowId, step.id, 'failed');
        this.#stepScheduler.markFailed(step.id, true);
        this.#progressTracker.updateStep(workflowId, step.id, 'failed', {
          error: result.error,
        });
      }
    } catch (error) {
      // Handle execution error
      this.#stateMachine.transitionStep(workflowId, step.id, 'failed');
      this.#stepScheduler.markFailed(step.id, true);
      this.#progressTracker.updateStep(workflowId, step.id, 'failed', {
        error: error.message,
      });
    }
  }

  /**
   * Get workflow by ID.
   * @param {string} workflowId
   * @returns {Object|null}
   */
  getWorkflow(workflowId) {
    return this.#workflows.get(workflowId) || null;
  }

  /**
   * List all workflows.
   * @returns {Object[]}
   */
  listWorkflows() {
    return Array.from(this.#workflows.values());
  }

  /**
   * Get workflow progress.
   * @param {string} workflowId
   * @returns {Object|null}
   */
  getProgress(workflowId) {
    return this.#progressTracker.getProgress(workflowId);
  }

  /**
   * Cancel a workflow.
   * @param {string} workflowId
   * @returns {boolean}
   */
  cancelWorkflow(workflowId) {
    const workflow = this.#workflows.get(workflowId);
    if (!workflow) return false;

    if (this.#stateMachine.canTransitionWorkflow(workflowId, 'cancelled')) {
      this.#stateMachine.transitionWorkflow(workflowId, 'cancelled');
      workflow.status = 'cancelled';
      workflow.updated_at = new Date().toISOString();

      // Cancel all pending/queued steps
      for (const step of workflow.steps) {
        if (this.#stateMachine.canTransitionStep(workflowId, step.id, 'cancelled')) {
          this.#stateMachine.transitionStep(workflowId, step.id, 'cancelled');
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Get state machine for external use.
   * @returns {StateMachine}
   */
  getStateMachine() {
    return this.#stateMachine;
  }

  /**
   * Get plan validator for external use.
   */
  getPlanValidator() {
    return this.#planValidator;
  }

  /**
   * Persist workflow to database.
   */
  #persistWorkflow(workflow) {
    if (!this.#db) return;

    try {
      const stmt = this.#db.prepare(`
        INSERT OR REPLACE INTO workflows
          (id, trigger_id, name, description, status, plan_hash, model_used,
           token_count, estimated_duration, metadata, created_at, updated_at)
        VALUES
          (@id, @triggerId, @name, @description, @status, @planHash, @modelUsed,
           @tokenCount, @estimatedDuration, @metadata, @createdAt, @updatedAt)
      `);

      stmt.run({
        id: workflow.id,
        triggerId: workflow.triggerId,
        name: workflow.name,
        description: workflow.description,
        status: workflow.status,
        planHash: workflow.metadata?.planHash || '',
        modelUsed: workflow.metadata?.modelUsed || 'unknown',
        tokenCount: workflow.metadata?.tokenCount || 0,
        estimatedDuration: workflow.metadata?.duration || 0,
        metadata: JSON.stringify(workflow.metadata || {}),
        createdAt: workflow.created_at,
        updatedAt: workflow.updated_at,
      });

      // Persist steps
      this.#persistSteps(workflow);
    } catch (error) {
      console.error('Failed to persist workflow:', error);
    }
  }

  /**
   * Persist workflow steps to database.
   */
  #persistSteps(workflow) {
    if (!this.#db) return;

    const stmt = this.#db.prepare(`
      INSERT OR REPLACE INTO workflow_steps
        (id, workflow_id, step_index, name, action, connector_type,
         connector_action, input_params, status, requires_approval,
         timeout_ms, max_retries, created_at, updated_at)
      VALUES
        (@id, @workflowId, @stepIndex, @name, @action, @connectorType,
         @connectorAction, @inputParams, @status, @requiresApproval,
         @timeoutMs, @maxRetries, @createdAt, @updatedAt)
    `);

    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      stmt.run({
        id: step.id,
        workflowId: workflow.id,
        stepIndex: step.step_index ?? i,
        name: step.name,
        action: step.action,
        connectorType: step.connector_type,
        connectorAction: step.connector_action,
        inputParams: JSON.stringify(step.input_params || {}),
        status: this.#stateMachine.getStepState(workflow.id, step.id) || 'pending',
        requiresApproval: step.requires_approval ? 1 : 0,
        timeoutMs: step.timeout_ms || 30000,
        maxRetries: step.max_retries || 3,
        createdAt: workflow.created_at,
        updatedAt: workflow.updated_at,
      });
    }
  }
}
