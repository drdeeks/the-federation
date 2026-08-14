import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";

export class DailyNotes {
  constructor(workspace) {
    this.workspace = workspace || process.cwd();
    this.dailyDir = path.join(this.workspace, "memory", "daily");
  }

  async init() {
    await fs.mkdir(this.dailyDir, { recursive: true });
  }

  _todayFile() {
    const date = new Date().toISOString().split("T")[0];
    return path.join(this.dailyDir, `${date}.yaml`);
  }

  async log(entry, options = {}) {
    const filePath = this._todayFile();
    const now = new Date().toISOString();

    let data;
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      data = yaml.load(raw) || {};
    } catch {
      data = {
        date: now.split("T")[0],
        created_at: now,
        entries: [],
      };
    }

    data.entries.push({
      timestamp: now,
      content: entry,
      tags: options.tags || [],
      category: options.category || "general",
    });
    data.updated_at = now;

    await fs.writeFile(filePath, yaml.dump(data, { lineWidth: -1 }));
    return { status: "logged", file: filePath };
  }

  async getToday() {
    try {
      const raw = await fs.readFile(this._todayFile(), "utf-8");
      return yaml.load(raw) || {};
    } catch {
      return { date: new Date().toISOString().split("T")[0], entries: [] };
    }
  }

  async getRange(startDate, endDate) {
    const results = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const filePath = path.join(this.dailyDir, `${dateStr}.yaml`);
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        results.push(yaml.load(raw) || {});
      } catch {}
    }

    return results;
  }

  async listNotes() {
    const notes = [];
    try {
      const files = await fs.readdir(this.dailyDir);
      const yamlFiles = files.filter((f) => f.endsWith(".yaml")).sort().reverse();
      for (const f of yamlFiles) {
        const raw = await fs.readFile(path.join(this.dailyDir, f), "utf-8");
        const data = yaml.load(raw) || {};
        notes.push({
          date: data.date || f.replace(".yaml", ""),
          file: path.join(this.dailyDir, f),
          entries: (data.entries || []).length,
        });
      }
    } catch {}
    return notes;
  }
}

export class WeeklyDigest {
  constructor(workspace) {
    this.workspace = workspace || process.cwd();
    this.weeklyDir = path.join(this.workspace, "memory", "weekly");
  }

  async init() {
    await fs.mkdir(this.weeklyDir, { recursive: true });
  }

  async create(weekStart, summary, options = {}) {
    const filePath = path.join(this.weeklyDir, `week-${weekStart}.yaml`);
    const now = new Date().toISOString();

    const data = {
      week_start: weekStart,
      created_at: now,
      summary,
      patterns: options.patterns || [],
      decisions: options.decisions || [],
    };

    await fs.writeFile(filePath, yaml.dump(data, { lineWidth: -1 }));
    return { status: "created", file: filePath };
  }

  async get(weekStart) {
    const filePath = path.join(this.weeklyDir, `week-${weekStart}.yaml`);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return yaml.load(raw) || {};
    } catch {
      return {};
    }
  }

  async listDigests() {
    const digests = [];
    try {
      const files = await fs.readdir(this.weeklyDir);
      const yamlFiles = files.filter((f) => f.startsWith("week-") && f.endsWith(".yaml")).sort().reverse();
      for (const f of yamlFiles) {
        const raw = await fs.readFile(path.join(this.weeklyDir, f), "utf-8");
        const data = yaml.load(raw) || {};
        digests.push({
          weekStart: data.week_start || f.replace("week-", "").replace(".yaml", ""),
          file: path.join(this.weeklyDir, f),
          patterns: (data.patterns || []).length,
        });
      }
    } catch {}
    return digests;
  }
}

