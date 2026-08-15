import fs from "fs/promises";
import fssync from "fs";
import path from "path";
import { parseFrontmatter } from "./frontmatter.js";

// ─── Agent-internal exclusion ────────────────────────────────────────────────
//
// The indexer indexes ONLY the user-supplied informational corpus (docs, links,
// examples the user gives the agent). The agent's OWN files — its identity,
// its habits, its memory, its knowledge graph — are never indexed as corpus.
// They live in dedicated dirs and are excluded here.
//
// Identity/config filenames vary by runtime. The defaults below are generic;
// supply AGENT_INTERNAL_FILES (comma-separated) to match a different
// convention rather than hardcoding any one runtime's names here.

const DEFAULT_AGENT_INTERNAL_FILES = [
  "identity.md", "memory.md", "user.md", "tools.md",
  "config.yaml", "config.yml",
  "readme.md", "changelog.md",
];

const AGENT_INTERNAL_FILES = new Set(
  (process.env.AGENT_INTERNAL_FILES
    ? process.env.AGENT_INTERNAL_FILES.split(",")
    : DEFAULT_AGENT_INTERNAL_FILES
  ).map((n) => n.trim().toLowerCase()).filter(Boolean)
);

const AGENT_INTERNAL_DIRS = new Set([
  ".agent", "habits", "memory", "knowledge", ".secrets",
  "node_modules", ".git",
]);

function isAgentInternal(name) {
  return AGENT_INTERNAL_FILES.has(name.toLowerCase());
}

// Default location of the user-supplied corpus (self-resolving).
function defaultCorpus(workspace) {
  return path.join(workspace || process.cwd(), "corpus");
}

// ─── Supported File Extensions ──────────────────────────────────────────────

const EXTENSIONS = {
  // Documentation
  markdown:   [".md", ".mdx", ".mdown", ".markdown"],
  text:       [".txt", ".text", ".rst", ".adoc", ".asciidoc", ".org", ".tex", ".latex"],
  wiki:       [".wiki", ".mediawiki", ".dokuwiki", ".tiddlywiki"],

  // Config / Data
  yaml:       [".yaml", ".yml"],
  json:       [".json", ".jsonl", ".json5", ".ndjson", ".geojson"],
  toml:       [".toml", ".ini", ".cfg", ".conf"],
  xml:        [".xml", ".xaml", ".svg", ".html", ".htm", ".xhtml"],
  csv:        [".csv", ".tsv", ".psv"],

  // Code (indexable as documentation)
  code:       [".py", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
               ".sh", ".bash", ".zsh", ".fish",
               ".rb", ".go", ".rs", ".java", ".kt", ".swift",
               ".c", ".cpp", ".h", ".hpp", ".cs",
               ".sql", ".r", ".lua", ".perl", ".pl",
               ".vim", ".el", ".lisp", ".clj"],

  // Agent / AI specific
  agent:      [".agent", ".skill", ".hook", ".prompt", ".template"],
  identity:   ["IDENTITY.md", "MEMORY.md", "USER.md", "TOOLS.md"],

  // Research / Notes
  research:   [".bib", ".enw", ".ris", ".endnote"],
  notebook:   [".ipynb", ".jl"],
  canvas:     [".canvas"],
};

// Flat list for indexing
const ALL_EXTENSIONS = Object.values(EXTENSIONS).flat();

// Extensions that are code (for category inference)
const CODE_EXTENSIONS = new Set(EXTENSIONS.code);

// Extensions that are config/data
const CONFIG_EXTENSIONS = new Set([
  ...EXTENSIONS.yaml, ...EXTENSIONS.json, ...EXTENSIONS.toml,
  ...EXTENSIONS.xml, ...EXTENSIONS.csv,
]);

// ─── Category Rules ─────────────────────────────────────────────────────────

