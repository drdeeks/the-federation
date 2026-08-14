# Devpost Draft Submission — All Things Agentic Hackathon

Purpose: get a draft submission open on Devpost so the project is
registered and the $150 Google Cloud credit form (Resources tab) unlocks.
Per the Official Rules §7 ("Draft Submissions"), you can save and keep
editing this on Devpost right up until the real Submission Period ends —
nothing here is final. Everything below is honest about what's actually
built vs. planned; tighten the "what it does" language as more gets built.

---

## Category

**The Fortified Enterprise Fleet.**

Confirmed against the Official Rules' own category description: *"Build a
scalable network of institutional agents that hook into official enterprise
infrastructure... agents are cataloged for cross-department use... safely
maintain context across weeks of asynchronous operations... interact with
production data without violating enterprise compliance, data sovereignty,
or security policies."* That's this project's actual shape, not a stretch
fit — `layers/` in this repo is already structured around the category's
own required 7 subsystems:

| Fleet requirement (Google's rubric term) | This project's answer |
|---|---|
| Discovery & Lifecycle — Agent Registry | `layers/registry/` (Watchtower — external, disclosed) |
| Core Execution & State — Agent Runtime | `layers/runtime/` (ADK + Gemini on Cloud Run) |
| Core Execution & State — Memory Bank | `layers/memory/` (salvaged 4-layer memory core, ported + smoke-tested) |
| Security & Governance — Agent Identity* | `layers/security/` (Character Kit — external, disclosed) |
| Security & Governance — Agent Gateway | `layers/gateway/` (Watchtower guardrails — external, disclosed) |
| Security & Governance — Model Armor | `layers/modelarmor/` — **the one real gap, not built yet** (Google Cloud's managed prompt-injection/jailbreak/PII API) |
| Telemetry — Agent Observability | `layers/observability/` (Watchtower audit chain — external, disclosed) |

*"Agent Identity" is Google's rubric label, kept here verbatim since it's the
literal term judges grade against. Internally this project calls it **Agent
Character** — Character Kit is behavioral enforcement, not identity/auth,
and the name is right there in the product.

## Project name

**Not filled in — pick your own.** (Project naming is explicitly the
human's call in this project's own doctrine, not something to auto-generate.)
Given the branding direction already in motion ("The Federation" as the
umbrella, `Federation-<name>` for each component — see project memory), a
name in that shape would be consistent, but the actual word is yours.

## Tagline / elevator pitch

*(Devpost taglines are typically capped around 120 characters — trim to fit.)*

> The canonical home Federation Watchtower answers to: enterprise agent
> identity, registry, and observability, unified — not another dashboard.

## Overview (what it does)

This project is the canonical operational parent for **The Federation** — a
branded ecosystem of agent-infrastructure products. **Federation Watchtower**
(a separate, already-live product) is the simple, broad-audience monitoring
layer — "the daycare." This project is the deeper layer Watchtower and every
future Federation component ultimately answers to: real per-agent identity
and behavioral enforcement (via Character Kit), a live terminal feed of what
an agent is actually doing, direct control over an agent's loops and
heartbeat, and a kill switch / steer channel for a human to intervene
mid-task — not abstractions Watchtower deliberately hides from its simpler
audience.

**This is the actual hackathon build, not a wrapper around pre-existing
work.** The integration layer, the live terminal-feed UI, the kill switch,
the ability to send your own agents in, and memory tiering are all being
built during the Submission Period as this project's real substance.
Character Kit specifically has no platform of its own to run on today —
this project is what gives it one. Concretely:

- **Character Kit** — pre-existing, published npm package
  (`@drdeeks/character-kit`), disclosed as prior work. Local behavioral
  enforcement (habit loop, acknowledgment capture, fail-closed gating). It
  has no UI, no live view, no kill switch, no federation surface of its
  own — this project builds all of that around it, in-period.
- **Federation Watchtower** — pre-existing, already-deployed product
  (Cloudflare Worker + widget + SDK), disclosed as prior work. This project
  integrates against it **directly via its REST API** (see
  `docs/review/COMPLETE_SPEC.md` in the `federation-watchtower` repo for the
  full endpoint catalog) — there is no separate pre-built "adapter package"
  being reused here. Whatever translation/bridge logic exists between
  Character Kit and Watchtower is being written as part of this submission,
  not disclosed as something finished beforehand.

## What's actually built vs. planned (be honest here — draft, not final)

**Real and verified so far (early-period work):**
- `shared/memory/` — 4-layer memory core (store/embedding/recall/forget/
  learning/ingestion), scrubbed of a hardcoded path inherited from an
  earlier prototype, smoke-tested (3/3). Memory *tiering* on top of this
  is active in-period work, not finished yet.
- `shared/enforcement/fail-closed-gate.js` — calls into Character Kit,
  blocks on any error, no permissive fallback.
- Early integration-layer scaffolding (contracts, event normalization,
  dedupe/ordering, fail-closed classification): 12/12 unit tests pass,
  `tsc --noEmit` clean. This is groundwork for the real in-period build,
  not a finished, disclosed-as-prior-work component.

**Actively being built during the Submission Period (the real substance
of this submission):**
- The live integration between Character Kit and Watchtower's REST API —
  no separate pre-built bridge package is being reused; this is written
  directly against Watchtower's documented endpoints.
- The local UI: a live feed of terminal actions, input/output, in real time.
- The kill switch — immediate hard stop, mapped onto Character Kit's
  existing fail-closed PreToolUse gate.
- `/steer`-equivalent control and the ability to send your own agents in
  through this platform.
- Wiring the 7 `layers/*` Fleet-subsystem directories to their real backing
  systems (promoting `shared/memory` into `layers/memory`, etc.).
- `layers/modelarmor/` — still fully unbuilt, the one true gap in the
  7-subsystem requirement, needs a real managed API integrated in-period.
- The ADK/Gemini agent layer itself.

## Required disclosure (Official Rules — "New Projects Only")

Per the rules: *"Participants may use standard development tools... but
must disclose any other pre-existing code or work incorporated into the
Project."* This project discloses two pre-existing **platforms** it
integrates against — not the integration work itself, which is new:

- **Federation Watchtower** — pre-existing, already deployed
  (`federation-serverless` Cloudflare Worker + `federation-tv-widget` +
  `@federation-watchtower/sdk`), disclosed as prior infrastructure. This
  project consumes its REST API directly, in-period.
- **Agent Character Kit** (`@drdeeks/character-kit`) — pre-existing,
  published npm package, disclosed as prior infrastructure. It has no
  platform of its own; this project builds one around it, in-period.
- Everything else — the integration/bridge logic between the two, the
  live terminal-feed UI, the kill switch, agent-sending, memory tiering,
  the 7-subsystem Fleet wiring, and the ADK/Gemini agent layer — is new
  work built during the Submission Period. That's the actual substance of
  this submission, not a disclosure item.

## Mandatory tech checklist (per Official Rules §6)

- [ ] Gemini 3.5+ via Gemini API or Vertex AI — not wired yet
- [ ] At least one Google Agent Framework (ADK / GenAI SDK / Antigravity
      SDK / GenKit) — not wired yet; ADK is the natural fit given
      `layers/runtime/` already names it
- [x] At least one Google Cloud infrastructure service — Federation
      Watchtower already runs on Cloudflare, not GCP; **this needs a real
      GCP service in the mix** (Cloud Run, Firestore, Pub/Sub, etc.) to
      satisfy the requirement — flag this early, it's a real gap to close,
      not just documentation

## Submission checklist (Official Rules §6, full requirements)

- [ ] Select category: **Fortified Enterprise Fleet**
- [ ] Hosted project URL (strongly encouraged, not just optional)
- [ ] Text description: features/functionality, tech used, data sources,
      findings/learnings — this document is the seed for that
- [ ] Public or private code repo URL (GitHub/GitLab/Bitbucket) + a
      **Spin-up Instructions** section in that repo's own README —
      step-by-step local/cloud setup, required even if judges don't run it
- [ ] Architecture diagram — visual, showing Gemini ⇄ backend ⇄ database ⇄
      frontend
- [ ] Demo video, ≤4 minutes, must show the backend actually running on
      Google Cloud (Cloud Console / Cloud Run dashboard / Vertex AI logs /
      a `.run` URL — something visibly GCP), uploaded publicly to
      YouTube or Vimeo
- [ ] Optional (score boost): a public blog/podcast/video about the build
      process, a social post tagged `#AllThingsAgentic Hackathon`, and/or
      real integration of another Google AI model (Gemma/Veo/Lyria)

## Credits step (why you're opening this draft)

Per the hackathon overview: sign up for the no-cost Google Cloud trial,
then claim **$150 in Google Cloud credits** via the credit form on the
Devpost **Resources tab**. Opening this draft submission is what makes
that tab/form available — the draft itself doesn't need to be complete to
serve that purpose, and can keep changing right up until the real
Submission Period ends.
