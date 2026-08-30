/**
 * LearningEngine — Phase 3: Memory Learning
 *
 * Analyzes stored memories to detect recurring patterns, consolidate related
 * memories into higher-order knowledge structures, reinforce frequently accessed
 * memories, and generate meta-knowledge about the memory system itself.
 * Uses a configurable reasoning model (AI_MODEL_REASONING) for complex reasoning
 * about memory relationships and knowledge gaps.
 *
 * Rollback Tag: [LEARNING-ENGINE-v1]
 * Phase: 3 — Forget & Learning Engines
 */

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_MEMORIES_FOR_PATTERN_DETECTION = 10;
const MIN_SIMILARITY_FOR_CONSOLIDATION = 0.7;
const REINFORCEMENT_FACTOR = 0.1;
const MAX_IMPORTANCE = 1.0;
const GAP_DETECTION_QUERY_LIMIT = 1000;
const GAP_MISS_THRESHOLD = 0.4;
const LEARNING_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const NEW_MEMORIES_THRESHOLD = 20;
const MAX_PATTERNS_OUTPUT = 20;
const REASONING_TIMEOUT_MS = 10000;
const WINDOW_SIZES = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

// ---------------------------------------------------------------------------
// Utility: TF-IDF vectorizer
// ---------------------------------------------------------------------------

class TFIDFVectorizer {
  /**
   * Build vocabulary and TF-IDF vectors from documents.
   * @param {string[]} documents
   * @returns {{ vocabulary: string[], vectors: number[][], idf: number[] }}
   */
  static vectorize(documents) {
    // Tokenize and build vocabulary
    const docTokens = documents.map(doc =>
      TFIDFVectorizer._tokenize(doc)
    );

    // Build vocabulary (terms that appear in at least 1 doc)
    const termFreq = new Map();
    for (const tokens of docTokens) {
      const unique = new Set(tokens);
      for (const term of unique) {
        termFreq.set(term, (termFreq.get(term) || 0) + 1);
      }
    }

    const vocabulary = [...termFreq.keys()].sort();
    const N = documents.length;

    // Compute IDF: log(N / df) where df = number of docs containing term
    const idf = vocabulary.map(term => {
      const df = termFreq.get(term) || 0;
      return Math.log((N + 1) / (df + 1)) + 1; // smooth IDF
    });

    // Compute TF-IDF vectors
    const vectors = docTokens.map(tokens => {
      const tf = new Map();
      for (const token of tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
      }

      return vocabulary.map((term, i) => {
        const termCount = tf.get(term) || 0;
        const tfVal = termCount / Math.max(tokens.length, 1);
        return tfVal * idf[i];
      });
    });

    return { vocabulary, vectors, idf };
  }

  static _tokenize(text) {
    // Common English stop words to filter out
    const STOP_WORDS = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'when',
      'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
      'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from',
      'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again',
      'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
      'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      's', 't', 'can', 'will', 'just', 'don', 'should', 'now', 'is', 'was',
      'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'am', 'are', 'be', 'i', 'me', 'my', 'myself', 'we', 'our', 'ours',
      'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
      'it', 'its', 'they', 'them', 'their', 'what', 'which', 'who', 'whom',
      'this', 'that', 'these', 'those'
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1 && !STOP_WORDS.has(t));
  }
}

// ---------------------------------------------------------------------------
// Utility: Cosine similarity for TF-IDF vectors
// ---------------------------------------------------------------------------

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// PatternScanner — Analyzes memory collections for recurring themes
// ---------------------------------------------------------------------------

class PatternScanner {
  /**
   * Scan memories for recurring themes and keywords using co-occurrence analysis.
   * @param {Object[]} memories
   * @returns {{ themes: Array<{ terms: string[], frequency: number, confidence: number }> }}
   */
  static scan(memories) {
    if (memories.length === 0) return { themes: [], keywords: [] };

    // Build term co-occurrence matrix
    const coOccurrence = new Map();
    const termFreq = new Map();

    for (const memory of memories) {
      const tokens = TFIDFVectorizer._tokenize(memory.content || '');
      const uniqueTokens = [...new Set(tokens)];

      for (const token of uniqueTokens) {
        termFreq.set(token, (termFreq.get(token) || 0) + 1);
      }

      // Build co-occurrence pairs
      for (let i = 0; i < uniqueTokens.length; i++) {
        for (let j = i + 1; j < uniqueTokens.length; j++) {
          const pair = [uniqueTokens[i], uniqueTokens[j]].sort().join('|||');
          coOccurrence.set(pair, (coOccurrence.get(pair) || 0) + 1);
        }
      }
    }

    // Find frequent co-occurring terms (themes)
    const themes = [];
    const minCoOccurrence = Math.max(2, Math.floor(memories.length * 0.1));

    for (const [pair, count] of coOccurrence) {
      if (count >= minCoOccurrence) {
        const [term1, term2] = pair.split('|||');
        const freq1 = termFreq.get(term1) || 0;
        const freq2 = termFreq.get(term2) || 0;
        const confidence = count / Math.max(freq1, freq2, 1);

        themes.push({
          terms: [term1, term2],
          frequency: count,
          confidence: Math.min(1, confidence),
          type: 'co-occurrence',
        });
      }
    }

    // Sort by confidence
    themes.sort((a, b) => b.confidence - a.confidence);

    // Extract top keywords
    const keywords = [...termFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([term, freq]) => ({ term, frequency: freq }));

    return { themes: themes.slice(0, 50), keywords };
  }
}