const CATEGORY_RULES = [
  // By filename
  { pattern: /IDENTITY/i, category: "identity" },
  { pattern: /TOOLS|USER\.md/i, category: "agent_config" },
  { pattern: /MEMORY|JOURNAL|LOG/i, category: "memory" },
  { pattern: /README|CHANGELOG|LICENSE|CONTRIBUTING/i, category: "documentation" },
  { pattern: /TODO|TASKS|BACKLOG/i, category: "task_list" },
  { pattern: /SKILL|TUTORIAL|GUIDE|HOWTO|LEARN/i, category: "skill" },

  // By path pattern
  { pattern: /daily|journal|log/i, category: "daily_note" },
  { pattern: /transcript|session|conversation/i, category: "transcript" },
  { pattern: /blog|post|article/i, category: "blog" },
  { pattern: /experiment|spike|research/i, category: "experiment" },
  { pattern: /knowledge|entity|person|company/i, category: "knowledge_graph" },
  { pattern: /lesson|pattern|decision|learning/i, category: "long_term" },
  { pattern: /spec|rfc|adr|decision/i, category: "spec" },
  { pattern: /doc|docs|reference/i, category: "documentation" },
  { pattern: /config|settings|env/i, category: "config" },
  { pattern: /test|spec|__tests__/i, category: "test" },
  { pattern: /skill|hook|prompt|template/i, category: "agent_skill" },

  // By content (first 500 chars)
  { pattern: /^---\n[\s\S]*?type:\s*person/i, category: "knowledge_graph" },
  { pattern: /^---\n[\s\S]*?tags?:\s*\[/i, category: "tagged" },
];

function inferCategory(filePath, content) {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(filePath) || rule.pattern.test(content.slice(0, 500))) {
      return rule.category;
    }
  }
  return "document";
}

// ─── File Type Discovery ─────────────────────────────────────────────────────

function isIndexable(fileName, extensions) {
  const lower = fileName.toLowerCase();

  // Exact-name matches (identity.md, llms.txt, etc.). All entries MUST be
  // lowercase — this Set is tested against a lowercased filename, so a
  // mixed-case entry silently never matches.
  const EXACT_NAMES = new Set([
    "llms.txt", "llms-full.txt", "agent.md",
    "identity.md", "user.md",
    "tools.md", "memory.md", "system.md",
    ".agent", ".skill", ".hook", ".prompt", ".template",
  ]);
  if (EXACT_NAMES.has(lower)) return true;

  // Never index the agent's own identity/memory files as corpus.
  if (isAgentInternal(lower)) return false;

  const ext = path.extname(lower);
  return extensions.includes(ext);
}

// ─── Link / Reference Extraction ─────────────────────────────────────────────
//
// The agent should document any links to informational docs so they can also
// be indexed. We extract: markdown links, bare URLs, wiki-style [[links]],
// Wikilink ![[embeds]], and <doc:...> / @import style references.

const LINK_PATTERNS = [
  { type: "markdown", re: /\[[^\]]*\]\(\s*([^)\s]+)\s*\)/g },          // [text](url)
  { type: "url",      re: /(?:^|[\s(])(https?:\/\/[^\s)\]]+)/gi },     // bare http(s)
  { type: "wiki",     re: /\[\[\s*([^\]|#]+)(?:[|#][^\]]*)?\s*\]\]/g },// [[Page]] / [[Page|alias]]
  { type: "embed",    re: /!\[\[\s*([^\]|#]+)(?:[|#][^\]]*)?\s*\]\]/g },// ![[Page]]
  { type: "docref",   re: /(?:doc|file|ref|see|import|include)\s*[:=]\s*["']?([^\s"'\)]+)/gi },
  { type: "arxiv",    re: /(?:arxiv\.org\/abs\/|arXiv:)(\d+\.\d+)/gi },// arxiv ids
];

function extractLinks(content, basePath = null) {
  const found = [];
  const seen = new Set();
  for (const { type, re } of LINK_PATTERNS) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      let target = m[1].trim().replace(/[.,;:]$/, "");
      if (!target || seen.has(target)) continue;
      seen.add(target);

      // Resolve relative file links against the document's directory
      let resolved = null;
      if (basePath && !/^https?:\/\//i.test(target) && !target.startsWith("@")) {
        const abs = path.resolve(path.dirname(basePath), target);
        if (fssync.existsSync(abs)) resolved = abs;
      }

      found.push({
        type,
        target,
        resolvedPath: resolved,
        external: /^https?:\/\//i.test(target) || type === "arxiv",
      });
    }
  }
  return found;
}

// Parse llms.txt (https://llmstxt.org) — a markdown file listing linked docs
function parseLlmsTxt(content, baseDir) {
  const details = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*[-*]\s*\[([^\]]+)\]\(([^)]+)\)\s*[:\-]?\s*(.*)$/);
    if (m) {
      const [, title, url, description] = m;
      details.push({
        title: title.trim(),
        url: url.trim(),
        description: description.trim(),
        external: /^https?:\/\//i.test(url.trim()),
        resolvedPath: baseDir && !/^https?:\/\//i.test(url.trim())
          ? path.resolve(baseDir, url.trim()) : null,
      });
    }
  }
  return details;
}

function extractTags(content, filePath) {
  const tags = new Set();
  const basename = path.basename(filePath, path.extname(filePath));
  tags.add(basename.toLowerCase().replace(/[_-]/g, " "));

  const tagPatterns = [
    /tags?:\s*\[([^\]]+)\]/i,
    /#\w+/g,
  ];

  for (const pattern of tagPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        const cleaned = match.replace(/^tags?:\s*\[|]$/g, "").replace(/#/g, "").trim();
        cleaned.split(/[,\s]+/).forEach((t) => {
          if (t.length > 1) tags.add(t.toLowerCase());
        });
      }
    }
  }

  return [...tags].slice(0, 20);
}

function chunkText(text, chunkSize = 3500, overlap = 350) {
  if (text.length <= chunkSize) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start + overlap >= text.length) break;
  }
  return chunks;
}

