#!/usr/bin/env python3
"""
Validator for Phase 1: Cognitive Memory Substrate
Auto-generated from blueprint deliverables.
Validation Gate: 
"""

import json
import os
import sys
import re
import glob
from pathlib import Path

def find_project_root(step_file):
    """Walk up from step file to find project root (contains .blueprint-chain)."""
    p = Path(step_file).resolve()
    for parent in p.parents:
        if (parent / '.blueprint-chain').exists():
            return parent
    return None

def check_deliverable(project_root, deliverable):
    """Check a single deliverable. Returns (ok, message)."""
    path = deliverable['path']
    full_path = project_root / path
    is_dir = deliverable['is_dir']
    is_glob = deliverable['is_glob']
    hint = deliverable['validation_hint']
    dtype = deliverable.get('type', 'file')

    if is_glob:
        matches = list(project_root.glob(path))
        if not matches:
            return False, f"No files matching glob: {path}"
        return True, f"Found {len(matches)} matches for {path}: {[str(m.relative_to(project_root)) for m in matches]}"

    if is_dir:
        if not full_path.is_dir():
            return False, f"Directory not found: {path}"
        return True, f"Directory exists: {path}"

    # File checks
    if not full_path.exists():
        return False, f"File not found: {path}"

    # Type: approval — a sign-off marker, not a build artifact.
    # Must contain both an 'Approved-By:' and a 'Date:' field, or
    # it's just an empty file pretending to be an attestation.
    if dtype == 'approval':
        approval_content = full_path.read_text()
        has_approver = re.search(r'Approved-By:\s*\S+', approval_content)
        has_date = re.search(r'Date:\s*\S+', approval_content)
        if not (has_approver and has_date):
            return False, f"Approval marker {path} is missing Approved-By:/Date: fields"
        return True, f"Approval attested: {path}"

    # Type: review — Creative Orchestration Doctrine Principle V
    # ('every creative layer has a corresponding reviewer'). Stricter
    # than 'approval': the reviewer must be a DIFFERENT agent than
    # whoever is assigned to this phase, not just anyone who signs.
    if dtype == 'review':
        review_content = full_path.read_text()
        reviewer_m = re.search(r'Reviewed-By:\s*(\S+)', review_content)
        has_date = re.search(r'Date:\s*\S+', review_content)
        critique_m = re.search(r'Critique:\s*(.+)', review_content)
        if not (reviewer_m and has_date and critique_m):
            return False, f"Review {path} is missing Reviewed-By:/Date:/Critique: fields"
        if len(critique_m.group(1).strip()) < 10:
            return False, f"Review {path} Critique: field is too short to be a real critique"
        reviewer = reviewer_m.group(1).strip()
        assignments_path = project_root / 'assignments.json'
        assignee = None
        if assignments_path.exists():
            try:
                adata = json.loads(assignments_path.read_text())
                entry = adata.get('assignments', {}).get('PHASE-1')
                assignee = (entry or {}).get('agent')
            except (json.JSONDecodeError, OSError):
                pass
        if assignee and reviewer == assignee:
            return False, f"Review {path}: Reviewed-By ({reviewer}) is the same agent as the phase assignee — reviewer must be independent"
        return True, f"Reviewed by {reviewer} (assignee: {assignee or 'unknown'}): {path}"

    # Content validation hints
    if hint:
        if 'valid JSON' in hint.lower() or 'json' in hint.lower():
            try:
                json.loads(full_path.read_text())
            except json.JSONDecodeError as e:
                return False, f"Invalid JSON in {path}: {e}"
            return True, f"Valid JSON: {path}"
        elif 'CL-' in hint or 'changelog' in hint.lower():
            content = full_path.read_text()
            if not re.search(r'CL-\d+', content):
                return False, f"No CL- entries in {path}"
            return True, f"CHANGELOG has CL- entries: {path}"
        elif 'executable' in hint.lower():
            if not os.access(full_path, os.X_OK):
                return False, f"Not executable: {path}"
            return True, f"Executable: {path}"
        elif 'yaml' in hint.lower() or 'yml' in hint.lower():
            # No YAML parser is guaranteed available in an arbitrary
            # target project (this validator ships standalone, outside
            # enterprise-blueprint's own scripts/); degrade to a existence-only
            # pass with a note rather than crash or assume PyYAML.
            try:
                import yaml as _y
                _y.safe_load(full_path.read_text())
                return True, f"Valid YAML: {path}"
            except ImportError:
                return True, f"YAML present but unverified (no parser available): {path}"
            except Exception as e:
                return False, f"Invalid YAML in {path}: {e}"

    return True, f"File exists: {path}"

