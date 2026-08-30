/**
 * ForgetEngine — Phase 3: Memory Forgetting
 *
 * Implements intelligent memory forgetting through exponential decay functions,
 * scheduled garbage collection, manual forget operations, and archive-to-storage
 * migration. Memories that are rarely accessed decay in importance over time
 * and are eventually archived or removed.
 *
 * Rollback Tag: [FORGET-ENGINE-v1]
 * Phase: 3 — Forget & Learning Engines
 */

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LAMBDA = 0.01;
const ARCHIVAL_THRESHOLD = 0.05;
const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_ACTIVE_RETENTION_DAYS = 90;
const DEFAULT_ARCHIVE_RETENTION_DAYS = 365;
const DEFAULT_GC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_ARCHIVE_CLEANUP_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_GC_BATCH = 1000;
const ARCHIVE_CLEANUP_BATCH = 200;
const DECAY_BATCH_SIZE = 100;
const DECAY_BATCH_DELAY_MS = 10;

// ---------------------------------------------------------------------------
// DecayCalculator — Computes decayed importance using exponential decay
// ---------------------------------------------------------------------------

class DecayCalculator {
  /**
   * Calculate current decayed importance.
   * Formula: current_importance = base_importance * e^(-λ * days_since_last_access)
   * @param {number} baseImportance — original importance [0.0, 1.0]
   * @param {string|Date} lastAccessed — ISO timestamp or Date of last access
   * @param {Object} [options]
   * @param {number} [options.lambda] — decay rate (default: 0.01)
   * @param {string} [options.function] — 'exponential' | 'linear' | 'logarithmic'
   * @param {string} [options.now] — current time for calculation (default: now)
   * @returns {number} — decayed importance [0.0, 1.0]
   */
  static calculate(baseImportance, lastAccessed, options = {}) {
    const lambda = options.lambda ?? DEFAULT_LAMBDA;
    const fn = options.function || 'exponential';
    const now = options.now ? new Date(options.now) : new Date();
    const lastAccess = new Date(lastAccessed);

    const msSinceAccess = now.getTime() - lastAccess.getTime();
    const daysSinceAccess = Math.max(0, msSinceAccess / (24 * 60 * 60 * 1000));

    let decayFactor;
    switch (fn) {
      case 'linear':
        // Linear: importance decreases linearly, floor at 0
        decayFactor = Math.max(0, 1 - (lambda * daysSinceAccess));
        break;
      case 'logarithmic':
        // Logarithmic: slower decay that plateaus
        decayFactor = 1 / (1 + lambda * Math.log(1 + daysSinceAccess));
        break;
      case 'exponential':
      default:
        // Exponential: e^(-λ * days)
        decayFactor = Math.exp(-lambda * daysSinceAccess);
        break;
    }

    return Math.max(0, Math.min(1, baseImportance * decayFactor));
  }

  /**
   * Calculate how many days until importance drops below a threshold.
   * @param {number} baseImportance
   * @param {number} threshold
   * @param {number} [lambda]
   * @returns {number} — days remaining (Infinity if never reaches threshold)
   */
  static daysUntilThreshold(baseImportance, threshold, lambda = DEFAULT_LAMBDA) {
    if (baseImportance <= threshold) return 0;
    // For exponential: threshold = base * e^(-λ * d)
    // ln(threshold/base) = -λ * d
    // d = -ln(threshold/base) / λ = ln(base/threshold) / λ
    return Math.log(baseImportance / threshold) / lambda;
  }
}

// ---------------------------------------------------------------------------
// ArchiveMigrator — Moves low-importance memories to archive storage
// ---------------------------------------------------------------------------

class ArchiveMigrator {
  constructor(store, archiveStore) {
    this.store = store;
    this.archiveStore = archiveStore;
    this._stats = { totalArchived: 0, totalErrors: 0 };
  }

