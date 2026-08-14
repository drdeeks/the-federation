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
