# Character Kit ⇄ Watchtower Bridge — Definitive Blueprint

**Status as of 2026-08-13, later same day (cross-checked against `AGENTS.md` §8, same date — read that section for the authoritative, continuously-updated status; this header is a snapshot, not the source of truth):**

| Phase | This blueprint's plan | Actual status |
|---|---|---|
| 0 — Source inventory | §10 | **DONE** — see `docs/symbol-matrix.md`. Resolves every item in §9 below (Character Kit exports, Watchtower SDK exports, event payload schema, auth shape, SDK-only vs SDK+REST — all confirmed against real source, not guessed). |
| 1 — Bridge contract | §10 | **DONE** — `contracts.ts`, `events.ts`, `failure.ts` |
| 2 — Character Kit client | §10 | **DONE** — `character-kit.ts` speaks the real daemon wire protocol over `node:net` (verified against `agent_enforcer_daemon.js` + the Python `EnforcerClient` source directly). No more stub. |
| 3 — Watchtower client | §10 | **DONE at surface, but legacy-only** — `watchtower.ts` wires `WatchtowerClient` (the producer-signed HMAC path) only. It never touches `FederationOwnerClient`/`FederationAgentClient`, even though `symbol-matrix.md` already verified both exist in the SDK. See `docs/FEDERATION_ROUTE_MAP.md` for the full canonical-vs-legacy route breakdown — this is real remaining work, not a stub. |
| 4 — Adapter | §10 | **DONE structurally**; no longer relies on a Phase 2 stub. |
| 5 — Failure hardening | §10 | Fail-closed **logic** done + unit-tested; live crash/network simulation not yet integration-tested |
| 6 — Deployment topology | §10 | **NOT started** |

Tests: 20/20 unit pass, `tsc --noEmit` clean (was 12/12 before Phase 2 landed). New coverage: `tests/character-kit.test.ts` runs the real socket transport against a fake daemon speaking the actual wire protocol. Still no live network test, no real `agent_enforcer_daemon.js` process, no real Watchtower endpoint exercised in any test.

**Read `docs/symbol-matrix.md` before touching Phase 2/3 further** — it already has the verified upstream symbol names (`Enforcer.execute_tool`, `EnforcerClient(socket_path)`, `WatchtowerClient.emitEvent`, `FederationOwnerClient.registerAgent`, `FederationAgentClient.connect/heartbeat/disconnect/emit`, etc.) that this blueprint's §9 asks for. **Read `docs/FEDERATION_ROUTE_MAP.md` before touching Phase 3's credential model** — it maps every Federation route this bridge could call against canonical-vs-legacy auth, cross-referenced against `~/projects/federation/docs/review/COMPLETE_SPEC.md`, and lists exactly what's an adapter-side gap (most of it) vs. a genuine Federation-side gap (four specific routes with no canonical bearer path yet).

---

The rest of this document is the blueprint as given, unmodified.

---

Below is the definitive blueprint, written as a build document rather than a discussion.

It follows the same core pattern already reflected in your rules files: verify first, preserve reversibility, fail closed, and keep primitives independent.

## 1) What exists now

### Character Kit

Role: local behavioral enforcement primitive.

Verified repo-level surfaces:

- `node/enforcer/agent_enforcer_daemon.js` — daemon / enforcement engine.
- `node/bin/ack.js hook <name>` — generic hook surface.
- `python/hermes_plugin/` — Python companion example.
- `python/agent_character_kit/` — Python client.
- `supervise.py` — supervisor / restart path.
- `AGENTS.md` — install/customize/verify source of truth.
- `HABIT_POLICY.md` — habit semantics.
- `deploy/` — deployment scaffolding.

Behavioral responsibility:

- habit loop
- acknowledgment capture
- acknowledgment validation
- fail-closed gating
- local socket/service enforcement
- no identity/soul/persona

### Watchtower

Role: federation / control / observability primitive.

