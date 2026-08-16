/**
 * Knowledge Retrieval — Hybrid search across graph, corpus, vectors
 * 
 * Independent from episodic memory (src/memory/).
 * Answers "what do we know?" — structural/informational knowledge.
 * Composed via Context Router (MOD-004) which sits above both planes.
 */

import { KnowledgeGraph, EntityType, RelationType } from '../graph/knowledge-graph.js';
import { DocumentStore } from '../corpus/document-store.js';
import { VectorStore } from '../vectors/vector-store.js';

export class KnowledgeRetrieval {
  constructor(options = {}) {
    this.graph = new KnowledgeGraph();
    this.corpus = new DocumentStore();
    this.vectors = new VectorStore({ dimension: options.vectorDimension || 1536 });
    this.embedFn = options.embedFn || null; // External embedding function
  }

  /**
   * Set embedding function for vector search.
   */
  setEmbedFunction(fn) {
    this.embedFn = fn;
  }

  // --- GRAPH OPERATIONS ---

  createEntity(entity) {
    return this.graph.createEntity(entity);
  }

  getEntity(id) {
    return this.graph.getEntity(id);
  }

  updateEntity(id, updates) {
    return this.graph.updateEntity(id, updates);
  }

  deleteEntity(id) {
    return this.graph.deleteEntity(id);
  }

  findEntitiesByName(query, options) {
    return this.graph.findByName(query, options);
  }

  getEntitiesByType(type, options) {
    return this.graph.getByType(type, options);
  }

  createRelation(relation) {
    return this.graph.createRelation(relation);
  }

  getRelations(entityId, options) {
    return this.graph.getRelations(entityId, options);
  }

  getNeighbors(entityId, options) {
    return this.graph.getNeighbors(entityId, options);
  }

  findPath(startId, endId, options) {
    return this.graph.findPath(startId, endId, options);
  }

  // --- CORPUS OPERATIONS ---

  addDocument(document) {
    return this.corpus.add(document);
  }

  getDocument(documentId) {
    return this.corpus.get(documentId);
  }

  getDocumentBySourceUri(uri) {
    return this.corpus.getBySourceUri(uri);
  }

  updateDocument(documentId, updates) {
    return this.corpus.update(documentId, updates);
  }

  deleteDocument(documentId) {
    return this.corpus.delete(documentId);
  }

  searchDocuments(query, options) {
    return this.corpus.search(query, options);
  }

  queryDocumentsByVisibility(visibility, options) {
    return this.corpus.queryByVisibility(visibility, options);
  }

  // --- VECTOR OPERATIONS ---

  addVector(vector) {
    return this.vectors.add(vector);
  }

  addVectorsBatch(vectors) {
    return this.vectors.addBatch(vectors);
  }

  getVector(vectorId) {
    return this.vectors.get(vectorId);
  }

  getVectorsByDocument(documentId) {
    return this.vectors.getByDocument(documentId);
  }

  deleteVector(vectorId) {
    return this.vectors.delete(vectorId);
  }

  deleteVectorsByDocument(documentId) {
    return this.vectors.deleteByDocument(documentId);
  }

  // --- HYBRID SEARCH ---

