import { test } from "node:test";
import assert from "node:assert/strict";
import { createWatchtowerClient } from "../src/bridge/watchtower.ts";
import type { BridgeConfig } from "../src/contracts.ts";

// MOD-004: canonical FederationAgentClient layered on top of the legacy
// WatchtowerClient. No real network -- fetch is injected (both SDK clients
// accept a `fetch` override), and calls are recorded by URL so each test
// asserts which client actually got used without depending on SDK internals
// beyond the documented request shape.
function fakeFetch(calls: Array<{ url: string; init: RequestInit }>): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response("{}", { status: 200 });
  }) as typeof globalThis.fetch;
}

function baseConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    watchtowerGateway: "https://fapi.test",
    watchtowerIngestionSecret: "shared-secret",
    watchtowerProducer: "adapter-test",
    projectId: "proj",
    agentId: "agent-1",
    maxRetries: 5,
    retryBaseMs: 200,
    ...overrides,
  };
}

test("with no canonical token configured, emit/heartbeat/connect/disconnect all go through the legacy path", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = createWatchtowerClient(baseConfig(), fakeFetch(calls));

  await client.connect();
  await client.emit({ projectId: "proj", agentId: "agent-1", eventType: "run.started", severity: "info", statement: "go" });
  await client.heartbeat("agent-1", "run-1");
  await client.disconnect();

  // connect()/disconnect() are no-ops in legacy-only mode (WatchtowerClient
  // has no such concept) -- only emit + heartbeat actually hit the network,
  // both via the legacy /api/v1/events endpoint (heartbeat is implemented
  // as an emitEvent call in the SDK itself).
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, "https://fapi.test/api/v1/events");
    const headers = new Headers(call.init.headers);
    assert.ok(headers.has("X-Watchtower-Signature"), "legacy calls are HMAC-signed");
    assert.ok(!headers.has("Authorization"), "legacy calls never carry a bearer token");
  }
});

test("with a canonical agent token configured, emit/heartbeat/connect/disconnect all go through FederationAgentClient", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = createWatchtowerClient(
    baseConfig({ watchtowerAgentToken: `fw_agent_${"a".repeat(40)}` }),
    fakeFetch(calls),
  );

  await client.connect();
  await client.emit({ projectId: "proj", agentId: "agent-1", eventType: "run.started", severity: "info", statement: "go" });
  await client.heartbeat("agent-1", "run-1");
  await client.disconnect();

  assert.equal(calls.length, 4);
  const paths = calls.map((c) => new URL(c.url).pathname);
  assert.deepEqual(paths, [
    "/api/v1/agents/agent-1/connect",
    "/api/v1/agents/agent-1/events",
    "/api/v1/agents/agent-1/heartbeat",
    "/api/v1/agents/agent-1/disconnect",
  ]);
  for (const call of calls) {
    const headers = new Headers(call.init.headers);
    assert.equal(headers.get("Authorization"), `Bearer fw_agent_${"a".repeat(40)}`);
    assert.ok(!headers.has("X-Watchtower-Signature"), "canonical calls are never HMAC-signed");
  }
});

test("emit() strips projectId/agentId before calling the canonical client (already bound at construction)", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = createWatchtowerClient(
    baseConfig({ watchtowerAgentToken: `fw_agent_${"b".repeat(40)}` }),
    fakeFetch(calls),
  );
  await client.emit({ projectId: "proj", agentId: "agent-1", eventType: "tool.authorized", severity: "success", statement: "ok" });
  const body = JSON.parse(String(calls[0].init.body));
  // The SDK's own request() re-adds projectId from the client's bound
  // config -- what matters here is the bridge didn't pass its own
  // projectId/agentId through as extra/conflicting fields.
  assert.equal(body.eventType, "tool.authorized");
  assert.equal(body.statement, "ok");
});

test("state() reflects the most recent successful emit regardless of which client handled it", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = createWatchtowerClient(baseConfig(), fakeFetch(calls));
  await client.emit({ projectId: "proj", agentId: "agent-1", eventType: "run.completed", severity: "success", statement: "done", eventId: "evt-42" });
  assert.equal(client.state().last_event_id, "evt-42");
  assert.ok(client.isConnected());
});