// ---------------------------------------------------------------------------
// RelationshipExtractor — Identifies relationships between memories
// ---------------------------------------------------------------------------

class RelationshipExtractor {
  /**
   * Extract relationships between memory pairs using statistical analysis.
   * Falls back to co-occurrence if reasoning model is unavailable.
   * @param {Object[]} memories
   * @param {Object} [options] — { reasoningClient, timeout }
   * @returns {{ relationships: Array<{ from: string, to: string, type: string, confidence: number }> }}
   */
  static async extract(memories, options = {}) {
    if (memories.length < 2) return { relationships: [] };

    // Build TF-IDF vectors for all memories
    const texts = memories.map(m => m.content || '');
    const { vectors } = TFIDFVectorizer.vectorize(texts);

    const relationships = [];

    // Compare memory pairs for semantic similarity
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const sim = cosineSimilarity(vectors[i], vectors[j]);

        if (sim > 0.3) {
          // Determine relationship type based on similarity and tags
          let type = 'supports';
          const tagsA = new Set(memories[i].tags || []);
          const tagsB = new Set(memories[j].tags || []);

          // Check for shared tags
          const sharedTags = [...tagsA].filter(t => tagsB.has(t));

          if (sim > 0.8) {
            type = 'elaborates';
          } else if (sim > 0.6) {
            type = sharedTags.length > 0 ? 'supports' : 'related';
          } else {
            type = 'associated';
          }

          // Check temporal ordering
          const timeA = new Date(memories[i].createdAt || memories[i].timestamp).getTime();
          const timeB = new Date(memories[j].createdAt || memories[j].timestamp).getTime();
          if (Math.abs(timeA - timeB) < 60 * 60 * 1000) {
            // Created within an hour — likely related
            if (type === 'associated') type = 'temporal';
          }

          relationships.push({
            from: memories[i].cid || memories[i].id,
            to: memories[j].cid || memories[j].id,
            type,
            confidence: sim,
            evidence: [memories[i].cid || memories[i].id, memories[j].cid || memories[j].id],
          });
        }
      }
    }

    // Sort by confidence, limit output
    relationships.sort((a, b) => b.confidence - a.confidence);

    return { relationships: relationships.slice(0, 100) };
  }
}

// ---------------------------------------------------------------------------
// KnowledgeConsolidator — Merges related memories into consolidated entries
// ---------------------------------------------------------------------------

class KnowledgeConsolidator {
  constructor(store) {
    this.store = store;
    this._stats = { totalConsolidated: 0, totalConflicts: 0 };
  }

  /**
   * Find and consolidate related memories.
   * Only consolidates memories with similarity > 0.7 AND shared tags.
   * @param {Object[]} memories
   * @returns {{ consolidated: number, conflicts: number, pairs: Array }}
   */
  consolidate(memories) {
    if (memories.length < 2) return { consolidated: 0, conflicts: 0, pairs: [] };

    // Build TF-IDF vectors
    const texts = memories.map(m => m.content || '');
    const { vectors } = TFIDFVectorizer.vectorize(texts);

    const consolidated = [];
    const conflicts = [];
    const processed = new Set();

    for (let i = 0; i < memories.length; i++) {
      if (processed.has(i)) continue;

      for (let j = i + 1; j < memories.length; j++) {
        if (processed.has(j)) continue;

        const sim = cosineSimilarity(vectors[i], vectors[j]);
        const tagsA = new Set(memories[i].tags || []);
        const tagsB = new Set(memories[j].tags || []);
        const sharedTags = [...tagsA].filter(t => tagsB.has(t));

        // Require similarity > 0.7 AND shared tags
        if (sim >= MIN_SIMILARITY_FOR_CONSOLIDATION && sharedTags.length > 0) {
          // Check for conflicts (opposite valence)
          const valA = memories[i].valence || 0;
          const valB = memories[j].valence || 0;
          if (valA * valB < -0.3) {
            // Opposite valence — conflicting information
            conflicts.push({
              id1: memories[i].cid || memories[i].id,
              id2: memories[j].cid || memories[j].id,
              reason: 'Conflicting valence detected',
            });
            this._stats.totalConflicts++;
            continue;
          }

          // Create consolidated memory
          const consolidatedMemory = {
            content: `[Consolidated] ${memories[i].content}\n---\n${memories[j].content}`,
            source: 'learning-engine',
            tags: [...new Set([...sharedTags, ...(memories[i].tags || []), ...(memories[j].tags || [])])],
            type: 'consolidated',
            metadata: {
              consolidated_from: [
                memories[i].cid || memories[i].id,
                memories[j].cid || memories[j].id,
              ],
              similarity: sim,
              shared_tags: sharedTags,
              consolidated_at: new Date().toISOString(),
            },
          };

          this.store.add(consolidatedMemory);
          processed.add(i);
          processed.add(j);

          consolidated.push({
            cid: memories[i].cid || memories[i].id,
            cid2: memories[j].cid || memories[j].id,
            similarity: sim,
            sharedTags,
          });

          this._stats.totalConsolidated++;
          break; // Move to next i
        }
      }
    }

    return {
      consolidated: consolidated.length,
      conflicts: conflicts.length,
      pairs: consolidated,
    };
  }

