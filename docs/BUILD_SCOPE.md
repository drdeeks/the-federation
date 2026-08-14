# Build Scope — 18 Days Remaining (locked 2026-08-13)

Category: **Fortified Enterprise Fleet**. This is the priority order for the
Submission Period, agreed 2026-08-13. Supersedes the looser "what's built vs
planned" language in `DEVPOST_SUBMISSION_DRAFT.md` — that doc gets updated
to match this as work lands.

## Tier 1 — build for real (everything except Tier 2)

Everything below is in scope to actually build, not stub. Order reflects
dependency, not importance — GCP service and ADK/Gemini are bundled because
one deployment choice satisfies both mandatory-tech checklist items at once.

1. **ADK + Gemini runtime, deployed on Cloud Run.**
   `layers/runtime/` is currently empty — zero agent code exists anywhere in
   the repo yet. Running the ADK agent on Cloud Run closes two of the three
   mandatory-tech gaps in one piece of infrastructure: Gemini 3.5+ (via
   Vertex AI or Gemini API) + a Google Agent Framework (ADK) + a real GCP
   infra service (Cloud Run itself), rather than three separate integrations.
   **Locked: Cloud Run.**

2. **Model Armor** (`layers/modelarmor/` — the one subsystem with literally
   nothing built). Confirmed real: Google Cloud's managed REST API, screens
   prompts/responses for jailbreaks + prompt injection, integrates with
   Sensitive Data Protection for 150+ PII types, works with any model
   including Gemini. This directly satisfies the Fortified Enterprise
   Fleet's "Security & Governance" requirement — no synthetic/local
   substitute, use the real API.

3. **Memory Bank promotion + real tiering.** `shared/memory/` already has a
   working, smoke-tested 4-layer core (store/embedding/recall/forget/
   learning/ingestion). Promote it into `layers/memory/` and build the
   tiering logic that's been referenced but not implemented.

4. **Wire the three Watchtower-backed layers for real:**
   `layers/registry/` (Agent Registry), `layers/gateway/` (Agent Gateway),
   `layers/observability/` (Agent Observability) — direct calls against
   Watchtower's REST API per `COMPLETE_SPEC.md`'s endpoint catalog, same
   approach as the adapter. Watchtower itself stays disclosed prior work;
   this integration code is in-period.

