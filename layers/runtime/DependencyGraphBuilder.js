// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// DependencyGraphBuilder — constructs DAGs from workflow steps.
// Detects cycles, computes topological order, and validates dependencies.

export class DependencyGraphBuilder {
  #steps = [];
  #adjacency = new Map();
  #inDegree = new Map();

  /**
   * Build a dependency graph from an array of steps.
   * @param {Object[]} steps - Array of step objects with id and depends_on fields
   * @returns {DependencyGraphBuilder} this instance for chaining
   * @throws {Error} if circular dependency detected
   */
  build(steps) {
    this.#steps = [...steps];
    this.#adjacency.clear();
    this.#inDegree.clear();

    // Initialize all nodes
    for (const step of steps) {
      this.#adjacency.set(step.id, []);
      this.#inDegree.set(step.id, 0);
    }

    // Build edges from depends_on
    for (const step of steps) {
      const deps = step.depends_on || [];
      for (const dep of deps) {
        if (!this.#adjacency.has(dep)) {
          throw new Error(
            `Step "${step.id}" depends on unknown step "${dep}". ` +
            `All dependency targets must exist in the step list.`
          );
        }
        this.#adjacency.get(dep).push(step.id);
        this.#inDegree.set(step.id, (this.#inDegree.get(step.id) || 0) + 1);
      }
    }

    // Detect cycles using Kahn's algorithm
    this.#detectCycles();

    return this;
  }

  /**
   * Get topological order of steps (execution order respecting dependencies).
   * @returns {string[]} Array of step IDs in valid execution order
   */
  getTopologicalOrder() {
    const queue = [];
    const inDegree = new Map(this.#inDegree);
    const order = [];

    // Find all nodes with no incoming edges
    for (const [node, degree] of inDegree) {
      if (degree === 0) queue.push(node);
    }

    while (queue.length > 0) {
      const node = queue.shift();
      order.push(node);

      for (const neighbor of this.#adjacency.get(node) || []) {
        const newDegree = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    return order;
  }

  /**
   * Get all ready-to-execute steps (all dependencies satisfied).
   * @param {Set<string>} completedSteps - Set of completed step IDs
   * @returns {string[]} Array of ready step IDs
   */
  getReadySteps(completedSteps) {
    const ready = [];
    for (const step of this.#steps) {
      if (completedSteps.has(step.id)) continue;
      const deps = step.depends_on || [];
      if (deps.every(dep => completedSteps.has(dep))) {
        ready.push(step.id);
      }
    }
    return ready;
  }

  /**
   * Get direct dependencies of a step.
   * @param {string} stepId
   * @returns {string[]}
   */
  getDependencies(stepId) {
    const step = this.#steps.find(s => s.id === stepId);
    return step ? [...(step.depends_on || [])] : [];
  }

  /**
   * Get all downstream steps (transitive dependents).
   * @param {string} stepId
   * @returns {string[]}
   */
  getDependents(stepId) {
    const visited = new Set();
    const queue = [...(this.#adjacency.get(stepId) || [])];

    while (queue.length > 0) {
      const node = queue.shift();
      if (!visited.has(node)) {
        visited.add(node);
        queue.push(...(this.#adjacency.get(node) || []));
      }
    }

    return [...visited];
  }

  /**
   * Check if the graph has any cycles.
   * @returns {boolean}
   */
  hasCycles() {
    try {
      this.#detectCycles();
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Detect cycles using Kahn's algorithm.
   * @throws {Error} with cycle path if cycle detected
   */
  #detectCycles() {
    const inDegree = new Map(this.#inDegree);
    const queue = [];
    let count = 0;

    for (const [node, degree] of inDegree) {
      if (degree === 0) queue.push(node);
    }

    while (queue.length > 0) {
      const node = queue.shift();
      count++;

      for (const neighbor of this.#adjacency.get(node) || []) {
        const newDegree = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    if (count !== this.#steps.length) {
      // Find cycle path for error message
      const cycleNodes = [];
      for (const [node, degree] of inDegree) {
        if (degree > 0) cycleNodes.push(node);
      }
      throw new Error(
        `Circular dependency detected in step chain: ${cycleNodes.join(' → ')}`
      );
    }
  }

  /**
   * Get the graph as an adjacency list.
   * @returns {Object}
   */
  toObject() {
    const result = {};
    for (const [node, neighbors] of this.#adjacency) {
      result[node] = [...neighbors];
    }
    return result;
  }

  /**
   * Get step details by ID.
   * @param {string} stepId
   * @returns {Object|null}
   */
  getStep(stepId) {
    return this.#steps.find(s => s.id === stepId) || null;
  }
}
