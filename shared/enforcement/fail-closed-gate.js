/**
 * shared/enforcement/fail-closed-gate.js
 *
 * A reusable, submission-side enforcement gate. It does NOT implement a second
 * enforcement engine (Character Kit is the single source of truth). It is a
 * thin wrapper that calls the Character Kit enforcer client and FAILS CLOSED:
 * if the enforcer is unreachable or returns anything other than an explicit
 * ALLOW, the action is blocked.
 *
 * Provenance: pattern from `agent-identity-kit` (`.trash/agent-identity-kit`,
 * the predecessor of `@drdeeks/character-kit`). The AIK contract: daemon down →
 * client blocks; no config → embedded defaults still enforce.
 *
 * This module is storage/transport-agnostic: pass in a `gate(action)` function
 * that talks to your Character Kit client (Unix socket or TCP). The default
 * `gate` throws "unavailable" so the fail-closed behavior is real even before
 * you wire the socket.
 */

/**
 * @param {Object} opts
 * @param {string} opts.agentId - identity of the agent making the request
 * @param {(action: object) => Promise<{decision: 'allow'|'deny', reason?: string}>} [opts.gate]
 *        Function that calls Character Kit's enforcer. If omitted, all actions
 *        are blocked (fail-closed by default).
 * @param {boolean} [opts.dryRun] - if true, log the decision but never block
 *        (use only for observability, never for real enforcement)
 */
export function createFailClosedGate(opts = {}) {
  const agentId = opts.agentId || 'unknown-agent';
  const gate = opts.gate || (async () => {
    // Default: enforcer unavailable → block. This is the fail-closed contract.
    throw new Error('enforcer unavailable: no gate configured');
  });

  if (opts.dryRun) {
    return {
      agentId,
      async judge(action) {
        try {
          const r = await gate(action);
          return { allowed: r.decision === 'allow', reason: r.reason || '', dryRun: true };
        } catch (err) {
          // In dry-run we observe but do not block.
          return { allowed: true, reason: `DRYRUN-block-would-occur: ${err.message}`, dryRun: true };
        }
      },
    };
  }

  return {
    agentId,
    /**
     * Judge an action. Returns { allowed, reason }.
     * Never throws ALLOW; only explicit 'allow' from the enforcer passes.
     */
    async judge(action) {
      try {
        const r = await gate(action);
        if (r && r.decision === 'allow') {
          return { allowed: true, reason: r.reason || '' };
        }
        return { allowed: false, reason: r?.reason || 'enforcer denied' };
      } catch (err) {
        // Fail closed: any error (unreachable, timeout, parse) → block.
        return { allowed: false, reason: `fail-closed: ${err.message}` };
      }
    },
  };
}