def check_agent_assignment(project_root, phase_num):
    """Real read side of agent delegation: this phase's gate FAILs
    if assignments.json (written by assign_agents.py --assign or
    --model-map) has no real agent on this phase — closes the gap
    where assignment data was written but nothing ever consumed it."""
    assignments_path = project_root / 'assignments.json'
    if not assignments_path.exists():
        return False, f"No assignments.json — PHASE-{phase_num} has no assigned agent (run assign_agents.py)"
    try:
        data = json.loads(assignments_path.read_text())
    except (json.JSONDecodeError, OSError) as e:
        return False, f"Could not read assignments.json: {e}"
    entry = data.get('assignments', {}).get(f'PHASE-{phase_num}')
    agent = (entry or {}).get('agent', 'unassigned')
    if not entry or agent == 'unassigned':
        return False, f"PHASE-{phase_num} has no assigned agent in assignments.json"
    return True, f"PHASE-{phase_num} assigned to {agent}"

def main():
    if len(sys.argv) < 2:
        print("Usage: validator.py <step-file-path>")
        sys.exit(1)

    step_file = sys.argv[1]
    project_root = find_project_root(step_file)
    if not project_root:
        print("ERROR: Could not find project root (.blueprint-chain)")
        sys.exit(1)

    deliverables = [
        {'raw': 'shared/memory/README.md', 'path': 'shared/memory/README.md', 'is_dir': False, 'is_glob': False, 'validation_hint': '', 'type': 'file', 'validator': ''},
        {'raw': 'src/memory/README.md', 'path': 'src/memory/README.md', 'is_dir': False, 'is_glob': False, 'validation_hint': '', 'type': 'file', 'validator': ''},
        {'raw': 'docs/MEMORY-ARCHITECTURE.md', 'path': 'docs/MEMORY-ARCHITECTURE.md', 'is_dir': False, 'is_glob': False, 'validation_hint': '', 'type': 'file', 'validator': ''},
        {'raw': 'tests/memory-isolation.test.mjs', 'path': 'tests/memory-isolation.test.mjs', 'is_dir': False, 'is_glob': False, 'validation_hint': '', 'type': 'file', 'validator': ''},
        {'raw': 'review-phase1.md', 'path': 'review-phase1.md', 'is_dir': False, 'is_glob': False, 'validation_hint': '', 'type': 'review', 'validator': ''},
    ]

    all_ok = True
    messages = []

    # Agent delegation must be real, not just documented — this phase's
    # gate fails if no agent is actually assigned (see check_agent_assignment).
    a_ok, a_msg = check_agent_assignment(project_root, 1)
    messages.append(a_msg)
    if not a_ok:
        all_ok = False

    for d in deliverables:
        ok, msg = check_deliverable(project_root, d)
        messages.append(msg)
        if not ok:
            all_ok = False

    # Print all messages
    for msg in messages:
        print(msg)

    if all_ok:
        print(f"OK: Phase 1 validation passed")
        sys.exit(0)
    else:
        print(f"FAIL: Phase 1 validation failed")
        sys.exit(1)

if __name__ == '__main__':
    main()