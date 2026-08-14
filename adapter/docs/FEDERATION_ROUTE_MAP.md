# Federation Watchtower route map — what exists, what's wired, what's missing

Written 2026-08-13 to answer one question precisely: **for the Character Kit
⇄ Watchtower bridge to cover every route Federation exposes, what needs to
change — in this repo, in Federation, or both?**

Source of truth for the route catalog: `~/projects/federation/docs/review/
COMPLETE_SPEC.md` §2 (a background-subagent review verified against the
actual `federation-serverless` source, not the SDK's `.d.ts` alone). Source
of truth for what this bridge actually calls: `src/bridge/watchtower.ts`
and `@federation-watchtower/sdk/src/index.d.ts` (both read directly for
this doc, 2026-08-13).

## The headline finding

**Most of the gap is on this repo's side, not Federation's.** The SDK
already exports a full canonical (`fw_owner_*`/`fw_agent_*`) client —
`FederationOwnerClient` and `FederationAgentClient` — and Federation's
server already accepts canonical bearer auth for owner creation, agent
registration, connect, heartbeat, events, disconnect, **and leases**.
`src/bridge/watchtower.ts` never uses any of that. It only constructs a
`WatchtowerClient`, which is the *legacy producer-signed HMAC* path —
correct as one supported transport, wrong as the *only* one, per
`COMPLETE_SPEC.md` §8's own guidance: *"Use the canonical owner/agent
lifecycle... not the legacy shared HMAC producer secret... for any real
production agent identity."*

Only four routes have **no canonical bearer alternative at all** — those
are genuinely Federation's gap to close, not something this adapter can
route around.

## Route-by-route

| Route | Auth accepted (verified, COMPLETE_SPEC.md §2.2/§2.3) | SDK client method | Wired in `watchtower.ts`? |
|---|---|---|---|
| `POST /api/v1/owners` | None (creates the credential) | `FederationOwnerClient.createOwner()` (static) | **No** |
| `POST /api/v1/agents` | Bearer `fw_owner_*` | `FederationOwnerClient#registerAgent(manifest)` | **No** |
| `POST /api/v1/agents/{id}/connect` | Bearer `fw_agent_*` | `FederationAgentClient#connect()` | **No** |
| `POST /api/v1/agents/{id}/heartbeat` | Bearer `fw_agent_*` | `FederationAgentClient#heartbeat()` | **No** — `wt.heartbeat()` in `adapter.ts` calls `WatchtowerClient.heartbeat()` (legacy `HeartbeatInput` shape) instead |
| `POST /api/v1/agents/{id}/events` | Bearer `fw_agent_*` | `FederationAgentClient#emit()` | **No** — `wt.emit()` calls `WatchtowerClient.emitEvent()` (legacy) instead |
| `POST /api/v1/agents/{id}/disconnect` | Bearer `fw_agent_*` | `FederationAgentClient#disconnect()` | **No** |
| `POST /api/v1/projects/{id}/leases` | **Bearer `fw_agent_*`** (despite living in the "legacy" section of the router — verified, not assumed) | `WatchtowerClient#requestLease()` | **No** — not called anywhere in this bridge yet at all, canonical or legacy |
| `POST /api/v1/events` (legacy ingestion) | Producer-signed HMAC only | `WatchtowerClient#emitEvent()` | **Yes** — this is what `wt.emit()` actually uses |
| `POST /api/v1/projects/{id}/leases/{id}/validate` | Producer-signed HMAC only | `WatchtowerClient#validateLease()` | **No** — not called anywhere yet |
| `POST /api/v1/projects/{id}/tools/authorize` | **Producer-signed HMAC only — no bearer path exists** | `WatchtowerClient#authorizeAction()` | **No** |
| `POST /api/v1/projects/{id}/validation-gates` | **Producer-signed HMAC only — no bearer path exists** | `WatchtowerClient#submitValidationGate()` | **No** |
| `GET /api/v1/projects/{id}/agents/{id}/commands` | **Producer-signed HMAC only — no bearer path exists** | `WatchtowerClient#getCommands()` | **No** |
| `POST /api/v1/projects/{id}/commands/acknowledge` | **Producer-signed HMAC only — no bearer path exists** | `WatchtowerClient#acknowledgeCommand()` | **No** |

## What that means, split by who owns the fix

**Adapter-side (this repo — the actual bulk of the work):**
`watchtower.ts` needs a second code path using `FederationOwnerClient` +
`FederationAgentClient` for owner creation, agent registration, connect,
heartbeat, events, disconnect, and lease request — all of which Federation
already supports canonically. This is real Phase 3 work that the "DONE at
surface" status previously glossed over: it was done against *a* real SDK
surface, not *the recommended* one. `config.ts`/`contracts.ts` will need an
owner token / agent token concept distinct from today's single
`watchtowerIngestionSecret`, since canonical auth is a different credential
shape (`fw_owner_*` created once via `createOwner`, `fw_agent_*` returned
once via `registerAgent` — both need the same one-time-plaintext-then-
encrypted handling as any other generated secret).

**Federation-side (their repo, not ours to route around):** lease
*validation*, tool authorization, validation gates, and command
polling/acknowledgment have no canonical bearer path today — only the
producer-signed HMAC route works for those four. An adapter that wants the
**complete** cooperative containment loop on canonical credentials cannot
do so until Federation adds `fw_agent_*` bearer support to those four
routes (mirroring what already exists for lease *request*). Until then, a
fully-canonical adapter still has to hold `WATCHTOWER_INGESTION_SECRET` and
sign those four calls the legacy way — a real, documented hybrid, not a
bug to hide.

## Not covered by this map

`COMPLETE_SPEC.md` §2.1 (system/discovery), §2.4–§2.8 (admin management,
incidents/budget/evidence, legacy federation-verification, MCP org admin,
self-hosted alert receiver + WebSocket) are Federation operator/admin
surfaces, not agent-facing — out of scope for this bridge by the same logic
`AGENTS.md` §1 already applies to x402/org-rooms/sitcom UI. §3's MCP
surfaces (remote gateway, local demo server, `watchtower_loop.py`) are
alternative integration paths to the same routes above, not additional
routes.

## How to apply

Don't re-derive this by re-reading both specs from scratch next session —
this table is current as of the commit that added it. If either
`watchtower.ts` or Federation's route auth changes, this file goes stale;
update it in the same commit (same discipline as `AGENTS.md` §8's
maintenance rule).
