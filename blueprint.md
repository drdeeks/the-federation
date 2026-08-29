# The Federation — ENTERPRISE BLUEPRINT
## Version: 1.0 | Document Class: MASTER SPECIFICATION
## Scope: PROJECT
### Generated: 2026-08-16

> **READ FIRST — DOCUMENT AUTHORITY**
> This document is the single source of truth. No feature may be built,
> no schema migrated, and no API changed without this document as the
> authoritative reference. All contributors MUST read Part V (Change
> Control Protocol) before touching any file. This document's change
> log is APPEND-ONLY. Prior sections may only be updated via a formal
> amendment with a corresponding CL entry.

---

## TABLE OF CONTENTS

```
PART I    — SYSTEM OVERVIEW & ARCHITECTURE
PART II   — MODULE REGISTRY
PART III  — SCREEN & FEATURE SPECIFICATIONS
PART IV   — DATA ARCHITECTURE
PART V    — CHANGE CONTROL PROTOCOL
PART VI   — MASTER IMPLEMENTATION CHECKLIST
PART VII  — QUALITY & COMPLIANCE STANDARDS
```

---

---

# PART I — SYSTEM OVERVIEW & ARCHITECTURE

> **Rollback Tag:** `[SYS-OVERVIEW-v1]`

## 1.1 Vision Statement

The Federation is a persistent identity, memory, context, control, and observability layer for autonomous agents. It gives agents continuity across runs while giving humans a native environment for configuring, steering, inspecting, and managing a fleet.

Watchtower remains canonical for identity, lifecycle, rooms, credentials, heartbeats, leases, events, and operator/MCP surfaces. CharacterKit remains canonical for habits, ACKs, commitments, command policy, and fail-closed behavior. Federation owns independent memory planes, knowledge retrieval, context composition, delegation, tasks, jobs, local controls, local observability, and the human-facing experience.

## 1.2 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HUMAN OPERATOR: fleet, agent drawer, terminal, memory, tasks, logs, controls │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ authenticated read or command
┌───────────────────────────────────▼──────────────────────────────────────────┐
│ FEDERATION APPLICATION: API, MCP integration, webhook intake, local fallback│
├──────────────────┬───────────────────┬──────────────────┬────────────────────┤
│ IDENTITY MIRROR  │ CONTROL PLANE     │ CONTEXT PLANE    │ OBSERVABILITY      │
│ Watchtower refs  │ tasks/jobs/steer  │ memory queries   │ local projection   │
│ no identity copy │ pause/resume/kill │ delegation       │ Watchtower mirror  │
└─────────┬────────┴─────────┬─────────┴─────────┬────────┴─────────┬──────────┘
          │                    │                   │                    │
┌─────────▼─────────┐ ┌──────▼──────────┐ ┌──────▼──────────┐ ┌──────▼───────┐
│ FEDERATION MEMORY  │ │ CHARACTERKIT     │ │ KNOWLEDGE PLANE  │ │ EVENT PLANE  │
│ working/episodic   │ │ habits/ACK       │ │ graph/corpus     │ │ source IDs   │
│ persistent/identity│ │ commitments      │ │ vectors/hybrid   │ │ provenance   │
│ retention/promotion│ │ fail-closed     │ │ independent      │ │ local facts  │
└─────────┬─────────┘ └──────┬───────────┘ └──────┬───────────┘ └──────┬───────┘
          │                   │                    │                    │
┌─────────▼───────────────────▼────────────────────▼────────────────────▼──────┐
│ PROVIDER-NEUTRAL PORTS: storage, model, object, queue, telemetry, transport  │
│ package-name resolution; explicit configuration; no machine-local paths      │
└───────────────────────────────────┬───────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼───────────────────────────────────────────┐
│ @the-federation/watchtower-adapter — TRANSLATION ONLY                                   │
│ CharacterKit activity ⇄ normalized facts ⇄ Watchtower transport              │
│ no identity, policy, memory, lease decision, or canonical source of truth    │
└──────────────────────┬──────────────────────────────────────┬─────────────────┘
                       │                                      │
