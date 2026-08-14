# canonical/ — Submission Workspace (self-contained)

The single source of truth for the hackathon submission. Stands alone: nothing
hardcoded, path-agnostic, no links to outside repos.

## Rules of this workspace

1. **No hardcoded paths.** Everything self-resolving (relative, env-driven).
2. **No links out.** This repo references no other repo by path. External systems
   (Character Kit, Watchtower, ADK) are integrated at submission time and
   DISCLOSED as pre-existing per hackathon rules (line 856).
3. **`layers/` is the Fleet map.** 7 subdirs named by FUNCTION (memory, security,
   registry, runtime, gateway, observability, modelarmor) — see `layers/README.md`.
4. **Deadweight stays out.** Unincorporated material goes to `deadweight/`
   (gitignored), never committed.
5. **Project name is chosen by the human, not generated.** (AI-chosen names
   collide; human-chosen names don't.)

## Layout

```
canonical/
├── docs/        hackathon-rules.html (authoritative), design notes
├── scripts/     build / deploy / verify helpers (empty until needed)
├── logs/        runtime logs (gitignored)
├── tests/       submission-level tests
├── .trash/      quarantined material (gitignored)
├── shared/      reusable, verified modules (memory/, enforcement/)
├── layers/      the 7 Fleet subsystems, by function
└── deadweight/  unincorporated salvage (gitignored)
```

## What's ported so far (verified)

- `shared/memory/` — salvaged 4-layer memory core (store/embedding/recall/forget/
  learning/ingestion), scrubbed of the old hardcoded vault path. Smoke-tested.
- `shared/enforcement/fail-closed-gate.js` — reusable gate that calls Character
  Kit and blocks on any error.

## Provenance / disclosure

The `shared/memory` and `shared/enforcement` modules are derived from prior
(non-submitted) work and are DISCLOSED as pre-existing per rules line 856.
Character Kit, Watchtower, and the 5 agent engines are external pre-existing
systems, likewise disclosed at submission.

## Verify

```
node --test shared/memory/smoke.test.mjs
```

<!-- APPENDED-UPDATES: 2026-08-12 — do not rewrite above; additions only -->

## Appended updates (2026-08-12)

The following were added after the initial scaffold. Above remains the original
orientation; this section records what changed so the doc stays true without
being rewritten.

### Added since scaffold
- `docs/FOREVER_DOCTRINE.yaml` — the constitution of this repo (POL-001 singular
  source of truth). Outranks all other docs here.
- `docs/DOCTRINE-BINDING.md` — declares the YAML as constitution; maps the 7
  policies onto this repo's layout; records the scope rule (only this dir
  touched; external = vendored copy; names human-chosen).
- `docs/FOREVER_DOCTRINE.sha256` — tamper-EVIDENT checksum of the constitution
  (POL-004 "say evident, mean evident"). Recompute after any edit to the YAML.
- `docs/session-export.md` — full session transcript (session `20260810_111345
  _002e80`) from isolation → doctrine binding → memory extraction → adapter
  vendoring. Faithful log; contains absolute paths from earlier turns by nature.
- `adapter/` — vendored copy of `character-kit-watchtower-bridge` (the translator
  between Character Kit and Watchtower). No `.git`, no `node_modules`. Brought in
  as an isolated copy per the scope rule; it is pre-existing, DISCLOSED.
- `shared/character-kit-watchtower-bridge.tar.gz` — archive of the adapter (37
  entries, integrity verified).

### Layout corrected (actual tree)
```
canonical/
├── docs/        FOREVER_DOCTRINE.yaml (constitution), DOCTRINE-BINDING.md,
│               FOREVER_DOCTRINE.sha256, hackathon-rules.html, session-export.md
├── adapter/     vendored character-kit-watchtower-bridge (no .git/node_modules)
├── scripts/     build / deploy / verify helpers (empty until needed)
├── logs/        runtime logs (gitignored)
├── tests/       submission-level tests
├── .trash/      quarantined material (gitignored)
├── shared/      memory/ enforcement/ character-kit-watchtower-bridge.tar.gz
├── layers/      the 7 Fleet subsystems, by function
└── deadweight/  unincorporated salvage (gitignored)
```

### Secrets location (doctrine line 871)
Key vaults go in `.secrets/` (gitignored), NOT committed `.env`. Both are
excluded in `.gitignore`.

### Verification still holds
```
node --test shared/memory/smoke.test.mjs   # 3/3 green
```
Zero hardcoded paths/network-IDs in our code + doctrine (the only `/home`
reference anywhere is inside the session log, expected).
