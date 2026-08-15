# AGENTS.md — character-kit-watchtower-bridge

> Cold-start handoff. Read this FIRST in any new session touching this repo.

**Maintenance rule:** this file, `README.md`, and `CHANGELOG.md` are kept in
sync on every change. Status (§8) is updated with a dated line; history goes in
`CHANGELOG.md`. Do not let any of the three drift.

---

## 1. WHAT THIS IS

A **translator bridge** between two independent, pre-existing primitives:

- **Character Kit** (`@drdeeks/character-kit`) — local behavioral enforcement
  (habit loop, acknowledgment capture, fail-closed gating). Owns NO
  identity/soul/persona. Truth: its repo `AGENTS.md`.
- **Federation Watchtower** (`@federation-watchtower/sdk` + `federation-serverless`)
  — federation / control / observability (registry, heartbeats, events, leases,
  guardrails, audit trail, public projection).

The bridge converts Character Kit enforcement activity → normalized Watchtower
events, and Watchtower results → adapter-visible state. **It owns no policy** and
is the only layer that knows both sides.

Separate package from `google-agentic-projects` (the hackathon repo). The
submission uses the bridge; the bridge is not the submission.

## 2. THE NON-NEGOTIABLE RULE — FAIL-CLOSED

Delivery failure never grants permission.

- Watchtower unavailable → CK stays fail-closed; queue/retry; **no release**.
- Character Kit unavailable → cannot authorize; **block**.
- Adapter crashes → CK continues; no release inferred.
- Socket / network lost → treated as CK unavailable; **block**.
- Duplicate event → suppressed (`event_id`, then `correlation_id + sequence`).
- Out-of-order event → preserved for audit; state NOT advanced.

Enforced in `src/failure.ts`; tested in `tests/adapter-roundtrip.test.ts` +
`tests/event-normalizer.test.ts`.

## 3. REQUIRED SEPARATION (verified, not assumed)

- Character Kit MUST NOT depend on Watchtower.
- Watchtower MUST NOT depend on Character Kit.
- The adapter is the only cross-system layer and is **disposable**: removing it
  leaves both primitives fully working. That is the correctness test.

## 4. REPO LAYOUT (canonical)

```
src/
  contracts.ts        normalized event types — types only, no logic
  config.ts           config validation/parse only
  failure.ts          fail-closed classification (the non-negotiable)
  events.ts           event name constants + makeEvent
  state.ts            dedupe / ordering / retry state
  adapter.ts          orchestration (no policy, no storage engine)
  index.ts            PUBLIC API surface only
  bridge/
    character-kit.ts  Character Kit ONLY (no Watchtower imports/creds)
    watchtower.ts     Watchtower ONLY (uses @federation-watchtower/sdk)
  normalization/
    event-normalizer.ts  CK result -> normalized event
    dedupe.ts             idempotency / duplicate suppression
    ordering.ts           sequence correlation / out-of-order audit
  transport/
    transport.ts     Transport interface (no vendor logic)
    http.ts          HTTP -> Watchtower via SDK (no CK logic)
  runtime/
    lifecycle.ts     start/stop orchestration
    shutdown.ts      graceful teardown
tests/                unit (config, contracts, event-normalizer, adapter-roundtrip)
docs/symbol-matrix.md Phase 0 source inventory (verified exports)
CHANGELOG.md          dated, append-only trail
```

Each file's "must not contain" list is in the build blueprint. Honor it.

## 5. VERIFIED UPSTREAM MAP (Phase 0 — see docs/symbol-matrix.md)

| Bridge helper | Verified upstream |
|---------------|------------------|
| `gateAction` | Character Kit `Enforcer.execute_tool` / `EnforcerClient` |
| `checkHabit` | Character Kit habit injection |
| `submitAcknowledgement` | Character Kit ack capture |
| `sendHeartbeat` | `WatchtowerClient.heartbeat` + `Enforcer.heartbeat` |
| `emitEvent` | `WatchtowerClient.emitEvent(OperationalEvent)` |
| `registerAgent` | `FederationOwnerClient.registerAgent(manifest)` |
| `validateLease` | `WatchtowerClient.validateLease` |

## 6. STACK / TOOLING

- TypeScript (ESM, `target: ES2022`, `moduleResolution: Bundler`).
- Runtime: Node >= 20.
- Test: `node --test` via `tsx`. Typecheck: `tsc --noEmit`.
- No framework; no bundler needed for dev (tsx runs TS directly).

