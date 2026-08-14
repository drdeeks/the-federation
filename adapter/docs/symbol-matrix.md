# Phase 0 — Source Inventory (Symbol Matrix)

Produced by inspecting the actual repositories (not from memory) before any
implementation, per blueprint §9/§10. Both repos were cloned and grepped.

## Character Kit (`/tmp/ack-src`, v1.5.0)

| Surface | Verified export / entry | Bridge use |
|---------|------------------------|------------|
| Daemon | `node/enforcer/agent_enforcer_daemon.js` → `class Enforcer` (line 170), `startSocketServer(enforcer)` (1331), `startMultiWorkspaceDaemon` (1325) | socket gating surface |
| Hook gen | `node/bin/ack.js hook <framework>` (claude/cursor/gemini/opencode/hermes/generic) | generates companion hook config |
| Python engine | `python/agent_character_kit/enforcer.py` → `class Enforcer.execute_tool(tool, params)` (106), `heartbeat()` (282), `validate_workspace()` (274), `audit_path()` (160) | enforcement result |
| Python client | `python/agent_character_kit/enforcer.py` → `class EnforcerClient(socket_path)` (291) | socket client |
| Supervisor | `supervise.py` | restart path |

**Enforcement result contract, corrected 2026-08-13 after reading the real
daemon source (`node/enforcer/agent_enforcer_daemon.js:283-361`), not just
this table:** the daemon's actual `execute_tool` wire response is
`{ denied: boolean, reason?, reflection?, manifest?, self_verify_defects?, commit_intent? }` —
confirmed independently by the Python `EnforcerClient`'s own handling of it
(`enforcer.py:361-369`). The `{ decision: "allowed" | "blocked", habit_id?,
habit_summary?, ack_text?, decision_reason?, evidence }` shape below is the
**bridge's own** `EnforcementResult` contract (`src/contracts.ts`), not
anything Character Kit emits natively — `src/bridge/character-kit.ts`
translates one into the other and is the only file that ever sees the raw
daemon response.

## Watchtower (`/tmp/fwt-src`, federation-serverless + @federation-watchtower/sdk v0.2.0)

| Surface | Verified export | Bridge use |
|---------|----------------|------------|
| SDK client | `WatchtowerClient` (`emitEvent`, `heartbeat`, `requestLease`, `validateLease`, `submitValidationGate`, `authorizeAction`, `getCommands`, `acknowledgeCommand`) | event delivery |
| Owner client | `FederationOwnerClient.createOwner()`, `registerAgent(manifest)` | agent self-registration |
| Agent client | `FederationAgentClient.connect/heartbeat/disconnect/emit` (fw_agent_ token) | lifecycle |
| Types | `OperationalEvent`, `LeaseRequest`, `ValidationGateRequest`, `ControlledActionRequest`, `HeartbeatInput`, `EventSeverity` | payload shapes |
| Signed ingestion | HMAC-SHA256 over `${ts}.${body}`; headers `X-Watchtower-Signature: sha256=...`, `X-Watchtower-Timestamp`, `X-Watchtower-Producer` | auth |
| OperationalEventType | `run.started|run.completed|run.failed|heartbeat|validation.passed|validation.failed|policy.blocked|tool.authorized|tool.denied|lease.denied|loop.depth_exceeded|loop.duplicate_detected|heartbeat.missed|incident.*` | event mapping |

## Bridge → upstream name mapping (conceptual names now verified)

| Blueprint helper | Verified upstream |
|------------------|------------------|
| `gateAction` | Character Kit `Enforcer.execute_tool` / `EnforcerClient` |
| `checkHabit` | Character Kit `injectHabit` (habit injection) |
| `submitAcknowledgement` | Character Kit `submitAcknowledgement` |
| `sendHeartbeat` | `WatchtowerClient.heartbeat` + `Enforcer.heartbeat` |
| `emitEvent` | `WatchtowerClient.emitEvent(OperationalEvent)` |
| `registerAgent` | `FederationOwnerClient.registerAgent(manifest)` |
| `validateLease` | `WatchtowerClient.validateLease` |

## Open items resolved by this inventory

- Exact SDK exports → confirmed from `index.d.ts`.
- Event payload schema → confirmed (`OperationalEvent`).
- Auth shape → confirmed (HMAC + producer header).
- Whether Watchtower via SDK only → **yes**, SDK wraps signing + REST.