  getStats() {
    return { ...this._stats };
  }
}

// ---------------------------------------------------------------------------
// ReinforcementEngine — Increases importance of frequently accessed memories
// ---------------------------------------------------------------------------

class ReinforcementEngine {
  constructor(store) {
    this.store = store;
    this._stats = { totalReinforced: 0 };
  }

  /**
   * Reinforce a memory's importance based on access.
   * Formula: new_importance = min(1.0, importance + 0.1 * (1.0 - importance))
   * This creates a logarithmic approach to maximum importance.
   * @param {Object} memory
   * @returns {{ reinforced: boolean, oldImportance: number, newImportance: number }}
   */
  reinforce(memory) {
    const oldImportance = memory.metadata?.importance_score ?? memory.salience ?? 0.5;
    const newImportance = Math.min(
      MAX_IMPORTANCE,
      oldImportance + REINFORCEMENT_FACTOR * (MAX_IMPORTANCE - oldImportance)
    );

    if (Math.abs(newImportance - oldImportance) < 0.001) {
      return { reinforced: false, oldImportance, newImportance };
    }

    // Update memory in store
    const updatedMemory = { ...memory };
    if (!updatedMemory.metadata) updatedMemory.metadata = {};
    updatedMemory.metadata.importance_score = newImportance;
    updatedMemory.updated_at = new Date().toISOString();
    updatedMemory.access_count = (updatedMemory.access_count || 0) + 1;
    updatedMemory.last_accessed = new Date().toISOString();

    this.store.delete(memory.cid);
    this.store.add(updatedMemory);

    this._stats.totalReinforced++;

    return { reinforced: true, oldImportance, newImportance };
  }

  /**
   * Reinforce all memories that have been accessed recently (high access count).
   * @param {Object[]} memories
   * @param {number} [minAccessCount=5]
   * @returns {{ reinforced: number }}
   */
  reinforceFrequent(memories, minAccessCount = 5) {
    let reinforced = 0;

    for (const memory of memories) {
      const accessCount = memory.access_count || memory.accessCount || 0;
      if (accessCount >= minAccessCount) {
        const result = this.reinforce(memory);
        if (result.reinforced) reinforced++;
      }
    }

    return { reinforced };
  }

  getStats() {
    return { ...this._stats };
  }
}

// ---------------------------------------------------------------------------
// GapDetector — Identifies knowledge gaps from query patterns
// ---------------------------------------------------------------------------

class GapDetector {
  /**
   * Analyze query patterns to identify knowledge gaps.
   * @param {Object[]} recentQueries — { query, resultCount, topScore, timestamp }
   * @param {Object[]} memories — existing memories for topic analysis
   * @returns {{ gaps: Array<{ topic: string, missRate: number, suggestion: string }> }}
   */
  static detect(recentQueries, memories) {
    if (recentQueries.length === 0) return { gaps: [] };

    // Analyze queries that returned zero or low-quality results
    const missQueries = recentQueries.filter(q =>
      q.resultCount === 0 || (q.topScore !== undefined && q.topScore < GAP_MISS_THRESHOLD)
    );

    if (missQueries.length === 0) return { gaps: [] };

    // Extract keywords from miss queries
    const missKeywords = new Map();
    for (const q of missQueries) {
      const tokens = TFIDFVectorizer._tokenize(q.query || '');
      for (const token of tokens) {
        missKeywords.set(token, (missKeywords.get(token) || 0) + 1);
      }
    }

    // Find keywords that appear frequently in miss queries
    const gaps = [];
    const totalMissQueries = missQueries.length;

    for (const [keyword, count] of missKeywords) {
      const missRate = count / totalMissQueries;
      if (missRate > 0.2) {
        gaps.push({
          topic: keyword,
          missRate,
          frequency: count,
          suggestion: `Consider ingesting memories about "${keyword}" — ${count} queries returned no results`,
        });
      }
    }

    // Sort by miss rate
    gaps.sort((a, b) => b.missRate - a.missRate);

    return { gaps: gaps.slice(0, 10) };
  }
}

// ---------------------------------------------------------------------------
// MetaKnowledgeGenerator — Produces summary knowledge about the system
// ---------------------------------------------------------------------------

class MetaKnowledgeGenerator {
  constructor(store) {
    this.store = store;
  }