## 7. OPERATING RULES

1. **Read this file first.**
2. **Verify before claiming.** Every "done" needs real output: `npm run validate`
   (tsc) and `npm test` must pass. No fabricated output, ever.
3. **One canonical file per concept.** Zero duplicates; the canonical file wins.
4. **Trash > purge.** Never `rm -rf` source. Move to `.scratch/` if it must go.
5. **No hardcoded paths/secrets.** Self-resolving paths; secrets from `.env`
   (gitignored). `.env.example` is the only committed config template.
6. **Keep the boundary.** If a change makes Character Kit import Watchtower
   (or vice versa), it is wrong. Revert.
7. **Fail-closed defaults.** Never add a permissive fallback "for convenience."
8. **Update the triad.** On every change: this file (§8 status), `README.md`
   (status section), and `CHANGELOG.md` (append a dated entry). Keep them synced.
9. **Git commit before big changes**; keep the tree clean between steps.

## 8. CURRENT STATUS (update with a dated line on every change)

- 2026-08-10 — Phase 0 (source inventory) DONE — `docs/symbol-matrix.md`.
- 2026-08-10 — Phase 1 (contracts) DONE — `contracts.ts`, `events.ts`, `failure.ts`.
- 2026-08-13 — Phase 2 (Character Kit client) DONE — `character-kit.ts` speaks the
  real daemon wire protocol directly over `node:net` (newline-delimited JSON,
  Unix socket or `tcp://host:port`, `{method, params, token?}`), verified against
  `agent_enforcer_daemon.js` (`startSocketServer`, line 853) and the Python
  `EnforcerClient` (`enforcer.py:291`) — both read as source. No Python process
  spawned; the protocol is language-agnostic. `docs/symbol-matrix.md`'s
  "Enforcement result contract" line was corrected in the same pass: it had
  mislabeled the bridge's own `EnforcementResult` shape as Character Kit's
  native output; the real `execute_tool` response is `{denied, reason?,
  reflection?, manifest?, self_verify_defects?, commit_intent?}`, translated by
  `gateAction` into `EnforcementResult`. `injectHabit` calls `get_habit` (the
  only externally-reachable read that verifies a habit is real) since the
  daemon has no push-style injection RPC — habit-prompt injection is a
  daemon-internal, pre-LLM-call decision (`pickPrompt`/`toolTick`), not
  something this bridge triggers.
- 2026-08-10 — Phase 3 (Watchtower client) DONE at surface — `watchtower.ts` uses
  the real SDK; NOT exercised against live `fapi.drdeeks.xyz` in tests.