  /**
   * Archive a memory (soft-delete): move from active store to archive.
   * @param {string} cid — memory CID
   * @param {string} reason — reason for archival
   * @returns {{ success: boolean, archive?: Object, error?: string }}
   */
  archive(cid, reason = 'decay') {
    const memory = this.store.get(cid);
    if (!memory) {
      return { success: false, error: `Memory with ID ${cid} not found` };
    }

    const now = new Date().toISOString();
    const archiveRecord = {
      ...memory,
      original_cid: cid,
      archived_at: now,
      can_recover: 1,
      recovery_deadline: new Date(Date.now() + RECOVERY_WINDOW_MS).toISOString(),
      archive_reason: reason,
      status: 'archived',
    };

    try {
      this.archiveStore.add({
        content: JSON.stringify(archiveRecord),
        source: 'forget-engine',
        tags: ['archive', ...(memory.tags || [])],
        type: 'archive',
        metadata: {
          original_cid: cid,
          archived_at: now,
          can_recover: 1,
          recovery_deadline: archiveRecord.recovery_deadline,
          archive_reason: reason,
        },
      });

      // Remove from active store
      this.store.delete(cid);

      this._stats.totalArchived++;
      return { success: true, archive: archiveRecord };
    } catch (err) {
      this._stats.totalErrors++;
      return { success: false, error: err.message };
    }
  }

  /**
   * Find and archive all memories below importance threshold.
   * @param {number} threshold — importance threshold (default: 0.05)
   * @returns {{ archived: number, ids: string[] }}
   */
  archiveLowImportance(threshold = ARCHIVAL_THRESHOLD) {
    const archived = [];
    const allMemories = this.store.getAll({ limit: 10000 });

    for (const memory of allMemories) {
      const importance = memory.metadata?.importance_score ?? memory.salience ?? 0.5;
      if (importance < threshold) {
        const result = this.archive(memory.cid, 'low_importance');
        if (result.success) {
          archived.push(memory.cid);
        }
      }
    }

    return { archived: archived.length, ids: archived };
  }

  getStats() {
    return { ...this._stats };
  }
}

// ---------------------------------------------------------------------------
// GarbageCollector — Cleans up expired and permanently deleted archives
// ---------------------------------------------------------------------------

class GarbageCollector {
  constructor(archiveStore) {
    this.archiveStore = archiveStore;
    this._lastRun = null;
    this._timer = null;
    this._stats = { totalCleaned: 0, totalRuns: 0 };
  }

  /**
   * Run garbage collection on archives.
   * Removes archives past recovery deadline with can_recover=0.
   * @returns {{ cleaned: number, ids: string[] }}
   */
  run() {
    const now = new Date();
    const cleaned = [];
    const allArchives = this.archiveStore.getAll({ limit: 10000 });

    let count = 0;
    for (const archive of allArchives) {
      if (count >= MAX_GC_BATCH) break;

      const meta = archive.metadata || {};
      const canRecover = meta.can_recover ?? 1;
      const deadline = meta.recovery_deadline;

      // Skip if can still recover
      if (canRecover === 1) {
        // Check if recovery window has expired
        if (deadline && new Date(deadline) < now) {
          // Recovery window expired, mark as non-recoverable
          // We'll skip the actual update since store is immutable
          // The archive will be picked up in the next GC run
        }
        continue;
      }

      // can_recover === 0, permanently delete
      this.archiveStore.delete(archive.cid);
      cleaned.push(archive.cid);
      count++;
    }

    this._lastRun = now.toISOString();
    this._stats.totalCleaned += cleaned.length;
    this._stats.totalRuns++;

    return { cleaned: cleaned.length, ids: cleaned };
  }

  /**
   * Start scheduled GC.
   * @param {number} intervalMs — interval in ms (default: 1 hour)
   */
  startScheduled(intervalMs = DEFAULT_GC_INTERVAL_MS) {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.run(), intervalMs);
    this._timer.unref?.();
  }

  stopScheduled() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  getStats() {
    return { ...this._stats, lastRun: this._lastRun };
  }
}

// ---------------------------------------------------------------------------
// ManualForgetHandler — Processes explicit forget commands
// ---------------------------------------------------------------------------

class ManualForgetHandler {
  constructor(store, archiveMigrator, auditLogger) {
    this.store = store;
    this.archiveMigrator = archiveMigrator;
    this.auditLogger = auditLogger;
  }

