// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// StateMachine — manages workflow and step lifecycle states.
// Enforces valid state transitions and prevents illegal transitions.

const WORKFLOW_STATES = {
  CREATED: 'created',
  PLANNED: 'planned',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PARTIAL: 'partial',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
};

const STEP_STATES = {
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  WAITING_APPROVAL: 'waiting_approval',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
};

// Valid state transitions for workflows
const WORKFLOW_TRANSITIONS = {
  [WORKFLOW_STATES.CREATED]: [WORKFLOW_STATES.PLANNED, WORKFLOW_STATES.CANCELLED],
  [WORKFLOW_STATES.PLANNED]: [WORKFLOW_STATES.RUNNING, WORKFLOW_STATES.CANCELLED],
  [WORKFLOW_STATES.RUNNING]: [
    WORKFLOW_STATES.COMPLETED,
    WORKFLOW_STATES.FAILED,
    WORKFLOW_STATES.PARTIAL,
    WORKFLOW_STATES.CANCELLED,
    WORKFLOW_STATES.PAUSED,
  ],
  [WORKFLOW_STATES.PAUSED]: [WORKFLOW_STATES.RUNNING, WORKFLOW_STATES.CANCELLED],
  [WORKFLOW_STATES.COMPLETED]: [],
  [WORKFLOW_STATES.FAILED]: [],
  [WORKFLOW_STATES.PARTIAL]: [],
  [WORKFLOW_STATES.CANCELLED]: [],
};

// Valid state transitions for steps
const STEP_TRANSITIONS = {
  [STEP_STATES.PENDING]: [STEP_STATES.QUEUED, STEP_STATES.SKIPPED, STEP_STATES.CANCELLED],
  [STEP_STATES.QUEUED]: [STEP_STATES.RUNNING, STEP_STATES.WAITING_APPROVAL, STEP_STATES.CANCELLED],
  [STEP_STATES.RUNNING]: [
    STEP_STATES.COMPLETED,
    STEP_STATES.FAILED,
    STEP_STATES.WAITING_APPROVAL,
  ],
  [STEP_STATES.WAITING_APPROVAL]: [
    STEP_STATES.RUNNING,
    STEP_STATES.COMPLETED,
    STEP_STATES.FAILED,
    STEP_STATES.CANCELLED,
  ],
  [STEP_STATES.COMPLETED]: [],
  [STEP_STATES.FAILED]: [],
  [STEP_STATES.SKIPPED]: [],
  [STEP_STATES.CANCELLED]: [],
};

export class StateMachine {
  #workflowStates = new Map();
  #stepStates = new Map();

  /**
   * Get current workflow state.
   * @param {string} workflowId
   * @returns {string|null}
   */
  getWorkflowState(workflowId) {
    return this.#workflowStates.get(workflowId) || null;
  }

  /**
   * Get current step state.
   * @param {string} workflowId
   * @param {string} stepId
   * @returns {string|null}
   */
  getStepState(workflowId, stepId) {
    return this.#stepStates.get(`${workflowId}:${stepId}`) || null;
  }

  /**
   * Initialize a workflow in CREATED state.
   * @param {string} workflowId
   * @throws {Error} if workflow already exists
   */
  initWorkflow(workflowId) {
    if (this.#workflowStates.has(workflowId)) {
      throw new Error(`Workflow ${workflowId} already initialized`);
    }
    this.#workflowStates.set(workflowId, WORKFLOW_STATES.CREATED);
  }

  /**
   * Initialize a step in PENDING state.
   * @param {string} workflowId
   * @param {string} stepId
   */
  initStep(workflowId, stepId) {
    const key = `${workflowId}:${stepId}`;
    this.#stepStates.set(key, STEP_STATES.PENDING);
  }

  /**
   * Transition a workflow to a new state.
   * @param {string} workflowId
   * @param {string} newState
   * @returns {{ from: string, to: string }}
   * @throws {Error} if transition is invalid
   */
  transitionWorkflow(workflowId, newState) {
    const currentState = this.#workflowStates.get(workflowId);
    if (!currentState) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const validTransitions = WORKFLOW_TRANSITIONS[currentState];
    if (!validTransitions || !validTransitions.includes(newState)) {
      throw new Error(
        `Invalid workflow transition: ${currentState} -> ${newState}. ` +
        `Valid transitions: ${validTransitions?.join(', ') || 'none'}`
      );
    }

    this.#workflowStates.set(workflowId, newState);
    return { from: currentState, to: newState };
  }

  /**
   * Transition a step to a new state.
   * @param {string} workflowId
   * @param {string} stepId
   * @param {string} newState
   * @returns {{ from: string, to: string }}
   * @throws {Error} if transition is invalid
   */
  transitionStep(workflowId, stepId, newState) {
    const key = `${workflowId}:${stepId}`;
    const currentState = this.#stepStates.get(key);
    if (!currentState) {
      throw new Error(`Step ${stepId} in workflow ${workflowId} not found`);
    }

    const validTransitions = STEP_TRANSITIONS[currentState];
    if (!validTransitions || !validTransitions.includes(newState)) {
      throw new Error(
        `Invalid step transition: ${currentState} -> ${newState}. ` +
        `Valid transitions: ${validTransitions?.join(', ') || 'none'}`
      );
    }

    this.#stepStates.set(key, newState);
    return { from: currentState, to: newState };
  }

  /**
   * Check if a workflow transition is valid without performing it.
   * @param {string} workflowId
   * @param {string} newState
   * @returns {boolean}
   */
  canTransitionWorkflow(workflowId, newState) {
    const currentState = this.#workflowStates.get(workflowId);
    if (!currentState) return false;
    const validTransitions = WORKFLOW_TRANSITIONS[currentState];
    return validTransitions?.includes(newState) || false;
  }

  /**
   * Check if a step transition is valid without performing it.
   * @param {string} workflowId
   * @param {string} stepId
   * @param {string} newState
   * @returns {boolean}
   */
  canTransitionStep(workflowId, stepId, newState) {
    const key = `${workflowId}:${stepId}`;
    const currentState = this.#stepStates.get(key);
    if (!currentState) return false;
    const validTransitions = STEP_TRANSITIONS[currentState];
    return validTransitions?.includes(newState) || false;
  }

  /**
   * Get all workflow states.
   * @returns {Object}
   */
  static get STATES() {
    return WORKFLOW_STATES;
  }

  /**
   * Get all step states.
   * @returns {Object}
   */
  static get STEP_STATES() {
    return STEP_STATES;
  }

  /**
   * Reset state machine (for testing).
   */
  reset() {
    this.#workflowStates.clear();
    this.#stepStates.clear();
  }
}

export { WORKFLOW_STATES, STEP_STATES };