export class LongTermMemory {
  constructor(workspace) {
    this.workspace = workspace || process.cwd();
    this.filePath = path.join(this.workspace, "memory", "long-term.yaml");
  }

  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
  }

  async _load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      return yaml.load(raw) || { lessons: [], patterns: [], decisions: [] };
    } catch {
      return { lessons: [], patterns: [], decisions: [] };
    }
  }

  async _save(data) {
    data.updated_at = new Date().toISOString();
    await fs.writeFile(this.filePath, yaml.dump(data, { lineWidth: -1 }));
  }

  async addLesson(title, content, options = {}) {
    const data = await this._load();
    data.lessons.push({
      title,
      content,
      tags: options.tags || [],
      category: options.category || "general",
      added_at: new Date().toISOString(),
    });
    await this._save(data);
    return { status: "added", total: data.lessons.length };
  }

  async addPattern(name, description, examples = []) {
    const data = await this._load();
    data.patterns.push({
      name,
      description,
      examples,
      added_at: new Date().toISOString(),
    });
    await this._save(data);
    return { status: "added", total: data.patterns.length };
  }

  async addDecision(title, context, decision, rationale) {
    const data = await this._load();
    data.decisions.push({
      title,
      context,
      decision,
      rationale,
      made_at: new Date().toISOString(),
    });
    await this._save(data);
    return { status: "added", total: data.decisions.length };
  }

  async search(query) {
    const data = await this._load();
    const q = query.toLowerCase();
    const results = [];

    for (const lesson of data.lessons || []) {
      if ((lesson.title + lesson.content).toLowerCase().includes(q)) {
        results.push({ type: "lesson", ...lesson });
      }
    }
    for (const pattern of data.patterns || []) {
      if ((pattern.name + pattern.description).toLowerCase().includes(q)) {
        results.push({ type: "pattern", ...pattern });
      }
    }
    for (const decision of data.decisions || []) {
      if ((decision.title + decision.decision).toLowerCase().includes(q)) {
        results.push({ type: "decision", ...decision });
      }
    }
    return results;
  }

  async getAll() {
    return this._load();
  }
}

export class KnowledgeGraph {
  constructor(workspace) {
    this.workspace = workspace || process.cwd();
    this.entitiesDir = path.join(this.workspace, "knowledge", "entities");
  }

  async init() {
    await fs.mkdir(this.entitiesDir, { recursive: true });
  }

  _entityFile(name) {
    return path.join(this.entitiesDir, `${name.toLowerCase().replace(/[\s]+/g, "-")}.yaml`);
  }

  async addEntity(name, type, facts = {}, tags = []) {
    const filePath = this._entityFile(name);
    const now = new Date().toISOString();

    let existing = {};
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      existing = yaml.load(raw) || {};
    } catch {}

    const data = {
      name,
      type,
      tags,
      facts,
      created_at: existing.created_at || now,
      updated_at: now,
    };

    await fs.writeFile(filePath, yaml.dump(data, { lineWidth: -1 }));
    return { status: "added", file: filePath };
  }

  async getEntity(name) {
    try {
      const raw = await fs.readFile(this._entityFile(name), "utf-8");
      return yaml.load(raw) || {};
    } catch {
      return {};
    }
  }

  async searchEntities(query) {
    const results = [];
    try {
      const files = await fs.readdir(this.entitiesDir);
      for (const f of files) {
        if (!f.endsWith(".yaml")) continue;
        const raw = await fs.readFile(path.join(this.entitiesDir, f), "utf-8");
        const data = yaml.load(raw) || {};
        if (JSON.stringify(data).toLowerCase().includes(query.toLowerCase())) {
          results.push(data);
        }
      }
    } catch {}
    return results;
  }

  async listEntities(type = null) {
    const entities = [];
    try {
      const files = await fs.readdir(this.entitiesDir);
      for (const f of files) {
        if (!f.endsWith(".yaml")) continue;
        const raw = await fs.readFile(path.join(this.entitiesDir, f), "utf-8");
        const data = yaml.load(raw) || {};
        if (type && data.type !== type) continue;
        entities.push({ name: data.name, type: data.type, file: path.join(this.entitiesDir, f) });
      }
    } catch {}
    return entities;
  }
}

export class Memory {
  constructor(workspace) {
    this.workspace = workspace || process.cwd();
    this.daily = new DailyNotes(this.workspace);
    this.weekly = new WeeklyDigest(this.workspace);
    this.longterm = new LongTermMemory(this.workspace);
    this.knowledge = new KnowledgeGraph(this.workspace);
  }

  async init() {
    await Promise.all([
      this.daily.init(),
      this.weekly.init(),
      this.longterm.init(),
      this.knowledge.init(),
    ]);
  }

  async status() {
    const dailyNotes = await this.daily.listNotes();
    const weeklyDigests = await this.weekly.listDigests();
    const longterm = await this.longterm.getAll();
    const entities = await this.knowledge.listEntities();

    return {
      dailyNotes: dailyNotes.length,
      weeklyDigests: weeklyDigests.length,
      longtermLessons: (longterm.lessons || []).length,
      longtermPatterns: (longterm.patterns || []).length,
      longtermDecisions: (longterm.decisions || []).length,
      entities: entities.length,
    };
  }

  async search(query) {
    const longterm = await this.longterm.search(query);
    const entities = await this.knowledge.searchEntities(query);
    return { longterm, entities };
  }
}
