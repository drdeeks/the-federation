/**
 * HTTP transport to Watchtower — bridges normalized events into the verified
 * WatchtowerClient.emitEvent surface. Contains NO Character Kit enforcement logic.
 *
 * The actual signing + delivery is delegated to @federation-watchtower/sdk.
 */

import type { Transport } from "./transport.js";
import type { NormalizedEvent } from "../contracts.js";
import type { WatchtowerClientHandle } from "../bridge/watchtower.js";
import type { OperationalEventType } from "@federation-watchtower/sdk";

export function createHttpTransport(handle: WatchtowerClientHandle, projectId: string, agentId: string): Transport {
  return {
    async send(event: NormalizedEvent): Promise<void> {
      await handle.emit({
        schemaVersion: "2026-07-17",
        eventId: event.event_id,
        projectId,
        agentId,
        eventType: mapEventType(event.event_type),
        severity: severityFor(event),
        statement: event.decision_reason ?? event.habit_summary ?? event.event_type,
        occurredAt: event.timestamp,
        metadata: {
          correlationId: event.correlation_id,
          sequence: event.sequence,
          enforcementState: event.enforcement_state,
          source: event.source,
          evidence: event.evidence,
        },
      });
    },
    isConnected(): boolean {
      return handle.isConnected();
    },
  };
}

/** Map our normalized event type onto the Watchtower OperationalEventType vocabulary. */
function mapEventType(t: NormalizedEvent["event_type"]): OperationalEventType {
  switch (t) {
    case "character.enforcement.allowed":
      return "tool.authorized";
    case "character.enforcement.checked":
      return "run.started";
    case "character.enforcement.blocked":
      return "policy.blocked";
    case "character.habit.injected":
    case "character.habit.acknowledged":
      return "tool.authorized";
    case "event.delivered":
      return "run.completed";
    case "event.duplicate":
      return "loop.duplicate_detected";
    case "event.out_of_order":
      return "loop.depth_exceeded";
    default:
      return "run.completed";
  }
}

function severityFor(event: NormalizedEvent): "info" | "success" | "warning" | "error" | "critical" {
  if (event.enforcement_state === "blocked") return "warning";
  if (event.enforcement_state === "allowed") return "success";
  return "info";
}
