/**
 * Dedupe — idempotency + duplicate suppression. NO transport, NO enforcement policy.
 *
 * Rule (blueprint §6): dedupe by event_id, then correlation_id + sequence.
 * Duplicates are no-ops.
 */

import type { NormalizedEvent } from "../contracts.js";

export class Deduper {
  private readonly seen = new Set<string>();
  private readonly seqSeen = new Set<string>();

  /**
   * Returns true if this event is a duplicate and should be suppressed.
   * Records the signature on first sight.
   */
  isDuplicate(event: NormalizedEvent): boolean {
    if (this.seen.has(event.event_id)) return true;
    const seqKey = `${event.agent_id}:${event.session_id}:${event.correlation_id}:${event.sequence}`;
    if (this.seqSeen.has(seqKey)) return true;
    this.seen.add(event.event_id);
    this.seqSeen.add(seqKey);
    return false;
  }

  reset(): void {
    this.seen.clear();
    this.seqSeen.clear();
  }
}
