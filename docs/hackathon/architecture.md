# The Federation — Architecture (PHASE-0.4)

This is the architecture evidence artifact for PHASE-0 of `blueprint.md`
(Part I — System Overview and Architecture). It restates the authoritative
architecture already specified there in a standalone, citable form, as
required by `docs/README.md`'s modularity rule ("detailed docs are under
docs"). `blueprint.md` remains the single source of truth; this document
does not add, remove, or reinterpret anything it specifies — it exists so
the architecture has its own reference path independent of the blueprint's
internal section numbering.

## System identity

The Federation is a persistent digital civilization where humans and
autonomous agents coexist, create, work, communicate, play, exchange value,
and develop in a shared ecosystem. This repository builds the foundation
layer: persistent agent identity, independent cognitive subsystems, human
control, local management, the Google hackathon execution slice, and
integration contracts for future Federation districts.

The Federation is the parent identity. Federation Watchtower, Federation
CreAgent, Federation Marketplace, Federation Arcade, Federation Brain Sync,
and future projects are districts or institutions under that identity.
Watchtower, CharacterKit, Gemini, Google ADK, Cloudflare Workers, and
Durable Objects are integration or implementation points; none of them
replace the parent. (Cross-referenced, not duplicated: `docs/INTEGRATION_MAP.md`
is the current implementation-inventory view of these same relationships.)

## Layer diagram

```
THE FEDERATION — parent identity and civilization
  |
  +-- PEOPLE and AGENTS
  |     +-- humans remain participants and owners
  |     +-- agents retain persistent identity
  |
  +-- FOUNDATION
  |     +-- identity and registration
  |     +-- four-tier memory
  |     +-- knowledge and retrieval
  |     +-- context routing
  |     +-- policy and control
  |     +-- local agent management
  |
  +-- GOOGLE HACKATHON RUNTIME
  |     +-- Gemini API or Vertex AI
  |     +-- Google ADK orchestration
  |     +-- Google Cloud execution evidence
  |
  +-- ADAPTER BRIDGE
  |     +-- API normalization
  |     +-- MCP tool and resource contracts
  |     +-- per-agent credentials
  |     +-- per-organization credentials
  |     +-- per-agent webhooks
  |     +-- per-organization webhooks
  |
  +-- MONITORED ACTIONS
  |     +-- immutable event identifiers
  |     +-- tool calls and function actions
  |     +-- status, timestamp, trigger, provenance
  |
  +-- FEDERATION LOCAL OBSERVABILITY
  |     +-- fleet health
  |     +-- heartbeat and loop state
  |     +-- terminal and event feeds
  |     +-- audit references
  |
  +-- PER-AGENT MANAGEMENT DRAWER
  |     +-- terminal, memory, tasks, policy
  |     +-- steer, pause, resume, kill
  |
  +-- FUTURE DISTRICTS
        +-- Federation CreAgent
        +-- Federation Marketplace
        +-- Federation Arcade
        +-- Federation Brain Sync
        +-- future institutions and communities
```

## Layer contracts (what each layer owns, and does not own)

| Layer | Owns | Does not own |
|---|---|---|
| Foundation | identity, persistence, boundaries | external canonical history |
| Memory | daily, weekly, long-term, promotion | graph, vectors, execution state |
| Knowledge | entities, relations, corpus references | memory mutable state |
| Retrieval | documents, embeddings, ranking | policy or identity |
| Router | read queries and temporary context | durable state |
| Control | policy, ACK, commitments, interventions | UI-only authority |
| UI | presentation and operator input | direct database writes |
| Adapter | API, MCP, normalization, scope | hidden shared state |
| Observability | local immutable-action projection | source mutation |
| Districts | specialized experiences | separate parent identity |

## Module registry

