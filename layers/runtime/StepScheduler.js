// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// StepScheduler — queues workflow steps with dependency resolution.
// Manages parallel execution of independent steps.

import { DependencyGraphBuilder } from './DependencyGraphBuilder.js';

export class StepScheduler {
  #dependencyGraph;
  #queue = [];
  #running = new Set();
  #completed = new Set();
  #failed = new Set();
  #skipped = new Set();
  #cancelled = new Set();
  #concurrencyLimit;
  #onStepReady;

  /**
   * @param {Object} options
   * @param {number} options.concurrencyLimit - Max parallel steps (default: 5)
   * @param {Function} options.onStepReady - Callback when a step becomes ready
   */
  constructor(options = {}) {
    this.#concurrencyLimit = options.concurrencyLimit ?? 5;
    this.#onStepReady = options.onStepReady;
  }

  /**
   * Initialize the scheduler with workflow steps.
   * @param {Object[]} steps - Array of workflow steps
   * @returns {StepScheduler}
   */
  initialize(steps) {
    this.#dependencyGraph = new DependencyGraphBuilder();
    this.#dependencyGraph.build(steps);

    this.#queue = [];
    this.#running.clear();
    this.#completed.clear();
    this.#failed.clear();
    this.#skipped.clear();
    this.#cancelled.clear();

    // Enqueue initial ready steps
    this.#enqueueReadySteps();

    return this;
  }

  /**
   * Get the next step(s) ready for execution.
   * @returns {Object[]} Array of steps ready to run
   */
  getReadySteps() {
    const available = this.#concurrencyLimit - this.#running.size;
    if (available <= 0) return [];

    return this.#queue.splice(0, available).map(item => item.step);
  }

  /**
   * Mark a step as running.
   * @param {string} stepId
   */
  markRunning(stepId) {
    this.#running.add(stepId);
    // Remove from queue if present
    this.#queue = this.#queue.filter(item => item.step.id !== stepId);
  }

  /**
   * Mark a step as completed.
   * @param {string} stepId
   */
  markCompleted(stepId) {
    this.#running.delete(stepId);
    this.#completed.add(stepId);
    this.#enqueueReadySteps();
  }

  /**
   * Mark a step as failed.
   * @param {string} stepId
   * @param {boolean} skipDependents - Whether to skip downstream steps
   */
  markFailed(stepId, skipDependents = true) {
    this.#running.delete(stepId);
    this.#failed.add(stepId);

    if (skipDependents) {
      // Mark all downstream steps as skipped
      const dependents = this.#dependencyGraph.getDependents(stepId);
      for (const dep of dependents) {
        if (!this.#completed.has(dep) && !this.#failed.has(dep)) {
          this.#cancelled.add(dep);
          // Remove from queue
          this.#queue = this.#queue.filter(item => item.step.id !== dep);
        }
      }
    }

    this.#enqueueReadySteps();
  }

  /**
   * Cancel a step and all its dependents.
   * @param {string} stepId
   */
  cancel(stepId) {
    this.#running.delete(stepId);
    this.#cancelled.add(stepId);

    // Cancel all downstream steps
    const dependents = this.#dependencyGraph.getDependents(stepId);
    for (const dep of dependents) {
      if (!this.#completed.has(dep) && !this.#failed.has(dep)) {
        this.#cancelled.add(dep);
        this.#queue = this.#queue.filter(item => item.step.id !== dep);
      }
    }

    this.#enqueueReadySteps();
  }

  /**
   * Get scheduler status.
   * @returns {Object}
   */
  getStatus() {
    return {
      queue: this.#queue.length,
      running: this.#running.size,
      completed: this.#completed.size,
      failed: this.#failed.size,
      cancelled: this.#cancelled.size,
      concurrencyLimit: this.#concurrencyLimit,
    };
  }

  /**
   * Check if all steps are done (completed, failed, or cancelled).
   * @returns {boolean}
   */
  isComplete() {
    return (
      this.#queue.length === 0 &&
      this.#running.size === 0 &&
      (this.#completed.size + this.#failed.size + this.#cancelled.size) > 0
    );
  }

  /**
   * Get all completed step IDs.
   * @returns {Set<string>}
   */
  getCompletedSteps() {
    return new Set(this.#completed);
  }

  /**
   * Get all failed step IDs.
   * @returns {Set<string>}
   */
  getFailedSteps() {
    return new Set(this.#failed);
  }

  /**
   * Get all cancelled step IDs.
   * @returns {Set<string>}
   */
  getCancelledSteps() {
    return new Set(this.#cancelled);
  }

  /**
   * Enqueue steps that are ready to execute.
   */
  #enqueueReadySteps() {
    if (!this.#dependencyGraph) return;

    const allDone = new Set([...this.#completed, ...this.#failed, ...this.#cancelled]);
    const ready = this.#dependencyGraph.getReadySteps(allDone);

    for (const stepId of ready) {
      // Skip if already in queue, running, or done
      if (
        this.#queue.some(item => item.step.id === stepId) ||
        this.#running.has(stepId) ||
        allDone.has(stepId)
      ) {
        continue;
      }

      const step = this.#dependencyGraph.getStep(stepId);
      if (step) {
        this.#queue.push({
          step,
          enqueuedAt: Date.now(),
        });

        // Notify callback
        if (this.#onStepReady) {
          this.#onStepReady(step);
        }
      }
    }

    // Sort queue by step index for consistent ordering
    this.#queue.sort((a, b) => {
      const idxA = a.step.step_index ?? 0;
      const idxB = b.step.step_index ?? 0;
      return idxA - idxB;
    });
  }

  /**
   * Reset the scheduler.
   */
  reset() {
    this.#queue = [];
    this.#running.clear();
    this.#completed.clear();
    this.#failed.clear();
    this.#skipped.clear();
    this.#cancelled.clear();
    this.#dependencyGraph = null;
  }
}
