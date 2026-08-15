#!/usr/bin/env bash
# Keeps the blueprint-chain watcher scanning on an interval, forever.
# Each scan: detects any deliverable file change (docs/src/shared/tests/
# review-phaseN.md) -> fires the gate -> gate re-runs whichever phase is
# currently first-failing -> on a genuine pass, appends a signed,
# hash-chained entry to .blueprint-chain/.loop-log.jsonl. A failing
# scan (current phase still incomplete) is expected, logged to stdout,
# and never kills the loop -- only the process dying outright would.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONITOR_PY="/home/drdeek/.claude/skills/guardrail-enforcement/scripts/monitor.py"
INTERVAL="${GUARDRAIL_SCAN_INTERVAL:-300}"  # 5 min default -- deliverable files change far less often than a skill-version-bump watch would

echo "poll-forever: watching $ROOT every ${INTERVAL}s (PID $$)"

while true; do
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "[$ts] scanning..."
  python3 "$MONITOR_PY" scan --config "$ROOT/.monitor.json" || echo "[$ts] scan reported a non-zero exit (expected while the current phase is incomplete -- not fatal)"
  sleep "$INTERVAL"
done
