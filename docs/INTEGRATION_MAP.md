# Integration Map — what we build on, what we build

**Written:** 2026-08-14
**Scope:** the three-repo surface this submission spans.
**Method:** every claim below was verified by reading source in the repo named,
not by trusting an existing doc. Where a doc and the code disagreed, the code
won and the disagreement is called out.

This document answers four questions, in order:

1. What already exists and is **disclosed pre-existing foundation**?
2. What are we **building on top of** — and against which exact routes/tables?
3. What is the **current state** of each moving part?
4. What is **still to be done** — the real in-period build?

---

## 0. The three repos

| Repo | Role here | Disclosure |
|---|---|---|
| `~/projects/hackathon/` | **The submission.** All work happens here. | The build |
| `~/projects/federation/` | Federation Watchtower — live product (`fapi`/`watch`/`federation.drdeeks.xyz`) | **Pre-existing platform** |
| `~/projects/federation-adapters/watchtower-ack-adapter/` | Canonical home of the CK⇄Watchtower bridge | Mirror target |

**Working rule (owner directive, 2026-08-14):** the adapter is developed *inside*
`hackathon/adapter/`. When it's finished, it is copied back out to
`federation-adapters/watchtower-ack-adapter`. The hackathon repo is where the work
is done — not the other way around.

`hackathon/adapter/` was resynced from canonical on 2026-08-14 (it had been
stale: a 59-line boundary stub where canonical had the 198-line real socket
client, and it was missing `FEDERATION_ROUTE_MAP.md` plus
`tests/character-kit.test.ts` entirely). Verified after resync: `tsc --noEmit`
clean, **20/20 tests pass**. Its own `.gitignore` was preserved.

---

## 1. Pre-existing foundation (disclosed, not built in-period)

These are real, live, and ours to build **on top of** — they are not part of the
in-period build and must be disclosed as pre-existing.

### 1.1 Agent Character Kit — `@drdeeks/character-kit`
Published npm package. Local, fail-closed behavioral enforcement; one enforcer
daemon per agent workspace. Speaks newline-delimited JSON over a Unix socket (or
`tcp://host:port`), request shape `{method, params, token?}`.

### 1.2 Federation Watchtower — live in production
Cloudflare Worker + Durable Objects (`AgentRegistry`, `FederationCoordinator`,
`ProjectGuardrail`, `AgentWatchdog`, `RoomScene`) + D1 + R2 + Queue/DLQ.
Published SDK `@federation-watchtower/sdk`.

### 1.3 Credential primitives that ALREADY EXIST in Watchtower

This is the most important finding in this document, and it contradicts the
common framing that "per-org / per-agent identity doesn't exist yet."

**Per-agent credentials — LIVE.** `federation_agent_credentials`
(`0004_federation_lifecycle.sql`):

```sql
CREATE TABLE IF NOT EXISTS federation_agent_credentials (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    credential_hash TEXT NOT NULL UNIQUE,
    scopes TEXT NOT NULL,
    issued_at INTEGER NOT NULL,
    expires_at INTEGER,
    revoked_at INTEGER,
    last_used_at INTEGER,
    FOREIGN KEY(agent_id) REFERENCES federation_agents(id)
);
```

Hashed credential, real scopes, expiry, revocation, last-used tracking. Issued
as `fw_agent_*` bearer tokens (`lifecycle.ts:11-12,116`).

**Per-owner credentials — LIVE.** `federation_owners`, issued as `fw_owner_*`
(`lifecycle.ts:47`).

**Per-ORGANIZATION credentials — LIVE, but only on the MCP surface.**
`mcp_organizations` + `mcp_token_history` (`src/schema.sql`):

```sql
CREATE TABLE IF NOT EXISTS mcp_organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_email TEXT,
    api_key_hash TEXT NOT NULL,             -- bcrypt hash
    scopes TEXT DEFAULT '["org:read"]',     -- JSON array
    rate_limit INTEGER DEFAULT 100,         -- req/min
    ip_allowlist TEXT DEFAULT '[]',         -- JSON array of CIDRs
    status TEXT DEFAULT 'active',           -- active, suspended, revoked
    ...
);
CREATE TABLE IF NOT EXISTS mcp_token_history (
    org_id TEXT NOT NULL,
    action TEXT NOT NULL,                   -- issued, rotated, revoked
    scopes TEXT, issued_by TEXT, timestamp INTEGER, ...
);
```

That is a **complete** per-org credential system: hashed key, per-org scopes,
per-org rate limit, per-org IP allowlist, suspend/revoke status, key rotation
(`federation-coordinator.ts:320`), and a full issue/rotate/revoke audit trail.
Scope checking is real and hierarchical — `hasMcpScope()` (`mcp.ts:82-86`)
supports `*`, `watchtower:*`, `project:*`, `project:{id}`, and
`project:{id}:{permission}`.

