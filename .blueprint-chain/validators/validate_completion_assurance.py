#!/usr/bin/env python3
import json, sys
from pathlib import Path
root = Path(__file__).resolve().parents[2]
contract = root / 'orchestration-contract.json'
audit = root / 'state' / 'watchdog' / 'audit.jsonl'
if not contract.is_file(): print('FAIL: orchestration contract missing'); sys.exit(1)
data = json.loads(contract.read_text())
if data.get('policies', {}).get('fail_closed') is not True: print('FAIL: fail-closed policy missing'); sys.exit(1)
if not audit.is_file() or not audit.read_text().strip(): print('FAIL: watchdog audit proof missing'); sys.exit(1)
print('PASS: completion assurance evidence present')
