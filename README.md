# The Federation

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](ui/package.json)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](ui/package.json)
[![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)](package.json)
The parent platform and persistent digital civilization for humans and
autonomous agents.

This repository is the Federation foundation layer: the operator experience and
control plane surrounding `@federation-watchtower/sdk` (agent registry,
lifecycle, observability, webhooks, operator credentials, and MCP) and
`@drdeeks/character-kit` per agent (habits, ACKs, commitments, command policy,
and fail-closed enforcement). It includes `@the-federation/watchtower-adapter` as the
translator boundary and provides local agent management with terminal, memory,
tasks, logs, jobs, steering, and intervention controls.

## Product hierarchy

```text
The Federation
├── Federation-CreAgent       creation and onboarding
├── Federation-Marketplace    capabilities and exchange
├── Federation-Arcade         games and shared experiences
├── Federation-Brain-Sync     collaborative intelligence
└── future Federation-*       new districts and institutions
```

The Federation is the whole. Each future project contributes another part of
the same civilization and inherits Federation primitives and identity.

## Ownership boundaries

| Capability | Canonical Owner | This Repository's Role |
|---|---|---|
| Agent identity, registration, lifecycle, credentials (`fw_owner_*`, `fw_agent_*`, `fw_operator_*`) | **Federation Watchtower** | Mirror via `FederationOwnerClient`/`FederationAgentClient`; surface operator-facing identity/configuration |
| Heartbeat/watchdog, agent pause/resume/revoke, room/scene projection | **Federation Watchtower** | Mirror via SDK/MCP reads; surface fleet/agent state |
| Webhook delivery (alerts only, signed HMAC), operator credentials (`fw_operator_*`), per-org webhook config | **Federation Watchtower** | Configure via admin/operator routes; verify inbound `X-Watchtower-Signature` |
| Leases, validation gates, controlled-tool authorization, incident ledger | **Federation Watchtower (ProjectGuardrail)** | Opt-in integration via MCP org credential (`watchtower:lease` + `project:<id>:control`); leases are optional |
| Behavioral enforcement (habits, ACK, commitments, command policy, fail-closed gating) | **CharacterKit** | Configure per agent via adapter's `CharacterKitClient`; adapter transmits denials → Watchtower |
| Cognitive memory (four tiers), local agent management UI, task management, live terminal, steer/kill, logs, jobs | **This Repository** | Owns and operates; local steer/kill operate the local agent process only |
| Native immutable-action observability (local projection + Watchtower mirror) | **This Repository** | Mirrors Watchtower events; local fallback observability remains functional when Watchtower is unreachable |

## Current foundation

```text
Identity (Watchtower mirror) -> memory -> policy (CharacterKit) -> agent management -> local control
                                      |
                                      v
                              interoperable execution
```

The local Federation interface is the operator's home: agent cards, live
terminal/activity feeds, task state, memory management, policy and ACK
configuration, steering, pause/resume, kill, logs, job management, and fleet
visibility — with local observability fallback when Watchtower is unreachable.

External systems are integration points. They do not define The Federation.

## Memory systems

The repository intentionally contains two memory systems:

- `shared/memory/` — the reusable, storage-agnostic memory engine for storage,
  ingestion, embeddings, recall, forgetting, and learning.
- `src/memory/` — the Federation application memory subsystem for four independent cognitive tiers:
  working, episodic, semantic, and identity/persistent context; plus scope,
  indexing, retrieval policy, migrations, and context assembly.

The Federation subsystem consumes the shared engine. It is not an independent
duplicate implementation. See `docs/MEMORY-SYSTEM.md`.

## Repository map

```text
AGENTS.md                         repository operating rules
docs/FEDERATION-CONCEPT.md       product and civilization source of truth
docs/BUILD_SCOPE.md              current implementation scope
docs/INTEGRATION_MAP.md          dependency and route inventory
docs/MEMORY-SYSTEM.md      two-system memory boundary
docs/PROVENANCE.md               disclosure and attribution rules
shared/memory/                    reusable memory engine
shared/enforcement/              fail-closed enforcement adapter
@the-federation/watchtower-adapter (repo `federation-adapters`)    interoperability bridge (CharacterKit ⇄ Watchtower)
layers/                           foundation subsystem boundaries
src/server/                       Express + ws server (console API + live terminal)
src/observability/                Watchtower mirror + local fallback observability
src/control/                      CharacterKit control orchestration
src/memory/                       Federation application memory subsystem (four tiers)
src/context/                      task management
src/integrations/adapter-client.js  thin wrapper over the `@the-federation/watchtower-adapter` public API
```

## Verification

```bash
npm run smoke
# Adapter verification runs in its own repo `federation-adapters`:
#   npm run validate
#   npm test
```

Local verification covers repository behavior. Live Watchtower, CharacterKit,
MCP, webhook, cloud, and deployment behavior requires the corresponding
services and credentials.