- 2026-08-13 — **Correction to the above:** "DONE at surface" was true but
  incomplete — `watchtower.ts` only wires `WatchtowerClient` (legacy
  producer-signed HMAC). It never uses `FederationOwnerClient`/
  `FederationAgentClient`, the canonical `fw_owner_*`/`fw_agent_*` path
  Federation's own docs recommend for real agent identity, even though
  `symbol-matrix.md` already verified both SDK exports exist. Full
  route-by-route breakdown (which routes are canonical-capable, which are
  legacy-HMAC-only on Federation's side regardless of what we do) is in
  `docs/FEDERATION_ROUTE_MAP.md`. This is real remaining Phase 3 work, not
  closed out.
- 2026-08-10 — Phase 4 (adapter) DONE structurally; no longer relies on a CK stub.
- 2026-08-10 — Phase 5 (failure hardening) fail-closed LOGIC done + unit-tested;
  live crash/network simulation NOT yet integration-tested.
- 2026-08-13 — Phase 6 (topology: root/user/local) still NOT started.
  `submitAcknowledgement` hardcodes `session_id: "default"` in the meantime
  (matches the daemon's own fallback for an omitted session_id) — no session
  concept is threaded through `CharacterKitClient` yet.
- 2026-08-13 — **Tests: 20/20 unit pass; `tsc --noEmit` clean.** New coverage:
  `tests/character-kit.test.ts` runs `gateAction`/`injectHabit`/
  `submitAcknowledgement`/`heartbeat` against a fake daemon that speaks the
  exact real wire protocol (auth-token rejection and unreachable-socket
  fail-closed paths included) — still not a real `agent_enforcer_daemon.js`
  process, no live network in any test. Also fixed a real bug found in the
  same pass: `package.json`'s `test` script was missing `--import tsx`, so
  `npm test` failed outright on this Node version (22.23.2) — the previously
  recorded "12/12 pass" wasn't reproducible via the documented command.
- 2026-08-14 — **Phase 3 correction closed, partially:** `watchtower.ts` now
  wires `FederationAgentClient` (canonical `fw_agent_*`) for
  connect/heartbeat/events/disconnect, additive alongside the legacy
  `WatchtowerClient` (used when `BridgeConfig.watchtowerAgentToken` is
  configured; absent, behavior unchanged from before this entry). Owner
  creation/agent registration bootstrap and canonical lease request remain
  genuinely not done — see updated `docs/FEDERATION_ROUTE_MAP.md` for the
  precise remaining gap. `adapter.ts`'s `bridge.start()`/`stop()` (previously
  no-op) now call the new `connect()`/`disconnect()` handle methods.
  **Tests: 27/27 unit pass** (`tests/watchtower.test.ts`, new, 4 tests,
  fetch injected via the SDK's own `fetch` option, no real network — plus 3
  new `config.test.ts` cases for the optional token fields);
  `tsc --noEmit` clean. **No live integration test against a real running
  Federation instance** — none was available this session; still an open
  gap, same category as the Character Kit daemon integration gap below.
  Working copy for this pass: `/tmp/federation-adapters-work-20260814` (not
  the tracked repo at the time of writing — bring these changes into
  `~/projects/federation-adapters` as a deliberate, separate step).

## 9. KNOWN GAPS (do not claim these work)

- Character Kit client is a **stub**; real enforcement flow unverified end-to-end.
- No integration test against `fapi.drdeeks.xyz` or a local Watchtower.
- `unix-socket.ts` / `mcp.ts` transports: NOT created (deferred full-tree items).
- `scripts/` (start-dev / validate / replay-events): NOT created.
- e2e topology tests (root / user / agent-local): NOT created.
- x402 payment, org-room, sitcom UI: OUT OF SCOPE — live in Watchtower/Federation
  product, not here.

## 10. NEXT STEPS

- [x] **Wire the canonical Watchtower path for connect/heartbeat/events/
      disconnect** (2026-08-14) — `FederationAgentClient`, additive
      alongside legacy `WatchtowerClient`, `fw_agent_*`/`fw_owner_*`
      concept added to `config.ts`/`contracts.ts`
      (`watchtowerAgentToken`/`watchtowerOwnerToken`, optional).
- [ ] **Owner creation + agent registration bootstrap** — nothing calls
      `FederationOwnerClient.createOwner()`/`registerAgent()` yet. Needs a
      real setup/onboarding flow, plus the one-time-plaintext-then-
      encrypted handling for the returned tokens (same pattern as any
      other generated secret in this ecosystem).
- [ ] **Canonical lease request** — `FederationAgentClient` has no
      `requestLease` method in the SDK at all; not possible to wire
      canonically until the SDK adds one. Legacy `WatchtowerClient.
      requestLease()` remains uncalled by this bridge either way (was true
      before this pass too).
- [ ] Four routes (lease validate, tool authorize, validation gates,
      commands) have no canonical bearer path on Federation's side yet —
      that's Federation's gap, not this adapter's; a fully-canonical
      adapter still needs the legacy HMAC secret for those four until
      Federation adds it. Tracked in `docs/FEDERATION_ROUTE_MAP.md`.
- [x] Wire the real Character Kit client (Phase 2): socket or Python `EnforcerClient`.
- [ ] Integration test against a REAL `agent_enforcer_daemon.js` process, not
      just the protocol-accurate fake in `tests/character-kit.test.ts`.
- [ ] Integration test: emit a real event to a local/dev Watchtower.
- [ ] Add `unix-socket.ts` as its own module (today the transport lives inline
      in `character-kit.ts`) + `scripts/`.
- [ ] e2e topology tests (root-owned / user-owned / agent-local) — also where
      `submitAcknowledgement`'s hardcoded `session_id: "default"` should be
      replaced with a real threaded session.
- [ ] Use the bridge inside hackathon submission(s) as the disclosure backbone.

## 11. AUTHORITY / READING ORDER

1. `AGENTS.md` (this file) — orientation + rules.
2. `CHANGELOG.md` — dated history.
3. `docs/symbol-matrix.md` — verified upstream exports (Phase 0).
4. `README.md` — purpose + limitations for outsiders.
5. `src/failure.ts` — the non-negotiable; read before touching adapters.
