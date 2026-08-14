/**
 * Failure model — the non-negotiable part of the bridge.
 *
 * Contains ONLY failure classification + fail-closed policy.
 * No transport implementation. No policy decisions outside the failure model.
 *
 * Core rule (from blueprint §8): delivery failure never grants permission.
 * Character Kit stays fail-closed; the bridge queues/retries but never
 * derives an allow from a Watchtower outage.
 */

export type FailureKind =
  | "watchtower_unavailable"
  | "character_kit_unavailable"
  | "adapter_crash"
  | "socket_lost"
  | "network_lost"
  | "event_undeliverable"
  | "event_duplicate"
  | "event_out_of_order"
  | "unknown";

export interface FailureDecision {
  kind: FailureKind;
  /** When true, the action MUST be blocked regardless of any other signal. */
  blockAction: boolean;
  /** When true, the bridge may queue/retry local delivery. */
  retrySafe: boolean;
  /** Human-readable, redacted-safe reason. */
  reason: string;
}

/**
 * Classify a failure into a fail-closed decision.
 * The default is always block — permissive fallback is forbidden.
 */
export function classifyFailure(err: unknown): FailureDecision {
  const kind = inferKind(err);
  switch (kind) {
    case "character_kit_unavailable":
    case "socket_lost":
      // No Character Kit = cannot authorize. Block.
      return { kind, blockAction: true, retrySafe: false, reason: "character-kit unavailable; action blocked" };
    case "watchtower_unavailable":
    case "network_lost":
    case "event_undeliverable":
      // Watchtower down = queue/retry, Character Kit stays fail-closed.
      return { kind, blockAction: false, retrySafe: true, reason: "watchtower unreachable; queueing, no release" };
    case "adapter_crash":
      // Adapter gone = Character Kit continues independently; no release inferred.
      return { kind, blockAction: true, retrySafe: false, reason: "adapter crashed; no release signal" };
    case "event_duplicate":
      return { kind, blockAction: false, retrySafe: false, reason: "duplicate suppressed" };
    case "event_out_of_order":
      return { kind, blockAction: false, retrySafe: false, reason: "out-of-order preserved for audit; no state advance" };
    default:
      return { kind: "unknown", blockAction: true, retrySafe: false, reason: "unclassified failure; fail-closed" };
  }
}

function inferKind(err: unknown): FailureKind {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.code === "string") {
      if (e.code === "ECONNREFUSED" || e.code === "ENOTFOUND") return "watchtower_unavailable";
      if (e.code === "ENOENT" || e.code === "ECONNRESET") return "socket_lost";
    }
    if (e.kind && typeof e.kind === "string") return e.kind as FailureKind;
  }
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (m.includes("character") && m.includes("unavailable")) return "character_kit_unavailable";
    if (m.includes("watchtower") || m.includes("network") || m.includes("fetch")) return "watchtower_unavailable";
  }
  return "unknown";
}

/** True iff a delivery attempt may be retried without violating fail-closed. */
export function isRetryable(decision: FailureDecision): boolean {
  return decision.retrySafe && !decision.blockAction;
}
