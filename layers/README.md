# layers/ — the 7 Fleet subsystems, named by FUNCTION

The Fortified Enterprise Fleet category requires 7 subsystems. Here they live as
directories named by what they SERVE (not by cute project titles), so the mapping
to the rules is unambiguous and the code stays self-describing.

| Dir | Fleet subsystem | What belongs here | Source / status |
|-----|-----------------|-------------------|-----------------|
| `layers/memory/` | Memory Bank | Persistent, secure cross-session context. → port `shared/memory` here when wired to Fleet. | from `shared/memory` (salvaged) |
| `layers/security/` | Agent Identity | Zero-trust access control, fail-closed enforcement. | Character Kit / AIK (external, disclosed) |
| `layers/registry/` | Agent Registry | Publish/version/discover agents. | Watchtower (external, disclosed) |
| `layers/runtime/` | Agent Runtime | Long-running async background execution. | ADK agents (external) |
| `layers/gateway/` | Agent Gateway | Unified routing + policy enforcement. | Watchtower guardrails (external, disclosed) |
| `layers/observability/` | Agent Observability | OpenTelemetry-compliant audit + reasoning traces. | Watchtower audit chain (external, disclosed) |
| `layers/modelarmor/` | Model Armor | Prompt-injection + PII screening on ingress/egress. | **GAP** — managed API, build in-period |

"External" = not authored in this repo; integrated at submission time and
DISCLOSED as pre-existing per hackathon rules (line 856). "Salvaged" = ported
from the prior Qwen-cloud work, scrubbed of hardcoded paths.

Nothing in this repo hardcodes paths or links to outside repos. Self-resolving.

<!-- APPENDED-UPDATES: 2026-08-12 — additions only, do not rewrite above -->

## Appended notes (2026-08-12)

- `layers/memory/` is the intended Fleet wiring target for the salvaged
  `shared/memory/` core. The core is verified/tested in `shared/`; promoting it
  into the `layers/memory/` layer happens at submission build time (wire to
  Firestore-backed store + ADK runtime).
- `adapter/` (vendored `character-kit-watchtower-bridge`) is the bridge that
  connects two layers here: `layers/security/` (Character Kit / Agent Identity,
  fail-closed) and `layers/observability/` (Watchtower audit chain). It owns no
  policy of its own — it is the only cross-system translator, per its own
  AGENTS.md. Disclosed as pre-existing.
- `layers/modelarmor/` remains the single GAP: a managed API call (prompt-injection
  + PII screening) built during the Submission Period. Not yet present.
