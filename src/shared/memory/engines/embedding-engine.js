/**
 * Embedding Engine for the shared Federation memory engine
 * Generates vector embeddings for text content
 * Supports a local backend and a pluggable remote API backend, with caching
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

// Utility functions for tokenization and vector operations
export function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2); // Keep tokens of length >= 2
}

export function normalize(vector) {
  if (!vector || vector.length === 0) return [];
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return new Array(vector.length).fill(0);
  return vector.map(val => val / magnitude);
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  if (a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

export function hashEmbedding(text, dimensions = 384) {
  if (!text) return new Float32Array(dimensions).fill(0);

  const vector = new Float32Array(dimensions);
  const tokens = tokenize(text);

  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash) + token.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % dimensions;
    vector[index] += 1;
  }

  // Normalize
  const magnitude = Math.sqrt(Array.from(vector).reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      vector[i] /= magnitude;
    }
  }

  return Array.from(vector);
}

// Vector Index for similarity search
export class VectorIndex {
  constructor(options = {}) {
    this.dimension = options.dimension || 384;
    this.similarityThreshold = options.similarityThreshold || 0.3;
    this.chunks = new Map(); // id -> { id, text, vector, metadata }
    this._searchCount = 0;
    this._docFreq = new Map();
  }

  add(id, text, vector, metadata = {}) {
    if (vector.length !== this.dimension) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`);
    }
    this.chunks.set(id, { id, text, vector, metadata });
  }

  get(id) {
    return this.chunks.get(id) || null;
  }

  remove(id) {
    return this.chunks.delete(id);
  }

  clear() {
    this.chunks.clear();
    this._docFreq.clear();
  }

  get size() {
    return this.chunks.size;
  }

  search(queryVector, options = {}) {
    this._searchCount++;
    const limit = options.limit || 10;
    const threshold = options.threshold !== undefined ? options.threshold : this.similarityThreshold;

    const results = [];
    for (const chunk of this.chunks.values()) {
      const similarity = cosineSimilarity(queryVector, chunk.vector);
      if (similarity >= threshold) {
        results.push({ chunk, vectorScore: similarity, bm25Score: 0 });
      }
    }

    results.sort((a, b) => b.vectorScore - a.vectorScore);
    return results.slice(0, limit);
  }

  addBatch(items) {
    for (const item of items) {
      this.add(item.id, item.text, item.embedding, item.metadata || {});
    }
  }

  rebuildBM25() {
    this._docFreq.clear();
    for (const chunk of this.chunks.values()) {
      const terms = tokenize(chunk.text);
      const uniqueTerms = new Set(terms);
      for (const term of uniqueTerms) {
        this._docFreq.set(term, (this._docFreq.get(term) || 0) + 1);
      }
    }
  }

  getStats() {
    return {
      totalChunks: this.chunks.size,
      dimension: this.dimension,
      searchCount: this._searchCount
    };
  }
}

/**
 * Embedding Engine for the shared Federation memory engine
 * Generates vector embeddings for text content
 * Supports a local (character n-gram) backend and a pluggable remote API backend
 */
export class EmbeddingEngine {
  constructor(options = {}) {
    this.backend = options.backend || 'local'; // 'local' or 'remote'
    this.dimensions = options.dimension || options.dimensions || 384;
    this.cache = new Map();
    this.cachePath = options.cachePath;
    this.cacheSize = options.cacheSize || 1000;
    this._vectorIndex = null;

    // Statistics
    this._cacheHits = 0;
    this._cacheMisses = 0;
    this._totalEmbeddings = 0;
    this._totalErrors = 0;

    // Load cache from disk if path provided
    if (this.cachePath && existsSync(this.cachePath)) {
      try {
        const data = JSON.parse(readFileSync(this.cachePath, 'utf-8'));
        this.cache = new Map(Object.entries(data));
      } catch (e) {
        // Ignore cache load errors
      }
    }
  }

  /** Get or create the vector index for similarity search. */
  getOrCreateIndex() {
    if (!this._vectorIndex) {
      this._vectorIndex = new VectorIndex({ dimension: this.dimensions });
    }
    return this._vectorIndex;
  }

  /** Generate embedding for text (async for API compatibility). */
  async embed(text) {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      throw new Error('Text is required for embedding');
    }

