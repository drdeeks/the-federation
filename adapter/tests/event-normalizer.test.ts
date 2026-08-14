import { test } from "node:test";
import assert from "node:assert/strict";
import { enforcementToEvent, habitInjectedToEvent } from "../src/normalization/event-normalizer.ts";
import { Deduper } from "../src/normalization/dedupe.ts";
import { Ordering } from "../src/normalization/ordering.ts";

const ctx = { agent_id: "a1", session_id: "s1", correlation_id: "c1", sequence: 1 };

test("enforcementToEvent maps allowed -> character.enforcement.allowed", () => {
  const ev = enforcementToEvent({ decision: "allowed", habit_id: "h1", evidence: { x: 1 } }, ctx);
  assert.equal(ev.event_type, "character.enforcement.allowed");
  assert.equal(ev.enforcement_state, "allowed");
  assert.equal(ev.habit_id, "h1");
});

test("enforcementToEvent maps blocked -> character.enforcement.blocked", () => {
  const ev = enforcementToEvent({ decision: "blocked", decision_reason: "secret leak" }, ctx);
  assert.equal(ev.event_type, "character.enforcement.blocked");
  assert.equal(ev.enforcement_state, "blocked");
});

test("habitInjectedToEvent maps to character.habit.injected", () => {
  const ev = habitInjectedToEvent("h2", "be concise", ctx);
  assert.equal(ev.event_type, "character.habit.injected");
});

test("Deduper suppresses by event_id then correlation+sequence", () => {
  const d = new Deduper();
  const e1 = enforcementToEvent({ decision: "allowed" }, ctx);
  const e2 = { ...e1 };
  const e3 = enforcementToEvent({ decision: "allowed" }, { ...ctx, sequence: 1 });
  assert.equal(d.isDuplicate(e1), false);
  assert.equal(d.isDuplicate(e2), true, "same event_id is duplicate");
  assert.equal(d.isDuplicate(e3), true, "same agent/session/correlation/sequence is duplicate");
});

test("Ordering flags out-of-order without advancing state", () => {
  const o = new Ordering();
  assert.equal(o.classify(enforcementToEvent({ decision: "allowed" }, { ...ctx, sequence: 1 })), "first");
  assert.equal(o.classify(enforcementToEvent({ decision: "allowed" }, { ...ctx, sequence: 2 })), "ok");
  // stale sequence 1 again -> out_of_order
  assert.equal(o.classify(enforcementToEvent({ decision: "allowed" }, { ...ctx, sequence: 1 })), "out_of_order");
});