  /**
   * Hybrid search: combines graph traversal, corpus text search, vector similarity.
   * Returns unified results with source attribution.
   */
  async hybridSearch(query, options = {}) {
    const { 
      limit = 20, 
      vectorThreshold = 0.75,
      includeGraph = true,
      includeCorpus = true,
      includeVectors = true,
      entityTypes,
      documentVisibilities,
    } = options;

    const results = [];

    // 1. Corpus text search
    if (includeCorpus) {
      const corpusResults = this.corpus.search(query, { 
        limit: Math.ceil(limit * 0.4),
        visibility: documentVisibilities?.[0],
      });
      for (const doc of corpusResults) {
        results.push({
          source: 'corpus',
          type: 'document',
          content: doc.content?.slice(0, 500) || doc.sourceUri,
          metadata: { documentId: doc.documentId, sourceUri: doc.sourceUri, visibility: doc.visibility },
          score: 1.0, // Text match gets high base score
        });
      }
    }

    // 2. Vector similarity search (requires embedding)
    if (includeVectors && this.embedFn) {
      const embedding = await this.embedFn(query);
      const vectorResults = this.vectors.search(embedding, { 
        limit: Math.ceil(limit * 0.4),
        threshold: vectorThreshold,
      });
      for (const { vector, similarity } of vectorResults) {
        const doc = this.corpus.get(vector.documentId);
        if (doc && (!documentVisibilities || documentVisibilities.includes(doc.visibility))) {
          results.push({
            source: 'vectors',
            type: 'chunk',
            content: vector.chunkText?.slice(0, 500) || '',
            metadata: { 
              vectorId: vector.vectorId, 
              documentId: vector.documentId,
              chunkIndex: vector.chunkIndex,
              modelRef: vector.modelRef,
            },
            score: similarity,
          });
        }
      }
    }

    // 3. Graph search - find relevant entities
    if (includeGraph) {
      const graphResults = this.graph.findByName(query, { limit: Math.ceil(limit * 0.2) });
      for (const entity of graphResults) {
        if (entityTypes && !entityTypes.includes(entity.type)) continue;
        results.push({
          source: 'graph',
          type: 'entity',
          content: `${entity.label}: ${entity.description}`,
          metadata: { 
            entityId: entity.id, 
            entityType: entity.type,
            confidence: entity.confidence,
          },
          score: entity.confidence || 0.8,
        });

        // Also get neighbors for context
        const neighbors = this.graph.getNeighbors(entity.id, { limit: 5 });
        for (const { entity: neighbor, relations } of neighbors) {
          results.push({
            source: 'graph',
            type: 'neighbor',
            content: `${neighbor.label} (${relations.map(r => r.type).join(', ')})`,
            metadata: { 
              entityId: neighbor.id, 
              entityType: neighbor.type,
              relations: relations.map(r => r.type),
            },
            score: 0.7,
          });
        }
      }
    }

    // Deduplicate and rank
    const seen = new Set();
    const unique = [];
    for (const r of results) {
      const key = `${r.source}:${r.metadata?.entityId || r.metadata?.documentId || r.metadata?.vectorId || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }

    // Sort by score desc
    unique.sort((a, b) => b.score - a.score);
    return unique.slice(0, limit);
  }

  /**
   * Get contextual knowledge for a task/contract.
   * Used by Context Router (MOD-004) to compose context packages.
   */
  async getContextForTask(taskContract, options = {}) {
    const { limit = 30, maxGraphDepth = 2 } = options;
    const results = [];

    // Extract key terms from task contract
    const terms = this._extractKeyTerms(taskContract);

    // Search for each term
    for (const term of terms.slice(0, 5)) {
      const termResults = await this.hybridSearch(term, { limit: Math.ceil(limit / terms.length), includeVectors: !!this.embedFn });
      results.push(...termResults);
    }

    // Also search for agent/project entities if mentioned
    if (taskContract.agentId) {
      const agentEntity = this.graph.getEntity(taskContract.agentId);
      if (agentEntity) {
        results.push({ source: 'graph', type: 'agent', content: JSON.stringify(agentEntity), metadata: { entityId: agentEntity.id }, score: 1.0 });
        const neighbors = this.graph.getNeighbors(agentEntity.id, { limit: 10 });
        for (const { entity: neighbor, relations } of neighbors) {
          results.push({ source: 'graph', type: 'agent-neighbor', content: neighbor.label, metadata: { entityId: neighbor.id, relations: relations.map(r => r.type) }, score: 0.8 });
        }
      }
    }

    if (taskContract.projectId) {
      const projectEntity = this.graph.getEntity(taskContract.projectId);
      if (projectEntity) {
        results.push({ source: 'graph', type: 'project', content: JSON.stringify(projectEntity), metadata: { entityId: projectEntity.id }, score: 1.0 });
      }
    }

    // Deduplicate
    const seen = new Set();
    const unique = [];
    for (const r of results) {
      const key = `${r.source}:${r.metadata?.entityId || r.metadata?.documentId || r.metadata?.vectorId || r.content.slice(0, 50)}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }

    unique.sort((a, b) => b.score - a.score);
    return unique.slice(0, limit);
  }

  _extractKeyTerms(text) {
    // Simple keyword extraction - in production use NLP
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how']);
    
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    // Count frequencies
    const freq = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    
    // Sort by frequency
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w);
  }

  // --- STATS & PERSISTENCE ---

  getStats() {
    return {
      graph: this.graph.getStats(),
      corpus: this.corpus.getStats(),
      vectors: this.vectors.getStats(),
    };
  }

  export() {
    return {
      graph: this.graph.export(),
      corpus: Array.from(this.corpus.documents.values()),
      vectors: Array.from(this.vectors.vectors.values()),
      exportedAt: new Date().toISOString(),
    };
  }

  static import(data) {
    const retrieval = new KnowledgeRetrieval();
    if (data.graph) {
      retrieval.graph = KnowledgeGraph.import(data.graph);
    }
    if (data.corpus) {
      for (const doc of data.corpus) {
        retrieval.corpus.documents.set(doc.documentId, doc);
        retrieval.corpus.contentHashIndex.set(doc.contentHash, doc.documentId);
        if (doc.sourceUri) retrieval.corpus.sourceUriIndex.set(doc.sourceUri, doc.documentId);
        if (!retrieval.corpus.visibilityIndex.has(doc.visibility)) retrieval.corpus.visibilityIndex.set(doc.visibility, new Set());
        retrieval.corpus.visibilityIndex.get(doc.visibility).add(doc.documentId);
      }
    }
    if (data.vectors) {
      for (const vec of data.vectors) {
        retrieval.vectors.vectors.set(vec.vectorId, vec);
        if (!retrieval.vectors.documentIndex.has(vec.documentId)) retrieval.vectors.documentIndex.set(vec.documentId, new Set());
        retrieval.vectors.documentIndex.get(vec.documentId).add(vec.vectorId);
      }
    }
    return retrieval;
  }
}

export default KnowledgeRetrieval;