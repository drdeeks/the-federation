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

// MOD-004: canonical tokens are optional -- absence must never throw, and
// must never be silently required alongside the legacy secret.
test("resolveConfig succeeds with no canonical tokens configured (legacy-only, zero regression)", () => {
  delete process.env.WATCHTOWER_AGENT_TOKEN;
  delete process.env.WATCHTOWER_OWNER_TOKEN;
  const cfg = resolveConfig({
    watchtowerGateway: "https://fapi.test",
    watchtowerIngestionSecret: "secret",
    projectId: "p1",
    agentId: "a1",
  });
  assert.equal(cfg.watchtowerAgentToken, undefined);
  assert.equal(cfg.watchtowerOwnerToken, undefined);
});

test("resolveConfig picks up canonical tokens from explicit input", () => {
  const cfg = resolveConfig({
    watchtowerGateway: "https://fapi.test",
    watchtowerIngestionSecret: "secret",
    projectId: "p1",
    agentId: "a1",
    watchtowerAgentToken: "fw_agent_explicit",
    watchtowerOwnerToken: "fw_owner_explicit",
  });
  assert.equal(cfg.watchtowerAgentToken, "fw_agent_explicit");
  assert.equal(cfg.watchtowerOwnerToken, "fw_owner_explicit");
});

test("resolveConfig picks up canonical tokens from environment variables", () => {
  process.env.WATCHTOWER_AGENT_TOKEN = "fw_agent_env";
  process.env.WATCHTOWER_OWNER_TOKEN = "fw_owner_env";
  try {
    const cfg = resolveConfig({
      watchtowerGateway: "https://fapi.test",
      watchtowerIngestionSecret: "secret",
      projectId: "p1",
      agentId: "a1",
    });
    assert.equal(cfg.watchtowerAgentToken, "fw_agent_env");
    assert.equal(cfg.watchtowerOwnerToken, "fw_owner_env");
  } finally {
    delete process.env.WATCHTOWER_AGENT_TOKEN;
    delete process.env.WATCHTOWER_OWNER_TOKEN;
  }
});