Verified repo-level surfaces:

- `source/federation-serverless/src/index.ts` — Worker entry point.
- `packages/watchtower-sdk/` — SDK package surface.
- `fapi.drdeeks.xyz` — machine/API ingress.
- `watch.drdeeks.xyz` — public read-only surface.
- `/api/v1/agents` — agent registration.
- `/api/v1/projects/{projectId}/leases` — lease request.
- `/api/v1/projects/{projectId}/leases/{leaseId}/validate` — lease validation.
- `POST /disconnect` — lifecycle disconnect path.

Behavioral responsibility:

- agent registry
- heartbeats
- events
- leases
- guardrails
- audit trail
- public projection
- remote ingress/egress

### The required separation

- Character Kit must not depend on Watchtower.
- Watchtower must not depend on Character Kit.
- The adapter is the only thing allowed to know both sides.

---

## 2) What the bridge must do

### Bridge responsibility

The bridge is a translator, not a policy engine.

It converts:

Character Kit enforcement activity → into → normalized Watchtower events

and converts:

Watchtower lease/guardrail/status results → into → adapter-visible operational state

It must not:

- define habits
- own identity
- own federation policy
- implement a second enforcement engine
- duplicate Watchtower internals
- duplicate Character Kit internals

### Communication direction

1. Host/runtime → Character Kit
2. Character Kit → Bridge
3. Bridge → Watchtower
4. Watchtower → Bridge
5. Bridge → host/runtime

The bridge is the only cross-system layer.

---

## 3) Exact repo/file tree you should create

### New repository

Create a separate repository/package so the primitives stay independent:

```
character-kit-watchtower-bridge/
├── package.json                     [required]
├── tsconfig.json                    [required]
├── .gitignore                       [required]
├── README.md                        [documentation]
├── .env.example                     [documentation]
├── src/
│   ├── index.ts                     [required]
│   ├── config.ts                    [required]
│   ├── contracts.ts                 [required]
│   ├── adapter.ts                   [required]
│   ├── events.ts                    [required]
│   ├── failure.ts                   [required]
│   ├── state.ts                     [required]
│   ├── runtime/
│   │   ├── lifecycle.ts             [required]
│   │   └── shutdown.ts              [required]
│   ├── bridge/
│   │   ├── character-kit.ts         [required]
│   │   └── watchtower.ts            [required]
│   ├── normalization/
│   │   ├── event-normalizer.ts      [required]
│   │   ├── dedupe.ts                [required]
│   │   └── ordering.ts              [required]
│   └── transport/
│       ├── transport.ts             [required]
│       ├── http.ts                  [required]
│       ├── unix-socket.ts           [optional]
│       └── mcp.ts                   [optional]
├── tests/
│   ├── unit/
│   │   ├── config.test.ts           [test]
│   │   ├── contracts.test.ts        [test]
│   │   ├── event-normalizer.test.ts [test]
│   │   ├── dedupe.test.ts           [test]
│   │   └── failure.test.ts          [test]
│   ├── integration/
│   │   ├── character-kit-local.test.ts [test]
│   │   ├── watchtower-local.test.ts    [test]
│   │   ├── adapter-roundtrip.test.ts    [test]
│   │   ├── retry-idempotency.test.ts    [test]
│   │   └── out-of-order.test.ts         [test]
│   ├── e2e/
│   │   ├── root-owned-topology.test.ts  [test]
│   │   ├── user-owned-topology.test.ts  [test]
│   │   └── user-local-topology.test.ts  [test]
│   └── fixtures/
│       ├── character-kit-hook.json   [generated]
│       ├── watchtower-event.json     [generated]
│       ├── lease-active.json         [generated]
│       └── lease-denied.json         [generated]
├── scripts/
│   ├── start-dev.ts                  [required]
│   ├── validate.ts                   [required]
│   └── replay-events.ts              [optional]
└── docs/
    ├── topology.md                   [documentation]
    ├── api.md                        [documentation]
    ├── event-contract.md             [documentation]
    ├── failure-modes.md              [documentation]
    ├── deployment.md                 [documentation]
    └── open-questions.md             [documentation]
```

