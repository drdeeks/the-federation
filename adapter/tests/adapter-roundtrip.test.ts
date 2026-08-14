import { test } from "node:test";
import assert from "node:assert/strict";
import { createBridge } from "../src/adapter.ts";
import { resolveConfig } from "../src/config.ts";
import { classifyFailure, isRetryable } from "../src/failure.ts";

function testConfig() {
  return resolveConfig({
    watchtowerGateway: "https://fapi.test",
    watchtowerIngestionSecret: "secret",
    projectId: "p1",
    agentId: "a1",
  });
}

test("createBridge exposes the tiny public API + internals", () => {
  const b = createBridge(testConfig());
  for (const m of ["start", "stop", "status", "gateAction", "emitEvent", "sendHeartbeat", "checkHabit", "submitAcknowledgement"]) {
    assert.equal(typeof (b as any)[m], "function", `missing ${m}`);
  }
});

test("Character Kit unavailable => gateAction throws (fail-closed)", async () => {
  const b = createBridge(testConfig());
  // The stub CK client throws on every call (unavailable).
  await assert.rejects(() => (b as any).gateAction("bash", { command: "rm -rf /" }), /character-kit unavailable/);
});

test("fail-closed: character_kit_unavailable blocks; watchtower_unavailable retries", () => {
  const ckDown = classifyFailure(new Error("character kit unavailable"));
  assert.equal(ckDown.blockAction, true);
  assert.equal(isRetryable(ckDown), false);

  const wtDown = classifyFailure(Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" }));
  assert.equal(wtDown.blockAction, false);
  assert.equal(isRetryable(wtDown), true);
});
