/**
 * Public bridge API surface — exports ONLY the public API.
 *
 * Contains NO transport implementation, NO habit logic, NO Watchtower policy,
 * NO Character Kit daemon details.
 */

import { createBridge, type FullBridge } from "./adapter.js";
import { resolveConfig, type RawConfigInput } from "./config.js";
import type { BridgeConfig } from "./contracts.js";

export { createBridge } from "./adapter.js";
export type { FullBridge, AdapterContext } from "./adapter.js";
export { resolveConfig } from "./config.js";
export type { RawConfigInput } from "./config.js";
export type { BridgeConfig, NormalizedEvent, NormalizedEventType, BridgeStatus, EnforcementResult, WatchtowerState } from "./contracts.js";
export { classifyFailure, isRetryable } from "./failure.js";
export type { FailureKind, FailureDecision } from "./failure.js";
export { makeEvent, EVENT_TYPES } from "./events.js";
export { enforcementToEvent, habitInjectedToEvent } from "./normalization/event-normalizer.js";
export { Deduper } from "./normalization/dedupe.js";
export { Ordering } from "./normalization/ordering.js";

/** Convenience: build + start in one call. */
export async function createBridgeAndStart(input: RawConfigInput = {}): Promise<FullBridge> {
  const config: BridgeConfig = resolveConfig(input);
  const bridge = createBridge(config);
  await bridge.start();
  return bridge;
}
