# Federation Memory Architecture

Status: canonical architecture boundary for the Federation memory subsystem.

This document defines a portable cognitive substrate that can be dropped into
a scaffolded project while keeping each memory and retrieval layer independently
usable. `BLUEPRINT.md` and `CHECKLIST.md` are forthcoming execution authorities;
this document defines the subsystem boundary they will build against.

## 1. Two implementation boundaries, four knowledge subsystems

The repository contains two implementation-level memory boundaries:

1. `shared/memory/` — reusable memory-engine primitives.
2. `src/memory/` — the Federation cognitive substrate that exposes explicit
   contracts, adapters, scope, and context composition.

Inside the Federation cognitive substrate are four independently usable
knowledge subsystems:

1. Episodic memory.
2. Long-term/declarative memory.
3. Knowledge graph.
4. Document and semantic retrieval.

The Memory Router and Context Composer coordinate those subsystems. They do not
store their state and they do not become a fifth hidden memory database.

```text
                         FEDERATION AGENT
                                |
                                v
                     +-----------------------+
                     |   CONTEXT COMPOSER     |
                     |   / MEMORY ROUTER      |
                     +-----------+-----------+
                                 |
                 explicit read-only queries through adapters
                                 |
       +-------------------------+--------------------------+
       |                         |                          |
       v                         v                          v
  EPISODIC             LONG-TERM / DECLARATIVE       KNOWLEDGE GRAPH
  MEMORY               MEMORY                        entities, facts,
  events, daily        lessons, patterns,            relations, metadata
  records, weekly      decisions, preferences,
  synthesis            constraints, principles
       |                         |                          |
       +-------------------------+--------------------------+
                                 |
                                 v
                 DOCUMENT + SEMANTIC RETRIEVAL
                 corpus, documents, keyword search,
                 embeddings, vector index, hybrid ranking
```

Execution state is intentionally outside this diagram. Blueprint state,
checklist state, enforcement state, active task state, and runtime state are
governed by their own contracts. They may be queried by a composer through an
explicit adapter, but they are not memory.

## 2. Isolation rule

The governing rule is:

> Integrated through explicit APIs and derived context; isolated through
> independent storage and state.

Therefore:

- no subsystem reads another subsystem's private files directly;
- no subsystem requires another subsystem to exist in order to operate;
- no subsystem shares a database or mutable in-memory state with another;
- each subsystem owns its storage adapter and lifecycle;
- cross-subsystem communication uses explicit contracts and derived results;
- promotion from one subsystem to another is an explicit operation;
- retrieval returns bounded references or derived records, not private stores;
- no memory subsystem imports `.trash/` or historical project artifacts.

This permits a local YAML store, JSON index, SQL adapter, vector service, or
cloud implementation to be replaced independently.

## 3. Shared memory engine

`shared/memory/` is reusable infrastructure. It provides generic primitives for
storage, ingestion, embeddings, recall, retention, forgetting, recovery, and
learning.

It must remain independent of:

- a particular Federation application;
- a model vendor or embedding vendor;
- a project scaffold;
- blueprint or checklist state;
- a machine-specific path;
- a knowledge graph or document corpus layout.

The shared engine can be used by an episodic store, a declarative store, or
another compatible agent runtime, but it does not decide how those systems are
composed.

## 4. Episodic memory

Episodic memory records what happened. Its natural representations are daily
records and derived weekly syntheses.

```text
episodic/
├── daily/YYYY-MM-DD.yaml
└── weekly/week-YYYY-MM-DD.yaml
```

A daily record may contain:

- timestamp;
- agent and task identifiers;
- event or observation;
- action summary;
- outcome;
- category and tags;
- provenance reference.

A weekly synthesis is a new derived artifact. It does not rewrite daily
records. It may contain a summary, recurring patterns, decisions, and source
references.

The episodic API should support recording, reading, range queries, listing,
searching, deletion according to retention policy, and export. It must not
silently mutate the knowledge graph, declarative memory, document corpus,
vectors, or execution state.

## 5. Long-term/declarative memory

Long-term memory contains durable learned or explicitly approved context. It
should be structured rather than treated as one unbounded narrative file.

Supported categories are:

- lessons — things learned;
- patterns — repeated observations;
- decisions — explicit architectural or operational choices;
- preferences — durable preferences;
- constraints — durable limits or requirements;
- principles — higher-order rules.

Each record should carry scope, provenance, confidence, sensitivity, retention,
and approval state. A daily or weekly record does not become declarative memory
automatically. Promotion must be explicit and auditable.

## 6. Knowledge graph

The knowledge graph models entities and relationships. It answers who, what,
where, and how things relate.

```text
entity
├── identifier
├── type
├── facts
├── attributes
├── tags
└── relations
    ├── relationship
    ├── target
    └── metadata
```

