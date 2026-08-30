# Implementation Checklist

*Generated from `blueprint.md` on 2026-08-16T19:12:59.375864Z*

## Summary
- **Project:** The Federation
- **Phases:** 6
- **Tasks:** 30
- **Modules:** 6
- **Screens:** 0
- **Mode:** loop
- **Validators:** enabled

## Completion Assurance

- **Contract:** `orchestration-contract.json`
- **Watchdog:** `watch` every 15 seconds
- **Repair mode:** `propose`; fail closed: `True`
- **Required checks:** contract_valid, all_deliverables_verified, no_unresolved_blockers, audit_record_written
- [ ] **ASSURANCE-01** Declare task, gate, executor, verifier, health, and audit adapters.
- [ ] **ASSURANCE-02** Configure polling, retry, timeout, and fail-closed policies.
- [ ] **ASSURANCE-03** Implement deliverable verification for every checklist item.
- [ ] **ASSURANCE-04** Run the monitor and retain evidence of each phase transition.
- [ ] **ASSURANCE-05** Exercise retry and blocked-state behavior without claiming completion.
- [ ] **ASSURANCE-06** Record the final completion decision with provenance and rollback reference.

## Phase Checklist

### [PHASE-0-v1] — PHASE-0: Foundation

**Flag:** `FEAT_FOUNDATION`

- [ ] **PHASE-0.1** Type: file `docs/BUILD_SCOPE.md`
- [ ] **PHASE-0.2** Type: file `docs/INTEGRATION_MAP.md`
- [ ] **PHASE-0.3** Type: file `docs/PROVENANCE.md`
- [ ] **PHASE-0.4** Type: file `package.json`
- [ ] **PHASE-0.5** Type: review `review-phase0.md`

### [PHASE-1-v1] — PHASE-1: Independent Memory Planes

**Flag:** `FEAT_MEMORY`

- [ ] **PHASE-1.1** Type: file `src/memory/memory-manager.js`
- [ ] **PHASE-1.2** Type: file `shared/memory/store/memory-store.js`
- [ ] **PHASE-1.3** Type: file `tests/memory-isolation.test.mjs`
- [ ] **PHASE-1.4** Type: file `docs/MEMORY-SYSTEM.md`
- [ ] **PHASE-1.5** Type: review `review-phase1.md`

### [PHASE-2-v1] — PHASE-2: Knowledge Context and Delegation

**Flag:** `FEAT_CONTEXT`

- [ ] **PHASE-2.1** Type: file `src/knowledge/index.js`
- [ ] **PHASE-2.2** Type: file `src/knowledge/retrieval/knowledge-retrieval.js`
- [ ] **PHASE-2.3** Type: file `src/context/router.js`
- [ ] **PHASE-2.4** Type: file `src/context/task-manager.js`
- [ ] **PHASE-2.5** Type: review `review-phase2.md`

### [PHASE-3-v1] — PHASE-3: Control and Native Visibility

**Flag:** `FEAT_CONTROL`

- [ ] **PHASE-3.1** Type: file `src/context/job-manager.js`
- [ ] **PHASE-3.2** Type: file `src/server/routers/control.js`
- [ ] **PHASE-3.3** Type: file `ui/src/components/AgentDrawer.tsx`
- [ ] **PHASE-3.4** Type: file `src/observability/provider.js`
- [ ] **PHASE-3.5** Type: review `review-phase3.md`

### [PHASE-4-v1] — PHASE-4: Translator and Provider Integration

**Flag:** `FEAT_PORTABILITY`

- [ ] **PHASE-4.1** Type: file `src/integrations/adapter-client.js`
- [ ] **PHASE-4.2** Type: file `adapter/src/contracts.ts`
- [ ] **PHASE-4.3** Type: file `adapter/src/bridge/character-kit.ts`
- [ ] **PHASE-4.4** Type: file `adapter/src/bridge/watchtower.ts`
- [ ] **PHASE-4.5** Type: review `review-phase4.md`

### [PHASE-5-v1] — PHASE-5: Evidence and Operations

**Flag:** `FEAT_EVIDENCE`

- [ ] **PHASE-5.1** Type: file `README.md`
- [ ] **PHASE-5.2** Type: file `docs/SUBMISSION-GUARDRAILS.md`
- [ ] **PHASE-5.3** Type: file `docs/PROVENANCE.md`
- [ ] **PHASE-5.4** Type: file `tests/memory-isolation.test.mjs`
- [ ] **PHASE-5.5** Type: review `review-phase5.md`

## Module Registry
| Module ID | Name | Purpose | Flag |
|---|---|---|---|
| MOD-001 | Federation Memory | Four memory tiers, retention, provenance, and prom | FEAT_MEMORY |
| MOD-002 | Knowledge Plane | Graph, corpus, vector, and hybrid semantic retriev | FEAT_KNOWLEDGE |
| MOD-003 | Context and Delegation | Bounded composition and capability-based routing | FEAT_CONTEXT |
| MOD-004 | Control Plane | Tasks, jobs, human controls, terminal, and receipt | FEAT_CONTROL |
| MOD-005 | Native Observability | Watchtower visibility mirror, local fallback, and  | FEAT_OBSERVABILITY |
| MOD-006 | Integration Ports | Adapter, MCP/webhook, and replaceable provider bou | FEAT_PORTABILITY |

## Feature Flags
| Flag | Phases | Modules | Screens |
|---|---|---|---|
| FEAT_FOUNDATION | PHASE-0 |  |  |
| FEAT_MEMORY | PHASE-1 | Federation Memory |  |
| FEAT_CONTEXT | PHASE-2 | Context and Delegation |  |
| FEAT_CONTROL | PHASE-3 | Control Plane |  |
| FEAT_PORTABILITY | PHASE-4 | Integration Ports |  |
| FEAT_EVIDENCE | PHASE-5 |  |  |
| FEAT_KNOWLEDGE |  | Knowledge Plane |  |
| FEAT_OBSERVABILITY |  | Native Observability |  |
