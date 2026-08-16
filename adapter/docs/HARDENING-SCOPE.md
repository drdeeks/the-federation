Watchtower ACK Adapter: Verification, Correction & Durable Delivery Directive

Status: Pre-deployment engineering directive
Scope: watchtower-ack-adapter
Objective: Correct the verified ordering defect, preserve the existing architecture, implement durable store-and-forward delivery for Watchtower outages, and establish the exact verification gates required before the adapter can be considered runtime-proven.

⸻

1. Governing Rule

DO NOT redesign the adapter.

The existing architecture is substantially correct and must be preserved unless a change is demonstrably required to:

1. Correct a verified correctness defect.
2. Preserve an explicit contract or invariant.
3. Close a documented verification gap.
4. Resolve an actual integration failure discovered through testing.
5. Implement the durable Watchtower delivery requirement defined in this directive.
6. Remove an objectively incorrect implementation assumption.

Do not introduce speculative abstractions, generalized frameworks, unnecessary refactors, replacement protocols, duplicate state models, or unrelated improvements.

The goal is:

Verify → correct → regression-test → integrate → persist → recover → observe → enhance only where evidence requires it.

Do not convert documented limitations into fake capabilities merely to make the project appear more complete.

⸻

2. Current Assessment

The adapter is substantially built and has a strong existing architecture.

Area	Current Assessment
Architecture / separation	🟢 Strong
Contract definition	🟢 Strong
Character Kit integration	🟢 Strong, protocol-tested
Watchtower integration	🟡 Substantial, not live-proven
Canonical fw_agent_* authentication	🟢 Implemented for covered routes
Fail-closed design	🟢 Strong intent + tests
Retry/delivery	🟡 Functional but currently non-durable
Event deduplication	🟢 Good in-process implementation
Ordering	🔴 One verified correctness defect
Durable event queue	🔴 Required enhancement
Production readiness	🟡 Correctly not production-ready
Documentation honesty	🟢 Strong
Live integration proof	🔴 Not completed

The adapter should not be rebuilt.

The immediate work is targeted correction plus completion of the missing runtime durability and integration guarantees.

⸻

3. P0: Correct Ordering State Advancement

Defect

The ordering implementation currently contains logic equivalent to:

// stale or ahead-of-expected: do NOT advance state.
if (event.sequence > last) {
  this.lastSeq.set(k, event.sequence);
}
return "out_of_order";

Those statements contradict each other.

The comment says the state must not advance, while the implementation explicitly advances it.

Failure scenario

Given:

lastSeq = 1

and event:

sequence = 5

the current implementation can produce:

sequence 5
    ↓
out_of_order
    ↓
lastSeq becomes 5

The subsequent valid events:

sequence 2
sequence 3
sequence 4

can then all be rejected as stale.

That permanently skips the missing sequence range.

⸻

4. Required Ordering Invariant

Only the immediately next sequence may advance ordering state.

The required rule is:

event.sequence === lastSeq + 1
    ↓
accept
    ↓
advance lastSeq

Everything else must leave lastSeq unchanged.

Required implementation shape

if (event.sequence === last + 1) {
  this.lastSeq.set(k, event.sequence);
  return "ok";
}
return "out_of_order";

Do not advance state for:

sequence < last + 1
sequence > last + 1

This applies to both stale and future/ahead-of-expected events.

⸻

5. Formal Ordering Contract

Treat this as a permanent adapter invariant.

VALID:
sequence = lastSeq + 1
    → accepted
    → state advances
STALE:
sequence <= lastSeq
    → rejected/audited
    → state unchanged
FUTURE:
sequence > lastSeq + 1
    → rejected/audited
    → state unchanged

The implementation must never use a future sequence as a new ordering baseline.

⸻

6. P1: Mandatory Ordering Regression Test

Add a regression test specifically designed to catch the defect.

The test MUST execute:

initial state
    ↓
sequence 1
    ↓
OK
    ↓
sequence 5
    ↓