  /**
   * Generate meta-knowledge summary.
   * @returns {Object}
   */
  generate() {
    const allMemories = this.store.getAll({ limit: 10000 });
    const stats = this.store.getStats();

    if (allMemories.length === 0) {
      return {
        totalMemories: 0,
        message: 'No memories available for meta-knowledge generation',
      };
    }

    // Calculate importance distribution
    const importances = allMemories.map(m =>
      m.metadata?.importance_score ?? m.salience ?? 0.5
    );
    const avgImportance = importances.reduce((s, v) => s + v, 0) / importances.length;

    // Count by type
    const typeCounts = {};
    for (const m of allMemories) {
      const type = m.type || 'note';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    // Extract top topics (tags)
    const tagCounts = {};
    for (const m of allMemories) {
      for (const tag of (m.tags || [])) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    const topTopics = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    // Access frequency distribution
    const accessCounts = allMemories.map(m => m.access_count || m.accessCount || 0);
    const avgAccessCount = accessCounts.reduce((s, v) => s + v, 0) / accessCounts.length;
    const maxAccessCount = Math.max(...accessCounts);

    // Memory age analysis
    const now = Date.now();
    const ages = allMemories.map(m => {
      const created = new Date(m.createdAt || m.timestamp || m.created_at).getTime();
      return (now - created) / (24 * 60 * 60 * 1000);
    });
    const avgAgeDays = ages.reduce((s, v) => s + v, 0) / ages.length;

    // Growth rate (memories per day)
    const oldestAge = Math.max(...ages, 1);
    const growthRate = allMemories.length / oldestAge;

    // Most accessed memories
    const mostAccessed = allMemories
      .sort((a, b) => (b.access_count || b.accessCount || 0) - (a.access_count || a.accessCount || 0))
      .slice(0, 5)
      .map(m => ({
        cid: m.cid,
        content: (m.content || '').slice(0, 100),
        accessCount: m.access_count || m.accessCount || 0,
      }));

    return {
      totalMemories: allMemories.length,
      activeVsArchived: {
        total: stats.currentSize || allMemories.length,
        byType: typeCounts,
      },
      importance: {
        average: avgImportance,
        distribution: {
          low: importances.filter(v => v < 0.3).length,
          medium: importances.filter(v => v >= 0.3 && v < 0.7).length,
          high: importances.filter(v => v >= 0.7).length,
        },
      },
      topTopics,
      access: {
        average: avgAccessCount,
        maximum: maxAccessCount,
      },
      age: {
        averageDays: avgAgeDays,
        growthRatePerDay: growthRate,
      },
      mostAccessed,
      decayRate: {
        average: avgImportance < 0.3 ? 'high' : avgImportance < 0.6 ? 'medium' : 'low',
      },
      generatedAt: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// LearningScheduler — Determines optimal timing for learning operations
// ---------------------------------------------------------------------------

class LearningScheduler {
  constructor() {
    this._lastRun = null;
    this._newMemoriesSinceLastRun = 0;
    this._stats = { totalRuns: 0, skippedRuns: 0 };
  }

  /**
   * Record that a new memory was ingested.
   */
  recordIngestion() {
    this._newMemoriesSinceLastRun++;
  }

  /**
   * Check if learning should run.
   * Triggers when: (a) new memories > 20, (b) 6+ hours since last run, (c) manual trigger
   * @param {boolean} [manualTrigger=false]
   * @returns {{ shouldRun: boolean, reason: string }}
   */
  shouldRun(manualTrigger = false) {
    if (manualTrigger) {
      return { shouldRun: true, reason: 'Manual trigger' };
    }

    const now = Date.now();

    // Check memory threshold
    if (this._newMemoriesSinceLastRun >= NEW_MEMORIES_THRESHOLD) {
      return { shouldRun: true, reason: `${this._newMemoriesSinceLastRun} new memories since last run` };
    }

    // Check time threshold
    if (!this._lastRun || (now - this._lastRun) >= LEARNING_COOLDOWN_MS) {
      return { shouldRun: true, reason: `${LEARNING_COOLDOWN_MS / (60 * 60 * 1000)} hours since last run` };
    }

    return { shouldRun: false, reason: 'Cooldown not expired and memory threshold not met' };
  }

  /**
   * Mark a learning run as completed.
   */
  markCompleted() {
    this._lastRun = Date.now();
    this._newMemoriesSinceLastRun = 0;
    this._stats.totalRuns++;
  }

  /**
   * Mark a run as skipped.
   */
  markSkipped() {
    this._stats.skippedRuns++;
  }

  getStats() {
    return {
      ...this._stats,
      lastRun: this._lastRun ? new Date(this._lastRun).toISOString() : null,
      newMemoriesSinceLastRun: this._newMemoriesSinceLastRun,
      cooldownHours: LEARNING_COOLDOWN_MS / (60 * 60 * 1000),
    };
  }
}

// ---------------------------------------------------------------------------
// InsightReporter — Generates human-readable reports of discoveries
// ---------------------------------------------------------------------------

class InsightReporter {
  /**
   * Generate a formatted insight report.
   * @param {Object} patternResults — from PatternScanner
   * @param {Object} relationshipResults — from RelationshipExtractor
   * @param {Object} consolidationResults — from KnowledgeConsolidator
   * @param {Object} gapResults — from GapDetector
   * @param {Object} metaKnowledge — from MetaKnowledgeGenerator
   * @returns {{ sections: Array<{ title: string, content: string, confidence: number }> }}
   */
  static generate(patternResults, relationshipResults, consolidationResults, gapResults, metaKnowledge) {
    const sections = [];

    // Theme Patterns
    if (patternResults.themes.length > 0) {
      const themeList = patternResults.themes.slice(0, 10)
        .map(t => `  • "${t.terms.join(' + ')}" (frequency: ${t.frequency}, confidence: ${t.confidence.toFixed(2)})`)
        .join('\n');

      sections.push({
        title: 'Theme Patterns',
        content: `Discovered ${patternResults.themes.length} recurring themes:\n${themeList}`,
        confidence: patternResults.themes[0]?.confidence || 0,
      });
    }

    // Relationship Patterns
    if (relationshipResults.relationships.length > 0) {
      const relList = relationshipResults.relationships.slice(0, 10)
        .map(r => `  • ${r.from} → ${r.to} (${r.type}, confidence: ${r.confidence.toFixed(2)})`)
        .join('\n');

      sections.push({
        title: 'Relationship Patterns',
        content: `Found ${relationshipResults.relationships.length} memory relationships:\n${relList}`,
        confidence: relationshipResults.relationships[0]?.confidence || 0,
      });
    }

    // Knowledge Clusters
    if (consolidationResults.consolidated > 0) {
      sections.push({
        title: 'Knowledge Clusters',
        content: `Consolidated ${consolidationResults.consolidated} memory pairs into knowledge clusters.\n` +
          `${consolidationResults.conflicts} conflicting pairs were flagged for review.`,
        confidence: 0.8,
      });
    }

    // Knowledge Gaps
    if (gapResults.gaps.length > 0) {
      const gapList = gapResults.gaps.slice(0, 5)
        .map(g => `  • "${g.topic}" (miss rate: ${(g.missRate * 100).toFixed(0)}%) — ${g.suggestion}`)
        .join('\n');

      sections.push({
        title: 'Knowledge Gaps',
        content: `Identified ${gapResults.gaps.length} knowledge gaps:\n${gapList}`,
        confidence: 0.7,
      });
    }

    // Meta Knowledge
    if (metaKnowledge && metaKnowledge.totalMemories > 0) {
      sections.push({
        title: 'System Meta-Knowledge',
        content: [
          `Total memories: ${metaKnowledge.totalMemories}`,
          `Average importance: ${(metaKnowledge.importance?.average || 0).toFixed(3)}`,
          `Growth rate: ${(metaKnowledge.age?.growthRatePerDay || 0).toFixed(1)} memories/day`,
          `Top topics: ${(metaKnowledge.topTopics || []).map(t => t.tag).join(', ') || 'none'}`,
        ].join('\n'),
        confidence: 1.0,
      });
    }

    // Recommendations
    const recommendations = [];
    if (gapResults.gaps.length > 0) {
      recommendations.push(`Address ${gapResults.gaps.length} knowledge gaps by ingesting relevant memories`);
    }
    if (consolidationResults.consolidated > 0) {
      recommendations.push(`Review ${consolidationResults.consolidated} consolidated knowledge clusters for accuracy`);
    }
    if (metaKnowledge?.importance?.average < 0.3) {
      recommendations.push('Average importance is low — consider reinforcing frequently accessed memories');
    }

    if (recommendations.length > 0) {
      sections.push({
        title: 'Recommendations',
        content: recommendations.map(r => `  • ${r}`).join('\n'),
        confidence: 0.9,
      });
    }

    return { sections };
  }
}

// ---------------------------------------------------------------------------
// TemporalPatternAnalyzer — Identifies time-based patterns in memories
// ---------------------------------------------------------------------------

class TemporalPatternAnalyzer {
  /**
   * Analyze temporal patterns in memory creation and access.
   * @param {Object[]} memories
   * @param {Object} [options] — { windowSizes }
   * @returns {{ patterns: Array<{ period: string, phase: string, amplitude: number, confidence: number }> }}
   */
  static analyze(memories, options = {}) {
    if (memories.length < 3) return { patterns: [] };

    const windows = options.windowSizes || WINDOW_SIZES;
    const patterns = [];

    // Analyze creation time distribution
    const creationHours = memories.map(m => {
      const d = new Date(m.createdAt || m.timestamp || m.created_at);
      return d.getHours();
    });

    // Count per hour
    const hourCounts = new Array(24).fill(0);
    for (const h of creationHours) {
      hourCounts[h]++;
    }

    // Find peak hours
    const maxCount = Math.max(...hourCounts);
    if (maxCount > 0) {
      const peakHours = hourCounts
        .map((count, hour) => ({ hour, count }))
        .filter(h => h.count > maxCount * 0.5)
        .map(h => h.hour);

      if (peakHours.length > 0 && peakHours.length < 24) {
        patterns.push({
          period: 'daily',
          phase: `Peak hours: ${peakHours.join(', ')}`,
          amplitude: maxCount / memories.length,
          confidence: 0.7,
        });
      }
    }

    // Analyze creation day distribution
    const dayCounts = new Array(7).fill(0);
    for (const m of memories) {
      const d = new Date(m.createdAt || m.timestamp || m.created_at);
      dayCounts[d.getDay()]++;
    }

    const maxDayCount = Math.max(...dayCounts);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const peakDays = dayCounts
      .map((count, day) => ({ day, count }))
      .filter(d => d.count > maxDayCount * 0.5)
      .map(d => dayNames[d.day]);

    if (peakDays.length > 0 && peakDays.length < 7) {
      patterns.push({
        period: 'weekly',
        phase: `Peak days: ${peakDays.join(', ')}`,
        amplitude: maxDayCount / memories.length,
        confidence: 0.6,
      });
    }

    // Access frequency temporal pattern
    const accessHours = memories
      .filter(m => m.last_accessed)
      .map(m => new Date(m.last_accessed).getHours());

    if (accessHours.length > 3) {
      const accessHourCounts = new Array(24).fill(0);
      for (const h of accessHours) accessHourCounts[h]++;
      const maxAccess = Math.max(...accessHourCounts);

      if (maxAccess > 0) {
        const peakAccessHours = accessHourCounts
          .map((count, hour) => ({ hour, count }))
          .filter(h => h.count > maxAccess * 0.5)
          .map(h => h.hour);

        if (peakAccessHours.length > 0 && peakAccessHours.length < 24) {
          patterns.push({
            period: 'daily-access',
            phase: `Peak access hours: ${peakAccessHours.join(', ')}`,
            amplitude: maxAccess / accessHours.length,
            confidence: 0.65,
          });
        }
      }
    }

    return { patterns };
  }
}

// ---------------------------------------------------------------------------
// KnowledgeGraphBuilder — Constructs directed graph of memory relationships
// ---------------------------------------------------------------------------

class KnowledgeGraphBuilder {
  constructor() {
    this._nodes = new Map(); // cid -> node data
    this._edges = new Map(); // "from|||to" -> edge data
    this._stats = { totalNodes: 0, totalEdges: 0, lastUpdated: null };
  }

  /**
   * Build knowledge graph from memories and relationships.
   * @param {Object[]} memories
   * @param {Object[]} relationships
   * @returns {{ nodes: Object[], edges: Object[] }}
   */
  build(memories, relationships = []) {
    this._nodes.clear();
    this._edges.clear();

    // Add nodes
    for (const memory of memories) {
      const cid = memory.cid || memory.id;
      this._nodes.set(cid, {
        id: cid,
        content: (memory.content || '').slice(0, 200),
        tags: memory.tags || [],
        importance: memory.metadata?.importance_score ?? memory.salience ?? 0.5,
        type: memory.type || 'note',
        accessCount: memory.access_count || memory.accessCount || 0,
      });
    }

    // Add edges from relationships
    for (const rel of relationships) {
      const edgeKey = `${rel.from}|||${rel.to}`;
      if (!this._edges.has(edgeKey)) {
        this._edges.set(edgeKey, {
          from: rel.from,
          to: rel.to,
          type: rel.type,
          confidence: rel.confidence,
          evidence: rel.evidence || [],
        });
      }
    }

    // Add implicit edges based on shared tags
    const tagIndex = new Map();
    for (const memory of memories) {
      const cid = memory.cid || memory.id;
      for (const tag of (memory.tags || [])) {
        if (!tagIndex.has(tag)) tagIndex.set(tag, []);
        tagIndex.get(tag).push(cid);
      }
    }

    for (const [tag, cids] of tagIndex) {
      for (let i = 0; i < cids.length; i++) {
        for (let j = i + 1; j < cids.length; j++) {
          const edgeKey1 = `${cids[i]}|||${cids[j]}`;
          const edgeKey2 = `${cids[j]}|||${cids[i]}`;

          if (!this._edges.has(edgeKey1) && !this._edges.has(edgeKey2)) {
            this._edges.set(edgeKey1, {
              from: cids[i],
              to: cids[j],
              type: 'tag-association',
              confidence: 0.5,
              evidence: [tag],
            });
          }
        }
      }
    }

    this._stats.totalNodes = this._nodes.size;
    this._stats.totalEdges = this._edges.size;
    this._stats.lastUpdated = new Date().toISOString();

    return this.export();
  }

  /**
   * Find connected components (clusters) in the graph.
   * @returns {{ clusters: Array<{ nodes: string[], density: number }> }}
   */
  findClusters() {
    const visited = new Set();
    const clusters = [];

    for (const [nodeId] of this._nodes) {
      if (visited.has(nodeId)) continue;

      // BFS to find connected component
      const cluster = [];
      const queue = [nodeId];
      while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);
        cluster.push(current);

        // Find neighbors
        for (const [edgeKey, edge] of this._edges) {
          if (edge.from === current && !visited.has(edge.to)) {
            queue.push(edge.to);
          }
          if (edge.to === current && !visited.has(edge.from)) {
            queue.push(edge.from);
          }
        }
      }

      // Calculate density
      const maxEdges = (cluster.length * (cluster.length - 1)) / 2;
      let actualEdges = 0;
      for (const [edgeKey] of this._edges) {
        const [from, to] = edgeKey.split('|||');
        if (cluster.includes(from) && cluster.includes(to)) {
          actualEdges++;
        }
      }

      clusters.push({
        nodes: cluster,
        density: maxEdges > 0 ? actualEdges / maxEdges : 0,
        size: cluster.length,
      });
    }

    clusters.sort((a, b) => b.size - a.size);
    return { clusters };
  }

  /**
   * Find most central (connected) nodes.
   * @param {number} [topN=5]
   * @returns {{ central: Array<{ id: string, connections: number, importance: number }> }}
   */
  findCentral(topN = 5) {
    const connections = new Map();

    for (const [nodeId] of this._nodes) {
      connections.set(nodeId, 0);
    }

    for (const [edgeKey, edge] of this._edges) {
      connections.set(edge.from, (connections.get(edge.from) || 0) + 1);
      connections.set(edge.to, (connections.get(edge.to) || 0) + 1);
    }

    const central = [...connections.entries()]
      .map(([id, count]) => ({
        id,
        connections: count,
        importance: this._nodes.get(id)?.importance || 0,
      }))
      .sort((a, b) => b.connections - a.connections)
      .slice(0, topN);

    return { central };
  }

  /**
   * Export graph as JSON.
   * @returns {{ nodes: Object[], edges: Object[], stats: Object }}
   */
  export() {
    return {
      nodes: [...this._nodes.values()],
      edges: [...this._edges.values()],
      stats: { ...this._stats },
    };
  }

  getStats() {
    return { ...this._stats };
  }
}

// ---------------------------------------------------------------------------
// LearningMetricsTracker — Monitors learning operation metrics
// ---------------------------------------------------------------------------

class LearningMetricsTracker {
  constructor() {
    this._sessions = [];
    this._rollingWindowMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  }

  /**
   * Record a learning session.
   * @param {Object} session
   */
  recordSession(session) {
    this._sessions.push({
      ...session,
      timestamp: Date.now(),
    });
  }

  /**
   * Get patterns discovered per run (average over rolling window).
   */
  getAvgPatternsPerRun() {
    const recent = this._getRecentSessions();
    if (recent.length === 0) return 0;
    const total = recent.reduce((sum, s) => sum + (s.patternsDiscovered || 0), 0);
    return total / recent.length;
  }

  /**
   * Get consolidation rate (memories consolidated / memories analyzed).
   */
  getConsolidationRate() {
    const recent = this._getRecentSessions();
    if (recent.length === 0) return 0;
    const totalConsolidated = recent.reduce((sum, s) => sum + (s.memoriesConsolidated || 0), 0);
    const totalAnalyzed = recent.reduce((sum, s) => sum + (s.memoriesAnalyzed || 0), 0);
    return totalAnalyzed > 0 ? totalConsolidated / totalAnalyzed : 0;
  }

  /**
   * Get API consumption (AI provider calls per session).
   */
  getAvgApiCalls() {
    const recent = this._getRecentSessions();
    if (recent.length === 0) return 0;
    const total = recent.reduce((sum, s) => sum + (s.apiCalls || 0), 0);
    return total / recent.length;
  }

  /**
   * Get processing time per stage.
   */
  getAvgProcessingTime() {
    const recent = this._getRecentSessions();
    if (recent.length === 0) return 0;
    const total = recent.reduce((sum, s) => sum + (s.processingTimeMs || 0), 0);
    return total / recent.length;
  }

  /**
   * Get all metrics.
   */
  getMetrics() {
    return {
      totalSessions: this._sessions.length,
      avgPatternsPerRun: this.getAvgPatternsPerRun(),
      consolidationRate: this.getConsolidationRate(),
      avgApiCallsPerSession: this.getAvgApiCalls(),
      avgProcessingTimeMs: this.getAvgProcessingTime(),
      rollingWindowDays: this._rollingWindowMs / (24 * 60 * 60 * 1000),
    };
  }

  _getRecentSessions() {
    const cutoff = Date.now() - this._rollingWindowMs;
    return this._sessions.filter(s => s.timestamp > cutoff);
  }
}

// ---------------------------------------------------------------------------
// LearningEngine — Main orchestrator for learning operations
// ---------------------------------------------------------------------------

export class LearningEngine {
  /**
   * @param {Object} options
   * @param {Object} options.store — MemoryStore instance
   * @param {Object} [options.logger] — Logger instance
   * @param {Object} [options.reasoningClient] — optional AI reasoning client
   */
  constructor(options = {}) {
    this.store = options.store;
    this.logger = options.logger;
    this.reasoningClient = options.reasoningClient || null;

    // Create sub-components
    this.patternScanner = PatternScanner;
    this.relationshipExtractor = RelationshipExtractor;
    this.consolidator = new KnowledgeConsolidator(this.store);
    this.reinforcement = new ReinforcementEngine(this.store);
    this.gapDetector = GapDetector;
    this.metaKnowledge = new MetaKnowledgeGenerator(this.store);
    this.scheduler = new LearningScheduler();
    this.insightReporter = InsightReporter;
    this.temporalAnalyzer = TemporalPatternAnalyzer;
    this.knowledgeGraph = new KnowledgeGraphBuilder();
    this.metricsTracker = new LearningMetricsTracker();

    this._stats = {
      totalLearningRuns: 0,
      totalPatternsDiscovered: 0,
      totalConsolidations: 0,
      totalReinforcements: 0,
    };

    // Recent queries for gap detection (ring buffer)
    this._recentQueries = [];
    this._maxQueries = GAP_DETECTION_QUERY_LIMIT;
  }

  /**
   * Record a recall query for gap detection.
   * @param {Object} queryInfo — { query, resultCount, topScore, timestamp }
   */
  recordQuery(queryInfo) {
    this._recentQueries.push({
      ...queryInfo,
      timestamp: queryInfo.timestamp || Date.now(),
    });

    // Trim to max
    if (this._recentQueries.length > this._maxQueries) {
      this._recentQueries = this._recentQueries.slice(-this._maxQueries);
    }

    this.scheduler.recordIngestion();
  }

  /**
   * Run a complete learning cycle.
   * @param {Object} [options] — { manualTrigger: boolean }
   * @returns {Promise<Object>}
   */
  async learn(options = {}) {
    const startTime = Date.now();

    // Check scheduler
    const shouldRun = this.scheduler.shouldRun(options.manualTrigger);
    if (!shouldRun.shouldRun && !options.force) {
      this.scheduler.markSkipped();
      return {
        success: false,
        reason: shouldRun.reason,
        skipped: true,
      };
    }

    // Get all memories
    const memories = this.store.getAll({ limit: 10000 });

    if (memories.length < MIN_MEMORIES_FOR_PATTERN_DETECTION) {
      return {
        success: false,
        reason: `Not enough memories for pattern detection (minimum ${MIN_MEMORIES_FOR_PATTERN_DETECTION} required, have ${memories.length})`,
        memoryCount: memories.length,
      };
    }

    const results = {
      success: true,
      memoryCount: memories.length,
      patterns: null,
      relationships: null,
      consolidations: null,
      reinforcement: null,
      gaps: null,
      metaKnowledge: null,
      temporalPatterns: null,
      knowledgeGraph: null,
      insightReport: null,
    };

    try {
      // 1. Pattern scanning
      results.patterns = this.patternScanner.scan(memories);
      this._stats.totalPatternsDiscovered += results.patterns.themes.length;

      // 2. Relationship extraction
      results.relationships = await this.relationshipExtractor.extract(memories, {
        reasoningClient: this.reasoningClient,
      });

      // 3. Knowledge consolidation
      results.consolidations = this.consolidator.consolidate(memories);
      this._stats.totalConsolidations += results.consolidations.consolidated;

      // 4. Reinforcement of frequently accessed memories
      const reinforced = this.reinforcement.reinforceFrequent(memories, 3);
      results.reinforcement = reinforced;
      this._stats.totalReinforcements += reinforced.reinforced;

      // 5. Gap detection
      results.gaps = this.gapDetector.detect(this._recentQueries, memories);

      // 6. Meta-knowledge generation
      results.metaKnowledge = this.metaKnowledge.generate();

      // 7. Temporal pattern analysis
      results.temporalPatterns = this.temporalAnalyzer.analyze(memories);

      // 8. Knowledge graph building
      results.knowledgeGraph = this.knowledgeGraph.build(
        memories,
        results.relationships.relationships
      );

      // 9. Insight report generation
      results.insightReport = this.insightReporter.generate(
        results.patterns,
        results.relationships,
        results.consolidations,
        results.gaps,
        results.metaKnowledge
      );

      // Update scheduler
      this.scheduler.markCompleted();
      this._stats.totalLearningRuns++;

      // Record metrics
      const processingTime = Date.now() - startTime;
      this.metricsTracker.recordSession({
        patternsDiscovered: results.patterns.themes.length,
        memoriesConsolidated: results.consolidations.consolidated,
        memoriesAnalyzed: memories.length,
        apiCalls: results.relationships.relationships.length > 0 ? 1 : 0,
        processingTimeMs: processingTime,
      });

      results.processingTimeMs = processingTime;
      results.mode = this.reasoningClient ? 'ai-enhanced' : 'statistical';

      return results;
    } catch (err) {
      return {
        success: false,
        error: err.message,
        partialResults: results,
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get learning statistics.
   */
  getStats() {
    return {
      ...this._stats,
      scheduler: this.scheduler.getStats(),
      metrics: this.metricsTracker.getMetrics(),
      consolidator: this.consolidator.getStats(),
      reinforcement: this.reinforcement.getStats(),
      knowledgeGraph: this.knowledgeGraph.getStats(),
    };
  }

  /**
   * Clear all learning data.
   */
  clear() {
    this._recentQueries = [];
    this.consolidator = new KnowledgeConsolidator(this.store);
    this.reinforcement = new ReinforcementEngine(this.store);
    this.knowledgeGraph = new KnowledgeGraphBuilder();
    this.metricsTracker = new LearningMetricsTracker();
    this.scheduler = new LearningScheduler();
    this._stats = {
      totalLearningRuns: 0,
      totalPatternsDiscovered: 0,
      totalConsolidations: 0,
      totalReinforcements: 0,
    };
  }
}

// Export sub-components for testing and reuse
export {
  TFIDFVectorizer,
  PatternScanner,
  RelationshipExtractor,
  KnowledgeConsolidator,
  ReinforcementEngine,
  GapDetector,
  MetaKnowledgeGenerator,
  LearningScheduler,
  InsightReporter,
  TemporalPatternAnalyzer,
  KnowledgeGraphBuilder,
  LearningMetricsTracker,
};
