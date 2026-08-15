# Shared Federation Capabilities

`shared/` contains reusable implementation-level capabilities consumed by
Federation layers.

- `memory/` — reusable, storage-agnostic memory engine and smoke test.
- `enforcement/` — fail-closed enforcement adapter for CharacterKit controls.

The shared memory engine is distinct from the Federation application memory
subsystem in `src/memory/`. Shared memory owns reusable storage, ingestion,
recall, embedding, retention, and learning primitives. `src/memory` owns
Federation tier policy, scope, indexing, context assembly, and persistence
adapters.

Shared code must remain modular and must not become a second product-level
source of truth. It must not import `.trash/` or depend on a machine-specific
path, model vendor, or unrelated project identity.
