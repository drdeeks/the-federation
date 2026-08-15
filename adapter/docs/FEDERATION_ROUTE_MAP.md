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

**UPDATE 2026-08-14 (MOD-004): the connect/heartbeat/events/disconnect gap
below is closed.** `src/bridge/watchtower.ts` now constructs a
`FederationAgentClient` alongside the legacy `WatchtowerClient`, used for
those four routes when `BridgeConfig.watchtowerAgentToken` is configured
(optional — absent, behavior is unchanged, legacy-only). Owner creation and
agent registration (`FederationOwnerClient.createOwner`/`registerAgent`)
are still not wired — those are one-time bootstrap calls, not part of the
steady-state runtime path this pass touched, and lease request
(`requestLease`) is still not called anywhere in this bridge at all,
canonical or legacy — the SDK's `FederationAgentClient` doesn't even expose
a canonical method for it (only the legacy `WatchtowerClient` does), so
wiring it canonically isn't possible until the SDK adds one. See
`CHANGELOG.md`'s 2026-08-14 entry for the full account.

Original finding (still accurate for the four routes below marked
Federation-side): only four routes have **no canonical bearer alternative
at all** — those are genuinely Federation's gap to close, not something
this adapter can route around. (As of the same date, Federation's own
`fix/rooms-agents-migrations` branch closed that gap too, additively —
unpushed, and not yet this adapter's concern until it ships; this repo's
legacy path already works against it unchanged either way.)

## Route-by-route

| Route | Auth accepted (verified, COMPLETE_SPEC.md §2.2/§2.3) | SDK client method | Wired in `watchtower.ts`? |
|---|---|---|---|
| `POST /api/v1/owners` | None (creates the credential) | `FederationOwnerClient.createOwner()` (static) | **No** — one-time bootstrap, not this pass's scope |
| `POST /api/v1/agents` | Bearer `fw_owner_*` | `FederationOwnerClient#registerAgent(manifest)` | **No** — one-time bootstrap, not this pass's scope |
| `POST /api/v1/agents/{id}/connect` | Bearer `fw_agent_*` | `FederationAgentClient#connect()` | **Yes, canonically, when `watchtowerAgentToken` is configured** — wired into `adapter.ts`'s `bridge.start()` (previously a no-op). Falls back to a no-op (not legacy — `WatchtowerClient` has no connect concept) when no canonical token is set. |
| `POST /api/v1/agents/{id}/heartbeat` | Bearer `fw_agent_*` | `FederationAgentClient#heartbeat()` | **Yes, canonically, when configured** — `wt.heartbeat()` routes to it; falls back to legacy `WatchtowerClient.heartbeat()` otherwise (unchanged from before) |
| `POST /api/v1/agents/{id}/events` | Bearer `fw_agent_*` | `FederationAgentClient#emit()` | **Yes, canonically, when configured** — `wt.emit()` routes to it; falls back to legacy `WatchtowerClient.emitEvent()` otherwise (unchanged from before) |
| `POST /api/v1/agents/{id}/disconnect` | Bearer `fw_agent_*` | `FederationAgentClient#disconnect()` | **Yes, canonically, when configured** — wired into `adapter.ts`'s `bridge.stop()` (previously a no-op). No-op fallback otherwise, same reasoning as connect. |
| `POST /api/v1/projects/{id}/leases` | **Bearer `fw_agent_*`** (despite living in the "legacy" section of the router — verified, not assumed) | `WatchtowerClient#requestLease()` | **No** — not called anywhere in this bridge yet at all, canonical or legacy. The SDK's `FederationAgentClient` has no `requestLease` method, so a canonical path isn't possible without an SDK change. |
| `POST /api/v1/events` (legacy ingestion) | Producer-signed HMAC only | `WatchtowerClient#emitEvent()` | **Yes** — the legacy fallback `wt.emit()` still uses when no canonical token is configured |
| `POST /api/v1/projects/{id}/leases/{id}/validate` | Producer-signed HMAC only (Federation's `fix/rooms-agents-migrations` branch adds canonical dual-auth here too, unpushed as of 2026-08-14 — not yet live, not yet this adapter's concern) | `WatchtowerClient#validateLease()` | **No** — not called anywhere yet |
| `POST /api/v1/projects/{id}/tools/authorize` | Producer-signed HMAC only (same unpushed Federation-side dual-auth note as above) | `WatchtowerClient#authorizeAction()` | **No** |
| `POST /api/v1/projects/{id}/validation-gates` | Producer-signed HMAC only (same unpushed Federation-side dual-auth note as above) | `WatchtowerClient#submitValidationGate()` | **No** |
| `GET /api/v1/projects/{id}/agents/{id}/commands` | Producer-signed HMAC only (same unpushed Federation-side dual-auth note as above) | `WatchtowerClient#getCommands()` | **No** |
| `POST /api/v1/projects/{id}/commands/acknowledge` | Producer-signed HMAC only (same unpushed Federation-side dual-auth note as above) | `WatchtowerClient#acknowledgeCommand()` | **No** |

## What that means, split by who owns the fix

**Adapter-side (this repo) — DONE for connect/heartbeat/events/disconnect
as of 2026-08-14 (MOD-004):** `watchtower.ts` now has a second code path
using `FederationAgentClient`, used when a canonical `fw_agent_*` token is
configured. `config.ts`/`contracts.ts` gained the owner token / agent token
concept this section originally called for
(`watchtowerAgentToken`/`watchtowerOwnerToken`, optional). **Still open:**
owner creation + agent registration bootstrap (`FederationOwnerClient.
createOwner`/`registerAgent`) — nothing in this codebase currently calls
either; some future setup/onboarding flow needs to, and needs the
one-time-plaintext-then-encrypted handling this section flagged for the
returned `fw_owner_*`/`fw_agent_*` tokens. Also still open: `requestLease`
has no canonical path in the SDK at all yet (see the table above).

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