OUT_OF_ORDER
    ↓
state remains 1
    ↓
sequence 2
    ↓
OK
    ↓
sequence 3
    ↓
OK
    ↓
sequence 4
    ↓
OK
    ↓
state becomes 4

The test must verify both:

1. The classification returned for each event.
2. The internal ordering state after the future event.

Do not write a test that only verifies:

5 → out_of_order

The critical assertion is:

5 → out_of_order
AND
lastSeq remains 1

That is what catches the actual defect.

⸻

7. Preserve Character Kit Integration Boundary

The existing Character Kit integration boundary is architecturally correct.

Preserve:

Character Kit
    │
    │ native protocol
    ▼
character-kit.ts
    │
    ▼
EnforcementResult
    │
    ▼
normalization
    │
    ▼
NormalizedEvent

The native Character Kit response:

{
  denied: boolean,
  reason?,
  reflection?,
  manifest?,
  self_verify_defects?,
  commit_intent?
}

must remain isolated to the Character Kit bridge.

The rest of the adapter should consume the normalized contract:

EnforcementResult {
  decision: "allowed" | "blocked"
  ...
}

Do not spread Character Kit’s native wire protocol through the rest of the adapter.

⸻

8. Preserve Watchtower Authentication Separation

Do not collapse the existing authentication mechanisms into one generic credential model until the real Watchtower deployment proves that the routes are equivalent.

Current architecture:

                    Watchtower Adapter
                           │
             ┌─────────────┴─────────────┐
             │                           │
       Canonical auth              Legacy auth
       fw_agent_*                  HMAC
             │                           │
             ▼                           ▼
 FederationAgentClient            WatchtowerClient

Current route distinction must remain explicit.

Canonical routes

connect
heartbeat
events
disconnect

Legacy routes

lease validation
tool authorization
validation gates
commands

Do not claim that legacy authentication has been eliminated while those routes still require it.

⸻

9. Verify Canonical Credential Configuration

Investigate the current resolveConfig() behavior requiring:

watchtowerIngestionSecret

even when:

watchtowerAgentToken

is configured.

The following configuration may currently still fail:

WATCHTOWER_AGENT_TOKEN=fw_agent_...
WATCHTOWER_GATEWAY=...
BRIDGE_PROJECT_ID=...
BRIDGE_AGENT_ID=...

because:

WATCHTOWER_INGESTION_SECRET

remains mandatory.

Do not remove the requirement immediately.

First determine which deployed Watchtower routes genuinely require the legacy secret.

Decision rule:

Does a covered runtime route still require legacy HMAC?
        │
       YES
        │
        ├── Preserve legacy secret requirement
        └── Document exactly which routes require it
       NO
        │
        └── Remove unnecessary coupling
            and add canonical-only configuration tests

Deployment evidence must drive this change.

⸻

10. P1: Implement Durable Watchtower Store-and-Forward Queue

The current adapter has bounded retry, but retry alone is insufficient.

The adapter MUST implement a durable delivery queue.

The requirement is:

Once an event has been accepted for Watchtower delivery, it must remain recoverable until Watchtower acknowledges successful delivery.

The queue must therefore survive:

Watchtower outage
network failure
adapter restart
process crash
temporary authentication/transport failure

The adapter must not lose events merely because Watchtower is temporarily unavailable.

⸻

11. Retry vs Queue

These are separate mechanisms and must remain conceptually distinct.

Retry

attempt delivery
    ↓
failure
    ↓
wait
    ↓
attempt again

Durable queue

event received
    ↓
persist event
    ↓
attempt delivery
    ↓
failure
    ↓
event remains persisted
    ↓
Watchtower recovery
    ↓
replay event

Retry determines:

When should I try again?

The queue determines:

Does the event still exist to be tried again?

Both are required.

Do not describe the existing in-memory retry mechanism as a durable queue.

⸻

12. Updated Adapter Architecture

