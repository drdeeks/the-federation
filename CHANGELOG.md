# The Federation Foundation — CHANGELOG

> This file is the append-only change log. No entry may be modified or deleted.
> All entries must follow the format defined in blueprint.md Part V.

---

## CL-0000 — Document Initialization

```
Date        : 2026-08-14
Contributor : [author]
Modules     : [MOD-001]
Section Tags: [[PHASE-0-v1]]
Files Changed: [blueprint.md, checklist.md, CHANGELOG.md]
Description : Initial blueprint created via enterprise-blueprint skill.
              Project: The Federation Foundation. Scope: PROJECT. All sections
              pre-populated with required structure awaiting content population.
Tests Passing: none — pre-build
Phase       : PHASE-0
Rollback Ref: N/A — initial document creation
```

## CL-0001 — PHASE-0 gated: architecture doc, independent review, chain-enforcement automation

```
Date        : 2026-08-15 08:20 UTC
Contributor : Claude (federation-architect role for deliverables; federation-qa
              role, a genuinely independent subagent, for the review)
Modules     : [MOD-001, MOD-011]
Section Tags: [[PHASE-0-v1]]
Files Changed: [docs/hackathon/architecture.md (new), review-phase0.md (new),
              .gate.json (new), .monitor.json (new), .monitor-state.json (new),
              .blueprint-chain/run-current-phase-gate.sh (new),
              .blueprint-chain/poll-forever.sh (new), plus committing the
              pre-existing but previously-uncommitted blueprint apparatus
              (blueprint.md, checklist.md, AGENTS.md, project.json,
              assignments.json, checklist-data.json, .blueprint-chain/,
              .blueprint-lock.json, .chain/, several docs/*.md files) into
              git history for the first time]
Description : Wrote docs/hackathon/architecture.md (PHASE-0.4), synthesized
              from blueprint.md's own Part I/II/§4.1/§4.6/§5.3 content, not
              new invention. Independent review (PHASE-0.5) performed by a
              separate subagent acting as "federation-qa" -- distinct from
              the phase's assigned "federation-architect"; the validator
              programmatically rejects a reviewer matching the assignee, so
              this could not be faked under one identity. The review found
              a real accuracy problem in the architecture doc's first draft
              (unsupported MOD-001/MOD-003 labels attached to Federation
              Watchtower's credential/webhook work, true from unrelated
              same-day work in a sibling repo but not something blueprint.md
              or docs/INTEGRATION_MAP.md actually states) -- corrected
              before this entry. Set up watcher+gate automation via the
              guardrail-enforcement skill: a file_mtime watcher over
              docs/**, src/**, shared/**, tests/**, and review-phase*.md
              fires a gate that re-runs whichever phase is currently
              first-failing and appends an HMAC-signed, hash-chained log
              entry on a genuine pass. A polling loop (custom
              poll-forever.sh, not the skill's own watchdog.sh, which
              assumes a different directory layout) is running detached in
              the background for this session -- not installed as a
              persistent systemd service, which remains a separate,
              sudo-requiring decision not taken unilaterally. Also brought
              the entire pre-existing blueprint scaffolding into git history
              for the first time, since it existed only on disk and was at
              the same kind of loss risk an uncommitted /tmp working copy
              turned out to have earlier the same day. A large, unrelated
              body of pre-existing uncommitted modifications/deletions/
              renames in this repo (README.md, api/* -> src/* restructuring,
              several docs/*.md edits) predates this session and was
              deliberately left uncommitted -- not part of this entry.
Tests Passing: PHASE-0 validator (.blueprint-chain/validators/validate_phase0_blueprint.py)
              — OK: Phase 0 validation passed (all 5 deliverables present,
              review well-formed and independent)
Phase       : PHASE-0
Rollback Ref: commit 3e5dcb5 (federation-society-hardening... this repo,
              ~/projects/hackathon) — revert via git revert if needed;
              blueprint.md itself untouched, no rollback needed there
```

## CL-0006 — MOD-003 Knowledge Retrieval + MOD-004 Context Router

