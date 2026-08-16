# The Federation Adapter (`@the-federation/adapter`)

> A disposable translator between `@drdeeks/character-kit` and
> `@federation-watchtower/sdk`.
>
> It owns no policy.

The adapter is newly built interoperability infrastructure. It lets two
independent pre-existing systems exchange the narrow facts required for a
runtime bridge without either system depending on the other.

| System | Owns | Adapter relationship |
|---|---|---|
| `@drdeeks/character-kit` | habits, acknowledgements, commitments, command policy, fail-closed behavioral enforcement | upstream protocol client |
| `@federation-watchtower/sdk` | canonical identity, lifecycle, events, leases, guardrails, audit, operator/MCP surfaces | downstream transport |
| `@the-federation/adapter` | translation and transport normalization only | disposable boundary |

## Boundary

```text
CharacterKit activity
  → normalized adapter event
  → Watchtower event transport

Watchtower transport result
  → adapter-visible transport fact
```

The adapter does not decide whether an action is permitted, create or validate
leases, manage operators, own credentials, store memory, manage agents, or
rewrite canonical Watchtower records. Those responsibilities remain with
CharacterKit, Watchtower, or Federation's control/integration layer.

## Responsibilities

- speak the CharacterKit newline-delimited socket protocol;
- translate enforcement results and habit activity into normalized events;
- preserve event identity, correlation, sequence, and provenance;
- suppress duplicates and identify out-of-order delivery;
- provide bounded retry and fail-closed transport behavior;
- use the configured Watchtower SDK transport without duplicating Watchtower
  policy or records.

## Watchtower transport modes

The bridge supports two Watchtower event paths:

- canonical `FederationAgentClient` lifecycle/event requests with an
  `fw_agent_*` credential when the installed SDK exposes that surface;
- legacy producer-signed `WatchtowerClient` requests as the compatibility
  path.

The current Watchtower SDK package has owner, agent lease, and
operator SDK surfaces. Those are consumed by Federation's integration and
management layers, not added as adapter policy. The adapter only carries the
event/lifecycle translation contract described above.

## Configuration

Use [`adapter/.env.example`](.env.example) as the configuration template from
the repository root.

Required bridge identity and transport settings include:

- `CHARACTER_KIT_SOCKET`, optionally `CHARACTER_KIT_TOKEN`;
- `WATCHTOWER_GATEWAY`;
- `WATCHTOWER_INGESTION_SECRET` and `WATCHTOWER_PRODUCER` for signed
  compatibility transport;
- optional `WATCHTOWER_AGENT_TOKEN` for canonical agent lifecycle/event
  transport;
- `BRIDGE_PROJECT_ID` and `BRIDGE_AGENT_ID`;
- retry limits and backoff settings.

Keep all credentials server-side and out of source control, logs, and browser
bundles.

## Fail-closed transport behavior

The adapter never converts a delivery failure into a successful delivery. It
retains event identity for bounded retries, suppresses duplicates, preserves
out-of-order evidence, and reports transport failure to its caller. Permission
decisions remain CharacterKit/Watchtower responsibilities.

## Verification

```bash
npm install
npm run validate
npm test
```

The test suite uses protocol-accurate fakes and injected fetch functions. It
proves local contracts; it does not prove live Watchtower or CharacterKit
deployment behavior.

## Layout

```text
src/contracts.ts       normalized bridge vocabulary
src/config.ts          configuration validation
src/bridge/            CharacterKit and Watchtower protocol clients
src/normalization/     event mapping, dedupe, ordering
src/transport/         downstream transport boundary
src/state.ts           in-process delivery state
src/failure.ts         transport failure classification
src/adapter.ts         bridge orchestration
tests/                 hermetic contract tests
docs/                  adapter route and engineering records
```