The completed architecture should be:

                         CHARACTER KIT
                              │
                              ▼
                     Character Kit Bridge
                              │
                              ▼
                      EnforcementResult
                              │
                              ▼
                         Normalizer
                              │
                              ▼
                       NormalizedEvent
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
                 Deduper             Ordering
                    │                   │
                    └─────────┬─────────┘
                              ▼
                 Durable Delivery Queue
                              │
                    ┌─────────┴─────────┐
                    │                   │
               Watchtower UP       Watchtower DOWN
                    │                   │
                    ▼                   ▼
                 Deliver             Persist
                    │                   │
                    ▼                   ▼
                   ACK               Retry later
                    │                   │
                    └─────────┬─────────┘
                              │
                              ▼
                    Watchtower RESTORED
                              │
                              ▼
                         Queue Drain
                              │
                              ▼
                    Ordered Delivery + ACK
                              │
                              ▼
                         Queue Empty

The queue is a transport/delivery boundary.

Do not place queue logic inside:

* Character Kit protocol handling.
* Character Kit normalization.
* Character Kit authentication.
* Ordering implementation.
* Watchtower authentication implementation.

⸻

13. Queue Persistence Contract

Once an event has passed adapter validation, deduplication, and ordering requirements, it MUST be persisted into the durable delivery queue before it is considered safely queued.

The queue record must retain enough information to reconstruct the Watchtower delivery.

Recommended conceptual structure:

interface QueuedEvent {
  id: string;
  sequence: number;
  event: NormalizedEvent;
  status:
    | "pending"
    | "delivering"
    | "failed";
  attempts: number;
  createdAt: string;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  lastError?: string;
}

The exact storage schema may differ.

The required information does not.

The queue must be able to determine:

1. What event this is.
2. What sequence it belongs to.
3. What payload must be transmitted.
4. Whether it has been delivered.
5. How many attempts have occurred.
6. When the next attempt should occur.
7. Why the last attempt failed.
8. Whether the event remains pending after process restart.

⸻

14. Durable Queue Requirement

A process-memory-only structure is insufficient.

This is not durable:

const queue: QueuedEvent[] = [];

The queue must persist to storage appropriate for the deployment environment.

Required invariant:

Watchtower DOWN
    ↓
event 1 persisted
event 2 persisted
event 3 persisted
    ↓
adapter crashes
    ↓
adapter restarts
    ↓
event 1 exists
event 2 exists
event 3 exists
    ↓
Watchtower restored
    ↓
events are delivered

If the implementation cannot demonstrate this behavior, it must not claim durable queue semantics.

⸻

15. Queue Placement Relative to Ordering

Ordering and queueing are separate responsibilities.

Ordering answers:

Is this event valid relative to the adapter’s current sequence?

Queueing answers:

Has this accepted event actually been acknowledged by Watchtower?

An event must not advance ordering state merely because it was queued.

Likewise, an event must not be removed from the queue merely because ordering accepted it.

Example:

sequence 10
    ↓
ordering accepts
    ↓
queue persists event 10
    ↓
Watchtower unavailable
    ↓
event 10 remains queued

Local acceptance and remote delivery are separate states.

⸻

16. Queue State Machine

Use explicit delivery states.

Minimum required state model:

PENDING
   ↓
DELIVERING
   ↓
ACKNOWLEDGED
   ↓
REMOVED

Failure path:

PENDING
   ↓
DELIVERING
   ↓
FAILED
   ↓
PENDING

A process crash while an event is marked:

DELIVERING

must not permanently strand that event.

On startup, any event that was DELIVERING without a durable successful acknowledgement must return to:

PENDING

and become eligible for delivery.

⸻

17. Queue Removal Requires Watchtower Acknowledgement

An event MUST NOT be removed merely because the adapter attempted transmission.

Required:

queued
  ↓
delivery attempt
  ↓
Watchtower response
  ↓
successful acknowledgement
  ↓
remove event

Failure:

queued
  ↓
delivery attempt
  ↓
timeout / connection failure / rejected request
  ↓