```
Date        : 2026-08-16
Contributor : Claude
Modules     : [MOD-003, MOD-004]
Section Tags: [[PHASE-1-v1], [PHASE-2-v1]]
Files Changed: [src/knowledge/graph/knowledge-graph.js (new),
              src/knowledge/corpus/document-store.js (new),
              src/knowledge/vectors/vector-store.js (new),
              src/knowledge/retrieval/knowledge-retrieval.js (new),
              src/knowledge/index.js (new),
              src/context/router.js (new — ContextRouter)]
Description : Implemented Knowledge Retrieval plane (MOD-003), independent
              from episodic memory (MOD-002): Knowledge Graph (entities,
              relations, path finding), Document Corpus (metadata, content
              hash dedup), Vector Store (chunks, embeddings, cosine search),
              Hybrid Retrieval (graph + corpus + vectors, task-context
              composition). Context Router (MOD-004) as read-only
              composition layer above both planes: composes episodic +
              knowledge with provenance/confidence. No cross-dependency
              between MOD-002 and MOD-003; ContextRouter sits above both.
Tests Passing: KnowledgeRetrieval basic ops, ContextRouter instantiation;
               npm run smoke (3 pass), ui typecheck+build (clean),
               adapter validate+test (32/32)
Phase       : PHASE-1 / PHASE-2
Rollback Ref: git revert HEAD
```

---

## CL-0004 — AgentDrawer component: per-agent management drawer with 5 tabs

```
Date        : 2026-08-16
Contributor : Claude
Modules     : [MOD-006]
Section Tags: [[PHASE-2-v1]]
Files Changed: [ui/src/components/AgentDrawer.tsx (new),
              ui/src/components/Overlay.tsx (new),
              ui/src/styles/components.css (extended),
              ui/src/App.tsx (wired drawer),
              ui/src/components/types.ts (pre-existing AgentDrawerProps)]
Description : Implemented AgentDrawer (MOD-006 / FTR-005) — the main
              per-agent management interface opened from fleet sidebar.
              Five tabs: Terminal (interactive command input/output with
              provenance styling), Memory (tier tabs for daily/weekly/
              long-term/identity, placeholder for memory substrate
              connection), Tasks (queue placeholder with create action),
              Control (steering input, lifecycle Pause/Resume/Kill buttons
              wired to control API contract, policy status noting
              CharacterKit local fail-closed enforcement + Watchtower
              opt-in leases/validation gates), Observability (immutable
              action log, heartbeat/loop state, local fallback note).
              Uses pre-existing CSS variables and .drawer/.drawer-tabs/
              .drawer-content styles. Overlay component added for
              click-outside-to-close. TypeScript clean, build passes.
Tests Passing: npm run typecheck (clean), npm run build (clean),
               npm run smoke (3 pass)
Phase       : PHASE-2
Rollback Ref: git revert HEAD
```

---

## CL-0004b — Adapter ordering defect fix (HARDENING-SCOPE.md P0) + rename to @the-federation/adapter

```
Date        : 2026-08-16
Contributor : Claude
Modules     : [MOD-009, MOD-010]
Section Tags: [[PHASE-4-v1]]
Files Changed: [adapter/src/normalization/ordering.ts (fixed),
              adapter/tests/ordering.test.ts (new),
              adapter/package.json (renamed, description updated),
              adapter/CHANGELOG.md, adapter/AGENTS.md (synced)]
Description : Fixed ordering defect in adapter/src/normalization/ordering.ts:
              future sequences (sequence > last + 1) and stale sequences
              (sequence <= last) no longer advance ordering state — only
              sequence === last + 1 advances. Added regression test
              (adapter/tests/ordering.test.ts) covering exact defect
              scenario: 1 → 5 (out_of_order, state stays 1) → 2 → 3 → 4 → 5
              all accepted, final state 4. Renamed package to
              @the-federation/adapter (generic, scalable, non-domain-specific)
              with updated description. Copied to canonical home:
              ~/projects/federation-adapters/watchtower-ack-adapter/.
Tests Passing: npm run smoke (3 pass), cd adapter && npm run validate
               (tsc clean), cd adapter && npm test (32/32 pass)
Phase       : PHASE-4
Rollback Ref: git revert HEAD
```

---

## CL-0004c — Tooling badges + GitHub publish workflow + LICENSE files

```
Date        : 2026-08-16
Contributor : Claude
Modules     : [MOD-001, MOD-009, MOD-010]
Section Tags: [[PHASE-0-v1], [PHASE-4-v1]]
Files Changed: [README.md (React/Vite/Express badges),
              adapter/README.md (npm version/downloads/publish badges),
              adapter/.github/workflows/publish.yml (new — auto-publish on push to main),
              LICENSE (new, root), adapter/LICENSE (new, adapter),
              CHANGELOG.md, AGENTS.md]
Description : Added accurate tooling badges to root README.md
              (React 19, Vite 8, Express 4). Added npm version, downloads,
              and publish workflow badges to adapter README.md. Created
              GitHub Actions workflow at adapter/.github/workflows/publish.yml
              that runs validate (typecheck + test + build) then publishes
              @the-federation/adapter to npm with provenance on push to main.
              Added MIT LICENSE files to root and adapter. Synced canonical
              adapter at ~/projects/federation-adapters/watchtower-ack-adapter/.
Tests Passing: npm run smoke (3 pass), ui typecheck+build (clean),
               adapter validate+test (32/32), canonical adapter validate+test (32/32)
Phase       : PHASE-0 / PHASE-4
Rollback Ref: git revert HEAD
```

