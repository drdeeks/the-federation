# DOCTRINE BINDING — canonical/

This document BINDS `canonical/` to its constitution. It is not a second source
of truth; it points at the one. Per POL-001 (singular source of truth), the
authoritative policy is `docs/FOREVER_DOCTRINE.yaml`. This file only declares
that this repo obeys it and where each policy is realized here.

## Constitution

- `docs/FOREVER_DOCTRINE.yaml` — the ONE constitution. Outranks all. Any conflict
  between this README, any code, or the doctrine → the doctrine wins.

## Policy → layout map (this repo)

| Policy | Realized in `canonical/` |
|--------|---------------------------|
| POL-001 singular_source_of_truth | One module per concern in `shared/`; `layers/` are consumers, not re-implementations; this file points to the YAML, never duplicates it. |
| POL-002 self_resolving_context | No hardcoded paths anywhere; context resolves override→default→fallback. Verified: zero `/home`/user paths in repo. |
| POL-003 layered_never_rewritten | `layers/` = additive layers by function; `deadweight/` = archive-not-destroy (this repo's `.archive/`); no in-place mutation of shared truth. |
| POL-004 fail_closed_tamper_evident | `shared/enforcement/fail-closed-gate.js` blocks on any error; `docs/FOREVER_DOCTRINE.sha256` makes core-truth changes VISIBLE (tamper-EVIDENT, not proof). |
| POL-005 context_agnostic_real_modularity | Modules are independently removable; external systems (Character Kit, Watchtower, ADK) are disclosed integrations, not vendored truths. |
| POL-006 affirmatively_reminded_character | The doctrine's 3-7 positive foundations are re-asserted at each decision point, not just logged. |
| POL-007 verifiable_without_inspection | `node --test shared/memory/smoke.test.mjs` is the green-light signal. Passing = truth; no manual verification step. |

## Verification signal (POL-007)

```
node --test shared/memory/smoke.test.mjs   # 3/3 = green = this repo is sound
```

## Tamper-evidence (POL-004)

`docs/FOREVER_DOCTRINE.sha256` is the checksum of the constitution. Any edit to
the doctrine changes the checksum — visible, not hidden. We claim EVIDENT, never
PROOF.

## Scope rule (human directive, binding)

This repo is the ONLY directory touched for this endeavor. Anything needed from
elsewhere is COPIED in as an isolated, vendored copy — never linked, never
referenced by external path. Project names are chosen by the human, not generated.
