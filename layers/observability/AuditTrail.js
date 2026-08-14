// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// AuditTrail — compliance logging for workflow approvals and actions.
// Stores audit events with timestamps, actors, and action details.

export class AuditTrail {
  #events = [];
  #maxEvents;

  constructor({ maxEvents = 10000, storage = null } = {}) {
    this.#maxEvents = maxEvents;
    this.storage = storage; // Optional external storage adapter
  }

  /**
   * Log an audit event.
   * @param {Object} event
   * @param {string} event.action - What happened
   * @param {string} event.chainId - Associated chain/workflow ID
   * @param {string} [event.actor] - Who did it
   * @param {Object} [event.data] - Additional context
   * @returns {Promise<Object>} The recorded event
   */
  async log(event) {
    const record = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: event.timestamp || new Date().toISOString(),
      action: event.action,
      chainId: event.chainId,
      actor: event.actor || 'system',
      data: event.data || {},
      ...event,
    };

    this.#events.push(record);

    // Trim if over limit
    if (this.#events.length > this.#maxEvents) {
      this.#events = this.#events.slice(-this.#maxEvents);
    }

    // Persist to external storage if configured
    if (this.storage?.write) {
      try {
        await this.storage.write(record);
      } catch { /* storage failure shouldn't break audit */ }
    }

    return record;
  }

  /**
   * Query audit events.
   * @param {Object} filter - { chainId, action, actor, since, until }
   * @param {number} limit - Max results
   * @returns {Array<Object>}
   */
  query(filter = {}, limit = 100) {
    let results = [...this.#events];

    if (filter.chainId) results = results.filter(e => e.chainId === filter.chainId);
    if (filter.action) results = results.filter(e => e.action === filter.action);
    if (filter.actor) results = results.filter(e => e.actor === filter.actor);
    if (filter.since) results = results.filter(e => e.timestamp >= filter.since);
    if (filter.until) results = results.filter(e => e.timestamp <= filter.until);

    return results.slice(-limit);
  }

  /**
   * Get all events for a chain.
   */
  getChainHistory(chainId) {
    return this.query({ chainId });
  }

  /**
   * Get event count.
   */
  count() {
    return this.#events.length;
  }

  /**
   * Clear all events.
   */
  clear() {
    this.#events = [];
  }
}
