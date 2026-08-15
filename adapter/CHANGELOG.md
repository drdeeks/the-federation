# CHANGELOG — character-kit-watchtower-bridge

> Append-only. Newest entry on top. One line per meaningful change.
> Update this on EVERY change, in lockstep with `AGENTS.md` §8 and `README.md`.

## Cadence rule

- **Every commit that changes behavior, contracts, or structure** → add an entry.
- **Every session that touches this repo** → add a dated status line even if
  only docs changed.
- Format: `- YYYY-MM-DD — <what changed> — <verified outcome>`
- Never edit or delete past entries. If a prior entry was wrong, append a
  correction entry. Drift starts when this file stops being updated.

---

## Entries

- 2026-08-10 — Initial scaffold + Phase 0/1/4 complete — 12/12 unit tests pass,
  `tsc --noEmit` clean. Repo `git init` + first commit `ba52050`. Tarball
  `character-kit-watchtower-bridge.tar.gz` placed in `federation-repo/`.
- 2026-08-10 — `README.md` / `AGENTS.md` / `CHANGELOG.md` refreshed with
  proven-vs-not-proven status split, boundary rules, and maintenance cadence.
- 2026-08-10 — Phase 2 (Character Kit client) left as boundary stub by design;
  real socket/Python transport deferred. Phase 3 (Watchtower client) uses real
  SDK surface but unexercised against live endpoint in tests.
- 2026-08-13 — Phase 2 done for real: `character-kit.ts` now speaks the actual
  daemon wire protocol (newline-delimited JSON over Unix socket / `tcp://`)
  over `node:net`, verified against `agent_enforcer_daemon.js` and the Python
  `EnforcerClient` source directly. `gateAction`, `injectHabit`,
  `submitAcknowledgement`, `heartbeat` all implemented and translate the raw
  daemon response into this bridge's `EnforcementResult` contract.
  `characterKitToken` added to `BridgeConfig`/`config.ts`/`.env.example`
  (`CHARACTER_KIT_TOKEN`) for the daemon's auth gate. Fixed a mislabeled
  contract description in `docs/symbol-matrix.md`. New test file
  `tests/character-kit.test.ts` (8 tests) runs the client against a fake
  daemon speaking the real protocol — 20/20 total unit tests pass,
  `tsc --noEmit` clean. Also fixed `package.json`'s `test` script (was
  missing `--import tsx`, so `npm test` failed outright on Node 22.23.2).
- 2026-08-13 — New doc `docs/FEDERATION_ROUTE_MAP.md`: full route-by-route
  cross-reference against `~/projects/federation/docs/review/COMPLETE_SPEC.md`
  §2, verified against the real SDK `.d.ts` and `watchtower.ts` directly.
  Finding: `watchtower.ts` only ever wires the legacy producer-signed
  `WatchtowerClient`, never `FederationOwnerClient`/`FederationAgentClient`
  — even though the canonical path already covers owner/agent
  registration, connect, heartbeat, events, disconnect, and lease request
  on Federation's side today. Only four routes (lease validate, tool
  authorize, validation gates, commands) are genuinely Federation-side
  gaps with no canonical bearer path yet. Corrected Phase 3's AGENTS.md §8
  status and ADAPTER_SPEC_SHEET.md's stale header table to reflect this.
- 2026-08-14 — MOD-004 (canonical client wiring), closing the gap
  `FEDERATION_ROUTE_MAP.md` documented: `watchtower.ts` now constructs a
  `FederationAgentClient` (canonical `fw_agent_*` bearer) ADDITIONALLY to
  the existing legacy `WatchtowerClient`, used when `BridgeConfig.
  watchtowerAgentToken` is configured (new, optional, env
  `WATCHTOWER_AGENT_TOKEN`/`WATCHTOWER_OWNER_TOKEN` via `config.ts`) —
  absent, behavior is byte-for-byte unchanged from before this entry, zero
  regression. `emit`/`heartbeat` route through whichever client is active;
  `connect`/`disconnect` are new `WatchtowerClientHandle` methods (legacy
  has no such concept, so they're canonical-only, no-op otherwise), wired
  into `adapter.ts`'s `bridge.start()`/`stop()` which were previously
  no-ops. The four routes with no canonical bearer path at all (lease
  validate, tool authorize, validation gates, commands) remain
  legacy-`WatchtowerClient`-only by necessity — that gap is Federation's
  own MOD-002, not something this adapter can route around, though
  Federation's `fix/rooms-agents-migrations` branch closed it there today
  (unpushed, not yet this adapter's concern until it ships). New
  `tests/watchtower.test.ts` (4 tests, fetch injected via the SDK's own
  `fetch` option — no real network) verifies legacy-only routes all 4
  handle methods to `/api/v1/events`, canonical mode routes them to the
  4 distinct `/api/v1/agents/{id}/{connect,events,heartbeat,disconnect}`
  endpoints with a real bearer header and no HMAC signature, and that
  `emit()` doesn't pass its own bound projectId/agentId through as
  conflicting extra fields. `config.test.ts` gained 3 tests for the new
  optional fields. 27/27 unit tests pass, `tsc --noEmit` clean.
  **Not done**: no live integration test against a real running Federation
  instance (none was available this session) — `PHASE-5.1`-equivalent
  verification against a real deployment remains outstanding, same caveat
  this repo's own `AGENTS.md` §10 already flags for the Character Kit
  daemon integration.
