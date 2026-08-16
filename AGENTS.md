# AGENTS.md — The Federation

This repository is the working source for **The Federation**, the parent
platform and persistent digital civilization for humans and autonomous agents.

## Repository boundary

Work only inside `/home/drdeek/projects/hackathon` for this project.

- Do not inspect, edit, commit, push, deploy, or configure sibling projects
  unless the owner explicitly authorizes that separate operation.
- Federation Watchtower and Agent Character Kit are integration points. Use
  documented interfaces; do not silently modify their repositories here.
- Preserve existing user changes. Inspect `git status` before editing.
- Never push or commit unless explicitly requested.
- Never claim a feature or integration is complete without executable evidence.

## Root structure policy

The root is intentionally small. The only allowed informational documents at
the root are:

- `AGENTS.md` — operating rules
- `README.md` — public repository orientation
- `CHANGELOG.md` — chronological project history, when present
- `BLUEPRINT.md` — planned root blueprint, when added
- `CHECKLIST.md` — planned root execution checklist, when added

Other necessary root items may include package manifests, lockfiles, build
configuration, `.gitignore`, license files, and runtime entrypoints. Code,
tests, assets, logs, generated output, and all other documentation belong in a
clearly named scoped directory.

Documentation placement:

- `docs/` — Federation concept, current scope, integration facts, rules,
  submission material, and repository-wide design records.
- `adapter/` — adapter code, tests, docs, changelog, and adapter-local rules.
- `layers/<function>/` — implementation notes and code for that subsystem.
- `shared/<capability>/` — reusable capability code and its local README/tests.
- `.trash/` — recoverable legacy or redundant material; never use it as an
  active source of truth.

When a new directory is created, its name must state its scope. Add a local
`README.md` or `AGENTS.md` when the directory has its own rules or public
surface. Do not leave duplicate “current” documents in multiple directories.

## Product authority

1. `docs/FEDERATION-CONCEPT.md` — product meaning and civilization direction.
2. `docs/FOREVER_DOCTRINE.yaml` — universal working and integrity principles.
3. This file — repository rules and ownership boundaries.
4. `docs/BUILD_SCOPE.md` — current implementable foundation slice.
5. `docs/INTEGRATION_MAP.md` — factual dependency inventory.
6. Code, tests, and package configuration — evidence of current reality.
7. `docs/SUBMISSION-GUARDRAILS.md` — submission prose only.

The concept wins for intended direction. Code and tests win for current claims.
The scope wins for current build sequencing. Submission prose follows evidence.

## Product identity

**The Federation** is the whole. Future products use `Federation-<name>` and
become districts, institutions, services, or experiences in the same
civilization. The current repository builds the foundation layer: identity,
registration, persistent state, cognitive memory, configuration, policy,
control, local agent management, native observability, and interoperability.

## Ownership boundaries

### The Federation owns

Memory, retrieval, policy, habits, ACKs, commitments, local controls (steer, pause, resume, kill, terminal), native observability (local projection + Watchtower mirror with local fallback), live agent activity, logs, task management, job management, shared primitives, branding, and the human-facing experience.

### Integration points

- **Federation Watchtower** owns agent identity, registration, lifecycle, credentials (`fw_owner_*`, `fw_agent_*`, `fw_operator_*`), heartbeat/watchdog, room/scene projection, webhook delivery (alerts only, signed HMAC), operator credentials, per-org webhook config, leases, validation gates, controlled-tool authorization, and incident ledger. Federation mirrors these via SDK/MCP; does not reproduce Watchtower's canonical records.
- **CharacterKit** owns behavioral configuration and fail-closed enforcement (habits, ACK, commitments, command policy). It does not own Federation identity, memory, organizations, or UI.
- **Google ADK/Gemini and cloud services** are implementation components for the current foundation slice, not the product definition.

### Adapter

The adapter translates and normalizes CharacterKit enforcement activity → normalized Watchtower events, and Watchtower lease/guardrail/status results → adapter-visible state. It owns no independent identity, policy, memory, or source of truth. It is the only cross-system layer and is disposable.

## Non-negotiable invariants

```text
The Federation = the civilization
Federation-<name> = a district or child system
agent identity != organization membership != room placement
source event truth != Federation presentation
CharacterKit behavior != Federation identity
```

## Root structure policy

...

When a new directory is created, its name must state its scope. Add a local
`README.md` or `AGENTS.md` when the directory has its own rules or public
surface. Do not leave duplicate "current" documents in multiple directories.

**No project-labeled directories under `src/`** (e.g., `src/federation/` is forbidden); use functional names (`src/observability`, `src/control`, `src/memory`, `src/context`, `src/integrations`).

Agents remain persistent participants across organization, room, application,
capability, environment, and infrastructure changes. Humans retain ownership,
decision authority, configuration, and intervention.

## Change workflow

1. Read this file and the relevant concept section.
2. Read `docs/BUILD_SCOPE.md` and `docs/INTEGRATION_MAP.md`.
3. Inspect local status and identify exact files in scope.
4. Classify the change as foundation, adapter, integration, UI, or submission.
5. Implement the smallest verifiable layer with explicit ownership.
6. Update the canonical status document when facts change.
7. Run relevant checks and report blockers exactly.

Move obsolete or duplicate documentation into `.trash/` with its original
context preserved. Do not silently delete it and do not leave it discoverable
as an active document.

## Current implementation truth

As of 2026-08-15, the memory foundation and adapter foundations exist, but
independent memory subsystems, Memory Router/Context Composer, durable
persistence, Federation-native UI, ADK/Gemini runtime, cloud deployment,
model safety, and Federation-owned credential and webhook management
remain incomplete. Keep product direction ambitious and implementation claims
factual.

