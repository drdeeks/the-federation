# DUAL MEMORY ARCHITECTURE SPECIFICATION
## Independent Memory Systems With Controlled Interoperability
**Document Type:** Definitive Architecture / Implementation Contract  
**Status:** Normative  
**Scope:** Federation Foundation Cognitive Memory Substrate  
**Architecture Class:** Dual independent memory system  
**Primary Principle:** Memory systems SHALL cooperate through explicit interfaces, but neither SHALL depend upon the other for operation.
---
# 1. PURPOSE
The Federation memory architecture SHALL consist of two distinct memory systems with different responsibilities, storage semantics, retrieval mechanisms, lifecycle rules, and authority boundaries.
The systems SHALL be capable of exchanging explicitly defined information through controlled interfaces.
They SHALL NOT require one another to operate.
The fundamental architectural rule is:
> **INTEROPERABILITY IS PERMITTED. DEPENDENCY IS PROHIBITED.**
The architecture exists to prevent the common failure mode where conversational/session memory, durable knowledge, semantic retrieval, or cognitive state become coupled into one opaque persistence layer.
Each memory system MUST remain independently:
- deployable;
- addressable;
- testable;
- observable;
- recoverable;
- replaceable;
- degradable;
- operational.
---
# 2. HIGH-LEVEL ARCHITECTURE
```text
                         ┌──────────────────────────┐
                         │       FEDERATION         │
                         │     AGENT / CONTROL      │
                         └────────────┬─────────────┘
                                      │
                         ┌────────────┴────────────┐
                         │                         │
                         ▼                         ▼
              ┌─────────────────────┐   ┌─────────────────────┐
              │   MEMORY SYSTEM A   │   │   MEMORY SYSTEM B   │
              │                     │   │                     │
              │  EXPERIENTIAL       │   │  COGNITIVE /       │
              │  SESSION MEMORY     │   │  KNOWLEDGE MEMORY  │
              │                     │   │                     │
              │  sessions           │   │  corpus             │
              │  conversations      │   │  facts              │
              │  events             │   │  graph              │
              │  tool calls         │   │  vectors            │
              │  decisions          │   │  relationships      │
              │  execution history  │   │  semantic indexes   │
              └──────────┬──────────┘   └──────────┬──────────┘
                         │                         │
                         │    EXPLICIT INTERFACE   │
                         └────────────┬────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │     MEMORY INTERFACE      │
                         │                          │
                         │  query                   │
                         │  retrieve                │
                         │  promote                 │
                         │  reconcile               │
                         │  provenance              │
                         │  health                  │
                         └──────────────────────────┘

The interface between the systems SHALL be explicit.

There SHALL NOT be an implicit database-level dependency.

⸻

3. MEMORY SYSTEM A

Experiential / Session Memory

3.1 Purpose

Memory System A stores what happened.

It represents the agent’s operational and conversational experience.

Examples include:

* conversations;
* sessions;
* events;
* tool calls;
* decisions;
* task execution;
* temporary working context;
* interaction history;
* agent activity;
* task progression;
* execution state;
* session metadata.

It answers questions such as:

What happened?
What did the agent do?
What was discussed?
What occurred during this session?
What decision was made during this interaction?
What tools were called?
What was the execution history?

⸻

3.2 Characteristics

Memory System A SHOULD be:

* chronological;
* event-oriented;
* session-aware;
* provenance-preserving;
* append-oriented;
* reconstructable;
* independently queryable.

Conceptually:

SESSION
  │
  ├── EVENT
  ├── USER MESSAGE
  ├── AGENT RESPONSE
  ├── TOOL CALL
  ├── TOOL RESULT
  ├── DECISION
  ├── STATE CHANGE
  └── EVENT

A session represents an experience record.

It does NOT automatically represent authoritative knowledge.

⸻

4. MEMORY SYSTEM B

Cognitive / Knowledge Memory

4.1 Purpose

Memory System B stores what the system knows.

It represents durable, retrievable knowledge derived from:

* validated experiences;
* documents;
* structured facts;
* approved external sources;
* explicit system declarations;
* approved memory promotion;
* relationships;
* semantic representations.

It answers questions such as:

What is known?
What information is relevant?
What facts have been established?
What relationships exist?
What knowledge should be retrieved for this task?

⸻

4.2 Characteristics

Memory System B MAY contain multiple representations:

                  KNOWLEDGE SUBSTRATE
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
        DOCUMENTS       GRAPH        VECTORS
            │             │             │
            └─────────────┼─────────────┘
                          ▼
                  HYBRID RETRIEVAL

Potential components include:

* document/corpus storage;
* structured facts;
* graph relationships;
* vector embeddings;
* metadata;
* semantic indexes;
* provenance records;
* confidence information;
* source references.

The exact technologies are implementation choices.

The architectural boundary is not.

⸻

5. CORE INDEPENDENCE RULE

The systems SHALL NOT be implemented as:

Memory A
   │
   ▼
Memory B
   │
   ▼
Memory A

where one system becomes operationally dependent on the other.

Instead:

                       FEDERATION
                           │
                 ┌─────────┴─────────┐
                 │                   │
                 ▼                   ▼
             Memory A            Memory B
                 │                   │
                 └─────────┬─────────┘
                           │
                    Explicit Interface

The Federation/control layer owns orchestration.

Neither memory system owns the other.

⸻

6. HARD DEPENDENCY PROHIBITION

The following dependencies are FORBIDDEN:

Memory A database → Memory B database
Memory B database → Memory A database
Memory A startup → Memory B startup
Memory B startup → Memory A startup
Memory A schema → Memory B schema
Memory B schema → Memory A schema
Memory A availability → Memory B availability
Memory B availability → Memory A availability

A memory system SHALL NOT directly import, initialize, migrate, repair, or manage the storage implementation of the other memory system.

⸻

7. INDEPENDENT STARTUP REQUIREMENT

Each memory system MUST be independently startable.

Example

START FEDERATION
        │
        ├── START MEMORY A
        │
        └── START MEMORY B

The system MUST NOT execute:

START MEMORY A
      │
      └── WAIT FOR MEMORY B
                    │
                    └── START

or:

START MEMORY B
      │
      └── WAIT FOR MEMORY A
                    │
                    └── START

⸻

8. FAILURE ISOLATION

A failure in one memory system MUST NOT automatically cause the other system to fail.

8.1 Memory A Failure

Memory A: DOWN
Memory B: HEALTHY
Federation: RUNNING
Knowledge retrieval: AVAILABLE
Knowledge ingestion: AVAILABLE
Experiential memory:
    DEGRADED / UNAVAILABLE

The Federation MAY continue operating with degraded session-history capabilities.

⸻

8.2 Memory B Failure

Memory A: HEALTHY
Memory B: DOWN
Federation: RUNNING
Session memory: AVAILABLE
Current-session operation: AVAILABLE
Knowledge retrieval:
    DEGRADED / UNAVAILABLE

The Federation MAY continue operating with degraded long-term knowledge retrieval.

⸻

8.3 Both Systems Failure

Memory A: DOWN
Memory B: DOWN
Federation:
    MUST REPORT MEMORY SUBSYSTEM FAILURE
    MUST NOT CORRUPT OTHER STATE
    MUST REMAIN OBSERVABLE

Recovery SHALL be independently executable for each subsystem.

⸻

9. MEMORY AUTHORITY MODEL

The two systems SHALL have different authority.

Memory A

Primary authority:

EVENTS
SESSIONS
INTERACTIONS
EXECUTION HISTORY

Memory A answers:

“What happened?”

⸻

Memory B

Primary authority:

DURABLE KNOWLEDGE
FACTS
RELATIONSHIPS
DOCUMENTS
SEMANTIC INFORMATION

Memory B answers:

“What is known?”

⸻

9.1 Critical Rule

A statement appearing in Memory A SHALL NOT automatically become an authoritative fact in Memory B.

For example:

Conversation:
    "The API uses provider X."

does NOT automatically become:

Knowledge:
    API provider = X

without an explicit promotion process.

⸻

10. MEMORY PROMOTION

Information MAY move from Memory A to Memory B through an explicit promotion pipeline.

Memory A
   │
   ▼
Candidate Memory
   │
   ▼
Validation
   │
   ├── REJECT
   │
   └── ACCEPT
          │
          ▼
      Memory B

Promotion SHOULD include:

* source reference;
* provenance;
* timestamp;
* originating session;
* originating agent;
* confidence;
* validation status;
* transformation history;
* promotion reason;
* content hash where appropriate.

⸻

11. PROMOTION MUST NOT DESTROY SOURCE HISTORY

When information is promoted:

Memory A
   │
   │ original evidence
   ▼
Memory B
   │
   │ derived knowledge

Memory A SHALL remain intact unless an independent retention policy explicitly permits deletion.

Memory B SHALL retain provenance pointing back toward the originating evidence whenever technically possible.

The system MUST be capable of answering:

Where did this knowledge originate?

⸻

12. KNOWLEDGE MUST NOT FLOW BACK AUTOMATICALLY AS FACT

Memory B MAY provide information to Memory A or an active agent as retrieved context.

However:

Memory B → Memory A

SHALL represent retrieved context, not an automatic mutation of experiential memory.

Retrieved knowledge SHALL NOT silently become:

* a session event;
* a user statement;
* an agent decision;
* a historical event;
* an authoritative memory-A record.

If the system records the retrieval, it MUST distinguish:

RETRIEVED_KNOWLEDGE

from:

EXPERIENCED_EVENT

⸻

13. EXPLICIT MEMORY INTERFACE

Communication between the systems SHALL occur through a defined interface.

The interface MAY expose operations such as:

memory.query()
memory.retrieve()
memory.promote()
memory.reconcile()
memory.provenance()
memory.health()

The exact API is implementation-specific.

The semantics are mandatory.

⸻

14. QUERY CONTRACT

A query MUST identify its target memory domain.

Example:

{
  "memory": "experiential",
  "operation": "query",
  "session_id": "session-123",
  "query": "deployment discussion"
}

or:

{
  "memory": "knowledge",
  "operation": "retrieve",
  "query": "adapter webhook architecture"
}

The system MUST NOT rely on an ambiguous global:

search_memory()

that silently determines which underlying memory system is being queried.

A unified Federation search MAY exist, but it MUST preserve source identity.

⸻

15. UNIFIED RETRIEVAL

A Federation-level query MAY search both systems.

Example:

Federation Query
       │
       ├──────────────► Memory A
       │
       └──────────────► Memory B
                         │
                         ▼
                    Result Fusion
                         │
                         ▼
                   Agent Context

The result MUST retain origin metadata.

Example:

{
  "source": "memory_b",
  "type": "knowledge",
  "content": "...",
  "confidence": 0.94,
  "provenance": "document:architecture.md"
}

versus:

{
  "source": "memory_a",
  "type": "experience",
  "session_id": "abc123",
  "content": "...",
  "timestamp": "..."
}

The unified retrieval layer SHALL NOT erase this distinction.

⸻

16. PROVENANCE REQUIREMENTS

Every durable memory SHOULD contain sufficient provenance to establish:

WHO
WHAT
WHEN
WHERE
WHY
SOURCE
STATUS
CONFIDENCE

Minimum conceptual provenance:

{
  "source": "...",
  "origin_type": "session|document|system|external",
  "origin_id": "...",
  "created_at": "...",
  "agent_id": "...",
  "confidence": "...",
  "validation_status": "..."
}

⸻

17. CONFLICT HANDLING

If Memory A and Memory B contain contradictory information, the system MUST NOT silently overwrite one with the other.

Example:

Memory A:
    "Provider = X"
Memory B:
    "Provider = Y"

The system SHALL represent the conflict.

Possible resolution states:

UNRESOLVED
CONFIRMED_A
CONFIRMED_B
SUPERSEDED
REJECTED_A
REJECTED_B

Conflict resolution MUST preserve the underlying evidence.

⸻

18. STALENESS

Knowledge memory MAY become stale.

Experiential memory MAY contain historical information that is no longer current.

Therefore, the system SHALL distinguish:

historical truth

from:

current truth

and:

retrieved context

from:

authoritative current state

A retrieved memory MUST NOT automatically be treated as current merely because it is semantically relevant.

⸻

19. MEMORY LIFECYCLE

Memory A and Memory B SHALL have independent lifecycle policies.

Memory A

Possible lifecycle:

ACTIVE SESSION
      │
      ▼
COMPLETED SESSION
      │
      ▼
ARCHIVED EXPERIENCE
      │
      ▼
RETENTION / PURGE

Memory B

Possible lifecycle:

CANDIDATE
    │
    ▼
VALIDATED
    │
    ▼
ACTIVE KNOWLEDGE
    │
    ├── SUPERSEDED
    │
    ├── INVALIDATED
    │
    └── ARCHIVED

The lifecycle of one SHALL NOT automatically control the lifecycle of the other.

⸻

20. STORAGE INDEPENDENCE

The two systems SHOULD use independently managed persistence.

For example:

/data/memory/experiential/
    
/data/memory/knowledge/

or separate databases/services entirely.

The implementation MUST NOT require:

Memory A tables

to exist inside:

Memory B database

or vice versa.

Shared infrastructure is permitted.

Shared ownership is not.

⸻

21. SCHEMA INDEPENDENCE

Each system MUST maintain its own schema.

Memory A may contain:

sessions
events
messages
tool_calls
decisions
execution_records

Memory B may contain:

documents
chunks
facts
entities
relationships
embeddings
provenance

A schema migration in Memory A MUST NOT require a Memory B migration unless an explicitly versioned interface contract has changed.

⸻

22. VERSIONED INTEROPERABILITY

The memory interface SHALL be versioned.

Example:

memory-api/v1
memory-api/v2

Changes to the storage implementation MUST NOT automatically propagate across the boundary.

The interface is the contract.

The database is not.

⸻

23. ADAPTER REQUIREMENT

If either memory system uses a third-party provider, the Federation SHOULD communicate through an adapter.

Federation
    │
    ▼
Memory Interface
    │
    ▼
Adapter
    │
    ▼
Provider

Example:

Federation
    │
    ▼
KnowledgeMemory
    │
    ▼
VectorStoreAdapter
    │
    ▼
Vector Database

This prevents external infrastructure from becoming the Federation’s architectural contract.

⸻

24. NO PROVIDER LOCK-IN

The architecture MUST allow a memory provider to be replaced.

Example:

Current:
Knowledge Interface
        │
        ▼
Provider A

must permit:

Knowledge Interface
        │
        ▼
Provider B

without rewriting the Federation memory model.

The same applies to Memory A.

⸻

25. OBSERVABILITY

Each memory system MUST expose independent health information.

Example:

{
  "memory_a": {
    "status": "healthy",
    "latency_ms": 12,
    "storage": "available"
  },
  "memory_b": {
    "status": "degraded",
    "latency_ms": 480,
    "storage": "available"
  }
}

A combined:

MEMORY: HEALTHY

status is insufficient.

The system MUST be capable of identifying which subsystem is unhealthy.

⸻

26. AUDITABILITY

Memory operations SHOULD generate observable events.

Examples:

MEMORY_A_WRITE
MEMORY_A_READ
MEMORY_B_WRITE
MEMORY_B_READ
MEMORY_PROMOTION
MEMORY_REJECTION
MEMORY_CONFLICT
MEMORY_RECONCILIATION
MEMORY_PROVIDER_FAILURE

Promotion and reconciliation operations SHOULD be particularly auditable.

⸻

27. SECURITY BOUNDARY

Memory A and Memory B MUST NOT automatically share unrestricted access.

Permissions SHOULD be scoped.

Example:

Agent
 ├── read: Memory A
 ├── write: Memory A
 ├── read: Memory B
 └── promote: Memory B

while another agent may have:

Agent
 ├── read: Memory A
 └── read: Memory B

but:

write: DENIED
promote: DENIED

Memory promotion SHALL be an explicit capability.

⸻

28. DATA CLASSIFICATION

The architecture SHOULD classify information before promotion.

Suggested classifications:

EPHEMERAL
SESSION
EXPERIENTIAL
CANDIDATE_KNOWLEDGE
VALIDATED_KNOWLEDGE
AUTHORITATIVE_KNOWLEDGE
ARCHIVED
REJECTED

The classification determines storage and lifecycle behavior.

⸻

29. ANTI-PATTERNS

The following implementations are explicitly prohibited.

29.1 One Giant Memory Database

Everything
    │
    ▼
ONE DATABASE

Reason:

* destroys semantic boundaries;
* makes lifecycle management ambiguous;
* couples unrelated data;
* increases blast radius;
* makes provenance difficult;
* creates hidden dependencies.

⸻

29.2 Automatic Conversation-to-Knowledge Promotion

User says something
       │
       ▼
Knowledge database

This is prohibited.

Conversation is evidence, not automatically verified knowledge.

⸻

29.3 Knowledge-as-Conversation

Retrieved knowledge MUST NOT be rewritten into session history as though it originated from the current interaction.

⸻

29.4 Cross-Database Foreign-Key Dependency

Memory systems MUST NOT require relational foreign keys across independent persistence systems.

Use stable identifiers and provenance references instead.

⸻

29.5 Shared Migration Dependency

Memory A migration MUST NOT require Memory B to migrate simultaneously unless the explicit interoperability contract changes.

⸻

29.6 Shared Failure Domain

The architecture MUST NOT make one provider’s outage automatically take down both memory systems.

⸻

30. RECOMMENDED DATA FLOW

The canonical flow is:

                 USER / AGENT ACTIVITY
                         │
                         ▼
                  MEMORY SYSTEM A
                         │
                         │
                  EXPERIENCE
                         │
                         ▼
                  CANDIDATE MEMORY
                         │
                         ▼
                 VALIDATION LAYER
                         │
              ┌──────────┴──────────┐
              │                     │
           REJECT                 ACCEPT
              │                     │
              ▼                     ▼
          Archived              MEMORY B
                                  │
                         ┌────────┼────────┐
                         ▼        ▼        ▼
                       Facts    Graph    Vectors
                         │        │        │
                         └────────┼────────┘
                                  ▼
                           KNOWLEDGE QUERY
                                  │
                                  ▼
                                AGENT

⸻

31. RETRIEVAL FLOW

For a normal agent request:

USER REQUEST
     │
     ▼
CONTEXT ROUTER
     │
     ├───────────────┐
     │               │
     ▼               ▼
Memory A          Memory B
     │               │
     ▼               ▼
Experience       Knowledge
     │               │
     └───────┬───────┘
             ▼
       CONTEXT FUSION
             │
             ▼
          AGENT

Context fusion SHALL preserve:

* source;
* provenance;
* confidence;
* timestamp;
* memory type;
* authority level.

⸻

32. MEMORY ROUTER REQUIREMENTS

A Context Router MAY determine which memory system is relevant.

Example:

"What happened during yesterday's deployment?"
             │
             ▼
        Memory A

versus:

"What is the adapter architecture?"
             │
             ▼
        Memory B

versus:

"What did we decide about the adapter architecture?"
             │
             ├── Memory A
             └── Memory B

The router SHALL NOT turn routing into dependency.

It is an orchestration component.

⸻

33. TESTING CONTRACT

The implementation SHALL include tests proving independence.

Test A: Memory A Alone

Disable Memory B.
Start Memory A.
Expected:
PASS

⸻

Test B: Memory B Alone

Disable Memory A.
Start Memory B.
Expected:
PASS

⸻

Test C: Memory A Failure

Memory A = unavailable
Memory B = available
Expected:
Federation remains operational.
Memory B remains usable.

⸻

Test D: Memory B Failure

Memory A = available
Memory B = unavailable
Expected:
Federation remains operational.
Memory A remains usable.

⸻

Test E: Promotion

Memory A
   │
   ▼
Candidate
   │
   ▼
Validation
   │
   ▼
Memory B

Expected:

* source preserved;
* provenance preserved;
* original experience preserved;
* knowledge created only after explicit promotion.

⸻

Test F: No Implicit Promotion

Write event to Memory A.
Query Memory B.
Expected:
The event does NOT appear in Memory B
unless explicitly promoted.

⸻

Test G: Provider Replacement

Replace the provider behind one memory system.

Expected:

Federation interface unchanged.
Other memory system unaffected.

⸻

34. DEFINITION OF DONE

The dual memory architecture SHALL NOT be considered implemented until all of the following are true:

* Memory A exists as an independently addressable subsystem.
* Memory B exists as an independently addressable subsystem.
* Each has independent persistence.
* Each has independent schema.
* Each has independent lifecycle management.
* Each has independent health checks.
* Each can start without the other.
* Each can operate without the other.
* Each can fail without taking down the other.
* The interoperability boundary is explicit.
* The interface is versioned.
* Memory A and Memory B have distinct semantic responsibilities.
* Memory A events do not automatically become Memory B knowledge.
* Knowledge promotion is explicit.
* Promotion preserves provenance.
* Retrieval preserves memory source.
* Conflicts are represented rather than silently overwritten.
* Provider implementations are replaceable.
* Cross-system storage dependencies do not exist.
* Cross-system migration dependencies do not exist.
* Security permissions are independently enforceable.
* Failure isolation has automated tests.
* Promotion has automated tests.
* Retrieval has automated tests.
* Provenance has automated tests.
* Observability identifies each subsystem independently.

⸻

35. ARCHITECTURAL INVARIANTS

The following statements are NON-NEGOTIABLE invariants.

INVARIANT 001

Memory A SHALL remain operationally independent from Memory B.

INVARIANT 002

Memory B SHALL remain operationally independent from Memory A.

INVARIANT 003

Neither memory system SHALL directly own the other’s persistence.

INVARIANT 004

Interoperability SHALL occur through an explicit interface.

INVARIANT 005

Experiential history SHALL NOT automatically become durable knowledge.

INVARIANT 006

Durable knowledge SHALL retain provenance whenever derived from experiential memory.

INVARIANT 007

Retrieved knowledge SHALL NOT be represented as though it were a newly experienced event.

INVARIANT 008

Failure of one memory system SHALL NOT inherently terminate the other.

INVARIANT 009

Memory systems SHALL maintain independent lifecycle and retention policies.

INVARIANT 010

Memory systems SHALL maintain independent security boundaries.

INVARIANT 011

Storage providers SHALL remain implementation details behind the memory interfaces.

INVARIANT 012

A unified retrieval mechanism SHALL preserve the identity and provenance of each memory source.

INVARIANT 013

Conflicting memories SHALL be represented and resolved explicitly rather than silently overwritten.

INVARIANT 014

Promotion from experiential memory to cognitive memory SHALL be explicit, observable, and auditable.

INVARIANT 015

The architecture SHALL remain functional if either underlying memory provider is replaced.

⸻

36. REFERENCE IMPLEMENTATION MODEL

A clean implementation can be represented as:

src/
├── memory/
│   ├── experiential/
│   │   ├── interface.ts
│   │   ├── models.ts
│   │   ├── repository.ts
│   │   ├── service.ts
│   │   └── health.ts
│   │
│   ├── knowledge/
│   │   ├── interface.ts
│   │   ├── models.ts
│   │   ├── repository.ts
│   │   ├── service.ts
│   │   └── health.ts
│   │
│   ├── promotion/
│   │   ├── candidate.ts
│   │   ├── validator.ts
│   │   ├── promoter.ts
│   │   └── provenance.ts
│   │
│   ├── retrieval/
│   │   ├── router.ts
│   │   ├── fusion.ts
│   │   └── ranking.ts
│   │
│   └── contracts/
│       ├── memory-api.v1.ts
│       ├── provenance.v1.ts
│       └── health.v1.ts

The important structural property is:

experiential/

and:

knowledge/

remain separate domains.

⸻

37. REFERENCE DEPENDENCY GRAPH

The correct dependency direction is:

                         ┌──────────────────┐
                         │    Federation    │
                         │    Control       │
                         └────────┬─────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
             ┌─────────────┐             ┌─────────────┐
             │ Memory A    │             │ Memory B    │
             │ Interface   │             │ Interface   │
             └──────┬──────┘             └──────┬──────┘
                    │                           │
                    ▼                           ▼
             ┌─────────────┐             ┌─────────────┐
             │ Provider A  │             │ Provider B  │
             └─────────────┘             └─────────────┘

NOT:

Provider A
    │
    ▼
Memory A
    │
    ▼
Memory B
    │
    ▼
Provider B

⸻

38. FINAL ARCHITECTURAL DEFINITION

The Federation SHALL treat memory as a federated capability, not as a monolithic database.

The two systems represent two different dimensions of persistence:

MEMORY A
========
Experience
History
Sessions
Events
Execution
"What happened?"
MEMORY B
========
Knowledge
Facts
Relationships
Documents
Semantics
"What is known?"

They MAY cooperate.

They MAY exchange information.

They MAY participate in a unified retrieval pipeline.

They MAY share infrastructure.

They MAY be operated by the same Federation runtime.

They MUST NOT become dependent upon one another.

The canonical relationship is therefore:

                 ┌───────────────────────┐
                 │      FEDERATION       │
                 │                       │
                 │   orchestration       │
                 │   routing             │
                 │   policy              │
                 │   context fusion      │
                 └───────────┬───────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
     ┌─────────────────┐          ┌─────────────────┐
     │ MEMORY A         │          │ MEMORY B         │
     │                 │          │                 │
     │ EXPERIENCE      │          │ KNOWLEDGE       │
     │                 │          │                 │
     │ Independent     │          │ Independent     │
     │ Storage         │          │ Storage         │
     │ Schema          │          │ Schema          │
     │ Lifecycle       │          │ Lifecycle       │
     │ Health          │          │ Health          │
     └────────┬────────┘          └────────┬────────┘
              │                            │
              └───────────┬────────────────┘
                          │
                  EXPLICIT CONTRACT
                          │
                 promotion / retrieval
                 provenance / reconciliation

The governing rule

The systems work together by contract, not by dependency.

If either system disappears, the other remains a valid memory system.

If either provider is replaced, the Federation memory contract remains valid.

If information moves between them, that movement is explicit, validated, attributable, and auditable.

That separation is what makes the architecture resilient rather than merely making it look modular.