┌──────────────────────▼─────────────────────┐ ┌──────────────▼────────────────┐
│ @drdeeks/character-kit: enforcement         │ │ @federation-watchtower/sdk:  │
│ habits, ACK, commitments, command policy    │ │ identity, lifecycle, rooms,  │
│ fail-closed behavioral decision authority   │ │ heartbeats, leases, events   │
└──────────────────────────────────────────────┘ └──────────────────────────────┘
│                                                                              │
│ Identity references remain portable across organization and room changes.    │
│ Organization membership never becomes agent identity.                       │
│ Room placement never becomes agent identity.                                 │
│ Memory and knowledge remain separately queryable and separately persisted.   │
│ Context composition is read-only over both planes.                           │
│ Delegation is a task decision, never an implicit prompt mutation.            │
│ CharacterKit decisions are preserved as external enforcement facts.          │
│ Watchtower events are referenced, not recreated.                             │
│ The adapter translates envelopes and transport results only.                 │
│ Local fallback never claims an unavailable external action succeeded.        │
│ Provider ports expose capabilities without leaking vendor types into domain. │
│ Control commands require authorization and produce receipts.                 │
│ Observability exposes source, freshness, verification, and degradation.     │
│ Rollback preserves evidence and does not rewrite canonical history.           │
```

The UI is a projection. Canonical event truth remains external and traceable.

## 1.3 Technology and Directory Contract

| Layer | Technology | Rationale |
|---|---|---|
| Domain contracts | JavaScript modules and package interfaces | provider-neutral boundaries |
| Reusable primitives | `shared/memory`, `shared/enforcement` | one implementation per capability |
| Application | `src/memory`, `src/knowledge`, `src/context`, `src/control`, `src/observability`, `src/integrations` | functional boundaries |
| Human surface | `ui/` and `src/server/` | native visibility and management |
| Canonical packages | `@drdeeks/character-kit`, `@federation-watchtower/sdk` | package-name references only |
| Translator | `@the-federation/watchtower-adapter` | disposable translation boundary |
| Provider bindings | explicit storage, model, object, queue, telemetry ports | migration without domain rewrites |

---

---

# PART II — MODULE REGISTRY

> **Rollback Tag:** `[MODULE-REGISTRY-v1]`
> **Rule:** Every change log entry MUST reference at least one Module ID
> (unless this Part is N/A for this scope).

| Module ID | Name | Description | Feature Flag |
|---|---|---|---|
| MOD-001 | Federation Memory | Four memory tiers, retention, provenance, and promotion | FEAT_MEMORY |
| MOD-002 | Knowledge Plane | Graph, corpus, vector, and hybrid semantic retrieval | FEAT_KNOWLEDGE |
| MOD-003 | Context and Delegation | Bounded composition and capability-based routing | FEAT_CONTEXT |
| MOD-004 | Control Plane | Tasks, jobs, human controls, terminal, and receipts | FEAT_CONTROL |
| MOD-005 | Native Observability | Watchtower visibility mirror, local fallback, and provenance | FEAT_OBSERVABILITY |
| MOD-006 | Integration Ports | Adapter, MCP/webhook, and replaceable provider boundaries | FEAT_PORTABILITY |

Each module is independently owned, testable, and connected only through declared contracts.

---

---

# PART III — SCREEN & FEATURE SPECIFICATIONS

> **Rollback Tag:** `[SPECS-v1]`

Each specification follows this format:
> ID, Module Ref, Rollback Tag, Feature Flag, Purpose,
> Components, Rules, Error States, Fallback.

### FEAT-001 — Federation Memory
FEATURE ID: FEAT-001
MODULE REF: MOD-001
ROLLBACK TAG: [MEMORY-SPECS-v1]
FEATURE FLAG: FEAT_MEMORY
PURPOSE: Persist and retrieve agent context across runs through bounded independent tiers.
COMPONENTS: working, episodic, persistent, identity/context stores; memory manager; shared engine.
RULES: scope, tier, provenance, confidence, retention, and lifecycle are mandatory; promotion is explicit.
ERROR STATES: invalid tier, expired record, denied scope, oversized payload, provider failure.
FALLBACK: bounded local evidence with an explicit degraded state; never fabricate memory.
TESTING: isolation, promotion, expiry, denial, replay, corruption, and provider failure.

### FEAT-002 — Knowledge Retrieval
FEATURE ID: FEAT-002
MODULE REF: MOD-002
ROLLBACK TAG: [KNOWLEDGE-SPECS-v1]
FEATURE FLAG: FEAT_KNOWLEDGE
PURPOSE: Search graph, corpus, vectors, and hybrid evidence without merging knowledge into episodic memory.
COMPONENTS: graph, corpus, vector, embedding, hybrid retrieval, provenance envelope.
RULES: hashes deduplicate documents; confidence and source references survive retrieval.
ERROR STATES: no match, low confidence, malformed embedding, duplicate, denied source, unavailable index.
FALLBACK: typed empty evidence with reason and confidence metadata.
TESTING: graph, corpus, vector, hybrid, empty, denial, and timeout paths.

### FEAT-003 — Context and Delegation
FEATURE ID: FEAT-003
MODULE REF: MOD-003
ROLLBACK TAG: [CONTEXT-SPECS-v1]
FEATURE FLAG: FEAT_CONTEXT
PURPOSE: Compose bounded context and route work to an explicitly permitted capable agent.
COMPONENTS: context router, capability registry, task envelope, delegation record.
RULES: context is temporary; delegation is an explicit auditable task decision.
ERROR STATES: budget exceeded, ambiguous capability, denied route, stale target, duplicate task.
FALLBACK: review-required unassigned task; no automatic execution.
TESTING: bounded composition, provenance, denial, idempotency, stale target, retry.

### FEAT-004 — Human Control
FEATURE ID: FEAT-004
MODULE REF: MOD-004
ROLLBACK TAG: [CONTROL-SPECS-v1]
FEATURE FLAG: FEAT_CONTROL
PURPOSE: Provide human lifecycle, task, job, terminal, and intervention controls fail-closed.
COMPONENTS: control routes, task/job managers, terminal, UI, receipts, CharacterKit boundary.
RULES: Federation presents and records; CharacterKit enforces; Watchtower validates canonical external state.
ERROR STATES: unknown, denied, expired, unavailable, duplicate, timeout.
FALLBACK: record denial and expose safe local intervention; never infer success.
TESTING: steer, pause, resume, kill, terminal, approval, denial, replay.

### FEAT-005 — Native Observability
FEATURE ID: FEAT-005
MODULE REF: MOD-005
ROLLBACK TAG: [OBSERVABILITY-SPECS-v1]
FEATURE FLAG: FEAT_OBSERVABILITY
PURPOSE: Mirror Watchtower visibility while retaining a local projection and fallback.
COMPONENTS: fleet status, agent drawer, event stream, local log, SDK/MCP reads, signed webhook intake.
RULES: canonical event IDs and source references remain visible; presentation cannot rewrite history.
ERROR STATES: invalid signature, lag, duplicate, disconnect, corrupt payload, unavailable source.
FALLBACK: retain verified local envelope and mark degraded.
TESTING: mirror, fallback, signature, dedupe, ordering, heartbeat, loop, provenance.

### FEAT-006 — Translator and Provider Ports
FEATURE ID: FEAT-006
MODULE REF: MOD-006
ROLLBACK TAG: [PORTABILITY-SPECS-v1]
FEATURE FLAG: FEAT_PORTABILITY
PURPOSE: Keep external packages and infrastructure behind replaceable boundaries.
COMPONENTS: `@the-federation/watchtower-adapter`, `@drdeeks/character-kit`, `@federation-watchtower/sdk`, provider ports.
RULES: adapter owns no policy, identity, memory, lease decision, credentials, or canonical record.
ERROR STATES: missing package, incompatible version, unavailable provider, invalid configuration, transport failure.
FALLBACK: explicit unavailable capability or local provider; never substitute a policy decision.
TESTING: package resolution, translator boundary, transport selection, failure, migration binding.

Every feature declares ownership, rules, errors, fallback, tests, and rollback.

---

---

# PART IV — DATA ARCHITECTURE

> **Rollback Tag:** `[DATA-ARCH-v1]`
> **Rule:** All schema changes require a migration file named
> `YYYYMMDD_NNN_description.sql` with a corresponding rollback file,
> and must be referenced in the Global Change Log (where applicable).

## 4.1 Core Database Schemas

CREATE TABLE federation_agents (agent_id TEXT PRIMARY KEY, watchtower_identity_ref TEXT NOT NULL, lifecycle_state TEXT NOT NULL, organization_ref TEXT, room_ref TEXT, created_at TIMESTAMP NOT NULL, schema_version INTEGER NOT NULL);
CREATE TABLE memory_records (record_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, plane TEXT NOT NULL, tier TEXT NOT NULL, content_ref TEXT NOT NULL, provenance_ref TEXT NOT NULL, confidence REAL NOT NULL, retention_state TEXT NOT NULL, expires_at TIMESTAMP, created_at TIMESTAMP NOT NULL, schema_version INTEGER NOT NULL);
CREATE TABLE knowledge_documents (document_id TEXT PRIMARY KEY, owner_ref TEXT NOT NULL, content_hash TEXT NOT NULL UNIQUE, locator TEXT NOT NULL, source_system TEXT NOT NULL, indexed_at TIMESTAMP NOT NULL, metadata_json TEXT NOT NULL, schema_version INTEGER NOT NULL);
CREATE TABLE federation_tasks (task_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, status TEXT NOT NULL, priority INTEGER NOT NULL, delegation_ref TEXT, idempotency_key TEXT NOT NULL UNIQUE, created_at TIMESTAMP NOT NULL, schema_version INTEGER NOT NULL);
CREATE TABLE control_receipts (receipt_id TEXT PRIMARY KEY, command_id TEXT NOT NULL, agent_id TEXT NOT NULL, operator_ref TEXT NOT NULL, command_type TEXT NOT NULL, authorization_ref TEXT NOT NULL, outcome TEXT NOT NULL, source_ref TEXT, created_at TIMESTAMP NOT NULL, schema_version INTEGER NOT NULL);
CREATE TABLE observation_events (event_id TEXT PRIMARY KEY, source_system TEXT NOT NULL, source_event_ref TEXT NOT NULL, event_type TEXT NOT NULL, verification_state TEXT NOT NULL, payload_hash TEXT NOT NULL, observed_at TIMESTAMP NOT NULL, schema_version INTEGER NOT NULL);

> **PROJECT tier requires 3+ `CREATE TABLE` schemas.**

## 4.2 API Contract Specifications

All endpoints follow `/api/v1/{resource}/{action}` and return `{ success, data, error, meta }`, where meta includes requestId, timestamp, schemaVersion, and provenance.
GET /api/v1/fleet — fleet visibility and mirror health.
GET /api/v1/agents/{agentId} — Federation projection and scoped canonical state.
POST /api/v1/agents/{agentId}/memory/query — query one or both independent planes.
POST /api/v1/agents/{agentId}/tasks — create an idempotent task and delegation request.
POST /api/v1/agents/{agentId}/control — submit steer, pause, resume, kill, terminal, or greenlight.
GET /api/v1/agents/{agentId}/observability — local activity, mirror health, and source references.
POST /api/v1/integrations/watchtower/events — accept a verified event envelope.

> **PROJECT tier requires 3+ documented endpoints.**

---

---

# PART V — CHANGE CONTROL PROTOCOL

> **Rollback Tag:** `[CHANGE-CONTROL-v1]`
> **This section is permanent and non-negotiable.**
> Every contributor must read this section before making any change.

## Change Log Entry Format

Every entry MUST include all fields below. Entries are permanent.
No entry may be modified or deleted after writing.

```
Date        : YYYY-MM-DD HH:MM UTC
Contributor : [name/handle]
Modules     : [MOD-001, MOD-002, MOD-003, MOD-004, MOD-005, MOD-006]
Section Tags: [[TAG-NAME-v1], ...]
Files Changed: [every file changed]
Description : [What changed and why — minimum 3 sentences]
Tests Passing: [test names, or 'none — pre-build']
Phase       : [PHASE-N]
Rollback Ref: [git commit hash or migration rollback filename]
```

## Contributor Rules

1. No work merged without a change log entry in the same PR.
2. No database migration without a rollback migration file.
3. Feature flags required for every Phase 2+ feature.
4. Minimum: 1 unit test per new function, 1 integration test per endpoint.
5. `CHANGELOG.md` CI append-only check must pass on every PR.
6. No contributor may modify or delete an existing change log entry.

---

---

# PART VI — MASTER IMPLEMENTATION CHECKLIST

### PHASE-0: Foundation

**Section Tag:** `[PHASE-0-v1]`
**Feature Flag:** `FEAT_FOUNDATION`
**Assigned Agent:** assigned by orchestration
**Reviewer Agent:** independent reviewer; must differ from assignee

### Prerequisites
Prior phase verified and complete with evidence, tests, changelog entry, commit, and rollback reference.

### Deliverables
- [ ] **PHASE-0.1** Type: file `docs/BUILD_SCOPE.md`
- [ ] **PHASE-0.2** Type: file `docs/INTEGRATION_MAP.md`
- [ ] **PHASE-0.3** Type: file `docs/PROVENANCE.md`
- [ ] **PHASE-0.4** Type: file `package.json`
- [ ] **PHASE-0.5** Type: review `review-phase0.md`

### Validation Gate
Validate authority, package references, root structure, provenance, and repository checks. Every deliverable must have real content or executable functionality; placeholders do not pass. Run FOREVER validation against each deliverable, update `CHANGELOG.md`, and commit before the next task unlocks.

### Rollback Procedure
Disable the phase flag, stop new writes, preserve receipts and source references, restore the prior contract, and append the rollback entry.

### Agent Sign-Off
Assigned agent, independent reviewer, date, evidence links, test output, commit reference, and rollback reference are mandatory.

---


### PHASE-1: Independent Memory Planes

**Section Tag:** `[PHASE-1-v1]`
**Feature Flag:** `FEAT_MEMORY`
**Assigned Agent:** assigned by orchestration
**Reviewer Agent:** independent reviewer; must differ from assignee

### Prerequisites
Prior phase verified and complete with evidence, tests, changelog entry, commit, and rollback reference.

### Deliverables
- [ ] **PHASE-1.1** Type: file `src/memory/memory-manager.js`
- [ ] **PHASE-1.2** Type: file `shared/memory/store/memory-store.js`
- [ ] **PHASE-1.3** Type: file `tests/memory-isolation.test.mjs`
- [ ] **PHASE-1.4** Type: file `docs/MEMORY-SYSTEM.md`
- [ ] **PHASE-1.5** Type: review `review-phase1.md`

### Validation Gate
Run memory tests and verify four tiers, retention, provenance, and no duplicate engine. Every deliverable must have real content or executable functionality; placeholders do not pass. Run FOREVER validation against each deliverable, update `CHANGELOG.md`, and commit before the next task unlocks.

### Rollback Procedure
Disable the phase flag, stop new writes, preserve receipts and source references, restore the prior contract, and append the rollback entry.

### Agent Sign-Off
Assigned agent, independent reviewer, date, evidence links, test output, commit reference, and rollback reference are mandatory.

---


### PHASE-2: Knowledge Context and Delegation

**Section Tag:** `[PHASE-2-v1]`
**Feature Flag:** `FEAT_CONTEXT`
**Assigned Agent:** assigned by orchestration
**Reviewer Agent:** independent reviewer; must differ from assignee

### Prerequisites
Prior phase verified and complete with evidence, tests, changelog entry, commit, and rollback reference.

### Deliverables
- [ ] **PHASE-2.1** Type: file `src/knowledge/index.js`
- [ ] **PHASE-2.2** Type: file `src/knowledge/retrieval/knowledge-retrieval.js`
- [ ] **PHASE-2.3** Type: file `src/context/router.js`
- [ ] **PHASE-2.4** Type: file `src/context/task-manager.js`
- [ ] **PHASE-2.5** Type: review `review-phase2.md`

### Validation Gate
Verify independent retrieval, bounded composition, provenance, delegation, idempotency, and denial. Every deliverable must have real content or executable functionality; placeholders do not pass. Run FOREVER validation against each deliverable, update `CHANGELOG.md`, and commit before the next task unlocks.

### Rollback Procedure
Disable the phase flag, stop new writes, preserve receipts and source references, restore the prior contract, and append the rollback entry.

### Agent Sign-Off
Assigned agent, independent reviewer, date, evidence links, test output, commit reference, and rollback reference are mandatory.

---


### PHASE-3: Control and Native Visibility

**Section Tag:** `[PHASE-3-v1]`
**Feature Flag:** `FEAT_CONTROL`
**Assigned Agent:** assigned by orchestration
**Reviewer Agent:** independent reviewer; must differ from assignee

### Prerequisites
Prior phase verified and complete with evidence, tests, changelog entry, commit, and rollback reference.

### Deliverables
- [ ] **PHASE-3.1** Type: file `src/context/job-manager.js`
- [ ] **PHASE-3.2** Type: file `src/server/routers/control.js`
- [ ] **PHASE-3.3** Type: file `ui/src/components/AgentDrawer.tsx`
- [ ] **PHASE-3.4** Type: file `src/observability/provider.js`
- [ ] **PHASE-3.5** Type: review `review-phase3.md`

### Validation Gate
Verify Watchtower-equivalent visibility, local fallback, task/job state, fail-closed controls, and UI build. Every deliverable must have real content or executable functionality; placeholders do not pass. Run FOREVER validation against each deliverable, update `CHANGELOG.md`, and commit before the next task unlocks.

### Rollback Procedure
Disable the phase flag, stop new writes, preserve receipts and source references, restore the prior contract, and append the rollback entry.

### Agent Sign-Off
Assigned agent, independent reviewer, date, evidence links, test output, commit reference, and rollback reference are mandatory.

---


### PHASE-4: Translator and Provider Integration

**Section Tag:** `[PHASE-4-v1]`
**Feature Flag:** `FEAT_PORTABILITY`
**Assigned Agent:** assigned by orchestration
**Reviewer Agent:** independent reviewer; must differ from assignee

### Prerequisites
Prior phase verified and complete with evidence, tests, changelog entry, commit, and rollback reference.

### Deliverables
- [ ] **PHASE-4.1** Type: file `src/integrations/adapter-client.js`
- [ ] **PHASE-4.2** Type: file `adapter/src/contracts.ts`
- [ ] **PHASE-4.3** Type: file `adapter/src/bridge/character-kit.ts`
- [ ] **PHASE-4.4** Type: file `adapter/src/bridge/watchtower.ts`
- [ ] **PHASE-4.5** Type: review `review-phase4.md`

### Validation Gate
Run adapter tests and verify translator-only ownership, package integration, transport selection, and provider separation. Every deliverable must have real content or executable functionality; placeholders do not pass. Run FOREVER validation against each deliverable, update `CHANGELOG.md`, and commit before the next task unlocks.

### Rollback Procedure
Disable the phase flag, stop new writes, preserve receipts and source references, restore the prior contract, and append the rollback entry.

### Agent Sign-Off
Assigned agent, independent reviewer, date, evidence links, test output, commit reference, and rollback reference are mandatory.

---


### PHASE-5: Evidence and Operations

**Section Tag:** `[PHASE-5-v1]`
**Feature Flag:** `FEAT_EVIDENCE`
**Assigned Agent:** assigned by orchestration
**Reviewer Agent:** independent reviewer; must differ from assignee

### Prerequisites
Prior phase verified and complete with evidence, tests, changelog entry, commit, and rollback reference.

### Deliverables
- [ ] **PHASE-5.1** Type: file `README.md`
- [ ] **PHASE-5.2** Type: file `docs/SUBMISSION-GUARDRAILS.md`
- [ ] **PHASE-5.3** Type: file `docs/PROVENANCE.md`
- [ ] **PHASE-5.4** Type: file `tests/memory-isolation.test.mjs`
- [ ] **PHASE-5.5** Type: review `review-phase5.md`

### Validation Gate
Run project validation, adapter validation, security checks, reproducibility checks, and independent review. Every deliverable must have real content or executable functionality; placeholders do not pass. Run FOREVER validation against each deliverable, update `CHANGELOG.md`, and commit before the next task unlocks.

### Rollback Procedure
Disable the phase flag, stop new writes, preserve receipts and source references, restore the prior contract, and append the rollback entry.

### Agent Sign-Off
Assigned agent, independent reviewer, date, evidence links, test output, commit reference, and rollback reference are mandatory.

---

# PART VII — QUALITY & COMPLIANCE STANDARDS

> **Rollback Tag:** `[QUALITY-v1]`

## Error Handling Standards

1. Graceful degradation for all non-critical services.
2. User-facing messages: friendly, non-technical, no stack traces exposed.
3. Internal logging: full context — requestId, userId, error code, stack.
4. Retry: exponential backoff on external calls (3 retries: 1s, 2s, 4s).
5. Circuit breaker: 10 failures in 60s opens circuit for 5 minutes.

## Testing Requirements

- Unit tests: 80% line coverage on all core modules.
- Integration tests: every API endpoint has success + error case.
- E2E tests: all critical user flows have passing automated tests.

## Performance Budgets

| Metric | Budget |
|---|---|
| Page load LCP (3G) | < 2.0 seconds |
| API response time p95 | < 500ms |
| Background job completion | < 60 seconds |

> **PROJECT tier requires 6+ concrete metrics with units.**

---

---

# CHANGE LOG

> This section is append-only. No entry may be modified or deleted.

## CL-0000 — Document Initialization

```
Date        : 2026-08-16
Contributor : [author]
Modules     : [MOD-001]
Section Tags: [[PHASE-0-v1]]
Files Changed: [blueprint.md]
Description : Initial blueprint created via enterprise-blueprint skill.
              Project: The Federation. Scope: PROJECT. All sections
              pre-populated with required structure awaiting content population.
