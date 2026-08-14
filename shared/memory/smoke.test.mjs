// shared/memory/smoke.test.mjs
// Proof the extracted memory core actually works: ingest -> recall -> forget.
// Run: node --test shared/memory/smoke.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, EmbeddingEngine, RecallEngine, ForgetEngine } from './index.js';

test('ingest then recall returns the memory', async () => {
  const store = new MemoryStore({ snapshotPath: '/tmp/_smoke_memories.json' });
  const embed = new EmbeddingEngine({ backend: 'local', dimensions: 384 });
  const recall = new RecallEngine({ store, embeddingEngine: embed });

  const { cid } = store.add({
    content: 'Gemini 3.5 supports ADK agents on Cloud Run',
    tags: ['gemini', 'adk'],
    type: 'fact',
  });
  assert.ok(cid, 'memory should get a CID');

  const res = await recall.recall('gemini adk agents');
  assert.equal(res.success, true);
  assert.ok(res.results.length >= 1, 'should recall at least one memory');
  assert.ok(
    res.results[0].content.includes('Gemini 3.5'),
    'top result should be the ingested memory'
  );
});

test('fail-closed: gate blocks when enforcer unavailable', async () => {
  const { createFailClosedGate } = await import('../enforcement/fail-closed-gate.js');
  const gate = createFailClosedGate({ agentId: 'smoke' });
  const decision = await gate.judge({ tool: 'Bash', input: 'rm -rf /' });
  assert.equal(decision.allowed, false, 'must block when enforcer is unreachable');
  assert.match(decision.reason, /fail-closed|unavailable/);
});

test('forget soft-deletes and is recoverable within window', async () => {
  const store = new MemoryStore({ snapshotPath: '/tmp/_smoke_active.json' });
  const archiveStore = new MemoryStore({ snapshotPath: '/tmp/_smoke_archive.json' });
  const forget = new ForgetEngine({ store, archiveStore });
  const { cid } = store.add({ content: 'temporary fact', tags: ['tmp'], type: 'note' });

  const forgot = await forget.forget(cid, { mode: 'soft' });
  assert.equal(forgot.success, true, 'soft forget should succeed');
  assert.equal(store.has(cid), false, 'memory should be removed from active store');

  const recovered = await forget.recover(cid);
  assert.equal(recovered.success, true, 'should recover within the 24h window');
  // Recovery restores content under a NEW cid (MemoryStore is content-addressed,
  // write-once) — assert on the returned cid, not the original.
  assert.ok(recovered.memory && recovered.memory.cid, 'recovery should return a memory with a cid');
  assert.equal(store.has(recovered.memory.cid), true, 'restored memory should be in active store');
});
