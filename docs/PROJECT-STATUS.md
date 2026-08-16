# Federation project status

**Status date:** 2026-08-16

This is the dated current-state record. It is separate from the user-facing
README and from the fresh architecture blueprint and checklist that will be
created later.

## Provenance and ownership

| System | Provenance | Canonical responsibility |
|---|---|---|
| Federation Watchtower | pre-existing | identity, registration, lifecycle, credentials, heartbeats, rooms, events, leases, guardrails, audit, MCP, signed webhooks |
| CharacterKit / ACK | pre-existing | habits, ACKs, commitments, command policy, fail-closed enforcement |
| Federation adapter | newly built | translation, normalization, ordering, retry, fail-closed delivery boundary |
| Federation foundation | newly built/building | memory, context, control, task/job management, UI, native projection, provider ports |

## Watchtower branch and SDK

The inspected sibling state is branch `fix/rooms-agents-migrations`, HEAD
`4c13601` (`feat(sdk): add operator client and canonical lease methods`). The
SDK currently exposes owner, agent, and operator clients; canonical agent
connect/heartbeat/event/disconnect/lease request/lease validation; typed
validation-gate, controlled-action, command acknowledgement, and webhook
contracts.

Watchtower MCP is a separate Streamable HTTP organization surface using
organization credentials and project-scoped read/control permissions. It is
not an agent bearer credential and must remain a separate Federation
integration path.

## Adapter evidence

Verified in the current adapter:

- real CharacterKit socket protocol client with auth and fail-closed errors;
- normalized event construction;
- deduplication and ordering protection;
- bounded retry classification;
- canonical `FederationAgentClient` lifecycle/event path when
  `WATCHTOWER_AGENT_TOKEN` is configured;
- legacy HMAC fallback when canonical agent credentials are absent;
- `npm run validate` passes;
- `npm test` passes with 32 tests.

Next adapter work:

- wire canonical lease request and validation;
- decide and wire validation gates, controlled actions, command polling, and
  command acknowledgement;
- use owner bootstrap instead of leaving `WATCHTOWER_OWNER_TOKEN` unused;
- represent operator/MCP access through explicit Federation integration ports;
- replace in-memory retry state with durable recoverable delivery when needed;
- populate adapter-visible lease and guardrail state;
- add live integration evidence against running Watchtower and CharacterKit.

The adapter route map needs revision because its older text predates the
current SDK lease and operator additions.

## Federation evidence

The repository contains the shared memory engine, Federation memory stores,
knowledge graph/corpus/vector retrieval, context routing, task/job management,
local server routes, UI management surfaces, and adapter-client scaffolding.
Local smoke/build/adapter gates have passed in the current working state.

The local Federation server still contains fixture/local fallback behavior in
its integration and observability paths. Canonical Watchtower SDK/MCP wiring is
required before live mirror or full fleet-management claims are made.

## Documentation work order

1. Reconcile the active authority and integration documents.
2. Rebuild and ratify a fresh immutable root blueprint.
3. Generate a fresh execution checklist from that blueprint; keep progress and
   deficiencies there, not in the README or blueprint.
4. Update Federation plugins and skills to the ratified contracts.
5. Update Watchtower-facing documentation and integrations after the
   Federation contract is stable.