Tests Passing: none — pre-build
Phase       : PHASE-0
Rollback Ref: N/A — initial document creation
```

# APPENDIX A — FEDERATION ACCEPTANCE CATALOG

This catalog is normative. Each record is an implementation and review obligation; it is not a status report.

### MOD-001 Federation Memory / AC-001

Control: working input is bounded before persistence.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-002

Control: episodic records retain source and episode references.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-003

Control: persistent promotion is explicit and auditable.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-004

Control: identity context is immutable at the memory layer.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-005

Control: retention expiry produces a typed outcome.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-006

Control: sensitive records require scoped access.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-007

Control: records include schema version and provenance.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-008

Control: provider failure returns degraded state.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-009

Control: duplicate writes are idempotent.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-010

Control: cross-agent reads require authorization.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-011

Control: working input is bounded before persistence.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-012

Control: episodic records retain source and episode references.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-013

Control: persistent promotion is explicit and auditable.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-014

Control: identity context is immutable at the memory layer.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-015

Control: retention expiry produces a typed outcome.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-016

Control: sensitive records require scoped access.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-017

Control: records include schema version and provenance.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-018

Control: provider failure returns degraded state.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-019

Control: duplicate writes are idempotent.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-020

Control: cross-agent reads require authorization.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-021

Control: working input is bounded before persistence.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-022

Control: episodic records retain source and episode references.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-023

Control: persistent promotion is explicit and auditable.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-024

Control: identity context is immutable at the memory layer.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-025

Control: retention expiry produces a typed outcome.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-026

Control: sensitive records require scoped access.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-027

Control: records include schema version and provenance.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-028

Control: provider failure returns degraded state.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-029

Control: duplicate writes are idempotent.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-030

Control: cross-agent reads require authorization.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-031

Control: working input is bounded before persistence.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-032

Control: episodic records retain source and episode references.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-033

Control: persistent promotion is explicit and auditable.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-034

Control: identity context is immutable at the memory layer.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-035

Control: retention expiry produces a typed outcome.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-036

Control: sensitive records require scoped access.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-037

Control: records include schema version and provenance.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-038

Control: provider failure returns degraded state.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-039

Control: duplicate writes are idempotent.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-001 Federation Memory / AC-040

Control: cross-agent reads require authorization.

Input: a scoped request or recorded source fact for MOD-001 Federation Memory.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-001

Control: documents deduplicate by content hash.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-002

Control: graph entities retain source references.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-003

Control: relations reject malformed endpoints.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-004

Control: vector queries return ranked confidence.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-005

Control: hybrid results preserve plane provenance.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-006

Control: empty search is not an error masquerading as success.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-007

Control: indexing excludes agent-private control files.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-008

Control: corpus metadata records source system.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-009

Control: embedding failure is explicit.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-010

Control: knowledge is not silently promoted to memory.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-011

Control: documents deduplicate by content hash.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-012

Control: graph entities retain source references.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-013

Control: relations reject malformed endpoints.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-014

Control: vector queries return ranked confidence.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-015

Control: hybrid results preserve plane provenance.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-016

Control: empty search is not an error masquerading as success.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-017

Control: indexing excludes agent-private control files.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-018

Control: corpus metadata records source system.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-019

Control: embedding failure is explicit.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-020

Control: knowledge is not silently promoted to memory.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-021

Control: documents deduplicate by content hash.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-022

Control: graph entities retain source references.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-023

Control: relations reject malformed endpoints.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-024

Control: vector queries return ranked confidence.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-025

Control: hybrid results preserve plane provenance.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-026

Control: empty search is not an error masquerading as success.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-027

Control: indexing excludes agent-private control files.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-028

Control: corpus metadata records source system.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-029

Control: embedding failure is explicit.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-030

Control: knowledge is not silently promoted to memory.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-031

Control: documents deduplicate by content hash.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-032

Control: graph entities retain source references.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-033

Control: relations reject malformed endpoints.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-034

Control: vector queries return ranked confidence.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-035

Control: hybrid results preserve plane provenance.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-036

Control: empty search is not an error masquerading as success.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-037

Control: indexing excludes agent-private control files.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-038

Control: corpus metadata records source system.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-039

Control: embedding failure is explicit.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-002 Knowledge Plane / AC-040

Control: knowledge is not silently promoted to memory.

Input: a scoped request or recorded source fact for MOD-002 Knowledge Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-001

Control: context budgets are bounded.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-002

Control: composition preserves source confidence.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-003

Control: composition preserves freshness.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-004

Control: router can query either plane independently.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-005

Control: delegation requires a capability match.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-006

Control: delegation target must be permitted.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-007

Control: task envelopes are idempotent.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-008

Control: ambiguous routing requires review.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-009

Control: stale targets are rejected.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-010

Control: delegation decisions are auditable.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-011

Control: context budgets are bounded.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-012

Control: composition preserves source confidence.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-013

Control: composition preserves freshness.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-014

Control: router can query either plane independently.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-015

Control: delegation requires a capability match.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-016

Control: delegation target must be permitted.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-017

Control: task envelopes are idempotent.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-018

Control: ambiguous routing requires review.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-019

Control: stale targets are rejected.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-020

Control: delegation decisions are auditable.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-021

Control: context budgets are bounded.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-022

Control: composition preserves source confidence.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-023

Control: composition preserves freshness.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-024

Control: router can query either plane independently.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-025

Control: delegation requires a capability match.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-026

Control: delegation target must be permitted.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-027

Control: task envelopes are idempotent.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-028

Control: ambiguous routing requires review.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-029

Control: stale targets are rejected.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-030

Control: delegation decisions are auditable.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-031

Control: context budgets are bounded.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-032

Control: composition preserves source confidence.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-033

Control: composition preserves freshness.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-034

Control: router can query either plane independently.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-035

Control: delegation requires a capability match.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-036

Control: delegation target must be permitted.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-037

Control: task envelopes are idempotent.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-038

Control: ambiguous routing requires review.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-039

Control: stale targets are rejected.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-003 Context and Delegation / AC-040

Control: delegation decisions are auditable.

Input: a scoped request or recorded source fact for MOD-003 Context and Delegation.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-001

Control: steer requires operator authorization.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-002

Control: pause is distinct from kill.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-003

Control: resume cannot bypass fail-closed state.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-004

Control: kill records an immutable receipt.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-005

Control: terminal input has provenance.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-006

Control: tasks have explicit lifecycle states.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-007

Control: jobs have retry bounds.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-008

Control: duplicate commands do not duplicate effects.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-009

Control: denied controls remain visible.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-010

Control: UI cannot perform an unrecorded mutation.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-011

Control: steer requires operator authorization.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-012

Control: pause is distinct from kill.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-013

Control: resume cannot bypass fail-closed state.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-014

Control: kill records an immutable receipt.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-015

Control: terminal input has provenance.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-016

Control: tasks have explicit lifecycle states.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-017

Control: jobs have retry bounds.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-018

Control: duplicate commands do not duplicate effects.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-019

Control: denied controls remain visible.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-020

Control: UI cannot perform an unrecorded mutation.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-021

Control: steer requires operator authorization.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-022

Control: pause is distinct from kill.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-023

Control: resume cannot bypass fail-closed state.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-024

Control: kill records an immutable receipt.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-025

Control: terminal input has provenance.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-026

Control: tasks have explicit lifecycle states.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-027

Control: jobs have retry bounds.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-028

Control: duplicate commands do not duplicate effects.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-029

Control: denied controls remain visible.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-030

Control: UI cannot perform an unrecorded mutation.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-031

Control: steer requires operator authorization.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-032

Control: pause is distinct from kill.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-033

Control: resume cannot bypass fail-closed state.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-034

Control: kill records an immutable receipt.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-035

Control: terminal input has provenance.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-036

Control: tasks have explicit lifecycle states.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-037

Control: jobs have retry bounds.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-038

Control: duplicate commands do not duplicate effects.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-039

Control: denied controls remain visible.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-004 Control Plane / AC-040

Control: UI cannot perform an unrecorded mutation.

Input: a scoped request or recorded source fact for MOD-004 Control Plane.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-001

Control: fleet status distinguishes local and mirrored state.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-002

Control: agent cards expose lifecycle and health.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-003

Control: events retain canonical source IDs.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-004

Control: signed webhook envelopes are verified.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-005

Control: duplicate events are deduplicated.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-006

Control: ordering metadata is retained.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-007

Control: mirror lag is visible.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-008

Control: local fallback is explicit.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-009

Control: heartbeat and loop state are separate.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-010

Control: presentation cannot rewrite event truth.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-011

Control: fleet status distinguishes local and mirrored state.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-012

Control: agent cards expose lifecycle and health.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-013

Control: events retain canonical source IDs.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-014

Control: signed webhook envelopes are verified.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-015

Control: duplicate events are deduplicated.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-016

Control: ordering metadata is retained.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-017

Control: mirror lag is visible.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-018

Control: local fallback is explicit.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-019

Control: heartbeat and loop state are separate.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-020

Control: presentation cannot rewrite event truth.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-021

Control: fleet status distinguishes local and mirrored state.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-022

Control: agent cards expose lifecycle and health.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-023

Control: events retain canonical source IDs.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-024

Control: signed webhook envelopes are verified.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-025

Control: duplicate events are deduplicated.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-026

Control: ordering metadata is retained.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-027

Control: mirror lag is visible.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-028

Control: local fallback is explicit.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-029

Control: heartbeat and loop state are separate.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-030

Control: presentation cannot rewrite event truth.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-031

Control: fleet status distinguishes local and mirrored state.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-032

Control: agent cards expose lifecycle and health.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-033

Control: events retain canonical source IDs.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-034

Control: signed webhook envelopes are verified.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-035

Control: duplicate events are deduplicated.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-036

Control: ordering metadata is retained.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-037

Control: mirror lag is visible.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-038

Control: local fallback is explicit.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-039

Control: heartbeat and loop state are separate.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-005 Native Observability / AC-040

Control: presentation cannot rewrite event truth.

Input: a scoped request or recorded source fact for MOD-005 Native Observability.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-001

Control: package references are canonical.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-002

Control: machine-local paths are forbidden.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-003

Control: adapter imports CharacterKit only in its bridge.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-004

Control: adapter imports Watchtower only in its bridge.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-005

Control: adapter emits normalized events.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-006

Control: adapter owns no policy.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-007

Control: adapter owns no identity.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-008

Control: adapter owns no memory.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-009

Control: provider bindings are injected.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-010

Control: provider replacement preserves domain contracts.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-011

Control: package references are canonical.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-012

Control: machine-local paths are forbidden.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-013

Control: adapter imports CharacterKit only in its bridge.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-014

Control: adapter imports Watchtower only in its bridge.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-015

Control: adapter emits normalized events.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-016

Control: adapter owns no policy.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-017

Control: adapter owns no identity.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-018

Control: adapter owns no memory.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-019

Control: provider bindings are injected.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-020

Control: provider replacement preserves domain contracts.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-021

Control: package references are canonical.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-022

Control: machine-local paths are forbidden.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-023

Control: adapter imports CharacterKit only in its bridge.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-024

Control: adapter imports Watchtower only in its bridge.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-025

Control: adapter emits normalized events.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-026

Control: adapter owns no policy.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-027

Control: adapter owns no identity.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-028

Control: adapter owns no memory.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-029

Control: provider bindings are injected.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-030

Control: provider replacement preserves domain contracts.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-031

Control: package references are canonical.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-032

Control: machine-local paths are forbidden.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-033

Control: adapter imports CharacterKit only in its bridge.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-034

Control: adapter imports Watchtower only in its bridge.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-035

Control: adapter emits normalized events.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-036

Control: adapter owns no policy.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-037

Control: adapter owns no identity.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-038

Control: adapter owns no memory.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-039

Control: provider bindings are injected.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.

### MOD-006 Integration Ports / AC-040

Control: provider replacement preserves domain contracts.

Input: a scoped request or recorded source fact for MOD-006 Integration Ports.

Expected result: the boundary is enforced, evidence is retained, and failure is explicit.


## CL-0001 — Federation Architecture Population

```
Date        : 2026-08-16
Contributor : @drdeeks
Modules     : [MOD-001, MOD-002, MOD-003, MOD-004, MOD-005, MOD-006]
Section Tags: [[SYS-OVERVIEW-v1], [MODULE-REGISTRY-v1], [SPECS-v1], [DATA-ARCH-v1], [CHANGE-CONTROL-v1]]
Files Changed: [blueprint.md]
Description : Populated the fresh scaffold with The Federation's definitive architecture, ownership boundaries, independent memory and knowledge planes, context and control contracts, native observability requirements, translator-only adapter boundary, provider ports, schemas, APIs, acceptance catalog, and phase gates. The blueprint intentionally describes the project domain and package interfaces without embedding machine-local paths or making the blueprint engine dependent on any particular provider.
Tests Passing: validate_blueprint.py; forever_validation.py
Phase       : PHASE-0
Rollback Ref: restore the prior blueprint from .trash/blueprint-reset-20260816/
```
