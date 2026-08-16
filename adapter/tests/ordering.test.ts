import { test } from "node:test";
import assert from "node:assert/strict";
import { Ordering } from "../src/normalization/ordering.ts";
import type { NormalizedEvent } from "../src/contracts.ts";

function makeEvent(agentId: string, sessionId: string, sequence: number): NormalizedEvent {
  return {
    event_id: `evt-${sequence}`,
    agent_id: agentId,
    session_id: sessionId,
    correlation_id: `corr-${agentId}-${sessionId}`,
    sequence,
    timestamp: new Date().toISOString(),
    source: "character_kit",
    action_type: "tool_execution",
    status: "completed",
    payload: {},
    provenance_ref: `prov-${sequence}`,
  };
}

test("Ordering: regression - future sequence must NOT advance state", () => {
  const ordering = new Ordering();
  const agentId = "test-agent";
  const sessionId = "test-session";

  // sequence 1: first event
  let result = ordering.classify(makeEvent(agentId, sessionId, 1));
  assert.equal(result, "first", "sequence 1 should be 'first'");

  // sequence 5: future event - MUST return out_of_order AND NOT advance state
  result = ordering.classify(makeEvent(agentId, sessionId, 5));
  assert.equal(result, "out_of_order", "sequence 5 should be 'out_of_order'");
  // CRITICAL: state must remain at 1, not advance to 5

  // sequence 2: should now be accepted (next expected after 1)
  result = ordering.classify(makeEvent(agentId, sessionId, 2));
  assert.equal(result, "ok", "sequence 2 should be 'ok' after state remained at 1");

  // sequence 3: should be accepted
  result = ordering.classify(makeEvent(agentId, sessionId, 3));
  assert.equal(result, "ok", "sequence 3 should be 'ok'");

  // sequence 4: should be accepted
  result = ordering.classify(makeEvent(agentId, sessionId, 4));
  assert.equal(result, "ok", "sequence 4 should be 'ok'");

  // sequence 5: should now be accepted (next expected after 4)
  result = ordering.classify(makeEvent(agentId, sessionId, 5));
  assert.equal(result, "ok", "sequence 5 should be 'ok' after catching up");
});

test("Ordering: stale sequence must NOT advance state", () => {
  const ordering = new Ordering();
  const agentId = "test-agent";
  const sessionId = "test-session";

  // sequence 1
  ordering.classify(makeEvent(agentId, sessionId, 1));
  // sequence 2
  ordering.classify(makeEvent(agentId, sessionId, 2));

  // sequence 1 again (stale duplicate)
  let result = ordering.classify(makeEvent(agentId, sessionId, 1));
  assert.equal(result, "out_of_order", "stale sequence 1 should be 'out_of_order'");

  // sequence 3 should still be accepted
  result = ordering.classify(makeEvent(agentId, sessionId, 3));
  assert.equal(result, "ok", "sequence 3 should be 'ok' after stale event");
});

test("Ordering: sequence exactly last + 1 advances state", () => {
  const ordering = new Ordering();
  const agentId = "test-agent";
  const sessionId = "test-session";

  ordering.classify(makeEvent(agentId, sessionId, 1));
  ordering.classify(makeEvent(agentId, sessionId, 2));

  const result = ordering.classify(makeEvent(agentId, sessionId, 3));
  assert.equal(result, "ok", "sequence 3 should be 'ok'");
});

test("Ordering: first event for new agent/session starts at its sequence", () => {
  const ordering = new Ordering();

  let result = ordering.classify(makeEvent("agent-a", "session-1", 10));
  assert.equal(result, "first", "first event for agent-a/session-1 at sequence 10 should be 'first'");

  result = ordering.classify(makeEvent("agent-b", "session-1", 5));
  assert.equal(result, "first", "first event for agent-b/session-1 at sequence 5 should be 'first'");

  result = ordering.classify(makeEvent("agent-a", "session-2", 1));
  assert.equal(result, "first", "first event for agent-a/session-2 at sequence 1 should be 'first'");
});

test("Ordering: independent agent/session tracks do not interfere", () => {
  const ordering = new Ordering();

  ordering.classify(makeEvent("agent-a", "session-1", 1));
  ordering.classify(makeEvent("agent-a", "session-1", 2));

  // agent-b/session-1 should start fresh
  let result = ordering.classify(makeEvent("agent-b", "session-1", 1));
  assert.equal(result, "first", "agent-b/session-1 should be independent");

  ordering.classify(makeEvent("agent-b", "session-1", 2));

  // agent-a/session-1 should still be at 2
  result = ordering.classify(makeEvent("agent-a", "session-1", 3));
  assert.equal(result, "ok", "agent-a/session-1 should be at 3");
});