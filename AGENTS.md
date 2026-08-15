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

Identity, continuity, registration, memory, retrieval, organizations, rooms,
relationships, policy, habits, ACKs, commitments, local controls, native
observability, live agent activity, logs, credentials/webhooks management,
shared primitives, branding, and the human-facing experience.

### Integration points

- **Federation Watchtower** supplies external execution/observability signals
  and immutable action records. Federation integrates those signals into its
  own operational UI; it does not reproduce Watchtower's comedic TV/MCP layer
  or rewrite source truth.
- **CharacterKit** supplies behavioral configuration and fail-closed
  enforcement. It does not own Federation identity, memory, organizations, or
  UI.
- **Google ADK/Gemini and cloud services** are implementation components for
  the current foundation slice, not the product definition.

### Adapter

The adapter translates and normalizes runtime, CharacterKit, Federation, and
Watchtower events. It owns no independent identity, policy, memory, or source
of truth.

## Non-negotiable invariants

```text
The Federation = the civilization
Federation-<name> = a district or child system
agent identity != organization membership != room placement
source event truth != Federation presentation
CharacterKit behavior != Federation identity
```

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

As of 2026-08-14, the memory foundation and adapter foundations exist, but
independent memory subsystems, Memory Router/Context Composer, durable
persistence, Federation-native UI, ADK/Gemini runtime, cloud deployment,
model safety, and Federation-owned credential and webhook management
remain incomplete. Keep product direction ambitious and implementation claims
factual.

**2026-08-15 — PHASE-1 (Cognitive Memory Substrate) gated.** Produced
`src/memory/README.md`, real (not placeholder) `tests/memory-isolation.test.mjs`,
and an independent review at `review-phase1.md`. Findings from this pass,
recorded honestly per this document's own change-workflow rule (`update the
canonical status document when facts change`):

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
cd adapter && npm run validate
cd adapter && npm test
```

Passing prose or a smoke test is not proof of a live external integration.

