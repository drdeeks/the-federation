/**
 * Vector Store — Chunks, embeddings, and search metadata
 * 
 * Stores document chunks with embeddings for semantic search.
 * Independent from both episodic memory and knowledge graph.
 */

import crypto from 'crypto';

export class VectorStore {
  constructor(options = {}) {
    this.vectors = new Map(); // vectorId -> vector record
    this.documentIndex = new Map(); // documentId -> Set<vectorId>
    this.dimension = options.dimension || 1536; // OpenAI default
  }

  /**
   * Add vector record for a document chunk.
   */
  add(vector) {
    const vectorId = vector.vectorId || `vec-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const record = {
      vectorId,
      documentId: vector.documentId,
      chunkRef: vector.chunkRef || '',
      chunkIndex: vector.chunkIndex || 0,
      chunkText: vector.chunkText || '',
      embedding: vector.embedding || null,
      embeddingRef: vector.embeddingRef || null,
      modelRef: vector.modelRef || 'unknown',
      metadata: vector.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    this.vectors.set(vectorId, record);

    if (!this.documentIndex.has(vector.documentId)) {
      this.documentIndex.set(vector.documentId, new Set());
    }
    this.documentIndex.get(vector.documentId).add(vectorId);

    return record;
  }

  /**
   * Add multiple vectors (batch).
   */
  addBatch(vectors) {
    return vectors.map(v => this.add(v));
  }

  /**
   * Get vector by ID.
   */
  get(vectorId) {
    return this.vectors.get(vectorId) || null;
  }

  /**
   * Get all vectors for a document.
   */
  getByDocument(documentId) {
    const ids = this.documentIndex.get(documentId) || new Set();
    return Array.from(ids).map(id => this.vectors.get(id)).filter(Boolean);
  }

  /**
   * Update vector metadata.
   */
  update(vectorId, updates) {
    const vec = this.vectors.get(vectorId);
    if (!vec) return null;

    const allowedUpdates = ['chunkText', 'embedding', 'embeddingRef', 'modelRef', 'metadata'];
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) vec[key] = updates[key];
    }

    vec.updatedAt = new Date().toISOString();
    this.vectors.set(vectorId, vec);
    return vec;
  }

  /**
   * Delete vector.
   */
  delete(vectorId) {
    const vec = this.vectors.get(vectorId);
    if (!vec) return false;

    this.documentIndex.get(vec.documentId)?.delete(vectorId);
    this.vectors.delete(vectorId);
    return true;
  }

  /**
   * Delete all vectors for a document.
   */
  deleteByDocument(documentId) {
    const ids = this.documentIndex.get(documentId) || new Set();
    let count = 0;
    for (const id of ids) {
      this.vectors.delete(id);
      count++;
    }
    this.documentIndex.delete(documentId);
    return count;
  }

  /**
   * Cosine similarity search (brute force - use FAISS/ANN in production).
   */
  search(embedding, options = {}) {
    const { limit = 10, threshold = 0.7, documentIds } = options;
    
    const results = [];
    for (const [id, vec] of this.vectors) {
      if (!vec.embedding || vec.embedding.length !== embedding.length) continue;
      if (documentIds && !documentIds.includes(vec.documentId)) continue;

      const similarity = this._cosineSimilarity(embedding, vec.embedding);
      if (similarity >= threshold) {
        results.push({ vector: vec, similarity });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Search by text (requires external embedding).
   */
  async searchByText(text, embedFn, options = {}) {
    const embedding = await embedFn(text);
    return this.search(embedding, options);
  }

  /**
   * Get stats.
   */
  getStats() {
    let totalChunks = 0;
    let withEmbeddings = 0;
    for (const vec of this.vectors.values()) {
      totalChunks++;
      if (vec.embedding) withEmbeddings++;
    }
    return {
      totalVectors: this.vectors.size,
      totalChunks,
      withEmbeddings,
      documents: this.documentIndex.size,
      dimension: this.dimension,
    };
  }

  _cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export default VectorStore;