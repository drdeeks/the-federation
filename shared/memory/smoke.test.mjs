// shared/memory/smoke.test.mjs
// Proof the reusable Federation memory engine works: ingest -> recall -> forget.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore, EmbeddingEngine, RecallEngine, ForgetEngine } from './index.js';

async function temporaryStorePath(prefix) {
  const directory = await mkdtemp(join(tmpdir(), `${prefix}-`));
  return { directory, path: join(directory, 'memory.json') };
}

test('ingest then recall returns the memory', async () => {
  const temp = await temporaryStorePath('federation-memory-recall');
  try {
    const store = new MemoryStore({ snapshotPath: temp.path });
    const embed = new EmbeddingEngine({ backend: 'local', dimensions: 384 });
    const recall = new RecallEngine({ store, embeddingEngine: embed });

    const { cid } = store.add({
      content: 'Federation memory supports reusable agent context',
      tags: ['federation', 'memory'],
      type: 'fact',
    });
    assert.ok(cid, 'memory should get a CID');

    const res = await recall.recall('reusable agent context');
    assert.equal(res.success, true);
    assert.ok(res.results.length >= 1, 'should recall at least one memory');
    assert.ok(res.results[0].content.includes('Federation memory'));
  } finally {
    await rm(temp.directory, { recursive: true, force: true });
  }
});

test('fail-closed: gate blocks when enforcer unavailable', async () => {
  const { createFailClosedGate } = await import('../enforcement/fail-closed-gate.js');
  const gate = createFailClosedGate({ agentId: 'smoke' });
  const decision = await gate.judge({ tool: 'filesystem', input: 'destructive action' });
  assert.equal(decision.allowed, false, 'must block when enforcer is unreachable');
  assert.match(decision.reason, /fail-closed|unavailable/);
});

test('forget soft-deletes and is recoverable within window', async () => {
  const active = await temporaryStorePath('federation-memory-active');
  const archive = await temporaryStorePath('federation-memory-archive');
  try {
    const store = new MemoryStore({ snapshotPath: active.path });
    const archiveStore = new MemoryStore({ snapshotPath: archive.path });
    const forget = new ForgetEngine({ store, archiveStore });
    const { cid } = store.add({ content: 'temporary fact', tags: ['temporary'], type: 'note' });

    const forgot = await forget.forget(cid, { mode: 'soft' });
    assert.equal(forgot.success, true, 'soft forget should succeed');
    assert.equal(store.has(cid), false, 'memory should be removed from active store');

    const recovered = await forget.recover(cid);
    assert.equal(recovered.success, true, 'should recover within the recovery window');
    assert.ok(recovered.memory && recovered.memory.cid, 'recovery should return a memory with a cid');
    assert.equal(store.has(recovered.memory.cid), true, 'restored memory should be in active store');
  } finally {
    await Promise.all([
      rm(active.directory, { recursive: true, force: true }),
      rm(archive.directory, { recursive: true, force: true }),
    ]);
  }
});