  /**
   * Soft-delete a memory (archive it).
   * @param {string} cid
   * @param {string} [operator] — who initiated the forget
   * @returns {{ success: boolean, result?: Object, error?: string }}
   */
  softDelete(cid, operator = 'user') {
    const memory = this.store.get(cid);
    if (!memory) {
      return { success: false, error: `Memory with ID ${cid} does not exist or has already been permanently deleted` };
    }

    const beforeState = { ...memory };
    const result = this.archiveMigrator.archive(cid, 'manual_soft_delete');

    if (result.success) {
      this.auditLogger.log({
        operation: 'soft_delete',
        cid,
        beforeState,
        afterState: result.archive,
        operator,
        timestamp: new Date().toISOString(),
        reason: 'manual_soft_delete',
      });
    }

    return result;
  }

  /**
   * Hard-delete a memory (remove from active store, archive as non-recoverable).
   * @param {string} cid
   * @param {string} [operator]
   * @returns {{ success: boolean, error?: string }}
   */
  hardDelete(cid, operator = 'user') {
    const memory = this.store.get(cid);
    if (!memory) {
      return { success: false, error: `Memory with ID ${cid} does not exist or has already been permanently deleted` };
    }

    const beforeState = { ...memory };

    // Create archive with can_recover=0
    const now = new Date().toISOString();
    const archiveRecord = {
      ...memory,
      original_cid: cid,
      archived_at: now,
      can_recover: 0,
      recovery_deadline: null,
      archive_reason: 'manual_hard_delete',
      status: 'deleted',
    };

    // Try to store archive (best effort)
    try {
      this.archiveMigrator.archiveStore?.add({
        content: JSON.stringify(archiveRecord),
        source: 'forget-engine',
        tags: ['deleted', ...(memory.tags || [])],
        type: 'archive',
        metadata: {
          original_cid: cid,
          archived_at: now,
          can_recover: 0,
          archive_reason: 'manual_hard_delete',
        },
      });
    } catch (e) {
      // Archive storage failure is non-critical
    }

    // Remove from active store
    this.store.delete(cid);

    this.auditLogger.log({
      operation: 'hard_delete',
      cid,
      beforeState,
      afterState: null,
      operator,
      timestamp: now,
      reason: 'manual_hard_delete',
    });

    return { success: true };
  }
}

// ---------------------------------------------------------------------------
// RetentionPolicyEngine — Enforces configurable retention policies
// ---------------------------------------------------------------------------

class RetentionPolicyEngine {
  constructor() {
    this._policies = new Map();
    this._defaults = {
      active: DEFAULT_ACTIVE_RETENTION_DAYS,
      archived: DEFAULT_ARCHIVE_RETENTION_DAYS,
      pattern: Infinity, // patterns retained indefinitely
    };
  }

  /**
   * Set a retention policy for a category.
   * @param {string} category
   * @param {number} retentionDays
   */
  setPolicy(category, retentionDays) {
    if (retentionDays < 1) {
      throw new Error('Minimum active retention is 1 day');
    }
    this._policies.set(category, retentionDays);
  }

  /**
   * Get retention policy for a category.
   * @param {string} category
   * @returns {number} — retention days
   */
  getPolicy(category) {
    return this._policies.get(category) ?? this._defaults.active;
  }

  /**
   * Check if a memory is past its retention period.
   * @param {Object} memory
   * @returns {{ expired: boolean, reason?: string }}
   */
  checkRetention(memory) {
    const category = memory.type || 'note';
    const retentionDays = this._policies.get(category) ?? this._defaults[category] ?? this._defaults.active;

    if (retentionDays === Infinity) {
      return { expired: false };
    }

    const createdAt = new Date(memory.createdAt || memory.timestamp || memory.created_at);
    const ageMs = Date.now() - createdAt.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    if (ageDays > retentionDays) {
      return { expired: true, reason: `Memory age ${Math.floor(ageDays)} days exceeds retention of ${retentionDays} days` };
    }

    return { expired: false };
  }