**Why this matters for scoping the build:** the per-org identity work is
**not** a from-scratch build. The model, the scope grammar, the rotation path,
and the audit table all exist and are live. The gap is that this model covers
only the MCP surface — the REST/operator surface never got it.

---

## 2. What we are building on top of — exact routes

Source of truth: `hackathon/adapter/docs/FEDERATION_ROUTE_MAP.md`
(route-by-route, verified against `federation/docs/review/COMPLETE_SPEC.md`
§2.2/§2.3 and the real SDK).

### 2.1 Routes that accept canonical per-agent/per-owner bearer auth today

| Route | Auth | SDK client |
|---|---|---|
| `POST /api/v1/owners` | none (mints the credential) | `FederationOwnerClient.createOwner()` |
| `POST /api/v1/agents` | Bearer `fw_owner_*` | `FederationOwnerClient#registerAgent()` |
| `POST /api/v1/agents/{id}/connect` | Bearer `fw_agent_*` | `FederationAgentClient#connect()` |
| `POST /api/v1/agents/{id}/heartbeat` | Bearer `fw_agent_*` | `FederationAgentClient#heartbeat()` |
| `POST /api/v1/agents/{id}/events` | Bearer `fw_agent_*` | `FederationAgentClient#emit()` |
| `POST /api/v1/agents/{id}/disconnect` | Bearer `fw_agent_*` | `FederationAgentClient#disconnect()` |
| `POST /api/v1/projects/{id}/leases` | Bearer `fw_agent_*` | `WatchtowerClient#requestLease()` |

**These are what we build on.** The full canonical agent lifecycle already works
on real per-agent identity.

### 2.2 Routes with NO canonical bearer path (legacy shared HMAC only)

| Route | Owner of the gap |
|---|---|
| `POST /api/v1/projects/{id}/leases/{id}/validate` | Federation |
| `POST /api/v1/projects/{id}/tools/authorize` | Federation |
| `POST /api/v1/projects/{id}/validation-gates` | Federation |
| `GET /api/v1/projects/{id}/agents/{id}/commands` | Federation |
| `POST /api/v1/projects/{id}/commands/acknowledge` | Federation |

Until Federation adds `fw_agent_*` support to these, any adapter that wants the
complete containment loop must **also** hold the legacy ingestion secret for
these four. That is a documented hybrid, not a defect to hide.

### 2.3 The shared-admin-token surface

**19 routes** in `index.ts` are gated on `requireAdmin(request, env)` — a single
shared `WATCHTOWER_ADMIN_TOKEN`. `operator.html`'s `?project=<id>` narrows the
*UI* but still authenticates with that same shared token. There is no
org-scoped REST credential.

**Owner directive:** organizations must never share the platform admin key.

---

## 3. Current state, component by component

| Component | State | Verified how |
|---|---|---|
| Adapter Phase 0 (source inventory) | **DONE** | `docs/symbol-matrix.md` |
| Adapter Phase 1 (contracts) | **DONE** | `contracts.ts`, `events.ts`, `failure.ts` |
| Adapter Phase 2 (real CK socket client) | **DONE** | 198-line `character-kit.ts`, 20/20 tests pass |
| Adapter Phase 3 (Watchtower client) | **PARTIAL** — legacy HMAC only | `watchtower.ts` never constructs `FederationOwnerClient`/`FederationAgentClient` |
| Adapter Phase 5 (failure hardening) | logic done + unit-tested; no live simulation | `AGENTS.md` §8 |
| Adapter Phase 6 (topology) | **NOT STARTED** | `session_id` hardcoded `"default"` |
| Per-agent credentials (Watchtower) | **LIVE** | `federation_agent_credentials` |
| Per-org credentials — MCP surface | **LIVE** | `mcp_organizations` + `mcp_token_history` |
| Per-org credentials — REST/operator | **MISSING** | 19 × `requireAdmin`, shared token |
| Webhooks | **GLOBAL ONLY** | single `WATCHTOWER_ALERT_WEBHOOK_URL` env var; no per-org/per-agent destination column exists |
| Org branding (logo/color) | **MISSING** | no `logo` column; `lifecycle.ts` hardcodes `color: "#4fd1c5", emoji: "📡"` for every project |
| `layers/registry,runtime,gateway,observability,security` | **POPULATED** 2026-08-14 | 31 files ported + sanitized, all `node --check` clean |
| `layers/memory/` | **EMPTY** | promotion of `shared/memory/` never done |
| `layers/modelarmor/` | **EMPTY** | no candidate source anywhere — true content gap |
| `shared/memory/` (Mnemosyne engine) | real, ~5,000 lines, works | store/embeddings/recall/forget/learning |
| **Memory tiering** | **DOES NOT EXIST** | see §4.1 |
| `shared/enforcement/fail-closed-gate.js` | real, 70 lines, unwired | `gate()` defaults to throw = fail-closed |

---

