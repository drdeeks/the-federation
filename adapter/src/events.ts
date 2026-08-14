/**
 * Normalized event constants — names + helpers only.
 *
 * Contains NO vendor-specific payloads, NO transport code, NO habit policy.
 */

import type { NormalizedEvent, NormalizedEventType } from "./contracts.js";

export const EVENT_TYPES: readonly NormalizedEventType[] = [
  "character.enforcement.checked",
  "character.enforcement.allowed",
  "character.enforcement.blocked",
  "character.habit.injected",
  "character.habit.acknowledged",
  "event.delivered",
  "event.duplicate",
  "event.out_of_order",
];

function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Construct a normalized event with sensible defaults.
 * `event_id` is globally unique; `sequence` is set by the caller's ordering tracker.
 */
export function makeEvent(partial: Partial<NormalizedEvent> & {
  event_type: NormalizedEventType;
  agent_id: string;
  session_id: string;
  correlation_id: string;
  sequence: number;
}): NormalizedEvent {
  return {
    event_id: partial.event_id ?? randomId(),
    timestamp: partial.timestamp ?? new Date().toISOString(),
    source: partial.source ?? "bridge",
    enforcement_state: partial.enforcement_state ?? "checked",
    transport: partial.transport ?? "unknown",
    evidence: partial.evidence ?? {},
    ...partial,
  };
}