event remains queued

This prevents loss between transmission and acknowledgement.

⸻

18. Queue Drain

When Watchtower becomes available again, the adapter MUST automatically drain pending events.

The default drain behavior MUST preserve sequence order.

For:

101
102
103
104
105

the default behavior is:

101 → ACK
102 → ACK
103 → ACK
104 → ACK
105 → ACK

Do not arbitrarily parallelize queue delivery if doing so can violate Watchtower state ordering.

Parallel delivery may only be introduced if the Watchtower contract explicitly guarantees that it is safe.

⸻

19. Queue Drain Failure Safety

If:

101 → ACK
102 → ACK
103 → FAILURE
104 → pending
105 → pending

then the queue must become:

103
104
105

Events 101 and 102 must remain removed.

Event 103 must remain persisted.

Events 104 and 105 must remain persisted.

The adapter must retry according to its backoff policy.

A failure on one event must never cause the adapter to silently discard the remaining queue.

⸻

20. Stable Event Identity

Durable replay creates the possibility of duplicate transmission.

Every event therefore needs a stable identity.

The same event ID must survive:

initial delivery
retry
queue replay
adapter restart
Watchtower recovery

Example:

event-abc123
    ↓
attempt 1
    ↓
failure
    ↓
attempt 2
    ↓
failure
    ↓
adapter restart
    ↓
attempt 3
    ↓
success

Do not generate:

event-abc123
event-def456
event-ghi789

for repeated delivery of the same logical event.

⸻

21. Exactly-Once vs At-Least-Once

Do NOT claim exactly-once delivery unless Watchtower explicitly provides the required idempotency guarantees.

The adapter should target:

at-least-once delivery
+
stable event identity
+
Watchtower-side idempotency/deduplication

If Watchtower supports event IDs or idempotency keys, use them.

The desired semantic is:

same logical event
      ↓
may be transmitted more than once
      ↓
same stable event ID
      ↓
Watchtower recognizes duplicate
      ↓
logical state is applied once

Do not attempt to manufacture exactly-once semantics solely inside the adapter.

⸻

22. Retry and Backoff

Retry must remain bounded per delivery cycle, but retry exhaustion must NOT delete the event.

Recommended behavior:

attempt 1
    ↓
short delay
attempt 2
    ↓
longer delay
attempt 3
    ↓
longer delay
...
    ↓
maximum backoff
    ↓
continue periodic retry

The retry limit controls the current attempt cycle.

It does not determine the lifetime of the queued event.

An event remains queued until:

successful Watchtower acknowledgement

or an explicit permanent-failure/dead-letter policy is invoked.

⸻

23. Transient vs Permanent Failure

Transient failures MUST remain retryable.

Examples:

connection refused
timeout
DNS failure
HTTP 5xx
Watchtower unavailable
temporary network failure

These must not cause event deletion.

Permanent failures may be treated separately:

invalid payload
irreconcilable schema mismatch
permanent authentication rejection
explicit operator quarantine

A dead-letter mechanism is optional for the initial implementation.

If implemented, it must never silently discard events.

⸻

24. Queue Backpressure

The queue must have explicit resource limits.

At minimum define:

maximum queue size
maximum event size
maximum retained age
maximum storage usage
storage failure behavior

An indefinite Watchtower outage must not silently consume unlimited resources.

If the queue reaches capacity:

queue capacity reached
    ↓
cannot safely persist new event
    ↓
do not claim delivery
    ↓
fail closed
    ↓
surface queue exhaustion
    ↓
operator intervention

Do NOT silently discard:

* the oldest event.
* the newest event.
* random events.

Any discard policy must be explicit and operator-controlled.

⸻

25. Queue Metrics

Expose enough information to determine queue health.

Minimum recommended metrics:

queue_depth
oldest_queued_event_age
events_queued_total
events_delivered_total
events_failed_total
delivery_retry_total
queue_persistence_failures
queue_drain_active
watchtower_connection_state

During an outage, the system should make a state such as this observable:

