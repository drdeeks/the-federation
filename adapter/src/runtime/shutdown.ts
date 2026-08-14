/**
 * Graceful teardown — no enforcement decisions, no event schema definitions.
 */

import type { FullBridge } from "../adapter.js";

export async function gracefulShutdown(bridge: FullBridge): Promise<void> {
  // Best-effort: stop accepting, flush is handled by transport idempotency.
  await bridge.stop();
}
