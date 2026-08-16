# The Federation Adapter

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Unit tests](https://img.shields.io/badge/unit%20tests-32%2F32%20passing-brightgreen)](tests/)
[![npm version](https://img.shields.io/npm/v/@the-federation/adapter?logo=npm&color=cb3837)](https://www.npmjs.com/package/@the-federation/adapter)
[![npm downloads](https://img.shields.io/npm/dm/@the-federation/adapter?logo=npm&color=cb3837)](https://www.npmjs.com/package/@the-federation/adapter)
[![Status](https://img.shields.io/badge/status-not%20production--ready-orange)](docs/ADAPTER_SPEC_SHEET.md)
[![Publish](https://img.shields.io/github/actions/workflow/status/drdeek/federation-adapters/publish.yml?branch=main&label=publish&logo=github)](https://github.com/drdeek/federation-adapters/actions/workflows/publish.yml)

> A translator between independent primitives. It owns no policy.

A thin, **disposable** layer that lets two existing systems talk without either
depending on the other.

| Primitive | Current Role | Source of truth |
|-----------|--------------|-----------------|
| **Character Kit** (`@drdeeks/character-kit`) | Local behavioral enforcement — habit loop, acknowledgment capture, fail-closed gating. No identity/soul/persona. | `agent-character-kit` repo `AGENTS.md` |
| **Federation Watchtower** (`@federation-watchtower/sdk` + `federation-serverless`) | Federation / control / observability — agent registry, heartbeats, events, leases, guardrails, audit trail. | `federation-watchtower` repo |

The adapter does exactly two things:

1. Character Kit enforcement activity → **normalized Watchtower events**.
2. Watchtower lease/guardrail/status results → **adapter-visible state**.

It is a translator, not a policy engine. It defines no habits, owns no identity,
owns no federation policy, and re-implements neither primitive.

**Designed for expansion:** The architecture separates concerns (protocol bridges,
normalization, ordering, transport, runtime) so additional upstreams or downstreams
can be added without rewriting the core. New bridge pairs follow the same pattern:
isolated client → normalized contract → dedupe/ordering → durable delivery.

---

## The non-negotiable: fail-closed

**Delivery failure never grants permission.**

| Condition | Behavior |
|-----------|----------|
| Downstream unavailable | Upstream stays fail-closed; queue/retry; **no release** |
| Upstream unavailable | Cannot authorize; **block** |
| Adapter crashes | Upstream continues; no release inferred |
| Socket / network lost | Treated as upstream unavailable; **block** |
| Event undeliverable | Bounded retry, idempotency key preserved |
| Duplicate event | Suppressed by `event_id`, then `correlation_id + sequence` |
| Out-of-order event | Preserved for audit; state NOT advanced |

Enforced in `src/failure.ts`; asserted by `tests/adapter-roundtrip.test.ts` and
`tests/event-normalizer.test.ts`.

---

## Boundaries (verified, not assumed)

- Upstream MUST NOT depend on downstream.
- Downstream MUST NOT depend on upstream.
- The adapter is the **only** cross-system layer and is **disposable**: remove
  it and both primitives still work. That is the correctness test.

---

## Status — what is proven vs. not

**Proven (32/32 unit tests pass, `tsc --noEmit` clean):**

- Config resolution (fail-closed on missing secret).
- Normalized event construction (unique `event_id`, sane defaults).
- Enforcement-result → event mapping (allowed / blocked).
- Dedupe (by `event_id`, then `correlation_id + sequence`).
- Ordering (out-of-order detected; state not advanced; **fixed P0 defect**).
- Fail-closed classification (upstream down → block; downstream down → retry).
- **Upstream protocol client (`character-kit.ts`) against the real wire
  protocol** — verified against `agent_enforcer_daemon.js`'s
  `startSocketServer` and the Python `EnforcerClient` (same protocol, both
  read as source, not assumed): newline-delimited JSON over a Unix socket
  (or `tcp://host:port`), `{method, params, token?}` in, per-method response
  out. `gateAction`, `injectHabit`, `submitAcknowledgement`, and `heartbeat`
  are each tested end-to-end against a fake daemon speaking that exact
  protocol (`tests/character-kit.test.ts`), including auth-token rejection
  and unreachable-socket fail-closed paths.
- **Canonical downstream client wiring (MOD-004)** — `watchtower.ts`
  constructs a `FederationAgentClient` (canonical `fw_agent_*` bearer)
  additively alongside the legacy `WatchtowerClient`, used for
  connect/heartbeat/events/disconnect when `BridgeConfig.watchtowerAgentToken`
  is configured; absent, behavior is unchanged (legacy-only, zero
  regression). Verified hermetically in `tests/watchtower.test.ts` (fetch
  injected via the SDK's own `fetch` option, no real network).

**NOT proven (do not claim these work):**

- Live delivery to any Watchtower instance (`fapi.drdeeks.xyz` or local) — unit
  tests are hermetic; no test emits a real event over the network. This
  includes the canonical `FederationAgentClient` path (MOD-004) — no live
  integration test against a real running Federation instance exists yet.
- Owner creation / agent registration bootstrap
  (`FederationOwnerClient.createOwner`/`registerAgent`) — not wired anywhere
  in this codebase. `watchtowerOwnerToken` exists in config but nothing
  reads it yet.
- The upstream client against a **real running daemon** — tests use a
  protocol-accurate fake, not `agent_enforcer_daemon.js` itself.
- Dedicated transport modules (`unix-socket.ts`, `mcp.ts`) — not created;
  the Unix-socket transport lives inline in `character-kit.ts`.
- `scripts/` (start-dev / validate / replay-events) — not created.
- e2e topology tests (root / user / agent-local) — not created.
- x402 payment, org-rooms, sitcom UI — **out of scope**; they live in the
  Watchtower / Federation product, not here.

See `AGENTS.md` §8–§9 for the phase-by-phase breakdown and `CHANGELOG.md` for
the dated update trail.

---

## Relationship to the Google "All Things Agentic" hackathon

This adapter is **pre-existing platform infrastructure**, not a submission.
Per the Official Rules (hackathon repo `docs/rules.html`, line 856), pre-existing
code MUST be disclosed. This package is the **disclosure backbone**: a hackathon
submission is a *thin, newly built* ADK/Gemini agent layer that *uses* this adapter
+ Watchtower + Character Kit, with the platforms disclosed as prior work.

**Until the submission period opens, this adapter is scaffold + verified contracts
+ fail-closed logic only.** Real integration (live upstream client, downstream
delivery tests, submission ADK layer) happens **in-period**. Anything claimed working
before then is limited to what the unit tests prove.

---

## Build & verify

```bash
npm install
npm run validate     # tsc --noEmit — typecheck gate
npm test            # node --test via tsx — 32 unit tests
```

## Layout

```
src/
  contracts.ts   normalized event types (types only)
  config.ts      config validation
  failure.ts     fail-closed classification  ← read this first
  events.ts      event constants + makeEvent
  state.ts       dedupe / ordering / retry
  adapter.ts     orchestration (no policy, no storage)
  index.ts       public API only
  bridge/        character-kit.ts (upstream only) | watchtower.ts (downstream only, real SDK)
  normalization/ event-normalizer | dedupe | ordering
  transport/     transport interface | http
  runtime/       lifecycle | shutdown
tests/           unit: config, contracts, event-normalizer, adapter-roundtrip, ordering
docs/symbol-matrix.md  Phase 0 verified upstream export map
CHANGELOG.md     dated, append-only update trail
AGENTS.md        cold-start handoff + operating rules
```

Maintained files: `AGENTS.md` (internals) · `README.md` (outsiders) ·
`CHANGELOG.md` (history). Keep all three in sync on every change.