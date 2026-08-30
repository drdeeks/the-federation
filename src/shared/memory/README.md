# Shared memory engine

`shared/memory/` is the reusable memory engine for Federation-compatible
agents. It is independent of a specific application, model provider, agent
framework, cloud runtime, or machine-specific path.

It provides:

- storage and content-addressed memory records;
- ingestion and normalization;
- injectable embedding and vector primitives;
- recall and ranking;
- retention, forgetting, archiving, and recovery;
- learning and pattern extraction.

The Federation application memory subsystem in `src/memory/` owns the four
semantic tiers, agent and organization scope, document indexing, application
retrieval policy, context assembly, and persistence adapters. It may adapt or
re-export this engine but must not maintain a silent duplicate implementation.

## Public entry point

```js
import {
  MemoryStore,
  EmbeddingEngine,
  RecallEngine,
  ForgetEngine,
} from './index.js';

const store = new MemoryStore({ snapshotPath: './data/memories.json' });
const embed = new EmbeddingEngine({ backend: 'local', dimensions: 384 });
const recall = new RecallEngine({ store, embeddingEngine: embed });

store.add({ content: 'A reusable memory record', tags: ['example'], type: 'fact' });
const result = await recall.recall('reusable memory');
```

The local embedding backend is a deterministic vector fallback for tests and
development. It is not a claim of semantic model quality. A production
embedding provider must be injected through the engine interface.

## Verification

Run the repository smoke test from the project root:

```text
npm run smoke
```

The test covers ingestion, recall, fail-closed enforcement, soft forgetting,
and recovery. It does not prove the complete Federation four-tier router.