Watchtower: DOWN
queue_depth: 847
oldest_event_age: 00:17:42
drain_active: false

After recovery:

Watchtower: UP
queue_depth: 0
drain_active: false

⸻

26. Required Queue Tests

Test 1: Watchtower outage

event 1
event 2
event 3
Watchtower offline

Assert:

1 queued
2 queued
3 queued
0 falsely delivered

⸻

Test 2: Watchtower recovery

Watchtower offline
event 1
event 2
event 3
Watchtower restored

Assert:

1 delivered
2 delivered
3 delivered
queue empty

⸻

Test 3: Ordered drain

Queue:

1
2
3
4

Assert delivery order:

1
2
3
4

⸻

Test 4: Mid-drain failure

1 → ACK
2 → ACK
3 → FAILURE
4 → pending

Assert:

1 removed
2 removed
3 retained
4 retained

⸻

Test 5: Adapter restart while Watchtower is unavailable

Watchtower offline
event 1
event 2
event 3
adapter crashes
adapter restarts

Assert:

1 exists
2 exists
3 exists

Then:

Watchtower restored

Assert:

1 delivered
2 delivered
3 delivered
queue empty

⸻

Test 6: Crash during delivery

Simulate:

event 1
    ↓
DELIVERING
    ↓
process crash

On restart assert:

event 1 → PENDING

Then verify it is eventually delivered.

⸻

Test 7: Duplicate replay

event 42
    ↓
queued
    ↓
delivery failure
    ↓
adapter restart
    ↓
event 42 replay

Verify:

stable event ID preserved

and verify Watchtower-side idempotency/deduplication if supported.

⸻

Test 8: Queue capacity

Force:

queue capacity reached

Assert:

new event is NOT silently discarded
delivery is NOT falsely acknowledged
queue exhaustion is surfaced
adapter fails closed

⸻

27. Required Watchtower Failure/Recovery Integration Test

After deploying the real Watchtower environment, execute:

connect
    ↓
event 1
    ↓
Watchtower accepts event 1
    ↓
Watchtower becomes unavailable
    ↓
event 2
event 3
event 4
    ↓
events persist in queue
    ↓
adapter remains running
    ↓
Watchtower restored
    ↓
queue drain
    ↓
event 2 ACK
event 3 ACK
event 4 ACK
    ↓
queue empty

Then repeat with:

Watchtower unavailable
    ↓
events accumulate
    ↓
adapter restarts
    ↓
events remain queued
    ↓
Watchtower restored
    ↓
events drain

These must be tested against the real deployed Watchtower runtime.

⸻

28. Required Real Integration Path

The final runtime verification must establish:

REAL Character Kit
       ↓
REAL adapter
       ↓
REAL normalization
       ↓
REAL ordering
       ↓
REAL durable queue
       ↓
REAL canonical fw_agent_* authentication
       ↓
REAL Watchtower
       ↓
REAL persisted state

Then verify:

Watchtower state
       ↓
compare against
       ↓
expected adapter event state

Do not replace this test with another fake.

Mocks remain appropriate for unit and boundary tests.

They are not substitutes for the deployment-backed integration test.

⸻

29. Required Restart Semantics

Explicitly test the state currently held in memory:

Deduper
Ordering
Retry state
BridgeState
queue delivery state

The durable queue must survive restart.

For ordering and deduplication, determine and document whether their state is:

ephemeral

or:

persisted

or:

reconstructed from Watchtower

Do not invent persistence semantics.

The critical durability requirement is that accepted but unacknowledged delivery events survive adapter restart.

⸻

30. Deduplication vs Ordering

Do not merge these concepts.

Deduplication

"Have I already processed this event?"

Ordering

"Is this the next valid event in the sequence?"

Queue

"Has this accepted event been acknowledged by Watchtower?"

All three have separate responsibilities.

Tests must verify that one mechanism cannot accidentally corrupt another.

⸻

31. Required Combined Scenario

