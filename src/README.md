# Federation Application Source

`src/` contains current application-facing source organized by responsibility.

- `api/` — API and middleware scaffold; integration remains unverified until
- `agent/` — legacy agent orchestration scaffold; not currently wired or verified.

  its runtime dependencies are restored.
- `memory/` — Federation application memory subsystem.

## Memory boundary

`src/memory/` is not a second copy of the reusable engine. Its adapter modules
route reusable implementations from `shared/memory/`, while its semantic
retrieval, document indexing, and migration modules provide Federation-specific
application behavior.

Keep new implementation inside the narrowest functional directory. Repository
concept, scope, and integration documentation belongs under `docs/`; local
module behavior belongs beside the module.
