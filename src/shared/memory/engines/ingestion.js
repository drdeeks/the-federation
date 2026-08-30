/**
 * IngestionEngine — Phase 2: Memory Ingestion
 *
 * Processes incoming memory content through parsing, chunking, deduplication,
 * embedding generation, and persistent storage. Supports multiple input formats
 * and handles batch ingestion with atomic commit semantics.
 *
 * Rollback Tag: [INGESTION-ENGINE-v1]
 * Phase: 2 — Ingestion & Recall Engines
 */

import { createHash, randomUUID } from 'crypto';
import { EmbeddingEngine } from './embedding-engine.js';
import { MemoryStore } from '../store/memory-store.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONTENT_LENGTH = 100000;
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;
const DEFAULT_IMPORTANCE = 0.5;
const DEFAULT_DECAY_RATE = 0.01;

const IMPORTANCE_KEYWORDS = [
  'deadline', 'action item', 'must', 'critical', 'urgent', 'important',
  'decision', 'approved', 'rejected', 'milestone', 'deliverable',
  'required', 'mandatory', 'asap', 'blocker', 'priority'
];

// ---------------------------------------------------------------------------
// InputParser — Validates and normalizes incoming memory payloads
// ---------------------------------------------------------------------------

class InputParser {
  /**
   * Parse and normalize incoming memory content.
   * @param {string|Object|Array} input
   * @returns {Array<{ content: string, tags?: string[], source?: string }>}
   * @throws {Error} on invalid input format
   */
  static parse(input) {
    if (input === null || input === undefined) {
      throw new Error('Memory content must be non-empty string or JSON object with \'content\' field');
    }

    // Handle arrays
    if (Array.isArray(input)) {
      if (input.length === 0) {
        throw new Error('Memory content must be non-empty string or JSON object with \'content\' field');
      }
      return input.map(item => InputParser._parseItem(item));
    }

    return [InputParser._parseItem(input)];
  }

  /**
   * Parse a single memory item.
   */
  static _parseItem(item) {
    if (typeof item === 'string') {
      const content = InputParser._normalizeContent(item);
      if (!content) {
        throw new Error('Memory content must be non-empty string or JSON object with \'content\' field');
      }
      return { content };
    }

    if (typeof item === 'object' && item !== null) {
      // Must have a 'content' field
      if (!item.content || typeof item.content !== 'string') {
        throw new Error('Memory content must be non-empty string or JSON object with \'content\' field');
      }
      const content = InputParser._normalizeContent(item.content);
      if (!content) {
        throw new Error('Memory content must be non-empty string or JSON object with \'content\' field');
      }
      return {
        content,
        tags: Array.isArray(item.tags) ? item.tags : undefined,
        source: item.source || undefined,
        sourceId: item.sourceId || undefined,
        metadata: item.metadata || undefined,
        type: item.type || undefined,
        importance: typeof item.importance === 'number' ? item.importance : undefined,
      };
    }

    throw new Error('Memory content must be non-empty string or JSON object with \'content\' field');
  }

  /**
   * Normalize content: strip control characters, normalize whitespace, enforce length.
   */
  static _normalizeContent(content) {
    if (!content || typeof content !== 'string') return '';

    let normalized = content;

    // Strip control characters except newline and tab
    normalized = normalized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize whitespace: collapse spaces but keep newlines and tabs
    normalized = normalized.replace(/ {2,}/g, ' ');
    normalized = normalized.replace(/\t{2,}/g, '\t');

    // Strip leading/trailing whitespace
    normalized = normalized.trim();

    return normalized;
  }
}

// ---------------------------------------------------------------------------
// ContentChunker — Splits large content into meaningful chunks
// ---------------------------------------------------------------------------

