/**
 * Knowledge Retrieval module — MOD-003
 * 
 * Independent from episodic memory (MOD-002).
 * Provides: Knowledge Graph, Document Corpus, Vector Store, Hybrid Retrieval.
 * Context Router (MOD-004) sits above this and episodic memory.
 */

import { KnowledgeGraph, EntityType, RelationType } from './graph/knowledge-graph.js';
import { DocumentStore } from './corpus/document-store.js';
import { VectorStore } from './vectors/vector-store.js';
import { KnowledgeRetrieval } from './retrieval/knowledge-retrieval.js';

export { KnowledgeGraph, EntityType, RelationType, DocumentStore, VectorStore, KnowledgeRetrieval };

export default {
  KnowledgeGraph,
  DocumentStore,
  VectorStore,
  KnowledgeRetrieval,
  EntityType,
  RelationType,
};