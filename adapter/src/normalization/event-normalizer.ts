/**
 * Event normalizer — converts Character Kit enforcement output into a
 * normalized bridge event. NO network I/O, NO policy logic.
 *
 * Input shape mirrors the verified Python Enforcer.execute_tool result
 * (python/agent_character_kit/enforcer.py:106): decision + audit evidence.
 */

import type { EnforcementResult, NormalizedEvent } from "../contracts.js";
import { makeEvent } from "../events.js";

export function enforcementToEvent(
  result: EnforcementResult,
  ctx: { agent_id: string; session_id: string; correlation_id: string; sequence: number },
): NormalizedEvent {
  const state = result.decision === "allowed" ? "allowed" : "blocked";
  return makeEvent({
    event_type: state === "allowed" ? "character.enforcement.allowed" : "character.enforcement.blocked",
    agent_id: ctx.agent_id,
    session_id: ctx.session_id,
    correlation_id: ctx.correlation_id,
    sequence: ctx.sequence,
    source: "character-kit",
    enforcement_state: state,
    habit_id: result.habit_id,
    habit_summary: result.habit_summary,
    ack_text: result.ack_text,
    decision_reason: result.decision_reason,
    evidence: result.evidence,
  });
}

/** Map a habit injection into a normalized event. */
export function habitInjectedToEvent(
  habitId: string,
  summary: string,
  ctx: { agent_id: string; session_id: string; correlation_id: string; sequence: number },
): NormalizedEvent {
  return makeEvent({
    event_type: "character.habit.injected",
    agent_id: ctx.agent_id,
    session_id: ctx.session_id,
    correlation_id: ctx.correlation_id,
    sequence: ctx.sequence,
    source: "character-kit",
    enforcement_state: "checked",
    habit_id: habitId,
    habit_summary: summary,
  });
}
