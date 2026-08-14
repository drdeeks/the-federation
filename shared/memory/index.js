/**
 * shared/memory — extracted, scrubbed memory core.
 *
 * Provenance: Mycelium agent bundle (`.trash/Mycelium.tar.gz`), mnemosyne agent.
 * Brought over 2026-08-10. Scrubbed of the dirty hardcoded vault path that
 * lived in the original `memory-manager.js` (NOT copied). Storage-agnostic: the
 * engines take a `MemoryStore` instance, so they work against the in-memory
 * store here OR a Firestore-backed store later.
 *
 * Caveat (be honest): `embedding-engine.js`'s local backend is a naive
 * hash-bucket bag-of-words vector — NOT a real semantic embedding. The
 * infrastructure (index, cache, search API, recall ranking) is solid; the
 * *vectors* are weak. Swap `backend: 'remote'` to a real embedder (e.g.
 * Gemini `google-generativeai` embeddings) before relying on semantic recall
 * quality. The interface is already pluggable.
 *
 * Public surface:
 *   MemoryStore, EmbeddingEngine, VectorIndex,
 *   RecallEngine, ForgetEngine, LearningEngine
 */

export { MemoryStore, contentHash, generateCID } from './store/memory-store.js';
export { EmbeddingEngine, VectorIndex, createEmbeddingEngine } from './engines/embedding-engine.js';
export {
  RecallEngine,
  QueryProcessor,
  SemanticSearcher,
  KeywordSearcher,
  TemporalFilterer,
  TagFilterer,
  ResultRanker,
  QueryExpander,
  ResultFormatter,
} from './engines/recall.js';
export {
  ForgetEngine,
  DecayCalculator,
  ArchiveMigrator,
  GarbageCollector,
  ManualForgetHandler,
  RetentionPolicyEngine,
  DecayScheduler,
  ForgetAuditLogger,
  RecoveryHandler,
  RetentionPolicyValidator,
  ArchiveCleanupScheduler,
  ForgettingMetricsCollector,
} from './engines/forget.js';
export {
  LearningEngine,
  TFIDFVectorizer,
  PatternScanner,
  RelationshipExtractor,
  KnowledgeConsolidator,
  ReinforcementEngine,
  GapDetector,
  MetaKnowledgeGenerator,
} from './engines/learning.js';
export {
  IngestionEngine,
  InputParser,
  ContentChunker,
  ContentValidator,
  DeduplicationChecker,
  ImportanceScorer,
  TagExtractor,
} from './engines/ingestion.js';
