// tests/memory-isolation.test.mjs — PHASE-1 deliverable (blueprint.md PHASE-1.4).
//
// Tests the isolation rules docs/MEMORY-ARCHITECTURE.md §2 actually states,
// against what currently exists in code -- not against subsystems that are
// still empty directories. Per that document's own §11 "Current repository
// mapping": episodic, declarative/long-term, and knowledge-graph APIs, the
// Memory Router, and the Context Composer are NOT YET INTEGRATED. Writing
// tests that pretend to exercise them would be exactly the kind of false
// verification this project's blueprint.md §1.8 status vocabulary forbids
// ("this blueprint never treats planned work as completed"). Those cases
// are explicit `test.skip(...)` entries below with the real reason, not
// silently omitted and not faked as passing.
//
// What IS real and gets a real test: shared/memory (the engine) vs
// src/memory (the Federation application layer) actually stay isolated --
// no silent duplicate implementation, no reverse dependency from the
// engine back into the application layer, and the one real cross-cutting
// isolation rule that already has working code behind it: the corpus
// indexer must never index the agent's own memory/knowledge/secrets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

async function tempWorkspace(prefix) {
  return mkdtemp(join(tmpdir(), `${prefix}-`));
}

// ── Shared engine <-> Federation application boundary ──────────────────────

test('src/memory adapter modules re-export shared/memory engines rather than duplicating them', async () => {
  // This is a regression test for a real duplicate found and fixed during
  // this phase: src/memory/retrieval/embedding-engine.js was a 376-line,
  // 374-line-identical copy of shared/memory/engines/embedding-engine.js
  // (only two comment lines differed), silently violating
  // shared/memory/README.md's own rule: "must not maintain a silent
  // duplicate implementation." Every adapter listed here must be a thin
  // re-export, not a second copy -- checked by source size, not just by
  // import success (a duplicate would still "work," it just wouldn't be
  // isolated/single-source-of-truth).
  const adapters = [
    'src/memory/store/memory-store.js',
    'src/memory/intake/ingestion.js',
    'src/memory/retrieval/recall-engine.js',
    'src/memory/retrieval/embedding-engine.js',
    'src/memory/consolidation/pattern-detector.js',
    'src/memory/consolidation/forget-policy.js',
  ];
  for (const relPath of adapters) {
    const source = readFileSync(join(REPO_ROOT, relPath), 'utf-8');
    // The definitive check: it must actually re-export from shared/memory/.
    assert.match(
      source,
      /export \* from ['"]\.\.\/\.\.\/\.\.\/shared\/memory\//,
      `${relPath} does not re-export from shared/memory/ -- it may be a disconnected duplicate`,
    );
    // Backstop: a real duplicate (like the 376-line embedding-engine.js this
    // test regresses against) also has substantial *code* beyond the
    // comment header -- count lines that aren't comments/blank/the export
    // line itself, not raw non-blank lines (a longer descriptive comment,
    // like this file's own, is legitimate and must not fail this check).
    const codeLines = source
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('*') && !l.startsWith('/*') && !l.startsWith('//') && !l.startsWith('export * from'));
    assert.equal(
      codeLines.length, 0,
      `${relPath} has ${codeLines.length} line(s) of code beyond a re-export + comments -- expected a thin shim, found what looks like a duplicate implementation: ${codeLines.join(' | ')}`,
    );
  }
});

test('shared/memory engine source never imports back into src/ (the engine must not depend on its application)', async () => {
  const sharedMemoryDir = join(REPO_ROOT, 'shared', 'memory');
  const offenders = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        const source = readFileSync(full, 'utf-8');
        if (/from\s+['"].*\/src\//.test(source) || /require\(['"].*\/src\//.test(source)) {
          offenders.push(full.replace(REPO_ROOT + '/', ''));
        }
      }
    }
  }
  walk(sharedMemoryDir);

  assert.deepEqual(offenders, [], `shared/memory files importing from src/ (engine depending on its own application layer): ${offenders.join(', ')}`);
});

// ── Corpus indexing must exclude agent-internal state ───────────────────────

test('document indexer excludes memory, knowledge, and secrets directories from the corpus (TEST-008)', async () => {
  const { DocumentIndexer } = await import(join(REPO_ROOT, 'src/memory/semantic/document-indexer.js'));

  const workspace = await tempWorkspace('federation-corpus-isolation');
  try {
    // Real, user-supplied corpus content -- should be indexed.
    await mkdir(join(workspace, 'corpus'), { recursive: true });
    await writeFile(join(workspace, 'corpus', 'onboarding.md'), '# Onboarding\nThis is a real user-supplied document.');

    // Agent-internal state -- must never be indexed as corpus, per
    // docs/MEMORY-ARCHITECTURE.md SS7 ("must exclude agent-internal state
    // such as memory, knowledge, identity, habits, secrets").
    await mkdir(join(workspace, 'memory'), { recursive: true });
    await writeFile(join(workspace, 'memory', 'private-note.md'), '# Private\nThis must never appear in the corpus index.');
    await mkdir(join(workspace, 'knowledge'), { recursive: true });
    await writeFile(join(workspace, 'knowledge', 'entity.md'), '# Entity\nThis must never appear in the corpus index either.');
    await mkdir(join(workspace, '.secrets'), { recursive: true });
    await writeFile(join(workspace, '.secrets', 'key.md'), '# Secret\nDefinitely must never be indexed.');
    await mkdir(join(workspace, 'habits'), { recursive: true });
    await writeFile(join(workspace, 'habits', 'habit.md'), '# Habit\nAgent-internal, not corpus.');

    const indexer = new DocumentIndexer(workspace);
    await indexer.init();
    await indexer.indexDirectory(workspace);

    const indexedIds = Object.keys(indexer.index.documents);
    assert.ok(indexedIds.some((id) => id.includes('onboarding')), 'the real corpus document should be indexed');
    for (const excluded of ['private-note', 'entity', 'key', 'habit']) {
      assert.ok(
        !indexedIds.some((id) => id.includes(excluded)),
        `agent-internal file "${excluded}" leaked into the corpus index: ${indexedIds.join(', ')}`,
      );
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

// ── Not yet buildable: honest, visible skips, not silent omission ──────────
// docs/MEMORY-ARCHITECTURE.md SS11 lists these as "not yet integrated and
// must not be described as complete." Each skip below names the exact
// missing module so this file stops skipping it the moment that changes.

test('daily episodic record is appendable and retrievable without mutating other tiers (TEST-004)', { skip: 'src/memory/episodic/ is an empty directory -- no episodic store/API exists yet to test' }, () => {});

test('weekly digest derives from daily records without rewriting them (TEST-005)', { skip: 'src/memory/episodic/ is an empty directory -- no weekly synthesis exists yet to test' }, () => {});

test('long-term/declarative promotion records provenance and requires an explicit actor (TEST-006)', { skip: 'src/memory/persistent/ is an empty directory -- no declarative store/promotion API exists yet to test' }, () => {});

test('knowledge graph entities and relations remain independent from memory record storage (TEST-007)', { skip: 'no knowledge-graph store/API exists yet in src/memory/ -- schemas/ and working/ are also empty' }, () => {});

test('context composition from the Memory Router is temporary and not separately persisted (TEST-011)', { skip: 'Memory Router and Context Composer (MOD-004, FTR-004) are PLANNED, not implemented -- no src/context/ exists' }, () => {});
