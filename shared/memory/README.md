# shared/memory — Memory Core

Extracted from the Mycelium agent bundle (`.trash/Mycelium.tar.gz`, the `mnemosyne`
agent), brought into the hackathon repo as a reusable foundation for submissions.

## What's here

| File | Role |
|------|------|
| `engines/memory-store.js` | Content-addressed (CID-style), **write-once immutable**, multi-index store (source/tag/type/timestamp), TTL, LRU-ish eviction, snapshot persistence. |
| `engines/embedding-engine.js` | 384-dim vector engine, pluggable local/remote backend, cache, `VectorIndex` + cosine similarity. |
| `engines/recall-engine.js` | Multi-strategy recall: semantic + keyword + temporal + tag, ranked by similarity/recency/importance/access-frequency. Query expansion + cache. |
| `engines/forget-engine.js` | Exponential decay, retention policies, GC, soft/hard delete, 24h recovery window, audit log. |
| `engines/learning-engine.js` | Pattern detection (TF-IDF co-occurrence), relationship extraction, consolidation, reinforcement, gap detection, meta-knowledge. |
| `index.js` | Clean public surface (the only file submissions import from). |

## What was scrubbed (the "dirty" part)

The original bundle had a shared memory-manager module with a hardcoded vault path
leftover from a different, since-deleted project. That file was deliberately NOT
copied. The engines here are storage-agnostic (they take a `MemoryStore`
instance), so they work without any hardcoded path.

## Honest caveat

`embedding-engine.js`'s `local` backend produces **hash-bucket** vectors, not
real semantic embeddings. The recall *infrastructure* is production-shaped; the
*vector quality* is not. For real semantic recall, set
`new EmbeddingEngine({ backend: 'remote' })` and implement `_embedRemote` against
Gemini `google-generativeai` embeddings (already in the hackathon stack). The
interface is ready.

## Usage

```js
import { MemoryStore, EmbeddingEngine, RecallEngine, ForgetEngine } from './memory/index.js';

const store = new MemoryStore({ snapshotPath: './data/memories.json' });
const embed = new EmbeddingEngine({ backend: 'local', dimensions: 384 });
const recall = new RecallEngine({ store, embeddingEngine: embed });
const forget = new ForgetEngine({ store });

const { cid } = store.add({ content: 'Gemini 3.5 supports ADK agents', tags: ['gemini'], type: 'fact' });
const res = await recall.recall('gemini agents');
```

## Status

- Extracted: 2026-08-10
- Smoke-tested: ingest → recall → forget verified (`shared/memory/smoke.test.mjs`)
- NOT yet wired to Firestore; in-memory store only.
- NOT yet swapped to real embeddings.