The graph has its own store and API for adding entities, reading entities,
searching facts, and managing relations. It does not automatically ingest an
episodic record because a name or concept appeared in it.

Memory-to-knowledge promotion must be an explicit transaction such as an
approved `addEntity` or `addRelation` operation with source references.

## 7. Document and semantic retrieval

The document subsystem indexes information supplied to the agent. It is not an
episodic or declarative memory store.

```text
corpus
  -> document index
  -> chunks and metadata
  -> keyword retrieval and embeddings
  -> hybrid ranking
```

The corpus indexer must exclude agent-internal state such as memory,
knowledge, identity, habits, secrets, runtime output, and dependency
directories. This prevents recursive self-indexing.

Semantic retrieval owns embedding and vector storage adapters. It must return
lightweight references and scores; a separate resolver obtains bounded content.
The retrieval subsystem must not know how episodic or declarative memory is
stored.

The target retrieval contract is:

```js
retrieval.search({
  query,
  sources: ['corpus'],
  mode: 'hybrid',
  limit,
});
```

Keyword ranking, semantic ranking, and reciprocal-rank fusion are retrieval
concerns. They are not additional memory tiers.

## 8. Memory Router and Context Composer

The router orchestrates queries. The composer creates a temporary context
package for an agent task.

```text
user or agent query
        |
        v
Memory Router
  ├── episodic adapter
  ├── declarative adapter
  ├── knowledge adapter
  └── retrieval adapter
        |
        v
bounded references and derived records
        |
        v
Context Composer
        |
        v
temporary agent context
```

The router may classify intent, choose sources, enforce scope, and rank
candidates. The composer may combine relevant records with current task
context. Neither component persists the composed context by default.

Context disappears after the request unless an explicit caller promotes a
record into one of the persistent subsystems.

## 9. Explicit promotion and provenance

The only permitted cross-subsystem writes are explicit, contract-bound
operations:

```text
agent observation
      |
      +--> episodic.record()
      +--> declarative.addLesson()       [explicit decision]
      +--> knowledge.addEntity()         [explicit decision]
      +--> retrieval.indexDocument()     [explicit corpus operation]
```

Every derived record should preserve, where applicable:

```text
record_id
source_subsystem
agent_id
organization_id
task_id
event_id
source_reference
created_at
observed_at
confidence
sensitivity
retention
approval
```

An event observed from an external execution system may become an episodic
candidate. The memory record never replaces the immutable action or audit
record.

## 10. Storage and adapter contracts

Each subsystem owns an independent persistence adapter:

```text
EpisodicStore       record / read / search / export
DeclarativeStore    add / get / update-with-version / search / export
KnowledgeStore      addEntity / getEntity / addRelation / search
DocumentStore       index / resolve / search / export
VectorStore         upsert / search / delete / export
```

These are conceptual contracts for the subsystem. They do not require a
specific storage technology. Local implementations may use YAML, JSON, or an
in-memory test store. Deployed implementations may use SQL, object storage,
or a vector service. The interfaces and provenance semantics remain stable.

No critical identity, policy, memory, or provenance state may exist only in an
undocumented runtime directory.

## 11. Current repository mapping

```text
shared/memory/                       reusable engine primitives
src/memory/retrieval/                embedding and semantic retrieval adapters
src/memory/semantic/document-indexer.js
                                     corpus/document indexing
src/memory/store/db/                 Federation persistence/migration boundary
src/memory/* adapter modules         explicit bridges to shared primitives
```

The following target modules are not yet integrated and must not be described
as complete:

- episodic daily and weekly APIs;
- long-term/declarative memory API;
- independent knowledge graph store/API;
- keyword and hybrid/RRF retrieval contract;
- Memory Router;
- Context Composer;
- explicit promotion transaction layer;
- complete provenance schema enforcement;
- durable production adapters.

The older API memory implementations were preserved in `.trash/legacy` because
they did not satisfy this isolation boundary. They are reference material only,
not active implementations.

## 12. Required rules for future implementation

- Keep every subsystem independently importable and testable.
- Give every subsystem a public contract and a replaceable store adapter.
- Keep retrieval infrastructure separate from memory persistence.
- Keep execution and blueprint state separate from memory.
- Never infer graph entities or durable lessons without an explicit promotion.
- Never rewrite daily or immutable source records during consolidation.
- Never use a model provider name as a memory subsystem identity.
- Never pass unrestricted private state into the Context Composer.
- Test isolation, provenance, promotion, export, and failure behavior at the
  subsystem that owns each rule.

The Federation can therefore provide one coherent agent context without
turning memory, knowledge, documents, vectors, and execution state into one
coupled storage system.
