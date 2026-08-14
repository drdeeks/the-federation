/**
 * Character Kit client — ONLY Character Kit-facing integration.
 *
 * Connects to (verified against the real source, not the blueprint's guess):
 *   - node/enforcer/agent_enforcer_daemon.js -> startSocketServer(enforcer)
 *     (line 853): newline-delimited JSON over a Unix domain socket, or TCP
 *     when ENFORCER_SOCKET="tcp://host:port". Request: {method, params,
 *     token?}. Every method except "status" requires `token` to match the
 *     daemon's ACK_AUTH_TOKEN when that env var is set.
 *   - python/agent_character_kit/enforcer.py -> class EnforcerClient
 *     (line 291): a second implementation of the IDENTICAL wire protocol.
 *     Confirms the format is language-agnostic, so this file talks to the
 *     daemon directly over `node:net` -- no Python process is spawned.
 *
 * Contains NO Watchtower API calls, NO Watchtower event schema logic,
 * NO Watchtower credentials.
 *
 * Verified `execute_tool` response shape (agent_enforcer_daemon.js:283-361,
 * confirmed independently by the Python client's own handling at
 * enforcer.py:361-369): { denied: boolean, reason?, reflection?, manifest?,
 * self_verify_defects?, commit_intent? }. This does NOT match the
 * `{decision: "allowed"|"blocked", ...}` shape docs/symbol-matrix.md
 * originally described (that shape was mislabeled -- see the fix there).
 * `gateAction` below translates the real raw shape into this bridge's own
 * `EnforcementResult` contract; nothing outside this file ever sees the
 * daemon's native wire format.
 */

import net from "node:net";
import type { EnforcementResult } from "../contracts.js";

export interface CharacterKitClient {
  /** Gate a tool call. Fail-closed: throws if the daemon is unreachable. */
  gateAction(tool: string, params?: Record<string, unknown>): Promise<EnforcementResult>;
  /** Inject a habit challenge into the agent's context. */
  injectHabit(habitId: string, summary: string): Promise<void>;
  /** Capture an acknowledgment from the agent. */
  submitAcknowledgement(ackText: string): Promise<void>;
  /** Local heartbeat (python Enforcer.heartbeat). */
  heartbeat(): Promise<void>;
  /** True if the enforcement socket is reachable. */
  isConnected(): boolean;
}

const CALL_TIMEOUT_MS = 5000;

interface DaemonRequest {
  method: string;
  params?: Record<string, unknown>;
  token?: string;
}

/**
 * One-shot RPC: connect, write one newline-delimited JSON request, read the
 * first newline-delimited JSON response, close. The daemon and the verified
 * Python EnforcerClient both open a fresh connection per call (no session
 * state on the wire), so there is nothing to gain from a persistent
 * connection here -- matches the simplest correct implementation of the
 * protocol as verified.
 */
function callDaemon(
  socketSpec: string,
  token: string | undefined,
  method: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const isTcp = socketSpec.startsWith("tcp://");
    let socket: net.Socket;
    if (isTcp) {
      const url = new URL(socketSpec);
      socket = net.createConnection({ host: url.hostname || "127.0.0.1", port: Number(url.port) || 8753 });
    } else {
      socket = net.createConnection(socketSpec);
    }

    let buf = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`timeout after ${CALL_TIMEOUT_MS}ms`));
    }, CALL_TIMEOUT_MS);

    function finish(fn: () => void): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
      socket.end();
    }

    socket.on("connect", () => {
      const req: DaemonRequest = { method, params: params ?? {} };
      if (token) req.token = token;
      socket.write(JSON.stringify(req) + "\n");
    });

    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buf += chunk;
      const idx = buf.indexOf("\n");
      if (idx === -1) return;
      const line = buf.slice(0, idx);
      finish(() => {
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed === "object") resolve(parsed as Record<string, unknown>);
          else reject(new Error("malformed enforcer response"));
        } catch {
          reject(new Error("malformed enforcer response"));
        }
      });
    });

    socket.on("error", (err) => {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    });
  });
}

/**
 * Real implementation. `socketSpec` is a Unix socket path or a
 * `tcp://host:port` string (config.characterKitSocket); `token` matches the
 * daemon's ACK_AUTH_TOKEN (config.characterKitToken), required by every
 * method except the daemon's own "status" (which this client doesn't call --
 * connectivity is tracked from real RPC outcomes instead, see isConnected).
 */
export function createCharacterKitClient(socketSpec?: string, token?: string): CharacterKitClient {
  let connected = false;

  async function call(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!socketSpec) {
      throw new Error("character-kit unavailable: no socket configured (characterKitSocket)");
    }
    let response: Record<string, unknown>;
    try {
      response = await callDaemon(socketSpec, token, method, params);
    } catch (err) {
      connected = false;
      throw new Error(`character-kit unavailable: ${(err as Error).message}`);
    }
    // A parsed response -- even a business-error one -- proves the socket
    // itself is reachable; only a failed round-trip means "unreachable".
    connected = true;
    if (typeof response.error === "string") {
      throw new Error(`character-kit unavailable: ${response.error}`);
    }
    return response;
  }

  return {
    async gateAction(tool, params): Promise<EnforcementResult> {
      // Mirrors the verified Python client's flat-contract fix
      // (enforcer.py:349-357): the daemon's executeTool(tool, params) reads
      // params.command directly, not a nested params.params.command.
      const command =
        (typeof params?.command === "string" && params.command) ||
        (typeof params?.cmd === "string" && params.cmd) ||
        (typeof params?.code === "string" && params.code) ||
        "";
      const response = await call("execute_tool", { ...params, tool, command });
      const denied = response.denied === true;
      return {
        decision: denied ? "blocked" : "allowed",
        decision_reason: typeof response.reason === "string" ? response.reason : undefined,
        evidence: response,
      };
    },
    async injectHabit(habitId): Promise<void> {
      // The daemon has no push-style "inject" RPC an external caller can
      // trigger -- habit-prompt injection (pickPrompt/toolTick) is a
      // daemon-internal, pre-LLM-call decision. What this CAN verify is
      // that the habit is real: get_habit(name) returns its proof-layer
      // content, or {error: "unknown habit: ..."} otherwise. Fail-closed on
      // either an unknown habit or an unreachable daemon, same as every
      // other method here. `summary` isn't sent -- get_habit takes no such
      // field -- it still reaches Watchtower via the adapter's own
      // habitInjectedToEvent, untouched by this call.
      await call("get_habit", { name: habitId });
    },
    async submitAcknowledgement(ackText): Promise<void> {
      // No session concept is threaded through CharacterKitClient yet
      // (tracked in AGENTS.md #10 as Phase 6, topology, not started) --
      // "default" matches the daemon's own fallback for an omitted
      // session_id (agent_enforcer_daemon.js:924).
      await call("submit_ack", { session_id: "default", statement: ackText });
    },
    async heartbeat(): Promise<void> {
      await call("heartbeat");
    },
    isConnected(): boolean {
      return connected;
    },
  };
}