export class DocumentIndexer {
  constructor(workspace) {
    this.workspace = workspace || process.cwd();
    this.knowledgeDir = path.join(this.workspace, "knowledge");
    this.dbPath = path.join(this.knowledgeDir, "index.json");
    this.yamlDir = path.join(this.knowledgeDir, "documents");
    this.index = { documents: {}, links: {}, meta: { lastIndexed: null } };
  }

  async init() {
    await fs.mkdir(this.knowledgeDir, { recursive: true });
    await fs.mkdir(this.yamlDir, { recursive: true });
    try {
      const raw = await fs.readFile(this.dbPath, "utf-8");
      this.index = JSON.parse(raw);
    } catch {
      this.index = { documents: {}, links: {}, meta: { lastIndexed: null } };
    }
  }

  async save() {
    this.index.meta.lastIndexed = new Date().toISOString();
    await fs.writeFile(this.dbPath, JSON.stringify(this.index, null, 2));
  }

  async indexFile(filePath, options = {}) {
    const absPath = path.resolve(filePath);
    const content = await fs.readFile(absPath, "utf-8");
    const { data: existingFrontmatter, content: body } = parseFrontmatter(content);
    const stat = await fs.stat(absPath);
    const contentHash = String(stat.mtimeMs);

    const docId = path.relative(this.workspace, absPath)
      .replace(/[\/\\]/g, "-")
      .replace(/\.[^.]+$/, "");

    if (this.index.documents[docId]?.contentHash === contentHash) {
      return { status: "skipped", docId };
    }

    const category = options.category || inferCategory(absPath, body);
    const tags = options.tags || extractTags(body, absPath);
    const title = existingFrontmatter.title || path.basename(absPath, path.extname(absPath));

    const frontmatter = {
      id: docId,
      title,
      category,
      tags,
      type: existingFrontmatter.type || category,
      source: path.relative(this.workspace, absPath),
      indexed_at: new Date().toISOString(),
      updated_at: stat.mtime.toISOString(),
    };

    const yamlContent = `---\n${Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n")}\n---\n\n${body}`;

    const yamlPath = path.join(this.yamlDir, `${docId}.yaml`);
    await fs.writeFile(yamlPath, yamlContent);

    const chunks = chunkText(body);

    // Document any links / references to informational docs so they can
    // also be indexed & retrieved.
    const links = extractLinks(body, absPath);
    const basename = path.basename(absPath).toLowerCase();

    // llms.txt / agents.md: parse as a curated reference manifest
    let llmsRefs = [];
    if (basename === "llms.txt" || basename === "llms-full.txt" || basename === "agents.md") {
      llmsRefs = parseLlmsTxt(body, path.dirname(absPath));
      for (const ref of llmsRefs) {
        this.index.links[ref.url] = {
          title: ref.title,
          category: "reference",
          description: ref.description,
          external: ref.external,
          sourceDoc: docId,
          addedAt: new Date().toISOString(),
        };
      }
    }

    this.index.documents[docId] = {
      path: path.relative(this.workspace, absPath),
      title,
      category,
      tags,
      contentHash,
      indexedAt: new Date().toISOString(),
      chunkCount: chunks.length,
      links: links.map((l) => l.target),
      linkCount: links.length,
      chunks: chunks.map((c, i) => ({ id: `${docId}:chunk-${i}`, content: c })),
    };

    // Record every extracted link centrally (the agent documents these too)
    for (const l of links) {
      const key = l.target;
      if (!this.index.links[key]) {
        this.index.links[key] = {
          type: l.type,
          category: "reference",
          external: l.external,
          sourceDoc: docId,
          resolvedPath: l.resolvedPath || null,
          addedAt: new Date().toISOString(),
        };
      }
    }

    return { status: "indexed", docId, chunks: chunks.length, links: links.length };
  }

