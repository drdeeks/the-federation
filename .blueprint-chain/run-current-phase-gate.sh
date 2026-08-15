#!/usr/bin/env bash
# Determines the lowest-numbered phase whose validator has not yet passed,
# and runs that validator. This is the loop-command the guardrail-enforcement
# gate invokes on every watcher-triggered scan -- it always re-checks
# whichever phase is actually next, not a hardcoded phase number, so the
# same watcher config keeps working as the chain advances from PHASE-0
# through PHASE-5 without reconfiguration.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHAIN="$ROOT/.blueprint-chain"

for phase in 0 1 2 3 4 5; do
  validator="$CHAIN/validators/validate_phase${phase}_blueprint.py"
  if [ ! -f "$validator" ]; then
    continue
  fi
  # Use any real step file under this phase just to anchor project-root
  # discovery inside the validator -- content doesn't matter, only that it
  # lives under $CHAIN.
  anchor=$(find "$CHAIN" -maxdepth 1 -iname "phase-0${phase}-step-01-*" | head -n1)
  if [ -z "$anchor" ]; then
    anchor="$CHAIN/validators.json"
  fi
  echo "=== Checking PHASE-${phase} ==="
  if python3 "$validator" "$anchor"; then
    echo "PHASE-${phase}: already passing, checking next phase..."
    continue
  else
    echo "STOP: PHASE-${phase} is the current (first failing) phase."
    exit 1
  fi
done

echo "ALL PHASES PASS — chain complete."
exit 0