    const cacheKey = this._hash(text);
    if (this.cache.has(cacheKey)) {
      this._cacheHits++;
      return this.cache.get(cacheKey);
    }

    this._cacheMisses++;
    this._totalEmbeddings++;

    let embedding;
    if (this.backend === 'remote') {
      try {
        embedding = await this._embedRemote(text);
      } catch (e) {
        this._totalErrors++;
        // Fallback to local
        embedding = this._embedLocal(text);
      }
    } else {
      embedding = this._embedLocal(text);
    }

    // Cache result
    if (this.cache.size >= this.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, embedding);

    return embedding;
  }

  /** Generate embeddings for multiple texts. */
  async embedBatch(texts) {
    return Promise.all(texts.map(text => this.embed(text)));
  }

  /** Index text in vector index. */
  async index(id, text, metadata = {}) {
    const embedding = await this.embed(text);
    const index = this.getOrCreateIndex();
    index.add(id, text, embedding, metadata);
    return { id, embedding };
  }

  /** Index multiple texts. */
  async indexBatch(items) {
    for (const item of items) {
      await this.index(item.id, item.text, item.metadata || {});
    }
  }

  /** Search for similar content. */
  async search(query, topK = 5) {
    const queryEmbedding = await this.embed(query);
    const index = this.getOrCreateIndex();
    return index.search(queryEmbedding, { limit: topK });
  }

  /** Get engine statistics. */
  getStats() {
    return {
      backend: this.backend,
      dimension: this.dimensions,
      cacheSize: this.cache.size,
      cacheHits: this._cacheHits,
      cacheMisses: this._cacheMisses,
      totalEmbeddings: this._totalEmbeddings,
      totalErrors: this._totalErrors
    };
  }

  /** Save cache to disk. */
  saveCache() {
    if (!this.cachePath) return;
    try {
      mkdirSync(dirname(this.cachePath), { recursive: true });
      const data = Object.fromEntries(this.cache);
      writeFileSync(this.cachePath, JSON.stringify(data), 'utf-8');
    } catch (e) {
      // Ignore cache save errors
    }
  }

  /** Clear embedding cache. */
  clearCache() {
    this.cache.clear();
  }

  // Backward compatibility aliases (sync)
  generate(text) {
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return Array.from(new Float32Array(this.dimensions));
    }
    const cacheKey = this._hash(text);
    if (this.cache.has(cacheKey)) {
      this._cacheHits++;
      return this.cache.get(cacheKey);
    }
    this._cacheMisses++;
    this._totalEmbeddings++;
    const embedding = this._embedLocal(text);
    if (this.cache.size >= this.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, embedding);
    return embedding;
  }

  generateBatch(texts) {
    return texts.map(text => this.generate(text));
  }

  similarity(a, b) {
    const sim = cosineSimilarity(a, b);
    // Round to avoid floating point precision issues
    return Math.abs(sim - 1.0) < 1e-10 ? 1.0 : Math.abs(sim) < 1e-10 ? 0 : sim;
  }

  /** Find most similar embeddings from candidates. */
  findSimilar(query, candidates, topK = 5) {
    return candidates
      .map((candidate, index) => ({
        index,
        score: this.similarity(query, candidate)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /** Get cache statistics. */
  getCacheStats() {
    return { size: this.cache.size, dimensions: this.dimensions };
  }

  // Private methods

  _hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString();
  }

  _embedLocal(text) {
    const tokens = tokenize(text);
    const vector = new Float32Array(this.dimensions);

    for (const token of tokens) {
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = ((hash << 5) - hash) + token.charCodeAt(i);
        hash |= 0;
      }
      const index = Math.abs(hash) % this.dimensions;
      vector[index] += 1;
    }

    const magnitude = Math.sqrt(Array.from(vector).reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] /= magnitude;
      }
    }

    return Array.from(vector);
  }

  async _embedRemote(text) {
    // Placeholder for a remote embedding API call
    // In production, would call the configured AI_BASE_URL embedding endpoint
    throw new Error('Remote embedding backend not implemented -- configure AI_API_KEY and AI_BASE_URL');
  }
}

/** Create an embedding engine instance. */
export function createEmbeddingEngine(options = {}) {
  return new EmbeddingEngine(options);
}

export default EmbeddingEngine;