### Smallest viable first scaffold

Create only this first:

```
character-kit-watchtower-bridge/
├── package.json
├── tsconfig.json
├── .gitignore
├── README.md
├── .env.example
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── contracts.ts
│   ├── adapter.ts
│   ├── bridge/
│   │   ├── character-kit.ts
│   │   └── watchtower.ts
│   ├── normalization/
│   │   ├── event-normalizer.ts
│   │   ├── dedupe.ts
│   │   └── ordering.ts
│   └── transport/
│       ├── transport.ts
│       └── http.ts
└── tests/
    ├── config.test.ts
    ├── contracts.test.ts
    ├── event-normalizer.test.ts
    └── adapter-roundtrip.test.ts
```

*(Note: the smallest-viable scaffold above is what actually exists today in this repo, plus `state.ts`, `runtime/`, `docs/symbol-matrix.md`, and a stubbed `character-kit.ts` — see the status table at the top of this document.)*

---

## 4) File-by-file responsibility

### Root files

- `package.json`: package identity, scripts, dependencies.
- `tsconfig.json`: compile settings.
- `.gitignore`: build/artifact exclusions.
- `README.md`: architecture, install, boundaries.
- `.env.example`: minimal config examples.
- `package-lock.json`, `dist/`, `coverage/`: generated only.

### `src/index.ts`

Exports the public bridge API only.

Must not contain:
- transport implementation
- habit logic
- Watchtower policy
- Character Kit daemon details

### `src/config.ts`

Validates and parses bridge config.

Must not contain:
- enforcement decisions
- event normalization
- raw Watchtower internals

### `src/contracts.ts`

Defines the bridge's TypeScript types.

Must not contain:
- network logic
- runtime logic
- policy logic

### `src/adapter.ts`

Orchestrates Character Kit ↔ Watchtower flow.

Must not contain:
- a second enforcement engine
- event storage engine
- daemon startup code
- host-specific UI behavior

### `src/events.ts`

Defines normalized event names/constants.

Must not contain:
- vendor-specific payloads
- transport code
- habit policy

### `src/failure.ts`

Defines fail-closed behavior and failure classification.

Must not contain:
- transport implementation
- policy decisions outside the failure model

### `src/state.ts`

Tracks correlation, retry, dedupe, ordering state.

Must not contain:
- habit definitions
- Watchtower authorization logic

### `src/runtime/lifecycle.ts`

Start/stop lifecycle orchestration.

Must not contain:
- transport-specific code beyond orchestration
- policy logic

### `src/runtime/shutdown.ts`

Graceful teardown.

Must not contain:
- enforcement decisions
- event schema definitions

### `src/bridge/character-kit.ts`

Only Character Kit-facing integration.

Connects to:
- `node/enforcer/agent_enforcer_daemon.js`
- `node/bin/ack.js hook <name>`
- `python/agent_character_kit/`
- `python/hermes_plugin/`
- `supervise.py`

Must not contain:
- Watchtower API calls
- Watchtower event schema logic
- Watchtower credentials

### `src/bridge/watchtower.ts`

Only Watchtower-facing integration.

Connects to:
- `source/federation-serverless/src/index.ts`
- `packages/watchtower-sdk`
- `/api/v1/agents`
- `/api/v1/projects/{projectId}/leases`
- `/api/v1/projects/{projectId}/leases/{leaseId}/validate`
- `POST /disconnect`
- `fapi.drdeeks.xyz`

Must not contain:
- habit policy
- Character Kit daemon internals

### `src/normalization/event-normalizer.ts`

Converts Character Kit output into normalized bridge events.

Must not contain:
- network I/O
- policy logic

### `src/normalization/dedupe.ts`