  async indexDirectory(dirPath, options = {}) {
    const extensions = options.extensions || ALL_EXTENSIONS;
    const followLinks = options.followLinks !== false; // default: document + index linked docs
    const absDir = path.resolve(dirPath);
    const results = { indexed: 0, skipped: 0, errors: 0, links: 0 };

    const seen = new Set();

    const walk = async (dir) => {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".")
              && !AGENT_INTERNAL_DIRS.has(entry.name)) {
            await walk(fullPath);
          }
        } else if (isIndexable(entry.name, extensions)) {
          if (seen.has(fullPath)) continue;
          seen.add(fullPath);
          try {
            const result = await this.indexFile(fullPath, options);
            if (result.status === "indexed") results.indexed++;
            else results.skipped++;

            // Follow local links → index referenced informational docs too
            if (followLinks && result.links) {
              for (const doc of Object.values(this.index.documents)) {
                if (!doc.links) continue;
                for (const link of doc.links) {
                  const resolved = this.index.links[link]?.resolvedPath;
                  if (resolved && fssync.existsSync(resolved) && !seen.has(resolved)) {
                    seen.add(resolved);
                    try {
                      const r = await this.indexFile(resolved, options);
                      if (r.status === "indexed") results.links++;
                    } catch { /* ignore unreadable refs */ }
                  }
                }
              }
            }
          } catch (err) {
            results.errors++;
          }
        }
      }
    };

    await walk(absDir);
    await this.save();
    return results;
  }

  async search(query, options = {}) {
    const limit = options.limit || 10;
    const category = options.category;
    const queryLower = query.toLowerCase();

    const results = [];
    for (const [docId, doc] of Object.entries(this.index.documents)) {
      if (category && doc.category !== category) continue;

      for (const chunk of doc.chunks || []) {
        const contentLower = chunk.content.toLowerCase();
        const idx = contentLower.indexOf(queryLower);
        if (idx !== -1) {
          const start = Math.max(0, idx - 100);
          const end = Math.min(chunk.content.length, idx + query.length + 100);
          const snippet = (start > 0 ? "..." : "") +
            chunk.content.slice(start, end) +
            (end < chunk.content.length ? "..." : "");

          results.push({
            docId,
            path: doc.path,
            title: doc.title,
            category: doc.category,
            tags: doc.tags,
            snippet,
            chunkId: chunk.id,
          });
          break;
        }
      }
    }

    return results.slice(0, limit);
  }

  async addLink(url, title, category = "reference") {
    this.index.links[url] = { title, category, addedAt: new Date().toISOString() };
    await this.save();
    return { status: "added", url };
  }

  async removeLink(url) {
    delete this.index.links[url];
    await this.save();
    return { status: "removed", url };
  }

  listDocuments(category = null) {
    return Object.entries(this.index.documents)
      .filter(([_, doc]) => !category || doc.category === category)
      .map(([id, doc]) => ({
        id,
        path: doc.path,
        title: doc.title,
        category: doc.category,
        tags: doc.tags,
        chunks: doc.chunkCount,
        indexedAt: doc.indexedAt,
      }));
  }

  status() {
    return {
      documents: Object.keys(this.index.documents).length,
      chunks: Object.values(this.index.documents).reduce((sum, d) => sum + (d.chunkCount || 0), 0),
      links: Object.keys(this.index.links).length,
      lastIndexed: this.index.meta.lastIndexed,
      knowledgeDir: this.knowledgeDir,
    };
  }
}
