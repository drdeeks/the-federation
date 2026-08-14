// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// ProgressTracker — real-time workflow execution progress tracking.
// Monitors step-level status and estimated completion time.

export class ProgressTracker {
  #workflows = new Map();

  /**
   * Initialize tracking for a workflow.
   * @param {string} workflowId
   * @param {Object[]} steps
   */
  initWorkflow(workflowId, steps) {
    this.#workflows.set(workflowId, {
      workflowId,
      totalSteps: steps.length,
      steps: steps.map(s => ({
        id: s.id,
        name: s.name,
        status: 'pending',
        startedAt: null,
        completedAt: null,
        duration: null,
        error: null,
      })),
      startedAt: Date.now(),
      completedAt: null,
      estimatedCompletion: null,
    });
  }

  /**
   * Update step status.
   * @param {string} workflowId
   * @param {string} stepId
   * @param {string} status
   * @param {Object} details - Additional details (error, result)
   */
  updateStep(workflowId, stepId, status, details = {}) {
    const workflow = this.#workflows.get(workflowId);
    if (!workflow) return;

    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) return;

    step.status = status;
    step.error = details.error || null;

    if (status === 'running' && !step.startedAt) {
      step.startedAt = Date.now();
    }

    if (['completed', 'failed', 'skipped', 'cancelled'].includes(status)) {
      step.completedAt = Date.now();
      step.duration = step.completedAt - (step.startedAt || workflow.startedAt);
    }

    // Update estimated completion
    this.#updateEstimate(workflow);

    // Check if workflow is complete
    this.#checkCompletion(workflow);
  }

  /**
   * Get progress for a workflow.
   * @param {string} workflowId
   * @returns {Object|null}
   */
  getProgress(workflowId) {
    const workflow = this.#workflows.get(workflowId);
    if (!workflow) return null;

    const completed = workflow.steps.filter(s => s.status === 'completed').length;
    const failed = workflow.steps.filter(s => s.status === 'failed').length;
    const running = workflow.steps.filter(s => s.status === 'running').length;

    return {
      workflowId,
      totalSteps: workflow.totalSteps,
      completed,
      failed,
      running,
      pending: workflow.totalSteps - completed - failed - running,
      percentage: Math.round((completed / workflow.totalSteps) * 100),
      status: workflow.completedAt ? 'completed' : 'running',
      startedAt: workflow.startedAt,
      completedAt: workflow.completedAt,
      estimatedCompletion: workflow.estimatedCompletion,
      steps: workflow.steps.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        duration: s.duration,
        error: s.error,
      })),
    };
  }

  /**
   * Get summary for all tracked workflows.
   * @returns {Object[]}
   */
  getAllProgress() {
    return Array.from(this.#workflows.keys()).map(id => this.getProgress(id));
  }

  /**
   * Get metrics for a workflow.
   * @param {string} workflowId
   * @returns {Object|null}
   */
  getMetrics(workflowId) {
    const workflow = this.#workflows.get(workflowId);
    if (!workflow) return null;

    const completedSteps = workflow.steps.filter(s => s.duration !== null);
    const avgDuration = completedSteps.length > 0
      ? completedSteps.reduce((sum, s) => sum + s.duration, 0) / completedSteps.length
      : 0;

    return {
      workflowId,
      totalDuration: workflow.completedAt
        ? workflow.completedAt - workflow.startedAt
        : Date.now() - workflow.startedAt,
      averageStepDuration: Math.round(avgDuration),
      stepsCompleted: completedSteps.length,
      stepsFailed: workflow.steps.filter(s => s.status === 'failed').length,
      throughput: avgDuration > 0 ? Math.round(1000 / avgDuration) : 0,
    };
  }

  /**
   * Update estimated completion time.
   */
  #updateEstimate(workflow) {
    const completedSteps = workflow.steps.filter(s => s.duration !== null);
    if (completedSteps.length === 0) return;

    const avgDuration = completedSteps.reduce((sum, s) => sum + s.duration, 0) / completedSteps.length;
    const remaining = workflow.steps.filter(
      s => s.status === 'pending' || s.status === 'running'
    ).length;

    workflow.estimatedCompletion = Date.now() + (avgDuration * remaining);
  }

  /**
   * Check if workflow is complete.
   */
  #checkCompletion(workflow) {
    const allDone = workflow.steps.every(
      s => ['completed', 'failed', 'skipped', 'cancelled'].includes(s.status)
    );

    if (allDone && !workflow.completedAt) {
      workflow.completedAt = Date.now();
    }
  }

  /**
   * Clear a workflow from tracking.
   * @param {string} workflowId
   */
  clearWorkflow(workflowId) {
    this.#workflows.delete(workflowId);
  }

  /**
   * Reset all tracking data.
   */
  reset() {
    this.#workflows.clear();
  }
}
