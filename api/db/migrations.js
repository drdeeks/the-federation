/**
 * MigrationRunner — Phase 1: Schema Management
 * 
 * Manages schema/data migrations with version tracking.
 * Applies pending migrations in order, tracks applied versions,
 * and supports rollback of individual migrations.
 * Rollback Tag: [MIGRATION-RUNNER-v1]
 * Phase: 1 — Core Store & Embedding Engine
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * MigrationRunner — Manages SQL and JS migrations with version tracking.
 * 
 * Migrations are files in a migrations directory named:
 *   YYYYMMDD_NNN_description.sql or .js
 * 
 * Each migration must implement:
 *   - UP: forward migration
 *   - DOWN: rollback migration (optional)
 */
export class MigrationRunner {
  /**
   * @param {Object} options
   * @param {string} options.migrationsDir — Directory containing migration files
   * @param {string} options.statePath — Path to track applied migrations
   * @param {Object} options.db — Optional database/connection object for SQL migrations
   */
  constructor(options = {}) {
    this.migrationsDir = options.migrationsDir || resolve(__dirname, '../db/migrations');
    this.statePath = options.statePath || resolve(this.migrationsDir, '.migration-state.json');
    this.db = options.db || null;

    // Ensure directories exist
    if (!existsSync(this.migrationsDir)) {
      mkdirSync(this.migrationsDir, { recursive: true });
    }

    // Load migration state
    this._state = this._loadState();
  }

  /**
   * Get all pending migrations (not yet applied).
   * @returns {Array<{ name, path, order }>}
   */
  getPending() {
    const all = this._discoverMigrations();
    const applied = new Set(this._state.applied);
    return all.filter(m => !applied.has(m.name));
  }

  /**
   * Get all applied migrations.
   * @returns {Array<{ name, appliedAt }>}
   */
  getApplied() {
    return this._state.applied.map(name => ({
      name,
      appliedAt: this._state.timestamps[name] || null,
    }));
  }

  /**
   * Get migration status summary.
   * @returns {Object}
   */
  getStatus() {
    const pending = this.getPending();
    const applied = this.getApplied();
    return {
      totalDiscovered: this._discoverMigrations().length,
      applied: applied.length,
      pending: pending.length,
      pendingMigrations: pending.map(m => m.name),
      appliedMigrations: applied.map(m => m.name),
      lastApplied: applied.length > 0 ? applied[applied.length - 1] : null,
    };
  }

  /**
   * Run all pending migrations in order.
   * @returns {Object} { applied: string[], errors: string[] }
   */
  async runAll() {
    const pending = this.getPending();
    const applied = [];
    const errors = [];

    for (const migration of pending) {
      try {
        await this._runMigration(migration, 'up');
        this._markApplied(migration.name);
        applied.push(migration.name);
      } catch (err) {
        errors.push(`${migration.name}: ${err.message}`);
        // Stop on first error
        break;
      }
    }

    this._saveState();
    return { applied, errors };
  }

  /**
   * Run a specific migration by name.
   * @param {string} migrationName
   * @param {string} direction — 'up' or 'down'
   * @returns {Object}
   */
  async runSingle(migrationName, direction = 'up') {
    const all = this._discoverMigrations();
    const migration = all.find(m => m.name === migrationName);
    if (!migration) {
      throw new Error(`Migration not found: ${migrationName}`);
    }

    if (direction === 'up' && this._state.applied.includes(migrationName)) {
      return { skipped: true, reason: 'Already applied' };
    }

    if (direction === 'down' && !this._state.applied.includes(migrationName)) {
      return { skipped: true, reason: 'Not yet applied' };
    }

    await this._runMigration(migration, direction);

    if (direction === 'up') {
      this._markApplied(migrationName);
    } else {
      this._unmarkApplied(migrationName);
    }

    this._saveState();
    return { applied: migrationName, direction };
  }

  /**
   * Rollback the last applied migration.
   * @returns {Object}
   */
  async rollback() {
    if (this._state.applied.length === 0) {
      return { skipped: true, reason: 'No migrations to rollback' };
    }

    const lastApplied = this._state.applied[this._state.applied.length - 1];
    return this.runSingle(lastApplied, 'down');
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  _discoverMigrations() {
    if (!existsSync(this.migrationsDir)) return [];

    const files = readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql') || f.endsWith('.js'))
      .filter(f => !f.startsWith('.'))
      .sort();

    return files.map(f => {
      const ext = f.endsWith('.js') ? '.js' : '.sql';
      const name = f.replace(ext, '');
      return {
        name,
        path: join(this.migrationsDir, f),
        type: ext === '.js' ? 'js' : 'sql',
        order: this._parseOrder(name),
      };
    }).sort((a, b) => a.order - b.order);
  }

  _parseOrder(name) {
    // Format: YYYYMMDD_NNN_description
    const match = name.match(/^(\d{8})_(\d+)_/);
    if (match) {
      return parseInt(match[1]) * 1000 + parseInt(match[2]);
    }
    return 0;
  }

  async _runMigration(migration, direction) {
    if (migration.type === 'sql') {
      await this._runSQL(migration, direction);
    } else if (migration.type === 'js') {
      await this._runJS(migration, direction);
    }
  }

  async _runSQL(migration, direction) {
    const content = readFileSync(migration.path, 'utf8');
    
    // Parse UP/DOWN sections if present
    const sections = this._parseSQLSections(content);
    const sql = direction === 'up' ? sections.up : (sections.down || sections.up);
    
    if (this.db && typeof this.db.exec === 'function') {
      this.db.exec(sql);
    }
    // If no DB connection, just validate SQL syntax (no-op for in-memory)
    return { executed: true, direction, sql: sql.substring(0, 100) + '...' };
  }

  async _runJS(migration, direction) {
    // Dynamic import of JS migration
    const module = await import(migration.path);
    const fn = direction === 'up' ? module.up : module.down;
    if (typeof fn === 'function') {
      await fn(this.db);
    }
    return { executed: true, direction };
  }

  _parseSQLSections(content) {
    const sections = {};
    let currentSection = 'up';
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim().toUpperCase();
      if (trimmed.startsWith('-- MIGRATION:UP')) {
        currentSection = 'up';
        continue;
      } else if (trimmed.startsWith('-- MIGRATION:DOWN')) {
        currentSection = 'down';
        continue;
      }
      
      if (!sections[currentSection]) sections[currentSection] = '';
      sections[currentSection] += line + '\n';
    }
    
    // If no sections found, treat entire content as UP
    if (!sections.up && !sections.down) {
      sections.up = content;
    }
    
    return sections;
  }

  _markApplied(name) {
    if (!this._state.applied.includes(name)) {
      this._state.applied.push(name);
    }
    this._state.timestamps[name] = new Date().toISOString();
  }

  _unmarkApplied(name) {
    this._state.applied = this._state.applied.filter(n => n !== name);
    delete this._state.timestamps[name];
  }

  _loadState() {
    try {
      if (existsSync(this.statePath)) {
        return JSON.parse(readFileSync(this.statePath, 'utf8'));
      }
    } catch (err) {
      // Ignore parse errors
    }
    return { applied: [], timestamps: {} };
  }

  _saveState() {
    try {
      writeFileSync(this.statePath, JSON.stringify(this._state, null, 2));
    } catch (err) {
      console.error('[MigrationRunner] Failed to save state:', err.message);
    }
  }
}

export default MigrationRunner;