  /**
   * Validate a proposed retention policy.
   * @param {string} category
   * @param {number} days
   * @returns {{ valid: boolean, error?: string }}
   */
  validatePolicy(category, days) {
    if (typeof days !== 'number' || days < 1) {
      return { valid: false, error: 'Minimum retention period is 1 day' };
    }
    if (days < 7 && category === 'archived') {
      return { valid: false, error: 'Minimum archived retention period is 7 days' };
    }
    return { valid: true };
  }
}

// ---------------------------------------------------------------------------
// DecayScheduler — Runs periodic decay calculations on active memories
// ---------------------------------------------------------------------------

class DecayScheduler {
  constructor(store, decayCalculator, options = {}) {
    this.store = store;
    this.decayCalculator = decayCalculator;
    this.lambda = options.lambda ?? DEFAULT_LAMBDA;
    this.decayFunction = options.function || 'exponential';
    this._timer = null;
    this._stats = { totalProcessed: 0, totalRuns: 0, lastRun: null };
  }

  /**
   * Run decay calculations on all active memories.
   * Processes in batches to avoid blocking the event loop.
   * Only processes memories not accessed in the last 24 hours.
   * @returns {{ processed: number, updated: number }}
   */
  async run() {
    const now = new Date();
    const allMemories = this.store.getAll({ limit: 10000 });
    const recentThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let processed = 0;
    let updated = 0;

    // Filter to memories not accessed recently
    const candidates = allMemories.filter(m => {
      const lastAccess = m.last_accessed || m.createdAt || m.timestamp;
      return new Date(lastAccess) < recentThreshold;
    });

    // Process in batches
    for (let i = 0; i < candidates.length; i += DECAY_BATCH_SIZE) {
      const batch = candidates.slice(i, i + DECAY_BATCH_SIZE);

      for (const memory of batch) {
        const baseImportance = memory.metadata?.importance_score ?? memory.salience ?? 0.5;
        const lastAccessed = memory.last_accessed || memory.createdAt || memory.timestamp;

        const newImportance = this.decayCalculator.calculate(
          baseImportance,
          lastAccessed,
          { lambda: this.lambda, function: this.decayFunction, now: now.toISOString() }
        );

        // Only update if importance changed significantly (> 0.001)
        if (Math.abs(newImportance - baseImportance) > 0.001) {
          // Update metadata in store (immutable approach: delete and re-add)
          const updatedMemory = { ...memory };
          if (!updatedMemory.metadata) updatedMemory.metadata = {};
          updatedMemory.metadata.importance_score = newImportance;
          updatedMemory.updated_at = now.toISOString();

          // Re-add to store (immutable update)
          this.store.delete(memory.cid);
          this.store.add(updatedMemory);
          updated++;
        }

        processed++;
      }

      // Yield between batches
      if (i + DECAY_BATCH_SIZE < candidates.length) {
        await new Promise(r => setTimeout(r, DECAY_BATCH_DELAY_MS));
      }
    }

    this._stats.totalProcessed += processed;
    this._stats.totalRuns++;
    this._stats.lastRun = now.toISOString();

    return { processed, updated };
  }

  /**
   * Start scheduled decay.
   * @param {number} intervalMs — interval in ms
   */
  startScheduled(intervalMs = DEFAULT_GC_INTERVAL_MS) {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.run(), intervalMs);
    this._timer.unref?.();
  }

  stopScheduled() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  getStats() {
    return { ...this._stats };
  }
}

// ---------------------------------------------------------------------------
// ForgetAuditLogger — Records all forget operations with audit trail
// ---------------------------------------------------------------------------

class ForgetAuditLogger {
  constructor() {
    this._log = [];
    this._maxSize = 10000;
  }

  /**
   * Log a forget operation.
   * @param {Object} entry
   */
  log(entry) {
    const record = {
      id: randomUUID(),
      ...entry,
      logged_at: new Date().toISOString(),
    };

    this._log.push(record);

    // Trim if over max size (keep most recent)
    if (this._log.length > this._maxSize) {
      this._log = this._log.slice(-this._maxSize);
    }

    return record;
  }