Handles idempotency and duplicate suppression.

Must not contain:
- transport code
- enforcement policy

### `src/normalization/ordering.ts`

Preserves correlation and out-of-order metadata.

Must not contain:
- policy logic
- host UI behavior

### `src/transport/transport.ts`

Defines a transport interface.

Must not contain:
- Character Kit logic
- Watchtower-specific logic

### `src/transport/http.ts`

HTTP transport to Watchtower.

Must not contain:
- Character Kit enforcement logic

### `src/transport/unix-socket.ts`

Optional future local transport helper.

### `src/transport/mcp.ts`

Optional future MCP shim.

---

## 5) Public API of the bridge

Keep it tiny.

Proposed minimum API:

- `createBridge(config)`
- `start()`
- `stop()`
- `status()`

Internal helper responsibilities:

- `registerAgent()`
- `checkHabit()`
- `submitAcknowledgement()`
- `gateAction()`
- `sendHeartbeat()`
- `emitEvent()`
- `validateLease()`

Those internal helper names are conceptual only until the exact upstream exports are verified. **(Update: they now are — see `docs/symbol-matrix.md`'s "Bridge → upstream name mapping" table, which maps every one of these conceptual names to a verified real export.)**

---

## 6) Event contract

Use one normalized adapter event shape.

### Core fields

- `event_id`
- `event_type`
- `timestamp`
- `agent_id`
- `session_id`
- `correlation_id`
- `sequence`
- `source`
- `enforcement_state`
- `transport`
- `evidence`

### Optional fields

- `habit_id`
- `habit_summary`
- `ack_text`
- `decision_reason`
- `retry_count`
- `parent_event_id`
- `host_surface`
- `watchtower_route`
- `character_kit_route`
- `latency_ms`
- `error_code`
- `error_message` (redacted-safe)

### Minimum event types

- `character.enforcement.checked`
- `character.enforcement.allowed`
- `character.enforcement.blocked`
- `character.habit.injected`
- `character.habit.acknowledged`
- `event.delivered`
- `event.duplicate`
- `event.out_of_order`

### Correlation rules

- `event_id` is globally unique.
- `correlation_id` ties one host action to one habit challenge and one Watchtower record.
- `sequence` is monotonic per `(agent_id, session_id)`.
- duplicates are no-ops.
- out-of-order events are auditable but do not advance state.

---

## 7) Deployment topology

### Root/system-owned

- Character Kit daemon: root-owned
- Bridge: root-owned companion/service
- Watchtower: remote API or local federation endpoint

### User-owned

- Character Kit daemon: user-owned
- Bridge: same user service
- Watchtower: remote or local endpoint

### Agent/user-local

- Character Kit companion: launched with agent session
- Bridge: launched with agent session
- Watchtower: remote or local endpoint

The bridge must not care which topology is being used beyond config values.

---

## 8) Failure behavior

This is the non-negotiable part.

**Watchtower unavailable**
- Character Kit remains fail-closed.
- Bridge queues/retries only if safe.
- No permissive fallback.

**Character Kit unavailable**
- Bridge cannot authorize action.
- Block.

**Adapter crashes**
- Character Kit continues independently.
- No release signal is inferred.

**Socket disappears**
- Treat as Character Kit unavailable.
- Block.

**Network disappears**
- Local Character Kit enforcement continues.
- Watchtower delivery queues/retries.
- No permission is derived from delivery failure.

**Event cannot be delivered**
- Bounded retry queue.
- Idempotency key preserved.
- No duplicated state transitions.

**Event duplicated**
- Deduplicate by `event_id`, then `correlation_id + sequence`.

**Event out of order**
- Preserve for audit.
- Do not advance state from stale sequence.

---

## 9) What still needs source-level verification

*(Status: **resolved** — see `docs/symbol-matrix.md`, produced 2026-08-10. Left in place below as the original ask-list; do not re-derive, read the symbol matrix first.)*

These are the remaining unknowns that must be inspected in the actual source before implementation:

**Character Kit**
- exact exported symbols from `node/enforcer/agent_enforcer_daemon.js` — **resolved**: `class Enforcer` (line 170), `startSocketServer(enforcer)` (1331), `startMultiWorkspaceDaemon` (1325)
- exact hook input/output schema for `node/bin/ack.js` — **resolved**: `ack.js hook <framework>` generates companion hook config
- exact Python client API in `python/agent_character_kit/` — **resolved**: `python/agent_character_kit/enforcer.py` → `Enforcer.execute_tool/heartbeat/validate_workspace/audit_path`, `EnforcerClient(socket_path)`
- exact Hermes plugin surface in `python/hermes_plugin/` — not separately itemized in the symbol matrix; check directly if Hermes-specific wiring is needed

**Watchtower**
- exact exports from `packages/watchtower-sdk` — **resolved**: `WatchtowerClient`, `FederationOwnerClient`, `FederationAgentClient` (see symbol matrix for full method lists)
- exact constructor/function/type names in SDK source — **resolved**: see symbol matrix's Types row (`OperationalEvent`, `LeaseRequest`, etc.)
- exact event payload schema for signed ingestion — **resolved**: HMAC-SHA256 over `${ts}.${body}`, headers documented
- exact authentication shape for API/SDK calls — **resolved**

**Bridge**
- whether Watchtower should be called through SDK only or SDK + REST fallback — **resolved: SDK only**, it wraps signing + REST
- whether MCP is actually needed for the first version — still open, not addressed by the symbol matrix
- exact retry/delivery contract — logic implemented in `failure.ts`/`state.ts`, live retry behavior not yet integration-tested (Phase 5 gap)

---

## 10) Implementation phases

*(Status column added — see the status table at the top of this document for the authoritative source, `AGENTS.md` §8.)*

- **Phase 0 — Source inventory.** inspect Character Kit exports; inspect Watchtower SDK exports; produce symbol matrix; no code changes. **DONE.**
- **Phase 1 — Bridge contract.** create `contracts.ts`; create normalized event model; no transport. **DONE.**
- **Phase 2 — Character Kit client.** connect to daemon/hook surface; expose only allow/block + evidence; still no Watchtower dependency. **STUB ONLY — the real remaining work.**
- **Phase 3 — Watchtower client.** connect to SDK/API surface; emit normalized events only. **DONE at surface, not live-tested.**
- **Phase 4 — Adapter.** connect Character Kit result → normalized event → Watchtower emit; maintain correlation and idempotency. **DONE structurally, blocked on Phase 2.**
- **Phase 5 — Failure hardening.** watchtower unavailable; adapter crash; duplicate event; out-of-order event; socket loss. **Logic done + unit-tested; live simulation not done.**
- **Phase 6 — Deployment topology.** root-owned; user-owned; agent-local. **NOT started.**

---

## 11) What you need to make it work

You already have the two primitives.

What you still need is:

1. Exact source-level export map from Character Kit daemon/client and Watchtower SDK. **— have it, `docs/symbol-matrix.md`.**
2. A new adapter repo/package with the file tree above. **— have the smallest-viable version, vendored into this hackathon workspace as `adapter/`.**
3. A normalized event contract that both sides can map to. **— have it, `contracts.ts`/`events.ts`.**
4. A transport selection for Watchtower. **— decided: SDK only.**
5. Tests proving fail-closed behavior when any dependency disappears. **— have unit coverage; live/integration coverage is the gap.**
6. Deployment config for root/user/local topologies. **— not started (Phase 6).**
7. A clear rule that the adapter is disposable and owns no policy. **— stated in this repo's own README, holds.**

---

## 12) Final working rule

If the bridge can be removed and both primitives still work, it is correct.

If removing the bridge breaks either primitive, the bridge is carrying too much.

That is the exact boundary you want.