5. **`layers/security/` splits into two real, distinct pieces** — they were
   getting conflated under one label and they're not the same thing:

   **5a. Agent Character** (Character Kit wiring). Behavioral
   enforcement — habit loop, acknowledgment capture, fail-closed gating.
   Character Kit's own README says outright: "No identity/soul/persona."
   It does not provide identity in any sense, rubric's or otherwise — it's
   the action/enforcement layer only. See Tier 2: the *live* Character Kit
   socket (adapter Phase 2) stays deferred; what's in scope is whatever
   enforcement plumbing doesn't require that live socket.

   **5b. Zero-trust access control** — the thing Google's rubric literally
   means by "Agent Identity" ("For zero-trust access control"). Checked
   2026-08-13: Watchtower already has a real foundation to extend, not a
   from-scratch build. `lifecycle.ts` issues per-owner (`fw_owner_*`) and
   per-agent (`fw_agent_*`) bearer credentials — 32 random bytes, stored
   only as SHA-256 hashes, scoped (`agent:connect`/`heartbeat`/`emit`/
   `disconnect`), individually revocable. A separate scoped-lease system
   (`project-guardrail.ts`) binds project+agent+leaseId to scopes with
   TTL before any consequential action. That's a legitimate zero-trust
   seed, but it is not the whole requirement — the actual scope here was
   **already directed by the owner earlier today and already documented**
   in `federation/AGENTS.md:176-206`, not newly discovered:

   > "Owner's explicit directive (2026-08-13): organizations must never
   > share the platform admin key. This is not optional polish — it's the
   > prerequisite for the next two items to work correctly, since neither
   > branding nor webhook attribution can be scoped to 'this org' without a
   > real, distinct identity for that org to hold."
   >
   > "Per-organization and per-agent designated webhook destinations.
   > Today's alert webhook is global and singular... Owner wants each
   > organization AND each individual agent to have its own webhook, so
   > notifications are correctly attributed to the actual recipient instead
   > of all funneling through one shared destination."

   So the real, complete requirement for this piece is:
   - **Per-organization operator credential**, distinct from
     `WATCHTOWER_ADMIN_TOKEN` (currently one shared secret for every admin
     action, including every org — `operator.html`'s `?project=<id>` lock
     only narrows the UI, it does not authenticate separately).
   - **Per-agent credential** — partially covered already by the
     `fw_agent_*` lifecycle tokens (`lifecycle.ts`), which is real progress,
     but those aren't yet surfaced as the org/agent-facing identity the
     webhook-attribution work depends on.
   - **Per-org AND per-agent webhook destinations**, replacing the current
     single global `WATCHTOWER_ALERT_WEBHOOK_URL` — blocked on the two
     credential items above, since attribution needs a real distinct
     identity to attribute to.
   - Also still real, lower priority: no credential rotation/self-revoke
     endpoint, bearer tokens are static secrets (no signing/mTLS), and a
     parallel unauthenticated path exists (`agent-registry.ts`'s open
     scene/room registration, plus the legacy shared-HMAC
     `WATCHTOWER_INGESTION_SECRET`) that must be excluded from the
     zero-trust story, not silently left in.

   In scope for the 18 days: build the real per-org operator credential,
   extend the existing per-agent lifecycle tokens to be the org/agent
   identity the webhook system attributes to, and wire per-org/per-agent
   webhook destinations on top. This satisfies both the owner's original
   directive and Google's rubric item with the same piece of work — they
   were never two separate asks.

6. **Agent-sending** — the ability to send your own agent into the fleet.
   Depends on #1 (runtime) and #4 (registry) both existing first.

## Tier 2 — explicitly deferred, not cut

Both deferred for the same reason: they're the visible/identity-facing
surface of **The Federation** brand as a whole, not just this hackathon
entry, and building them now — under deadline pressure, without a real
branding kit concept — risks locking in a look/feel for the whole umbrella
prematurely. Your words: "the character can suck it and UI... because that
also ties into the Federation repo and we need a branding kit concept."

- **Live Character Kit socket** (adapter Phase 2, `character-kit.ts`).
  Stays a fail-closed boundary stub, exactly as documented in the adapter's
  own `AGENTS.md` §8 and README. Disclosed honestly as not-yet-live, not
  hidden.
- **UI** — live terminal-feed, killswitch surface, `/steer` control surface.
  Not built until a Federation branding kit concept exists. This is a real
  open work item, not a "someday" — see
  [[project_the_federation_vision]] memory: branding kits were already
  named as a planned future Federation-prefixed component. That concept
  needs to exist, even minimally, before UI work starts.

## What this means for the submission

- The demo video can legitimately show: a real ADK/Gemini agent running on
  Cloud Run, real Model Armor screening, real Watchtower-backed
  registry/gateway/observability, real memory tiering, real agent-sending.
- It will NOT show: a polished UI, a live Character Kit connection. Both
  get disclosed as scaffolded/deferred in the submission text, same honesty
  standard as the rest of the draft — no overclaiming.
- Judges' "backend actually running on Google Cloud" requirement is
  satisfied structurally by #1 (Cloud Run) and #2 (Model Armor), not just
  documentation.

## Next steps

1. Set up the GCP project + enable Vertex AI / Model Armor / Cloud Run APIs.
2. Scaffold `layers/runtime/` — first real ADK agent, deployed on Cloud Run.
3. Then Model Armor, then memory promotion, then the three Watchtower layers,
   then agent-sending.