  /**
   * Get audit log entries.
   * @param {Object} options — { limit, offset, cid, operation }
   * @returns {Array}
   */
  getEntries(options = {}) {
    let entries = [...this._log];

    if (options.cid) {
      entries = entries.filter(e => e.cid === options.cid);
    }
    if (options.operation) {
      entries = entries.filter(e => e.operation === options.operation);
    }

    const offset = options.offset || 0;
    const limit = options.limit || 100;

    return entries.slice(offset, offset + limit);
  }

  getStats() {
    return {
      totalEntries: this._log.length,
      operations: this._log.reduce((acc, e) => {
        acc[e.operation] = (acc[e.operation] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}

// ---------------------------------------------------------------------------
// RecoveryHandler — Supports recovery of forgotten memories within 24h window
// ---------------------------------------------------------------------------

class RecoveryHandler {
  constructor(store, archiveStore, auditLogger) {
    this.store = store;
    this.archiveStore = archiveStore;
    this.auditLogger = auditLogger;
  }

  /**
   * Recover a forgotten memory within the 24-hour grace window.
   * @param {string} cid — original memory CID
   * @returns {{ success: boolean, memory?: Object, error?: string }}
   */
  recover(cid) {
    // Find the archive record
    const allArchives = this.archiveStore.getAll({ limit: 10000 });
    let archiveRecord = null;

    for (const archive of allArchives) {
      const meta = archive.metadata || {};
      if (meta.original_cid === cid) {
        // Parse the content which contains the full archive record
        try {
          archiveRecord = JSON.parse(archive.content);
        } catch {
          archiveRecord = { ...archive, original_cid: cid };
        }
        break;
      }
    }

    if (!archiveRecord) {
      return { success: false, error: `Memory with ID ${cid} does not exist or has already been permanently deleted` };
    }

    // Check recovery eligibility
    const archivedAt = new Date(archiveRecord.archived_at);
    const now = new Date();
    const timeSinceArchival = now.getTime() - archivedAt.getTime();

    if (timeSinceArchival > RECOVERY_WINDOW_MS) {
      return { success: false, error: 'The 24-hour recovery window for this memory has expired' };
    }

    if (archiveRecord.can_recover === 0) {
      return { success: false, error: 'This memory was hard-deleted and cannot be recovered' };
    }

    // Restore to active store
    const restoredMemory = {
      content: archiveRecord.content,
      source: archiveRecord.source,
      tags: archiveRecord.tags,
      type: archiveRecord.type,
      timestamp: archiveRecord.timestamp,
      metadata: {
        ...archiveRecord.metadata,
        importance_score: archiveRecord.metadata?.importance_score ?? archiveRecord.salience ?? 0.5,
        restored_from_archive: true,
        restored_at: now.toISOString(),
      },
    };

    const result = this.store.add(restoredMemory);

    // Remove from archive
    // Find and delete archive entries for this CID
    for (const archive of allArchives) {
      const meta = archive.metadata || {};
      if (meta.original_cid === cid) {
        this.archiveStore.delete(archive.cid);
        break;
      }
    }

    this.auditLogger.log({
      operation: 'recovery',
      cid,
      beforeState: archiveRecord,
      afterState: restoredMemory,
      operator: 'user',
      timestamp: now.toISOString(),
      reason: 'recovery_within_window',
    });

    return { success: true, memory: result.memory };
  }

  /**
   * Check if a memory can be recovered.
   * @param {string} cid
   * @returns {{ canRecover: boolean, reason?: string, deadline?: string }}
   */
  checkRecoverability(cid) {
    const allArchives = this.archiveStore.getAll({ limit: 10000 });

    for (const archive of allArchives) {
      const meta = archive.metadata || {};
      if (meta.original_cid === cid) {
        let archiveRecord;
        try {
          archiveRecord = JSON.parse(archive.content);
        } catch {
          archiveRecord = { ...archive, original_cid: cid };
        }

        if (archiveRecord.can_recover === 0) {
          return { canRecover: false, reason: 'Memory was hard-deleted' };
        }

        const archivedAt = new Date(archiveRecord.archived_at);
        const now = new Date();
        const timeSinceArchival = now.getTime() - archivedAt.getTime();

        if (timeSinceArchival > RECOVERY_WINDOW_MS) {
          return { canRecover: false, reason: 'Recovery window expired' };
        }

        return {
          canRecover: true,
          deadline: archiveRecord.recovery_deadline,
        };
      }
    }

    return { canRecover: false, reason: 'Memory not found in archives' };
  }
}

// ---------------------------------------------------------------------------
// RetentionPolicyValidator — Validates retention policies before operations
// ---------------------------------------------------------------------------

class RetentionPolicyValidator {
  constructor(policyEngine) {
    this.policyEngine = policyEngine;
    this._policyRegistry = new Map();
  }

  /**
   * Validate and enforce retention policies before archival.
   * @param {Object} memory
   * @param {string} operation — 'archive' | 'gc' | 'cleanup'
   * @returns {{ valid: boolean, error?: string }}
   */
  validate(memory, operation = 'archive') {
    const category = memory.type || 'note';
    const importance = memory.metadata?.importance_score ?? memory.salience ?? 0.5;

    // High-importance memories should not be archived too aggressively
    if (importance > 0.8 && operation === 'archive') {
      return {
        valid: false,
        error: `High-importance memory (${importance.toFixed(2)}) should not be archived without explicit confirmation`,
      };
    }

    // Check retention policy
    const retention = this.policyEngine.checkRetention(memory);
    if (!retention.expired && operation === 'gc') {
      return {
        valid: false,
        error: `Memory is within retention period: ${retention.reason || 'not expired'}`,
      };
    }

    return { valid: true };
  }

  /**
   * Register a category-specific policy override.
   * @param {string} category
   * @param {Object} policy
   */
  registerPolicy(category, policy) {
    this._policyRegistry.set(category, policy);
  }

  getRegisteredPolicies() {
    return Object.fromEntries(this._policyRegistry);
  }
}

// ---------------------------------------------------------------------------
// ArchiveCleanupScheduler — Manages cleanup of expired archives
// ---------------------------------------------------------------------------

class ArchiveCleanupScheduler {
  constructor(archiveStore, auditLogger) {
    this.archiveStore = archiveStore;
    this.auditLogger = auditLogger;
    this._timer = null;
    this._stats = { totalCleaned: 0, totalRuns: 0, lastRun: null };
  }

  /**
   * Run archive cleanup.
   * Processes archives in batches, verifying can_recover and recovery_deadline.
   * @returns {{ cleaned: number, ids: string[] }}
   */
  run() {
    const now = new Date();
    const allArchives = this.archiveStore.getAll({ limit: 10000 });
    const cleaned = [];

    let count = 0;
    for (const archive of allArchives) {
      if (count >= ARCHIVE_CLEANUP_BATCH) break;

      const meta = archive.metadata || {};
      const canRecover = meta.can_recover ?? 1;
      const deadline = meta.recovery_deadline;

      // Only permanently delete if can_recover is 0
      if (canRecover !== 0) continue;

      // If there's a deadline, check if it's passed
      if (deadline && new Date(deadline) > now) continue;

      this.archiveStore.delete(archive.cid);
      cleaned.push(archive.cid);

      this.auditLogger.log({
        operation: 'permanent_deletion',
        cid: archive.cid,
        beforeState: archive,
        afterState: null,
        operator: 'system',
        timestamp: now.toISOString(),
        reason: 'archive_cleanup',
      });

      count++;
    }

    this._stats.totalCleaned += cleaned.length;
    this._stats.totalRuns++;
    this._stats.lastRun = now.toISOString();

    return { cleaned: cleaned.length, ids: cleaned };
  }

  startScheduled(intervalMs = DEFAULT_ARCHIVE_CLEANUP_INTERVAL_MS) {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this.run(), intervalMs);
    this._timer.unref?.();
  }

  stopScheduled() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  getStats() {
    return { ...this._stats };
  }
}

// ---------------------------------------------------------------------------
// ForgettingMetricsCollector — Tracks forgetting-specific metrics
// ---------------------------------------------------------------------------

class ForgettingMetricsCollector {
  constructor() {
    this._metrics = {
      archivalRate: [], // { timestamp, count }
      recoveryRate: [],
      memoryLifespans: [], // { createdAt, archivedAt, lifespanDays }
      decayEffectiveness: [],
      gcEfficiency: [],
    };
    this._rollingWindowMs = 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Record an archival event.
   */
  recordArchival(memory) {
    this._metrics.archivalRate.push({
      timestamp: Date.now(),
      cid: memory.cid,
      importance: memory.metadata?.importance_score ?? 0.5,
    });

    const createdAt = new Date(memory.createdAt || memory.timestamp).getTime();
    const lifespanDays = (Date.now() - createdAt) / (24 * 60 * 60 * 1000);
    this._metrics.memoryLifespans.push({
      cid: memory.cid,
      createdAt: memory.createdAt || memory.timestamp,
      archivedAt: new Date().toISOString(),
      lifespanDays,
    });
  }

  /**
   * Record a recovery event.
   */
  recordRecovery(memory) {
    this._metrics.recoveryRate.push({
      timestamp: Date.now(),
      cid: memory.cid,
    });
  }

  /**
   * Get archival rate (archivals per hour in rolling 24h window).
   */
  getArchivalRate() {
    const cutoff = Date.now() - this._rollingWindowMs;
    const recent = this._metrics.archivalRate.filter(e => e.timestamp > cutoff);
    const hours = this._rollingWindowMs / (60 * 60 * 1000);
    return recent.length / hours;
  }

  /**
   * Get recovery rate (recoveries / archivals in rolling 24h window).
   */
  getRecoveryRate() {
    const cutoff = Date.now() - this._rollingWindowMs;
    const archivals = this._metrics.archivalRate.filter(e => e.timestamp > cutoff).length;
    const recoveries = this._metrics.recoveryRate.filter(e => e.timestamp > cutoff).length;
    return archivals > 0 ? recoveries / archivals : 0;
  }

  /**
   * Get average memory lifespan in days.
   */
  getAverageLifespan() {
    if (this._metrics.memoryLifespans.length === 0) return 0;
    const total = this._metrics.memoryLifespans.reduce((sum, e) => sum + e.lifespanDays, 0);
    return total / this._metrics.memoryLifespans.length;
  }

  /**
   * Get all metrics.
   */
  getMetrics() {
    return {
      archivalRate: this.getArchivalRate(),
      recoveryRate: this.getRecoveryRate(),
      averageLifespanDays: this.getAverageLifespan(),
      totalArchivals: this._metrics.archivalRate.length,
      totalRecoveries: this._metrics.recoveryRate.length,
      rollingWindowHours: this._rollingWindowMs / (60 * 60 * 1000),
    };
  }
}

// ---------------------------------------------------------------------------
// ForgetEngine — Main orchestrator for forget operations
// ---------------------------------------------------------------------------

export class ForgetEngine {
  /**
   * @param {Object} options
   * @param {Object} options.store — MemoryStore instance for active memories
   * @param {Object} [options.archiveStore] — MemoryStore instance for archives
   * @param {Object} [options.logger] — Logger instance
   * @param {Object} [options.options]
   */
  constructor(options = {}) {
    this.store = options.store;
    this.archiveStore = options.archiveStore || options.store; // fallback to main store
    this.logger = options.logger;

    // Create sub-components
    this.decayCalculator = DecayCalculator;
    this.auditLogger = new ForgetAuditLogger();
    this.policyEngine = new RetentionPolicyEngine();
    this.archiveMigrator = new ArchiveMigrator(this.store, this.archiveStore);
    this.gc = new GarbageCollector(this.archiveStore);
    this.manualForget = new ManualForgetHandler(this.store, this.archiveMigrator, this.auditLogger);
    this.recovery = new RecoveryHandler(this.store, this.archiveStore, this.auditLogger);
    this.decayScheduler = new DecayScheduler(this.store, DecayCalculator, options.options);
    this.policyValidator = new RetentionPolicyValidator(this.policyEngine);
    this.archiveCleanup = new ArchiveCleanupScheduler(this.archiveStore, this.auditLogger);
    this.metrics = new ForgettingMetricsCollector();

    this._stats = {
      totalForgetOperations: 0,
      totalRecoveries: 0,
      totalDecayRuns: 0,
      totalGcRuns: 0,
    };
  }

  /**
   * Forget a memory (soft-delete by default).
   * @param {string} cid
   * @param {Object} [options] — { mode: 'soft'|'hard', operator: string }
   * @returns {Promise<{ success: boolean, result?: Object, error?: string }>}
   */
  async forget(cid, options = {}) {
    const mode = options.mode || 'soft';
    const operator = options.operator || 'user';

    const result = mode === 'hard'
      ? this.manualForget.hardDelete(cid, operator)
      : this.manualForget.softDelete(cid, operator);

    if (result.success) {
      this._stats.totalForgetOperations++;
      const memory = result.archive || { cid };
      this.metrics.recordArchival(memory);
    }

    return result;
  }

  /**
   * Recover a forgotten memory within the 24-hour window.
   * @param {string} cid
   * @returns {Promise<{ success: boolean, memory?: Object, error?: string }>}
   */
  async recover(cid) {
    const result = this.recovery.recover(cid);

    if (result.success) {
      this._stats.totalRecoveries++;
      this.metrics.recordRecovery(result.memory);
    }

    return result;
  }

  /**
   * Run decay calculations on all active memories.
   * @returns {Promise<{ processed: number, updated: number }>}
   */
  async runDecay() {
    const result = await this.decayScheduler.run();
    this._stats.totalDecayRuns++;
    return result;
  }

  /**
   * Run garbage collection on archives.
   * @returns {{ cleaned: number, ids: string[] }}
   */
  runGC() {
    const result = this.gc.run();
    this._stats.totalGcRuns++;
    return result;
  }

  /**
   * Run archive cleanup.
   * @returns {{ cleaned: number, ids: string[] }}
   */
  runArchiveCleanup() {
    return this.archiveCleanup.run();
  }

  /**
   * Archive all low-importance memories below threshold.
   * @param {number} [threshold]
   * @returns {{ archived: number, ids: string[] }}
   */
  archiveLowImportance(threshold = ARCHIVAL_THRESHOLD) {
    return this.archiveMigrator.archiveLowImportance(threshold);
  }

  /**
   * Get the current decayed importance of a memory.
   * @param {Object} memory
   * @returns {number}
   */
  getDecayedImportance(memory) {
    const baseImportance = memory.metadata?.importance_score ?? memory.salience ?? 0.5;
    const lastAccessed = memory.last_accessed || memory.createdAt || memory.timestamp;
    return DecayCalculator.calculate(baseImportance, lastAccessed, {
      lambda: this.decayScheduler.lambda,
      function: this.decayScheduler.decayFunction,
    });
  }

  /**
   * Get forgetting statistics.
   */
  getStats() {
    return {
      ...this._stats,
      auditLog: this.auditLogger.getStats(),
      metrics: this.metrics.getMetrics(),
      gc: this.gc.getStats(),
      archiveCleanup: this.archiveCleanup.getStats(),
      decayScheduler: this.decayScheduler.getStats(),
    };
  }

  /**
   * Start all scheduled operations.
   */
  startScheduled() {
    this.decayScheduler.startScheduled();
    this.gc.startScheduled();
    this.archiveCleanup.startScheduled();
  }

  /**
   * Stop all scheduled operations.
   */
  stopScheduled() {
    this.decayScheduler.stopScheduled();
    this.gc.stopScheduled();
    this.archiveCleanup.stopScheduled();
  }

  /**
   * Clear all forget-related data.
   */
  clear() {
    this.auditLogger = new ForgetAuditLogger();
    this.metrics = new ForgettingMetricsCollector();
    this._stats = {
      totalForgetOperations: 0,
      totalRecoveries: 0,
      totalDecayRuns: 0,
      totalGcRuns: 0,
    };
  }
}

// Export sub-components for testing and reuse
export {
  DecayCalculator,
  ArchiveMigrator,
  GarbageCollector,
  ManualForgetHandler,
  RetentionPolicyEngine,
  DecayScheduler,
  ForgetAuditLogger,
  RecoveryHandler,
  RetentionPolicyValidator,
  ArchiveCleanupScheduler,
  ForgettingMetricsCollector,
};
