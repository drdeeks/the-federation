# Federation Layers

`layers/` is the function-scoped subsystem map for the current Federation
foundation. A layer is not considered complete merely because its directory or
files exist. Each row below distinguishes implementation presence, syntax
verification, functional tests, and remaining integration work.

## Status vocabulary

- **Implemented files** — source files currently exist in the layer.
- **Syntax verified** — every JavaScript file in that layer passes `node --check`.
- **Functional tests** — a test file exercises that layer's behavior directly.
- **Open** — missing implementation, missing integration, or missing tests.

## Layer status

| Layer | Responsibility | Implemented files | Syntax verified | Functional tests | Current status |
|---|---|---:|---|---|---|
| `memory/` | persistent and tiered agent memory | 0 | N/A | None in layer | **Empty.** `shared/memory/` is the tested foundation; promotion, four-tier routing, and durable persistence are open. |
| `security/` | policy and security controls | 2 | Yes, 2/2 | None direct | **Partial scaffold.** `BurstPolicyEngine.js` and `PolicyDSL.js` exist; Federation policy wiring and direct tests are open. |
| `registry/` | agent registration and discovery | 2 | Yes, 2/2 | None direct | **Partial scaffold.** `agent-registry.js` and `agent-plugins.js` exist; Federation-owned persistence and integration tests are open. |
| `runtime/` | workflow and background execution | 8 | Yes, 8/8 | None direct | **Partial scaffold.** Workflow utility modules exist; ADK/Gemini runtime, task execution proof, and runtime tests are open. |
| `gateway/` | routing, connectors, limits, and request policy | 11 | Yes, 11/11 | None direct | **Partial scaffold.** Gateway utilities exist; Federation integration and request-path tests are open. |
| `observability/` | events, audit, health, metrics, and approvals | 8 | Yes, 8/8 | None direct | **Partial scaffold.** Observability utilities exist; immutable integration, local event cache, and direct tests are open. |
| `modelarmor/` | prompt-injection and sensitive-data screening | 0 | N/A | None | **Empty.** Managed safety integration is open. |

## Available evidence outside `layers/`

| Evidence | What it verifies | What it does not verify |
|---|---|---|
| `npm run smoke` | `shared/memory/` ingest/recall/forget and shared fail-closed gate | It does not verify `layers/memory/`, which is empty. |
| `adapter/tests/*.test.ts` | adapter contracts, normalization, roundtrip, and CharacterKit protocol when dependencies are installed | It does not prove the layer copies or live external services. |
| `node --check` over `layers/**/*.js` | JavaScript syntax for all 31 currently implemented layer files | It does not prove runtime behavior, integration, persistence, or deployment. |

The adapter test command currently cannot run in this checkout because its
local `tsc` and `tsx` dependencies are not installed. Do not report those tests
as passing until the dependencies are installed and the command produces real
passing output.

## Layer ownership rules

- Put implementation in the narrowest function layer; do not create a second
  copy in `shared/`, `src/`, or another layer without an explicit ownership
  decision.
- Put layer-specific documentation beside the layer. Repository-wide product
  meaning belongs in `docs/`.
- A layer may consume an integration point, but it must document the interface
  and failure behavior rather than silently depending on an external repo path.
- Add direct tests when a layer gains behavior. Syntax verification is a gate,
  not a substitute for functional testing.
- Update this matrix whenever files, tests, or implementation status changes.