The adapter must eventually pass this complete scenario:

sequence 1
    ↓
accepted
    ↓
Watchtower ACK
    ↓
removed
sequence 2
    ↓
accepted
    ↓
Watchtower DOWN
    ↓
persisted
sequence 3
    ↓
accepted
    ↓
Watchtower DOWN
    ↓
persisted
sequence 5
    ↓
OUT_OF_ORDER
    ↓
ordering state does NOT advance
sequence 4
    ↓
accepted
    ↓
persisted
adapter restart
    ↓
queue reconstructed
Watchtower restored
    ↓
sequence 2 delivered
    ↓
ACK
    ↓
sequence 3 delivered
    ↓
ACK
    ↓
sequence 4 delivered
    ↓
ACK
    ↓
queue empty

Sequence 5 must never cause the ordering state to jump forward.

The queue must preserve the accepted events.

The adapter restart must not destroy queued events.

Watchtower recovery must drain the queue.

⸻

32. Production Readiness Gate

Do not change the project status to:

production-ready

until the complete runtime lifecycle has been proven.

The adapter must demonstrate both:

Normal operation

Event
  ↓
Normalize
  ↓
Validate
  ↓
Order
  ↓
Persist queue
  ↓
Watchtower
  ↓
ACK
  ↓
Remove from queue

Watchtower outage

Event
  ↓
Normalize
  ↓
Validate
  ↓
Order
  ↓
Persist queue
  ↓
Watchtower unavailable
  ↓
Remain queued
  ↓
Additional events accumulate
  ↓
Adapter restart
  ↓
Queue reconstructed
  ↓
Watchtower restored
  ↓
Ordered queue drain
  ↓
ACK each event
  ↓
Remove each acknowledged event
  ↓
Queue empty

Both paths must be proven.

⸻

33. Implementation Order

Execute the work in this order unless a concrete blocker requires deviation.

P0: Correctness

* Fix Ordering.classify() so only lastSeq + 1 advances state.
* Confirm future sequences cannot mutate lastSeq.
* Confirm stale sequences cannot mutate lastSeq.
* Run the complete ordering test suite.

P1: Ordering Regression

* Add 1 → 5 → 2 → 3 → 4 regression test.
* Assert 5 returns out_of_order.
* Assert state remains 1 after 5.
* Assert 2, 3, and 4 subsequently succeed.
* Assert final state is 4.

P1: Durable Queue

* Implement the durable delivery queue.
* Persist accepted events before considering them safely queued.
* Preserve stable event IDs.
* Track delivery state.
* Track retry metadata.
* Recover DELIVERING events as PENDING after restart.
* Remove events only after successful Watchtower acknowledgement.
* Preserve queue ordering.
* Implement queue drain after Watchtower recovery.
* Implement bounded retry/backoff.
* Define queue capacity and backpressure behavior.

P1: Watchtower Integration

* Deploy Watchtower.
* Establish real canonical fw_agent_* authentication.
* Verify real event ingestion.
* Verify real Watchtower persistence.
* Verify event identity/idempotency behavior.
* Verify queue drain against the real Watchtower.
* Verify Watchtower outage behavior.
* Verify recovery behavior.

P1: Failure Recovery

* Test Watchtower outage.
* Test queued events accumulating during outage.
* Test adapter restart during outage.
* Verify queued events survive restart.
* Restore Watchtower.
* Verify ordered queue drain.
* Verify queue becomes empty after successful acknowledgement.

P2: Restart Semantics

* Test crash during DELIVERING.
* Verify unacknowledged events return to PENDING.
* Test duplicate replay.
* Test deduplication.
* Test ordering after restart.
* Document ephemeral vs persistent state.

P2: Credentials

* Verify every remaining legacy HMAC route.
* Determine whether WATCHTOWER_INGESTION_SECRET is genuinely required.
* Remove unnecessary legacy coupling only after deployment verification.
* Add canonical-only configuration regression coverage if applicable.

P3: Operational Hardening

