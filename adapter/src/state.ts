/**
 * State — tracks correlation, retry, dedupe, ordering state.
 *
 * Contains NO habit definitions, NO Watchtower authorization logic.
 */

import { Deduper } from "./normalization/dedupe.js";
import { Ordering } from "./normalization/ordering.js";

export class BridgeState {
  readonly dedupe = new Deduper();
  readonly ordering = new Ordering();
  private retryCount = new Map<string, number>();

  bumpRetry(correlationId: string): number {
    const n = (this.retryCount.get(correlationId) ?? 0) + 1;
    this.retryCount.set(correlationId, n);
    return n;
  }

  getRetry(correlationId: string): number {
    return this.retryCount.get(correlationId) ?? 0;
  }
}
