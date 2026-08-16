/**
 * Memory Agent Orchestrator — wraps shared/memory engines for the console
 *
 * Provides a clean API over the shared/memory engine for:
 * - Ingestion
 * - Recall
 * - Forgetting
 * - Learning
 * - Tier routing (Working, Episodic, Semantic, Identity)
 */
import { MemoryStore, EmbeddingEngine, RecallEngine, ForgetEngine, LearningEngine, IngestionEngine } from '../../shared/memory/index.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MemoryAgent {
  constructor(options = {}) {
    const snapshotDir = options.snapshotDir || join(__dirname, '../../../data/memory');
    this.store = new MemoryStore({ snapshotPath: join(snapshotDir, 'memory.json') });
    this.embeddingEngine = new EmbeddingEngine({ backend: 'local', dimensions: 384 });
    this.recallEngine = new RecallEngine({ store: this.store, embeddingEngine: this.embeddingEngine });
    this.forgetEngine = new ForgetEngine({ store: this.store, archiveStore: new MemoryStore({ snapshotPath: join(snapshotDir, 'archive.json') }) });
    this.learningEngine = new LearningEngine({ store: this.store, embeddingEngine: this.embeddingEngine });
    this.ingestionEngine = new IngestionEngine({ store: this.store, embeddingEngine: this.embeddingEngine });

    // Tier routing (simplified - maps to shared/memory store)
    this.tiers = {
      working: 'working',
      episodic: 'episodic',
      semantic: 'semantic',
      identity: 'identity',
    };
  }

  async ingest(data, options = {}) {
    const result = this.store.add({
      content: data.content,
      tags: data.tags || [],
      type: data.type || 'note',
      tier: data.tier || 'working',
      agentId: options.agentId,
    });
    return { success: true, memory: { cid: result.cid, ...data, tier: data.tier || 'working' } };
  }

  listMemories(options = {}) {
    const memories = this.store.getAll?.() || [];
    return { memories: memories.slice(options.offset, options.offset + options.limit), meta: { total: memories.length } };
  }

  getMemory(id) {
    return this.store.get?.(id);
  }

  updateMemory(id, updates) {
    const memory = this.store.get?.(id);
    if (!memory) return { success: false, error: 'Not found' };
    // In a real impl, update the store
    return { success: true, memory: { ...memory, ...updates } };
  }

  async deleteMemory(id, hard = false) {
    this.store.remove(id);
    return { success: true, archive: { cid: id, deleted: true } };
  }

  async recall(query, options = {}) {
    const result = await this.recallEngine.recall(query, options);
    return result;
  }

  async forget(cid, options = {}) {
    return this.forgetEngine.forget(cid, options);
  }

  async recover(cid) {
    return this.forgetEngine.recover(cid);
  }

  async learn(options = {}) {
    return this.learningEngine.learn(options);
  }

  getStats() {
    const storeStats = this.store.getStats?.() || {};
    return {
      store: storeStats,
      tiers: this.tiers,
      timestamp: new Date().toISOString(),
    };
  }

  async saveSnapshot() {
    return this.store.saveSnapshot?.();
  }

  async loadSnapshot() {
    return this.store.loadSnapshot?.();
  }
}

export { MemoryAgent };
export default MemoryAgent;