* Add queue metrics.
* Add queue health visibility.
* Add queue persistence failure handling.
* Add backpressure enforcement.
* Add optional dead-letter handling if justified.
* Add complete topology/e2e tests.
* Reassess production readiness.

⸻

34. Explicit Non-Goals

Do not:

* Rewrite the adapter architecture.
* Replace Character Kit’s native protocol.
* Merge Character Kit and Watchtower primitives.
* Remove the normalization boundary.
* Remove legacy authentication before verifying affected routes.
* Call in-memory retry a durable queue.
* Implement a queue that disappears when the process exits.
* Generate new event IDs for retries.
* Remove events before Watchtower acknowledgement.
* Silently discard events when Watchtower is unavailable.
* Silently discard events when queue capacity is reached.
* Claim exactly-once delivery without Watchtower-backed idempotency.
* Replace real integration testing with additional mocks.
* Add speculative abstractions.
* Refactor unrelated code while fixing ordering.
* Change public contracts merely for stylistic consistency.
* Mark the adapter production-ready solely because local tests pass.

⸻

35. Acceptance Criteria

The implementation passes this directive only when all of the following are true.

Ordering

sequence = last + 1
    → accepted
    → state advances
sequence > last + 1
    → out_of_order
    → state unchanged
sequence <= last
    → stale/out_of_order
    → state unchanged

Character Kit

native Character Kit protocol
        ↓
isolated bridge
        ↓
EnforcementResult
        ↓
normalized adapter event

The native protocol remains isolated.

Queue

accepted event
    ↓
durably persisted
    ↓
pending
    ↓
delivery attempt
    ↓
Watchtower ACK
    ↓
removed

Watchtower outage

Watchtower unavailable
    ↓
events continue entering durable queue
    ↓
events remain recoverable
    ↓
no false delivery acknowledgement

Adapter restart

adapter crashes
    ↓
adapter restarts
    ↓
unacknowledged queue events recovered
    ↓
events remain deliverable

Recovery

Watchtower restored
    ↓
queue drain begins
    ↓
oldest pending event delivered
    ↓
ACK
    ↓
event removed
    ↓
next pending event
    ↓
continue
    ↓
queue empty

Identity

same logical event
    ↓
same stable event ID
    ↓
retries/replays preserve identity

Failure

temporary failure
    ↓
retry/backoff
    ↓
event remains queued

No transient failure may cause event loss.

Capacity

queue capacity reached
    ↓
no silent discard
    ↓
no false delivery
    ↓
fail closed
    ↓
operator-visible queue exhaustion

⸻

36. Final Engineering Position

The correct action is not to rebuild this adapter.

The existing architecture already provides the right separation:

Character Kit
     ↓
protocol bridge
     ↓
normalized contract
     ↓
dedupe / ordering
     ↓
durable delivery queue
     ↓
Watchtower transport
     ↓
Watchtower

The immediate correctness defect is narrow:

future sequence
      ↓
MUST NOT advance ordering state

Fix it first.

Then prove it with the regression test.

Then implement durable store-and-forward delivery.

Then put the real Watchtower underneath the adapter.

The queue is not merely an optimization. It establishes a critical runtime guarantee:

Once the adapter accepts an event for delivery, temporary Watchtower unavailability must not cause that event to disappear.

The resulting delivery contract is:

Accepted
   ↓
Persisted
   ↓
Pending
   ↓
Delivered
   ↓
Acknowledged
   ↓
Removed

Not:

Accepted
   ↓
"we tried"
   ↓
hope the network was feeling cooperative

The adapter must survive Watchtower outages as a system, not merely complain about them more persistently.

The final runtime guarantee is:

Watchtower can go down. Events accumulate safely. The adapter can restart. The queue survives. Watchtower comes back. Pending events are replayed in the required order until every successfully acknowledged event is drained from the queue. No event is silently lost, no future sequence corrupts ordering state, and no delivery is falsely reported as successful.

Do not manufacture confidence. Produce evidence.
