import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createCharacterKitClient } from "../src/bridge/character-kit.ts";

/**
 * A minimal stand-in for agent_enforcer_daemon.js's startSocketServer
 * (node/enforcer/agent_enforcer_daemon.js:853): same newline-delimited JSON
 * wire protocol, same auth gate, same response shapes for the methods this
 * bridge calls. Verifies character-kit.ts against the real protocol, not
 * just against itself.
 */
function startFakeDaemon(token?: string) {
  const socketPath = path.join(os.tmpdir(), `ack-fake-daemon-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`);
  try { fs.unlinkSync(socketPath); } catch { /* not present */ }

  const server = net.createServer((socket) => {
    let buf = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buf += chunk;
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        const request = JSON.parse(line);

        if (token && request.method !== "status" && request.token !== token) {
          socket.write(JSON.stringify({ error: "unauthorized" }) + "\n");
          continue;
        }

        let response: Record<string, unknown>;
        switch (request.method) {
          case "execute_tool":
            response = request.params?.command === "rm -rf /"
              ? { denied: true, reason: "Violates hard constraint: rm -rf /", reflection: "no." }
              : { denied: false };
            break;
          case "get_habit":
            response = request.params?.name === "real-habit"
              ? { name: "real-habit", prompt: "did you verify?", assert: "verify before claiming" }
              : { error: `unknown habit: ${request.params?.name}` };
            break;
          case "submit_ack":
            response = request.params?.statement
              ? { ok: true }
              : { ok: false, error: "no statement" };
            break;
          case "heartbeat":
            response = { status: "ok", version: "1.5.0", character_hash: "abc123", violations: [], uptime: 1000 };
            break;
          default:
            response = { error: "unknown method" };
        }
        socket.write(JSON.stringify(response) + "\n");
      }
    });
  });

  const listening = new Promise<void>((resolve) => server.listen(socketPath, () => resolve()));

  return {
    socketPath,
    listening,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("gateAction: allowed action translates denied:false -> decision:allowed", async (t) => {
  const daemon = startFakeDaemon();
  await daemon.listening;
  t.after(() => daemon.close());

  const client = createCharacterKitClient(daemon.socketPath);
  const result = await client.gateAction("bash", { command: "ls" });
  assert.equal(result.decision, "allowed");
  assert.equal(client.isConnected(), true);
});

test("gateAction: denied action translates denied:true -> decision:blocked + reason", async (t) => {
  const daemon = startFakeDaemon();
  await daemon.listening;
  t.after(() => daemon.close());

  const client = createCharacterKitClient(daemon.socketPath);
  const result = await client.gateAction("bash", { command: "rm -rf /" });
  assert.equal(result.decision, "blocked");
  assert.match(result.decision_reason ?? "", /hard constraint/);
  assert.ok(result.evidence.reflection);
});

test("injectHabit: known habit resolves; unknown habit throws (fail-closed)", async (t) => {
  const daemon = startFakeDaemon();
  await daemon.listening;
  t.after(() => daemon.close());

  const client = createCharacterKitClient(daemon.socketPath);
  await assert.doesNotReject(() => client.injectHabit("real-habit", "some summary"));
  await assert.rejects(() => client.injectHabit("fake-habit", "x"), /unknown habit/);
});

test("submitAcknowledgement: empty statement surfaces daemon's rejection", async (t) => {
  const daemon = startFakeDaemon();
  await daemon.listening;
  t.after(() => daemon.close());

  const client = createCharacterKitClient(daemon.socketPath);
  await assert.doesNotReject(() => client.submitAcknowledgement("habit: verify why: real work"));
  await assert.rejects(() => client.submitAcknowledgement(""), /no statement/);
});

test("heartbeat: reaches the daemon and resolves", async (t) => {
  const daemon = startFakeDaemon();
  await daemon.listening;
  t.after(() => daemon.close());

  const client = createCharacterKitClient(daemon.socketPath);
  await assert.doesNotReject(() => client.heartbeat());
});

test("wrong token => unauthorized => throws, but the round-trip itself counts as connected", async (t) => {
  const daemon = startFakeDaemon("real-token");
  await daemon.listening;
  t.after(() => daemon.close());

  const client = createCharacterKitClient(daemon.socketPath, "wrong-token");
  await assert.rejects(() => client.heartbeat(), /unauthorized/);
  assert.equal(client.isConnected(), true);
});

test("no socket configured => fail-closed without attempting a connection", async () => {
  const client = createCharacterKitClient(undefined);
  await assert.rejects(() => client.heartbeat(), /character-kit unavailable: no socket configured/);
  assert.equal(client.isConnected(), false);
});

test("unreachable socket path => fail-closed", async () => {
  const client = createCharacterKitClient(path.join(os.tmpdir(), "nonexistent-ack.sock"));
  await assert.rejects(() => client.heartbeat(), /character-kit unavailable/);
  assert.equal(client.isConnected(), false);
});
