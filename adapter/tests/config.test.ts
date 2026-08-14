import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig } from "../src/config.ts";

test("resolveConfig throws without ingestion secret", () => {
  delete process.env.WATCHTOWER_INGESTION_SECRET;
  delete process.env.BRIDGE_PROJECT_ID;
  delete process.env.BRIDGE_AGENT_ID;
  assert.throws(() => resolveConfig({ watchtowerGateway: "https://x.test" }), /watchtowerIngestionSecret is required/);
});

test("resolveConfig succeeds with explicit values", () => {
  const cfg = resolveConfig({
    watchtowerGateway: "https://fapi.test",
    watchtowerIngestionSecret: "secret",
    projectId: "p1",
    agentId: "a1",
  });
  assert.equal(cfg.watchtowerGateway, "https://fapi.test");
  assert.equal(cfg.projectId, "p1");
  assert.equal(cfg.agentId, "a1");
  assert.equal(cfg.maxRetries, 5);
});
