# Adapter and Watchtower route boundary

This document records what the adapter translates and what belongs outside
the adapter. It is not a catalog of every Watchtower route.

## Current Watchtower SDK reference

The inspected sibling branch is `fix/rooms-agents-migrations`, observed at
HEAD `4c13601`. Its current SDK includes:

- `FederationOwnerClient` for owner creation and agent registration;
- `FederationAgentClient` for canonical agent lifecycle, events, lease request,
  and lease validation;
- `FederationOperatorClient` for organization-scoped operator actions;
- legacy `WatchtowerClient` for producer-signed event/control routes.

MCP is a separate organization-scoped Streamable HTTP surface. It is not an
adapter route and is not interchangeable with an `fw_agent_*` credential.

## Adapter-wired routes

| Watchtower route family | Adapter behavior | Ownership |
|---|---|---|
| agent connect | relays lifecycle start through canonical agent client when configured | Watchtower canonical lifecycle |
| agent heartbeat | translates bridge heartbeat to configured Watchtower client | Watchtower heartbeat |
| agent events | translates normalized CharacterKit activity into Watchtower events | Watchtower event record |
| agent disconnect | relays lifecycle stop through canonical agent client when configured | Watchtower canonical lifecycle |
| legacy signed events | compatibility transport when canonical agent client is absent | Watchtower ingestion |

The adapter tests verify the canonical and legacy event/lifecycle selection
with injected fetch functions. No live Watchtower request is made by those
tests.

## Explicitly outside the adapter

These surfaces exist in Watchtower and its current SDK, but they are not
adapter policy or adapter-owned control paths:

| Surface | Correct owner/consumer |
|---|---|
| owner creation and agent registration | Federation onboarding/integration layer using Watchtower owner client |
| lease request and lease validation | Federation control/integration layer using Watchtower agent client or MCP |
| validation gates and controlled actions | Federation/Watchtower control plane |
| command polling and acknowledgement | Federation management/control plane |
| operator credentials and webhook configuration | Federation operator integration using Watchtower operator client |
| MCP organization credentials and tools | Federation operator/integration layer |

The adapter may carry a result as a normalized transport fact when a future
bridge contract requires it. It must not decide, authorize, validate, manage,
or persist any of these concerns.

## Credential boundary

The adapter receives only the credentials needed for its configured transport.
Credential creation, rotation, scope, revocation, and audit remain with
Watchtower and the Federation integration layer. The adapter must never turn a
producer secret into a general-purpose operator or agent credential.

## Maintenance rule

Update this document when `adapter/src/bridge/watchtower.ts`, the adapter
contract, or the Watchtower SDK integration changes. Update
`docs/PROJECT-STATUS.md` for repository-wide implementation facts.
