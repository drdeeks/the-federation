import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEvent, EVENT_TYPES } from "../src/events.ts";

test("makeEvent assigns a unique event_id and sane defaults", () => {
  const a = makeEvent({ event_type: "character.enforcement.checked", agent_id: "a1", session_id: "s1", correlation_id: "c1", sequence: 1 });
  const b = makeEvent({ event_type: "character.enforcement.checked", agent_id: "a1", session_id: "s1", correlation_id: "c1", sequence: 2 });
  assert.notEqual(a.event_id, b.event_id);
  assert.equal(a.source, "bridge");
  assert.equal(a.enforcement_state, "checked");
  assert.ok(a.timestamp.includes("T"));
});

test("event types are the eight required by the contract", () => {
  assert.equal(EVENT_TYPES.length, 8);
  assert.ok(EVENT_TYPES.includes("character.enforcement.blocked"));
  assert.ok(EVENT_TYPES.includes("event.out_of_order"));
});
