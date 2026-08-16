# The Federation — Integration Map

This is the factual dependency and ownership inventory. Product meaning lives
in `FEDERATION-CONCEPT.md`; current evidence lives in `PROJECT-STATUS.md`.

## Federation-owned foundation

| Area | Federation responsibility | Current location |
|---|---|---|
| Identity context | persistent context surrounding canonical agent identity | Federation foundation and Watchtower integration ports |
| Cognitive memory | working, episodic, persistent, and identity tiers | `src/memory/` over `shared/memory/` |
| Knowledge memory | corpus, graph, vectors, semantic retrieval | `src/knowledge/` |
| Context | provenance-aware composition across independent memory systems | `src/context/` |
| Policy and control | Federation management surface around CharacterKit and Watchtower controls | `src/control/`, `src/server/`, UI |
| Tasks and jobs | task lifecycle, assignment, scheduling, retry policy | `src/context/` |
| Native observability | Federation projection with local fallback | `src/observability/`, `src/server/`, UI |
| Presentation | operator console, agent management, memory, terminal, logs | `ui/` and `src/server/` |

## Pre-existing integration points

### `@federation-watchtower/sdk` / Federation Watchtower

Watchtower is the canonical external operational plane. It owns agent
registration and identity credentials, lifecycle, heartbeats, watchdogs,
rooms/scenes, leases, validation gates, controlled-tool authorization,
incidents, immutable event/audit records, operator credentials, signed alert
webhooks, and organization MCP access.

The current inspected branch is `fix/rooms-agents-migrations`, observed at
HEAD `4c13601`. Its SDK includes:

- `FederationOwnerClient` for owner creation and agent registration;
- `FederationAgentClient` for lifecycle, events, lease request, and lease
  validation using `fw_agent_*` credentials;
- `FederationOperatorClient` for organization-scoped operator actions and
  webhook configuration using `fw_operator_*` credentials;
- legacy `WatchtowerClient` for producer-signed HMAC routes.

Watchtower MCP is a separate Streamable HTTP surface at `/mcp`. It uses an
organization credential with project-scoped read/control permissions. MCP is
not agent identity and is not interchangeable with `fw_agent_*` credentials.

### `@drdeeks/character-kit`

`@drdeeks/character-kit` owns habits, acknowledgments, commitments, command policy, and
local fail-closed enforcement. Federation owns the surrounding identity,
memory, management, and presentation experience.

## Adapter boundary

`@the-federation/adapter` is newly built and disposable. It is a translator, not a policy
engine:

```text
CharacterKit wire activity
  → normalized event / delivery contract
  → Watchtower transport

Watchtower transport result
  → adapter-visible transport fact
```

The adapter owns no policy, identity, memory, lease decision, operator
management, canonical event history, or UI. It performs CharacterKit protocol
access, normalization, dedupe/order protection, bounded retry, and fail-closed
transport behavior.

## Credential boundary

| Credential | Owner | Use |
|---|---|---|
| `fw_owner_*` | Watchtower | owner-scoped onboarding and agent registration |
| `fw_agent_*` | Watchtower | canonical per-agent lifecycle, events, and agent operations |
| `fw_operator_*` | Watchtower | organization-scoped operator configuration |
| MCP organization credential | Watchtower | organization/project-scoped MCP reads and controls |
| producer HMAC secret | Watchtower integration | legacy signed ingestion/control compatibility |
| CharacterKit token | CharacterKit | authenticated local enforcement socket |

Federation must keep these credentials server-side, scoped, attributable, and
separate. The adapter may transport the credentials required by its narrow
bridge contract but does not own their lifecycle.

## Truth boundary

```text
Watchtower canonical event truth
  → adapter translation
  → Federation local projection and context
  → Federation-native UI
```

Federation may enrich presentation and context but cannot rewrite the source
event's identity, provenance, timestamp, status, or audit reference.