| Module ID | Name | Responsibility | Active path | Status |
|---|---|---|---|---|
| MOD-001 | Federation Foundation | identity, boundaries, provenance | AGENTS.md, README.md, package.json → src/federation | PARTIAL |
| MOD-002 | Cognitive Memory | four tiers and explicit promotion | shared/memory, src/memory | PARTIAL |
| MOD-003 | Knowledge Retrieval | graph, corpus, vectors, hybrid search | src/memory/semantic | PARTIAL |
| MOD-004 | Context Router | read-only queries and composition | architecture contract → src/context | PLANNED |
| MOD-005 | Control Plane | policy, ACK, habits, commitments, controls | scope contract → src/control | PLANNED |
| MOD-006 | Agent UI | fleet, drawer, terminal, memory, tasks | UI contract → src/ui | PLANNED |
| MOD-007 | Google Runtime | Gemini, ADK, cloud, delegation | runtime contract → src/runtime/google | PLANNED |
| MOD-008 | Observability | immutable actions, health, loops, audit | migrations and contract → src/observability | PARTIAL |
| MOD-009 | Adapter Bridge | API, MCP, normalization | adapter contract → src/integrations/adapter | PLANNED |
| MOD-010 | Scoped Integration | credentials, imports, webhooks | webhook contract → src/integrations/webhooks | PLANNED |
| MOD-011 | Evidence Handoff | demo, disclosure, reproducibility | docs and evidence → docs/hackathon | PARTIAL |

Status values follow `blueprint.md` §1.8's vocabulary exactly: IMPLEMENTED
(active code with passing or documented verification), PARTIAL (active code
exists but a contract, test, or runtime path remains), PLANNED (specified
without claiming implementation), BLOCKED (a specific dependency prevents
verification). This document never treats planned work as completed.

## Independent persistence model

Seven independently-owned stores, per `blueprint.md` §4.1 — no shared
mutable database is assumed between them:

- **MemoryStore** — daily, weekly, long-term, and identity-context records.
- **KnowledgeStore** — entities, facts, and relations.
- **DocumentStore** — supplied corpus metadata and resolved documents.
- **VectorStore** — chunks, embeddings, and search metadata.
- **EventStore** — normalized immutable-action references.
- **ControlStore** — policy decisions and human control commands.
- **ScopeStore** — credential and webhook scope.

Execution state is governed by the blueprint and checklist and is not
memory.

## Sequential boundary policy (why sibling repos aren't touched yet)

Per `blueprint.md` §5.3: PHASE-0 through PHASE-3 complete this
repository's own foundation and hackathon slice. PHASE-4 completes the
adapter bridge *subset housed in this repository* — not the adapter's own
separate repository. PHASE-5 prepares the future Federation handoff and
evidence. Cross-system tuning (actually reconciling this blueprint's
adapter/credential/webhook design against the real, already-implemented
work in Federation Watchtower and the adapter's own repositories) begins
only after independent checks for all three boundaries pass here first.
Sibling repositories may be referenced for factual integration contracts
(see `docs/INTEGRATION_MAP.md`) but are not edited during this sequence.

## Portability mapping

| Current contract | Google path (hackathon) | Future edge path (post-hackathon) |
|---|---|---|
| MemoryStore | Cloud SQL or Firestore adapter | Durable Object or D1 adapter |
| VectorStore | managed or local vector adapter | Vectorize adapter |
| Agent runtime | ADK and Gemini | provider-neutral runtime |
| Event projection | normalized source events | Workers queue or Durable Object |
| Control command | local API and cloud service | authenticated Worker endpoint |
| Webhook delivery | cloud endpoint | Worker and queue retry |

## Non-negotiable principles

The sixteen principles in `blueprint.md` §1.3 govern every module above;
they are not repeated here in full to avoid the exact kind of duplicated
source-of-truth this blueprint's own §1 (Part I) and the Federation's
FOREVER-SYSTEM doctrine both prohibit. Read them at the source. The two
most load-bearing for this architecture document specifically:

- Principle 9: "No layer requires another layer to exist" — this is why
  MOD-004 through MOD-010 can be PLANNED while MOD-001/002/003/008/011 are
  already PARTIAL; the layers are independently useful, not a single
  monolithic build that only becomes real at 100%.
- Principle 13: "Credentials and webhooks are independently scoped per
  agent and per organization" — the exact requirement MOD-009/MOD-010
  exist to satisfy. `docs/INTEGRATION_MAP.md`'s "Credential and webhook
  bridge" section already notes that scoped per-agent/per-organization
  credential and webhook primitives exist externally and must become
  Federation-visible; this document does not assign those external
  primitives module IDs of its own, since blueprint.md doesn't either —
  MOD-009/MOD-010 remain PLANNED here regardless of what exists in a
  sibling repository, per the sequential boundary policy above.
