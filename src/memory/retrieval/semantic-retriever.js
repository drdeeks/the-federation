import fs from "fs/promises";
import path from "path";

let Pipeline = null;
try {
  const transformers = await import("@xenova/transformers");
  Pipeline = transformers.pipeline;
} catch {
  // Optional dependency — semantic search disabled if not installed
}

export class SemanticSearch {
  constructor(workspace) {
    this.workspace = workspace || process.cwd();
    this.vectorsDir = path.join(this.workspace, "knowledge", "vectors");
    this.embedder = null;
    this.vectors = new Map();
  }

  async init() {
    await fs.mkdir(this.vectorsDir, { recursive: true });
    try {
      const raw = await fs.readFile(path.join(this.vectorsDir, "vectors.json"), "utf-8");
      const data = JSON.parse(raw);
      for (const [id, entry] of Object.entries(data)) {
        this.vectors.set(id, entry);
      }
    } catch {}
  }

  async loadEmbedder() {
    if (this.embedder) return this.embedder;
    if (!Pipeline) {
      throw new Error("Semantic search requires @xenova/transformers. Install with: npm install @xenova/transformers");
    }
    this.embedder = await Pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    return this.embedder;
  }

  async embed(text) {
    const pipe = await this.loadEmbedder();
    const output = await pipe(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  }

  cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async indexDocument(docId, text, metadata = {}) {
    const chunks = [];
    const chunkSize = 3500;
    const overlap = 350;

    if (text.length <= chunkSize) {
      chunks.push({ id: docId, text, metadata });
    } else {
      let start = 0;
      let i = 0;
      while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push({
          id: `${docId}:chunk-${i}`,
          text: text.slice(start, end),
          metadata: { ...metadata, parent: docId, chunkIndex: i },
        });
        start = end - overlap;
        i++;
        if (start + overlap >= text.length) break;
      }
    }

    for (const chunk of chunks) {
      const embedding = await this.embed(chunk.text);
      this.vectors.set(chunk.id, {
        embedding,
        text: chunk.text.slice(0, 200),
        metadata: chunk.metadata,
      });
    }

    return chunks.length;
  }

  async save() {
    const data = {};
    for (const [id, entry] of this.vectors) {
      data[id] = entry;
    }
    await fs.writeFile(
      path.join(this.vectorsDir, "vectors.json"),
      JSON.stringify(data)
    );
  }

  async search(query, limit = 10) {
    const queryEmbedding = await this.embed(query);
    const results = [];

    for (const [id, entry] of this.vectors) {
      const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
      results.push({
        id,
        score,
        text: entry.text,
        metadata: entry.metadata,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  async hybridSearch(query, keywordResults, limit = 10) {
    const semanticResults = await this.search(query, limit * 2);

    const rrf = new Map();
    const k = 60;

    for (let i = 0; i < keywordResults.length; i++) {
      const id = keywordResults[i].docId || keywordResults[i].id;
      const score = 1 / (k + i + 1);
      rrf.set(id, (rrf.get(id) || 0) + score);
    }

    for (let i = 0; i < semanticResults.length; i++) {
      const id = semanticResults[i].metadata?.parent || semanticResults[i].id;
      const score = 1 / (k + i + 1);
      rrf.set(id, (rrf.get(id) || 0) + score);
    }

    const sorted = [...rrf.entries()].sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, limit).map(([id, score]) => ({
      id,
      rrfScore: score,
      text: this.vectors.get(id)?.text || "",
      metadata: this.vectors.get(id)?.metadata || {},
    }));
  }

  status() {
    return {
      vectors: this.vectors.size,
      semanticAvailable: !!Pipeline,
      vectorsDir: this.vectorsDir,
    };
  }
}
