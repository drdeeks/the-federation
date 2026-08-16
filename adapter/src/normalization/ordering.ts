/**
 * Ordering — preserves correlation + out-of-order metadata. NO policy, NO host UI.
 *
 * Rule (blueprint §6): sequence is monotonic per (agent_id, session_id).
 * Out-of-order events are auditable but do not advance state.
 */

import type { NormalizedEvent } from "../contracts.js";

export class Ordering {
  private readonly lastSeq = new Map<string, number>();

  private key(agentId: string, sessionId: string): string {
    return `${agentId}:${sessionId}`;
  }

  /**
   * Returns "ok" if the sequence is the expected next value,
   * "out_of_order" if it is stale/duplicate-of-ahead, "first" if unseen.
   */
  classify(event: NormalizedEvent): "first" | "ok" | "out_of_order" {
    const k = this.key(event.agent_id, event.session_id);
    const last = this.lastSeq.get(k);
    if (last === undefined) {
      this.lastSeq.set(k, event.sequence);
      return "first";
    }
    if (event.sequence === last + 1) {
      this.lastSeq.set(k, event.sequence);
      return "ok";
    }
    // stale (sequence <= last) OR ahead-of-expected (sequence > last + 1):
    // do NOT advance state in either case.
    return "out_of_order";
  }
}