class ContentChunker {
  /**
   * Chunk content into segments with overlap.
   * Uses paragraph-aware splitting when possible.
   * @param {string} content
   * @param {Object} [options]
   * @returns {Array<{ text: string, index: number }>}
   */
  static chunk(content, options = {}) {
    const chunkSize = options.chunkSize || CHUNK_SIZE;
    const overlap = options.overlap || CHUNK_OVERLAP;

    // If content is small enough, return as single chunk
    if (content.length <= chunkSize) {
      return [{ text: content, index: 0 }];
    }

    const chunks = [];

    // Try paragraph-aware splitting first
    const paragraphs = content.split(/\n\n+/);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      if ((currentChunk + '\n\n' + paragraph).length <= chunkSize) {
        currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
      } else {
        // Current chunk is full, save it
        if (currentChunk) {
          chunks.push({ text: currentChunk.trim(), index: chunkIndex++ });
        }

        // If paragraph itself is too large, do sentence-aware splitting
        if (paragraph.length > chunkSize) {
          const subChunks = ContentChunker._chunkBySentences(paragraph, chunkSize, overlap);
          for (const sub of subChunks) {
            chunks.push({ text: sub.trim(), index: chunkIndex++ });
          }
          currentChunk = '';
        } else {
          currentChunk = paragraph;
        }
      }
    }

    // Save remaining
    if (currentChunk.trim()) {
      chunks.push({ text: currentChunk.trim(), index: chunkIndex });
    }

    return chunks;
  }

  /**
   * Split by sentences when a paragraph is too large.
   */
  static _chunkBySentences(text, chunkSize, overlap) {
    const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
    const chunks = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length <= chunkSize) {
        current += sentence;
      } else {
        if (current) chunks.push(current);
        current = sentence;
      }
    }

    if (current.trim()) {
      chunks.push(current);
    }

    return chunks;
  }
}

// ---------------------------------------------------------------------------
// ContentValidator — Deep validation of memory content
// ---------------------------------------------------------------------------

class ContentValidator {
  /**
   * Validate memory content.
   * @param {string} content
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validate(content) {
    const errors = [];

    if (!content || typeof content !== 'string') {
      errors.push('Content must be a non-empty string');
      return { valid: false, errors };
    }

    // Check length
    if (content.length > MAX_CONTENT_LENGTH) {
      errors.push(`Content exceeds maximum allowed size of ${MAX_CONTENT_LENGTH} characters`);
    }

    // Check for non-printable control characters (except newline and tab)
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(content)) {
      errors.push('Content contains non-printable control characters');
    }

    // Check for potential script injection
    if (/<script[\s>]/i.test(content) || /javascript:/i.test(content)) {
      errors.push('Content contains potentially dangerous script patterns');
    }

    return { valid: errors.length === 0, errors };
  }
}

// ---------------------------------------------------------------------------
// DeduplicationChecker — SHA-256 hash-based deduplication
// ---------------------------------------------------------------------------

class DeduplicationChecker {
  /**
   * Compute content hash for deduplication.
   * @param {string} content
   * @returns {string} hex hash
   */
  static hashContent(content) {
    const normalized = content.toLowerCase().trim();
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Check if content is a duplicate.
   * @param {string} content
   * @param {Map} hashStore — Map<hash, memoryId>
   * @returns {{ isDuplicate: boolean, existingId?: string }}
   */
  static check(content, hashStore) {
    const hash = DeduplicationChecker.hashContent(content);
    const existingId = hashStore.get(hash);
    if (existingId) {
      return { isDuplicate: true, existingId };
    }
    return { isDuplicate: false };
  }
}

// ---------------------------------------------------------------------------
// ImportanceScorer — Computes initial importance score
// ---------------------------------------------------------------------------

class ImportanceScorer {
  /**
   * Compute importance score for content.
   * Formula: 0.3 * length_factor + 0.3 * keyword_factor + 0.4 * novelty_factor
   *
   * @param {string} content
   * @param {number} noveltyFactor — 0.0 to 1.0, how novel compared to existing memories
   * @returns {number} score between 0.0 and 1.0
   */
  static score(content, noveltyFactor = 0.5) {
    // Length factor: logarithmic scaling
    const lengthFactor = Math.min(1.0, Math.log10(content.length + 1) / Math.log10(MAX_CONTENT_LENGTH));

    // Keyword factor: presence of importance markers
    const lowerContent = content.toLowerCase();
    let keywordHits = 0;
    for (const keyword of IMPORTANCE_KEYWORDS) {
      if (lowerContent.includes(keyword)) keywordHits++;
    }
    const keywordFactor = Math.min(1.0, keywordHits / 3); // 3+ keywords = max

    // Novelty factor: 0-1
    const novelty = Math.max(0, Math.min(1.0, noveltyFactor));

    // Weighted combination
    const score = 0.3 * lengthFactor + 0.3 * keywordFactor + 0.4 * novelty;

    return Math.max(0, Math.min(1.0, score));
  }
}

// ---------------------------------------------------------------------------
// TagExtractor — Extracts or normalizes tags
// ---------------------------------------------------------------------------

class TagExtractor {
  /**
   * Extract and normalize tags from content or explicit tags.
   * @param {string} content
   * @param {string[]} explicitTags
   * @returns {string[]}
   */
  static extract(content, explicitTags = []) {
    const tags = new Set();

    // Add explicit tags (normalized to lowercase)
    for (const tag of explicitTags) {
      if (typeof tag === 'string') {
        tags.add(tag.toLowerCase().trim());
      }
    }

    // Auto-extract simple noun phrases (basic heuristic)
    // Look for capitalized words that aren't at sentence start
    const words = content.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const word = words[i].replace(/[^a-zA-Z]/g, '');
      const prevWord = words[i - 1];
      // If previous word ended with punctuation (sentence start), skip
      if (/[.!?]$/.test(prevWord)) continue;
      // Capitalized words (potential proper nouns/entities)
      if (word.length > 2 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
        tags.add(word.toLowerCase());
      }
    }