---

## CL-0003 — Phase I doc corrections: ownership boundaries, no project-labeled dirs, Federation branch integration target

```
Date        : 2026-08-15
Contributor : Claude (federation-architect role)
Modules     : [MOD-001, MOD-005, MOD-008, MOD-009, MOD-010]
Section Tags: [[PHASE-I-v1]]
Files Changed: [blueprint.md, README.md, AGENTS.md, CHANGELOG.md]
Description : Corrected ownership boundaries across all three docs to reflect
              reality: Federation Watchtower owns agent identity, registration,
              lifecycle, credentials (fw_owner_*/fw_agent_*/fw_operator_*),
              heartbeat/watchdog, webhooks (alerts only, signed HMAC), operator
              credentials, leases, validation gates, controlled-tool authorization,
              incident ledger. CharacterKit owns behavioral enforcement (habits,
              ACK, commitments, command policy, fail-closed gating). This
              repository owns local console: memory, tasks, logs, jobs, terminal,
              steer/kill, local observability projection + Watchtower mirror with
              local fallback. Added explicit "no project-labeled directories under
              src/" rule (src/federation/ forbidden). Added Federation branch
              integration target note (fix/rooms-agents-migrations, 14 commits
              ahead, unpushed). Updated blueprint paths (src/federation/ ->
              functional dirs). Updated FTR-001 (Watchtower mirror), FTR-005
              (memory/task/log/job management), FTR-006 (CharacterKit control),
              FTR-007 (local fallback observability), FTR-008 (consumption not
              building), API contract (local endpoints + local observability).
              Updated AGENTS.md with branch capabilities and SDK gaps.
Tests Passing: npm run smoke (3 pass / 5 skip), cd adapter && npm run validate
               (tsc clean), cd adapter && npm test (27/27 pass)
Phase       : PHASE-I
Rollback Ref: git revert HEAD
```

```
Date        : 2026-08-15 09:05 UTC
Contributor : Claude (federation-memory role for deliverables; federation-architect
              role, independent, for the review)
Modules     : [MOD-002]
Section Tags: [[PHASE-1-v1]]
Files Changed: [src/memory/README.md (new), tests/memory-isolation.test.mjs
              (new), review-phase1.md (new),
              src/memory/retrieval/embedding-engine.js (fixed — collapsed a
              376-line silent duplicate to a 2-line re-export shim),
              AGENTS.md (documented the duplicate-file finding under
              "Current implementation truth")]
Description : Wrote src/memory/README.md documenting the shared/memory
              (engine) vs src/memory (Federation application layer)
              boundary and an honest table of what's real vs empty in
              src/memory/'s subdirectories. Wrote
              tests/memory-isolation.test.mjs with 3 real, executing tests
              (adapter modules are re-export shims not duplicates; the
              shared engine never imports back into src/; the document
              indexer genuinely excludes memory/knowledge/.secrets/habits
              from the corpus, exercised against real temp-directory
              fixtures, not mocks) and 5 explicit test.skip(...) entries
              for blueprint acceptance tests that cannot be verified yet
              because the subsystem doesn't exist (episodic, declarative,
              knowledge-graph, Memory Router/Context Composer are all still
              empty directories, confirmed directly against the
              filesystem) -- each skip names the exact missing module,
              not a silent omission. Found and fixed a real, previously
              undocumented bug while building the first test: 
              src/memory/retrieval/embedding-engine.js was a 376-line file,
              374 lines identical to
              shared/memory/engines/embedding-engine.js, silently violating
              this repo's own no-duplicate rule. No importer referenced it
              anywhere (checked before touching it). Collapsed to the same
              shim pattern its siblings already used correctly; the first
              isolation test is now a permanent regression guard against
              this exact class of drift. Full finding recorded in
              AGENTS.md's "Current implementation truth" section per this
              project's own change-workflow rule.
Tests Passing: node --test tests/memory-isolation.test.mjs — 3 passed, 0
              failed, 5 skipped (each with a named reason). PHASE-1
              validator — OK: Phase 1 validation passed.
Phase       : PHASE-1
Rollback Ref: revert via git revert on this entry's commit; the
              embedding-engine.js fix is independently revertible (restore
              the prior 376-line file from git history) without affecting
              the test or README changes
```

