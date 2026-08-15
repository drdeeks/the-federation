# Federation memory subsystem (application layer)

`src/memory/` is Federation's own cognitive substrate — the four-tier
architecture FTR-002 specifies, built on top of the reusable engine in
`shared/memory/`. Full architecture: `docs/MEMORY-ARCHITECTURE.md`.

## Boundary with `shared/memory/`

`shared/memory/` owns the generic, application-agnostic primitives:
storage, ingestion, embeddings, recall, retention/forgetting, learning.
`src/memory/` owns Federation's specific application of those primitives —
tier structure, agent/organization scope, document indexing, retrieval
policy, and (once built) context assembly.

The rule, stated in `shared/memory/README.md` and enforced by
`tests/memory-isolation.test.mjs`: `src/memory/` **may adapt or re-export**
the shared engine, but **must not maintain a silent duplicate
implementation**. Every adapter module here that wraps a shared engine is a
thin re-export shim (`export * from '../../../shared/memory/...'`), not a
copy of the implementation.

## What actually exists right now

| Path | Real content | What it is |
|---|---|---|
| `store/memory-store.js` | re-export shim | wraps `shared/memory/store/memory-store.js` |
| `intake/ingestion.js` | re-export shim | wraps `shared/memory/engines/ingestion.js` |
| `retrieval/recall-engine.js` | re-export shim | wraps `shared/memory/engines/recall.js` |
| `retrieval/embedding-engine.js` | re-export shim | wraps `shared/memory/engines/embedding-engine.js` |
| `consolidation/pattern-detector.js` | re-export shim | wraps `shared/memory/engines/learning.js` |
| `consolidation/forget-policy.js` | re-export shim | wraps `shared/memory/engines/forget.js` |
| `retrieval/semantic-retriever.js` | real, Federation-specific | not a shared/memory concept — corpus/document retrieval logic |
| `semantic/document-indexer.js` | real, Federation-specific | corpus indexing; excludes agent-internal dirs (memory/knowledge/.secrets/habits) |
| `semantic/frontmatter.js` | real, Federation-specific | frontmatter parsing used by the indexer |
| `store/db/migrations*` | real, Federation-specific | Federation's own persistence/migration boundary |
| `episodic/` | **empty** | no episodic (daily/weekly) store or API yet |
| `working/` | **empty** | no working-memory tier yet |
| `persistent/` | **empty** | no long-term/declarative store or promotion API yet |
| `schemas/` | **empty** | no knowledge-graph or shared schema definitions yet |

This table exists so nobody has to re-derive "is X built yet" by reading
source — it's checked directly in `tests/memory-isolation.test.mjs`, which
runs real assertions against what's implemented and explicit, visible
`test.skip(...)` entries (with the exact missing module named) against
what isn't. Per blueprint.md §1.8, this repository's status vocabulary
never treats planned work as completed — MOD-002 is PARTIAL, not
IMPLEMENTED, and this file agrees with that.

## A real gap found and fixed during PHASE-1

`src/memory/retrieval/embedding-engine.js` was, until this phase, a
376-line file that duplicated `shared/memory/engines/embedding-engine.js`
almost exactly (374 of 376 lines identical — only two comment-header lines
differed). That silently violated the re-export-only rule above. It has
been collapsed to the same two-line shim pattern every sibling adapter
already used correctly. `tests/memory-isolation.test.mjs`'s first test is
a regression guard against this exact class of drift happening again —
see `AGENTS.md` for the full record of this finding.

## Isolation rules that apply here

See `docs/MEMORY-ARCHITECTURE.md` §2 for the complete rule set. The two
most relevant to this directory specifically:

- No subsystem reads another subsystem's private files directly — the
  document indexer's `AGENT_INTERNAL_DIRS` exclusion (`memory`,
  `knowledge`, `.secrets`, `habits`, `.agent`) is the concrete enforcement
  of this for corpus indexing.
- Promotion between tiers (episodic → declarative → knowledge graph) must
  be explicit and auditable — not yet applicable, since those tiers don't
  exist as code yet (see the empty-directory rows above).

## Verification

```text
node --test tests/memory-isolation.test.mjs
```

For the underlying engine's own tests: `npm run smoke` (documented in
`shared/memory/README.md`).
