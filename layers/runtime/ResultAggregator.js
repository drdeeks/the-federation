// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// ResultAggregator — merges outputs from parallel workflow steps.
// Handles data conflicts between parallel branches.

export class ResultAggregator {
  #conflictStrategy;

  /**
   * @param {Object} options
   * @param {string} options.conflictStrategy - 'last-write-wins' | 'require-merge' | 'conflict-flag'
   */
  constructor(options = {}) {
    this.#conflictStrategy = options.conflictStrategy ?? 'conflict-flag';
  }

  /**
   * Aggregate results from completed steps.
   * @param {Object[]} steps - Array of step results with id, status, result fields
   * @returns {{ aggregated: Object, conflicts: string[] }}
   */
  aggregate(steps) {
    const aggregated = {};
    const conflicts = [];
    const seen = new Map();

    for (const step of steps) {
      if (step.status !== 'completed' || !step.result) continue;

      const stepResult = step.result;

      // Check for field-level conflicts
      for (const [key, value] of Object.entries(stepResult)) {
        if (seen.has(key)) {
          const previous = seen.get(key);
          if (JSON.stringify(previous.value) !== JSON.stringify(value)) {
            // Conflict detected
            const conflictKey = `${step.id}:${key}`;
            conflicts.push(conflictKey);

            switch (this.#conflictStrategy) {
              case 'last-write-wins':
                aggregated[key] = value;
                break;
              case 'require-merge':
                // Keep both values in an array
                aggregated[key] = Array.isArray(previous.value)
                  ? [...previous.value, value]
                  : [previous.value, value];
                break;
              case 'conflict-flag':
              default:
                // Mark the conflict but keep the first value
                aggregated[`_conflict_${key}`] = {
                  step1: previous.stepId,
                  step2: step.id,
                  value1: previous.value,
                  value2: value,
                };
                break;
            }
          }
        } else {
          aggregated[key] = value;
          seen.set(key, { value, stepId: step.id });
        }
      }
    }

    return { aggregated, conflicts };
  }

  /**
   * Aggregate step results with metadata.
   * @param {Object[]} steps
   * @returns {Object}
   */
  aggregateWithMetadata(steps) {
    const { aggregated, conflicts } = this.aggregate(steps);

    const completed = steps.filter(s => s.status === 'completed');
    const failed = steps.filter(s => s.status === 'failed');
    const skipped = steps.filter(s => s.status === 'skipped');

    return {
      result: aggregated,
      conflicts,
      metadata: {
        totalSteps: steps.length,
        completed: completed.length,
        failed: failed.length,
        skipped: skipped.length,
        hasConflicts: conflicts.length > 0,
        strategy: this.#conflictStrategy,
        aggregatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Check if there are conflicts that need manual resolution.
   * @param {string[]} conflicts
   * @returns {boolean}
   */
  requiresManualResolution(conflicts) {
    return this.#conflictStrategy === 'conflict-flag' && conflicts.length > 0;
  }

  /**
   * Get conflict details for manual review.
   * @param {Object[]} steps
   * @returns {Object[]}
   */
  getConflictDetails(steps) {
    const details = [];
    const seen = new Map();

    for (const step of steps) {
      if (step.status !== 'completed' || !step.result) continue;

      for (const [key, value] of Object.entries(step.result)) {
        if (seen.has(key)) {
          const previous = seen.get(key);
          if (JSON.stringify(previous.value) !== JSON.stringify(value)) {
            details.push({
              field: key,
              step1: { id: previous.stepId, value: previous.value },
              step2: { id: step.id, value },
            });
          }
        } else {
          seen.set(key, { value, stepId: step.id });
        }
      }
    }

    return details;
  }

  /**
   * Get the conflict strategy.
   * @returns {string}
   */
  getStrategy() {
    return this.#conflictStrategy;
  }
}