**Federation branch `fix/rooms-agents-migrations` (HEAD `2b39c88`, 14 commits ahead of `origin/main`, unpushed) implements:** operator RBAC (`fw_operator_*`), per-org/per-agent webhooks (alerts only, signed HMAC), canonical bearer auth, rooms/agents migrations, lifecycle hardening, auto-lease at registration, MCP lease/validation/authorization/gate/ack tools. These are **Watchtower-owned integration points** the console consumes; they are not rebuilt here. The SDK (`packages/watchtower-sdk`) is unchanged on this branch; gaps include: no `FederationOperatorClient`, `FederationAgentClient` lacks `requestLease`/`validateLease`. Operator scopes are `operator:read`/`operator:write` only (no lease scope); leases require MCP org credential with `watchtower:lease` + `project:<id>:control`. Leases are optional/opt-in.

**2026-08-15 — PHASE-1 (Cognitive Memory Substrate) gated.** Produced
`src/memory/README.md`, real (not placeholder) `tests/memory-isolation.test.mjs`,
and an independent review at `review-phase1.md`. Findings from this pass,
recorded honestly per this document's own change-workflow rule (`update the
canonical status document when facts change`):

**2026-08-16 — PHASE-2 (Agent Management UI) started.** Implemented
`ui/src/components/AgentDrawer.tsx` (MOD-006 / FTR-005) — the main per-agent
management drawer with 5 tabs: Terminal (interactive command I/O with
provenance styling), Memory (tier tabs daily/weekly/long-term/identity,
placeholder for memory substrate), Tasks (queue placeholder), Control
(steering input, lifecycle Pause/Resume/Kill buttons noting CharacterKit
local fail-closed enforcement + Watchtower opt-in leases), Observability
(immutable action log, heartbeat/loop state, local fallback). Wired into
existing fleet sidebar via `ui/src/App.tsx`. Added `Overlay.tsx` for
click-outside-close. Extended `ui/src/styles/components.css` with tab
content styles. TypeScript clean, build passes, smoke tests pass.
Remaining for PHASE-2 gate: `src/ui/agent-drawer.md` (doc),
`src/control/control-contract.md`, `docs/ui/agent-management.md`,
`tests/control-contract.test.mjs`, `review-phase2.md`; plus wiring
controls to control API, connecting memory/tasks/observability to local
stores, implementing job management.

**2026-08-16 — Memory System (MOD-002) + Task/Job Management (MOD-005) implemented.**
Four-tier memory substrate built on `shared/memory` engine:
- `src/memory/working/working-store.js` — Daily tier (TTL 36h, max 2k, auto-promotion eligible)
- `src/memory/episodic/episodic-store.js` — Weekly tier (TTL 7d, max 5k, episode grouping)
- `src/memory/persistent/persistent-store.js` — Long-term tier (no TTL, max 20k, explicit promotion)
- `src/memory/schemas/identity-context-store.js` — Identity tier (no TTL, immutable, max 1k)
- `src/memory/memory-manager.js` — Unified coordinator with auto-promotion pipeline (working→episodic→persistent→identity)
All stores are thin re-export shims over `shared/memory/store/memory-store.js`, no duplication.
Task/Job management in `src/context/`:
- `src/context/task-manager.js` — Full CRUD, status transitions, priority queue, assignment, stats
- `src/context/job-manager.js` — Scheduled/recurring/oneshot jobs, cron-like scheduling, retry policy, manual execution
- `src/context/router.js` — REST API for tasks/jobs per agent
API verified: npm run smoke (3/3), ui typecheck+build (clean), adapter validate+test (32/32).

- **Real bug found and fixed**: `src/memory/retrieval/embedding-engine.js`
  was a 376-line file, 374 lines identical to
  `shared/memory/engines/embedding-engine.js` (only two comment-header
  lines differed) — a silent duplicate implementation, in direct violation
  of `shared/memory/README.md`'s own stated rule ("must not maintain a
  silent duplicate implementation"). No importer referenced this file
  anywhere in the repo (checked via grep before touching it), so it was
  dead weight, not something anything actually depended on breaking.
  Collapsed to the same two-line re-export shim pattern every sibling
  adapter (`store/memory-store.js`, `intake/ingestion.js`,
  `retrieval/recall-engine.js`, `consolidation/pattern-detector.js`,
  `consolidation/forget-policy.js`) already used correctly.
  `tests/memory-isolation.test.mjs`'s first test is now a permanent
  regression guard against this exact class of drift.
- **Confirmed, not newly discovered**: `docs/MEMORY-ARCHITECTURE.md` §11
  already honestly listed episodic, declarative/long-term, knowledge-graph,
  Memory Router, and Context Composer as "not yet integrated." Verified
  directly against the filesystem — `src/memory/episodic/`,
  `src/memory/working/`, `src/memory/persistent/`, and
  `src/memory/schemas/` are genuinely empty directories, zero files. The
  isolation test file skips the corresponding blueprint acceptance tests
  (TEST-004 through TEST-007, TEST-011) explicitly, each with the exact
  missing module named, rather than faking a pass or omitting them
  silently — MOD-002's PARTIAL status in `blueprint.md` is accurate, not
  overclaimed.
- **What is real and tested**: the `shared/memory/` ↔ `src/memory/`
  re-export boundary (no duplication, no reverse dependency from the
  engine into the application layer), and the document indexer's
  agent-internal exclusion (`memory/`, `knowledge/`, `.secrets/`,
  `habits/` never enter the corpus index — TEST-008), both verified with
  real fixtures, not mocked assertions.

## Verification

Run commands only inside this repository or `adapter/`:

```bash
npm run smoke
npm run validate
cd adapter && npm run validate
cd adapter && npm test
```

Passing prose or a smoke test is not proof of a live external integration.

