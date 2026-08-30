/**
 * Shared memory engine public surface.
 *
 * This package contains reusable, storage-agnostic memory primitives. The
 * Federation application memory subsystem owns tier routing, scope, context
 * assembly, and application policy above this package.
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
