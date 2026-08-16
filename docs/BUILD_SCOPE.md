# The Federation — Current Build Scope

**Status:** active implementation scope
**Date:** 2026-08-14
**Parent product:** The Federation
**Current slice:** Federation foundation layer

The product definition lives in `docs/FEDERATION-CONCEPT.md`. This document
translates that long-term civilization into the current coherent build. It does
not replace the concept and it does not turn the project into a generic agent
dashboard.

## Product outcome

Build the foundation that lets a human establish and manage a persistent
Federation agent: identity, memory, behavior, policy, local control, live
activity, and interoperable execution. Future Federation districts consume
these primitives instead of inventing isolated systems.

## Functional acceptance path

```text
establish or restore agent identity
  -> configure character, habits, policy, ACKs, and commitments
  -> retrieve relevant context through the Memory Router
  -> receive a task through Federation
  -> reason, execute, and optionally delegate
  -> normalize execution activity through the adapter
  -> record canonical action/event truth through the integration point
  -> show live activity, task state, logs, policy, and memory in Federation
  -> let the human steer, pause, resume, approve, or kill
  -> retain auditable provenance for the outcome
```

The Federation interface is native and operational. It is not a copy of an
external presentation layer.

## In scope now

### Identity and civilization foundation

- persistent human and agent identity
- agent registration and portable manifests
- organization, room, relationship, and Federation participation state
- identity continuity across application, room, organization, and runtime changes
- Federation HQ fallback for agents without a current placement

### Memory

- episodic, long-term/declarative, knowledge-graph, and document/semantic-retrieval subsystems
- Memory Router -> Context Composer with explicit adapter queries and promotion
- provenance, retention, sensitivity, and operator-visible lifecycle
- promotion, demotion, restriction, and export
- storage abstraction ready for durable cloud persistence
- real semantic embeddings for the finished implementation

### Agent management and policy

- character establishment and configuration
- habits and behavioral settings
- allowed, ACK-required, commitment-required, approval-required, fail-closed,
  and prohibited actions
- command/tool/environment/capability policy scopes
- ACK, commitment, review, and escalation frequencies
- local `/steer`, pause, resume, and kill controls
- persistent logs and auditable control actions

### Native observability

- fleet and agent status
- expandable per-agent cards
- live terminal/activity feed
- current task and process state
- tool/function activity, outputs, errors, and provenance
- heartbeat, loop, policy, ACK, commitment, intervention, and audit views
- memory inspection from the agent experience

### Interoperability and infrastructure

- adapter contracts and normalized event handling
- integration with existing external execution/observability systems
- scoped per-agent and per-organization credential mapping
- per-agent and per-organization webhook destinations
- ADK/Gemini as the current reasoning/orchestration implementation
- Google Cloud deployment and durable persistence for the current slice
- managed model safety screening for relevant ingress/egress

## Long-term, not current acceptance criteria

These belong to the Federation concept but are later districts or civilization
layers: Federation-CreAgent as a complete creation product,
Federation-Marketplace and an agent/human capability economy, Federation-Arcade,
Federation-Brain-Sync, and future education, research, social, employment,
publishing, governance, and community districts.

They must remain compatible with the foundation, but they must not inflate
current implementation claims.

## Current evidence and gaps

| Area | Evidence | Current truth |
|---|---|---|
| Memory substrate | `shared/memory/`, `src/memory/`, and smoke test | Engine exists; four subsystems, Router/Composer, and durable persistence open |
| Enforcement wrapper | `shared/enforcement/` | Exists; Federation management wiring open |
| Adapter | `adapter/src/` and tests | Real CharacterKit socket work; live/canonical integration open |
| Identity model | layer scaffolds and documentation | Federation-owned persistence open |
| Native UI | no completed UI | Open |
| ADK/Gemini runtime | no completed runtime | Open |
| Cloud persistence/deployment | no completed implementation | Open |
| Model safety | `layers/modelarmor/` empty | Open |
| Credentials | external scoped primitives documented | Federation bridge/operator surface open |
| Webhooks | external/global capability documented | Per-agent/per-org Federation routing open |

## Implementation order

1. **Governance and contracts** — concept, scope, identity/event contracts,
   semantic states, and repository checks.
2. **Identity and local state** — agent manifests, organization/room context,
   Federation HQ, portable persistence, and credential references.
3. **Memory substrate** — independent episodic, declarative, graph, and document/semantic subsystems; Router, Composer, provenance, promotion,
   and operator lifecycle controls.
4. **Runtime** — ADK/Gemini task loop, tool/function boundary, delegation, and
   cloud deployment skeleton.
5. **Integration truth path** — adapter normalization, canonical event
   references, local event cache, retries, and fail-closed behavior.
6. **Federation control plane** — agent cards, terminal feed, memory/task
   panels, event history, policy state, and audit-linked controls.
7. **Governance integrations** — behavioral settings, ACKs, commitments,
   steering, pause/resume/kill, credential mapping, and webhook routing.
8. **Safety and proof** — model safety, failure tests, reproducible setup,
   architecture evidence, demo flow, and accurate submission copy.

Each layer must leave prior layers usable. No layer may replace canonical event
truth, bypass fail-closed behavior, or make the UI the only record of a
consequential action.

## Definition of done for this slice

- An agent can be established or restored from a portable identity.
- Identity, memory, policy, behavior, and participation are visible.
- A real task uses the selected reasoning/orchestration path.
- Tool/function activity crosses the adapter boundary with provenance.
- Federation exposes the activity in a native per-agent operational view.
- The human can inspect memory and task state and issue an auditable control.
- Failure and authorization behavior is explicit and safe.
- Organization/agent credentials and webhooks are attributable.
- Local/cloud setup and critical-path tests are reproducible.
- Submission copy claims only behavior demonstrated by the implementation.