## 4. What still has to be built (the in-period work)

Everything in this section is **new work, built during the submission period**,
and should be identified as such. Nothing here is pre-existing.

### 4.1 Memory tiering — build, not port

**There is no memory tiering anywhere in this project.** Grepping all ~5,000
lines of `shared/memory/` for `tier|promote|daily|weekly|long-term|consolidat`
returns exactly one hit: a `period: 'weekly'` string label in
`learning.js:832`. The engine ingests, embeds, recalls, forgets, and learns —
it never tiers.

Working implementations of tiering exist **outside** the codebase and were never
brought in:

- `~/.claude/tools/memory-log.sh`, `memory-promote.sh`, `nemo.sh` — operator
  tooling (bash), daily→promote pipeline.
- `agent-identity-architecture` skill → `scripts/memory_curator.py` — a real
  daily → weekly → long-term + knowledge-index curator.

Neither is product code. This is a genuine build item, and per the owner it is
also a **revamp**: implement what those prove is possible, then go past it.

Also note the honest caveat already in `shared/memory/README.md`:
`embedding-engine.js`'s `local` backend produces **hash-bucket** vectors, not
real semantic embeddings. Recall *infrastructure* is production-shaped; vector
*quality* is not. Swapping to a real embedder is part of this work.

### 4.2 Org-scoped REST credentials — generalize, don't invent
Extend the `mcp_organizations` credential model (hash + scopes + rate limit +
IP allowlist + rotation + `mcp_token_history` audit) to cover the REST/operator
surface, replacing the 19 shared-admin-token gates with real org identity.
Prerequisite for 4.3 and 4.4.

### 4.3 Per-org and per-agent webhook destinations
Replace the single global `WATCHTOWER_ALERT_WEBHOOK_URL` with per-recipient
destinations so notifications attribute correctly. Depends on 4.2.

### 4.4 Org branding gated on approval
Logo upload + color choice, available only after an org is approved. Needs a
`logo` field (none exists), a real color path (currently hardcoded), and an
approval gate. Depends on 4.2.

### 4.5 Adapter Phase 3 — canonical wiring
Add the `FederationOwnerClient`/`FederationAgentClient` code path in
`watchtower.ts`; add owner/agent token fields to `config.ts`/`contracts.ts`,
distinct from today's single `watchtowerIngestionSecret`. Both credentials are
one-time-plaintext-then-encrypted.

### 4.6 Federation-side bearer support for the 4 routes
Add `fw_agent_*` acceptance to lease validate, tool authorize, validation gates,
and commands — mirroring what lease *request* already does.

### 4.7 Wire the fail-closed gate to the real enforcer
`shared/enforcement/fail-closed-gate.js` takes a `gate(action)` function and
blocks by default. The adapter's `character-kit.ts` (Phase 2, done) is exactly
that function. **This is a ready connection, not two open gaps** — then promote
into `layers/security/`.

### 4.8 Promote `shared/memory/` → `layers/memory/`
Wire against a Firestore-backed store + ADK runtime. The engines are already
storage-agnostic (they take a `MemoryStore` instance), so this is wiring, not a
rewrite. **This is also the item that satisfies the mandatory Google Cloud
infrastructure requirement**, which nothing in the current stack does —
Watchtower is entirely Cloudflare.

### 4.9 `layers/modelarmor/` — the one true content gap
Prompt-injection + PII screening on ingress/egress. No candidate source exists
anywhere; must be built in-period against a managed API.

---

## 5. Known documentation drift (found while verifying)

- `federation/AGENTS.md` describes the adapter as *"an explicit boundary stub
  that throws 'unavailable' by design"* with *"12/12 unit tests"*. **Stale** —
  Phase 2 landed 2026-08-13 (`f5d8c57`); it is a real socket client and 20/20
  tests pass. It also cites the path `~/projects/hackathon/canonical/adapter/`,
  which does not exist (`canonical/` was never a real directory).
- `federation/docs/review/COMPLETE_SPEC.md` notes `agents-skill.md` (served
  publicly at `/agent-skill.md`) documents POST/PATCH agent routes that **don't
  exist** — the router is GET-only there. An adapter built against that
  published doc breaks immediately.
- A PROJECT-tier blueprint covering much of §4 already exists, uncommitted, at
  `federation/docs/blueprint/federation-ecosystem-hardening/` (810 lines, 7
  phases, dated 2026-08-14). It is **untracked** — it must be committed or
  deliberately superseded, not silently left to rot.

---

## 6. Open decisions (not mine to make)

1. **Project name.** Still unnamed; becomes `Federation-<name>`.
2. **Where the ecosystem-hardening blueprint lives** — it currently sits in the
   federation repo while the working rule says work happens in `hackathon/`.
3. **Whether `fix/rooms-agents-migrations` gets pushed** before schema work
   begins (new migrations must land on top of its `0010`, not diverge).