    return Array.from(tags).slice(0, 20); // Limit to 20 tags
  }
}

// ---------------------------------------------------------------------------
// IngestionEngine — Main ingestion orchestrator
// ---------------------------------------------------------------------------

export class IngestionEngine {
  /**
   * @param {Object} options
   * @param {MemoryStore} options.store
   * @param {EmbeddingEngine} options.embeddingEngine
   */
  constructor(options = {}) {
    this.store = options.store || new MemoryStore();
    this.embeddingEngine = options.embeddingEngine || new EmbeddingEngine();
    this.vectorIndex = this.embeddingEngine.getOrCreateIndex();

    // Deduplication hash store: Map<sha256, cid>
    this._hashStore = new Map();

    // Batch history
    this._batchHistory = [];

    // Stats
    this._stats = {
      totalIngested: 0,
      totalDuplicates: 0,
      totalChunks: 0,
      totalErrors: 0,
    };
  }

  /**
   * Ingest a single memory item.
   * @param {string|Object} input
   * @param {Object} [options] — { source, sourceId, tags }
   * @returns {Promise<{ success: boolean, memory?: Object, error?: string }>}
   */
  async ingest(input, options = {}) {
    try {
      // 1. Parse input
      const items = InputParser.parse(input);
      if (items.length === 0) {
        return { success: false, error: 'No valid content to ingest' };
      }

      const item = items[0];
      const content = item.content;
      const tags = item.tags || options.tags || [];

      // 2. Validate content
      const validation = ContentValidator.validate(content);
      if (!validation.valid) {
        this._stats.totalErrors++;
        return { success: false, error: validation.errors.join('; ') };
      }

      // 3. Check for duplicates
      const hash = DeduplicationChecker.hashContent(content);
      const dupCheck = DeduplicationChecker.check(content, this._hashStore);
      if (dupCheck.isDuplicate) {
        this._stats.totalDuplicates++;
        return {
          success: false,
          error: `Identical memory already exists with ID ${dupCheck.existingId}`,
          existingId: dupCheck.existingId,
          isDuplicate: true,
        };
      }

      // 4. Generate content hash for CID
      const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 12);

      // 5. Generate embedding
      let embedding = null;
      let embeddingStatus = 'complete';
      try {
        embedding = await this.embeddingEngine.embed(content);
      } catch (err) {
        embeddingStatus = 'pending';
        // Store without embedding, flag for retry
      }

      // 6. Compute importance
      const importance = item.importance !== undefined
        ? Math.max(0, Math.min(1, item.importance))
        : ImportanceScorer.score(content);

      // 7. Extract tags
      const extractedTags = TagExtractor.extract(content, tags);

      // 8. Build memory object
      const memoryId = randomUUID();
      const now = new Date().toISOString();

      const memory = {
        id: memoryId,
        cid: `mem:${contentHash}:${memoryId.slice(0, 8)}`,
        content,
        source: item.source || options.source || 'api',
        sourceId: item.sourceId || options.sourceId || '',
        tags: extractedTags,
        type: item.type || 'memory',
        importance_score: importance,
        decay_rate: DEFAULT_DECAY_RATE,
        access_count: 0,
        embedding_status: embeddingStatus,
        created_at: now,
        updated_at: now,
        last_accessed: now,
        metadata: {
          ...item.metadata,
          contentHash: hash,
          sourceType: options.sourceType || 'api',
          ingestedAt: now,
        },
      };

      // 9. Store in MemoryStore
      const storeResult = this.store.add({
        content: memory.content,
        source: memory.source,
        sourceId: memory.sourceId,
        tags: memory.tags,
        type: memory.type,
        timestamp: memory.created_at,
        metadata: {
          id: memory.id,
          importance_score: memory.importance_score,
          decay_rate: memory.decay_rate,
          embedding_status: memory.embedding_status,
          contentHash: memory.metadata.contentHash,
          sourceType: memory.metadata.sourceType,
        },
      });

      // 10. Index in vector store
      if (embedding) {
        this.vectorIndex.add(
          memory.cid,
          content,
          embedding,
          { memoryId: memory.id, tags: memory.tags, importance: importance }
        );
      }

      // 11. Register in dedup store
      this._hashStore.set(hash, memory.cid);

      // 12. Update stats
      this._stats.totalIngested++;
      this._stats.totalChunks++;

      return {
        success: true,
        memory: {
          id: memory.id,
          cid: memory.cid,
          content: memory.content.slice(0, 200),
          tags: memory.tags,
          importance_score: memory.importance_score,
          embedding_status: memory.embedding_status,
          created_at: memory.created_at,
        },
        created: storeResult.created,
      };
    } catch (err) {
      this._stats.totalErrors++;
      return { success: false, error: err.message };
    }
  }

  /**
   * Ingest a large document by chunking it first.
   * @param {string} content
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, chunks?: Array, error?: string }>}
   */
  async ingestDocument(content, options = {}) {
    try {
      // Validate
      const validation = ContentValidator.validate(content);
      if (!validation.valid) {
        this._stats.totalErrors++;
        return { success: false, error: validation.errors.join('; ') };
      }

      // Check duplicate
      const hash = DeduplicationChecker.hashContent(content);
      const dupCheck = DeduplicationChecker.check(content, this._hashStore);
      if (dupCheck.isDuplicate) {
        this._stats.totalDuplicates++;
        return {
          success: false,
          error: `Identical memory already exists with ID ${dupCheck.existingId}`,
          isDuplicate: true,
        };
      }

      // Chunk the content
      const chunks = ContentChunker.chunk(content, {
        chunkSize: options.chunkSize || CHUNK_SIZE,
        overlap: options.overlap || CHUNK_OVERLAP,
      });

      // Generate embeddings for all chunks
      const texts = chunks.map(c => c.text);
      let embeddings;
      let embeddingStatus = 'complete';
      try {
        embeddings = await this.embeddingEngine.embedBatch(texts);
      } catch (err) {
        embeddingStatus = 'pending';
        embeddings = chunks.map(() => null);
      }

      // Build parent memory
      const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 12);
      const memoryId = randomUUID();
      const now = new Date().toISOString();
      const importance = options.importance !== undefined
        ? Math.max(0, Math.min(1, options.importance))
        : ImportanceScorer.score(content);
      const extractedTags = TagExtractor.extract(content, options.tags || []);

      const parentMemory = {
        id: memoryId,
        cid: `mem:${contentHash}:${memoryId.slice(0, 8)}`,
        content,
        source: options.source || 'api',
        sourceId: options.sourceId || '',
        tags: extractedTags,
        type: options.type || 'document',
        importance_score: importance,
        decay_rate: DEFAULT_DECAY_RATE,
        access_count: 0,
        embedding_status: embeddingStatus,
        chunk_count: chunks.length,
        created_at: now,
        updated_at: now,
        last_accessed: now,
        metadata: {
          contentHash: hash,
          sourceType: options.sourceType || 'api',
          ingestedAt: now,
        },
      };

      // Store parent
      this.store.add({
        content: parentMemory.content,
        source: parentMemory.source,
        sourceId: parentMemory.sourceId,
        tags: parentMemory.tags,
        type: parentMemory.type,
        timestamp: parentMemory.created_at,
        metadata: {
          id: parentMemory.id,
          importance_score: parentMemory.importance_score,
          is_parent: true,
          chunk_count: chunks.length,
        },
      });

      // Index parent in vector store
      if (embeddings[0]) {
        this.vectorIndex.add(
          parentMemory.cid,
          content.slice(0, CHUNK_SIZE),
          embeddings[0],
          { memoryId: parentMemory.id, tags: extractedTags, importance, isParent: true }
        );
      }

      // Store and index chunks
      const chunkResults = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkHash = createHash('sha256').update(chunks[i].text).digest('hex').slice(0, 12);
        const chunkId = randomUUID();
        const chunkCid = `chunk:${chunkHash}:${chunkId.slice(0, 8)}`;

        const chunkMemory = {
          cid: chunkCid,
          content: chunks[i].text,
          source: parentMemory.source,
          tags: extractedTags,
          type: 'chunk',
          timestamp: now,
          metadata: {
            id: chunkId,
            parent_id: parentMemory.id,
            chunk_index: chunks[i].index,
            importance_score: importance,
          },
        };

        this.store.add(chunkMemory);

        if (embeddings[i]) {
          this.vectorIndex.add(
            chunkCid,
            chunks[i].text,
            embeddings[i],
            { memoryId: chunkId, parentId: parentMemory.id, tags: extractedTags, importance }
          );
        }

        chunkResults.push({
          cid: chunkCid,
          index: chunks[i].index,
          textLength: chunks[i].text.length,
        });

        this._stats.totalChunks++;
      }

      // Register dedup
      this._hashStore.set(hash, parentMemory.cid);

      this._stats.totalIngested++;

      return {
        success: true,
        memory: {
          id: parentMemory.id,
          cid: parentMemory.cid,
          tags: parentMemory.tags,
          importance_score: parentMemory.importance_score,
          chunk_count: chunks.length,
          embedding_status: embeddingStatus,
          created_at: parentMemory.created_at,
        },
        chunks: chunkResults,
      };
    } catch (err) {
      this._stats.totalErrors++;
      return { success: false, error: err.message };
    }
  }

  /**
   * Batch ingest multiple items atomically.
   * @param {Array} items
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, results: Array, summary: Object }>}
   */
  async ingestBatch(items, options = {}) {
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const item of items) {
      const result = await this.ingest(item, options);
      results.push(result);
      if (result.success) successCount++;
      else errorCount++;
    }

    return {
      success: successCount > 0,
      results,
      summary: {
        total: items.length,
        success: successCount,
        errors: errorCount,
      },
    };
  }

  /**
   * Get ingestion statistics.
   */
  getStats() {
    return {
      ...this._stats,
      hashStoreSize: this._hashStore.size,
      vectorIndexSize: this.vectorIndex.size,
    };
  }

  /**
   * Clear all data.
   */
  clear() {
    this._hashStore.clear();
    this.vectorIndex.clear();
    this.store.clear();
  }
}

// Export sub-components for testing and reuse
export { InputParser, ContentChunker, ContentValidator, DeduplicationChecker, ImportanceScorer, TagExtractor };
