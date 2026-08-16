/**
 * Job Manager — Scheduled/recurring jobs with cron-like scheduling
 */

import crypto from 'crypto';

export const JobType = {
  SCHEDULED: 'scheduled',
  RECURRING: 'recurring',
  ONESHOT: 'oneshot',
  EVENT_DRIVEN: 'event_driven',
};

export const JobStatus = {
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
};

export class JobManager {
  constructor(options = {}) {
    this.jobs = new Map();
    this.timers = new Map();
    this.maxJobs = options.maxJobs || 1000;
  }

  /**
   * Create a new job.
   */
  create(agentId, jobData) {
    if (this.jobs.size >= this.maxJobs) {
      throw new Error('Job queue full');
    }

    const job = {
      id: crypto.randomUUID(),
      agentId,
      name: jobData.name,
      type: jobData.type || JobType.SCHEDULED,
      schedule: jobData.schedule || null, // cron expression or ISO timestamp
      payload: jobData.payload || {},
      status: JobStatus.SCHEDULED,
      lastRun: null,
      nextRun: jobData.nextRun || null,
      runCount: 0,
      maxRuns: jobData.maxRuns || null,
      timeout: jobData.timeout || 300000, // 5 min default
      retryPolicy: jobData.retryPolicy || { maxRetries: 3, backoffMs: 5000 },
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: jobData.metadata || {},
    };

    this.jobs.set(job.id, job);
    
    // Schedule if recurring or scheduled
    if (job.type === JobType.RECURRING && job.schedule) {
      this._scheduleRecurring(job);
    } else if (job.type === JobType.SCHEDULED && job.nextRun) {
      this._scheduleOneshot(job);
    }

    return job;
  }

  /**
   * Get job by ID.
   */
  get(jobId) {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get all jobs for an agent.
   */
  getByAgent(agentId, options = {}) {
    const { status, limit = 100, offset = 0 } = options;
    let jobs = [...this.jobs.values()].filter(j => j.agentId === agentId);

    if (status) {
      jobs = jobs.filter(j => j.status === status);
    }

    jobs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return jobs.slice(offset, offset + limit);
  }

  /**
   * Update job.
   */
  update(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    const allowedUpdates = ['name', 'schedule', 'payload', 'status', 'maxRuns', 'timeout', 'retryPolicy', 'metadata'];
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) job[key] = updates[key];
    }

    job.updatedAt = new Date().toISOString();

    // Reschedule if schedule changed
    if (updates.schedule !== undefined) {
      this._reschedule(job);
    }

    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Delete job.
   */
  delete(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    
    // Clear any running timer
    if (this.timers.has(jobId)) {
      clearTimeout(this.timers.get(jobId));
      this.timers.delete(jobId);
    }
    
    return this.jobs.delete(jobId);
  }

  /**
   * Pause job.
   */
  pause(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    job.status = JobStatus.PAUSED;
    job.updatedAt = new Date().toISOString();
    
    if (this.timers.has(jobId)) {
      clearTimeout(this.timers.get(jobId));
      this.timers.delete(jobId);
    }
    
    this.jobs.set(jobId, job);
    return job;
  }

  /**
   * Resume job.
   */
  resume(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    job.status = JobStatus.SCHEDULED;
    job.updatedAt = new Date().toISOString();
    this.jobs.set(jobId, job);
    
    if (job.type === JobType.RECURRING && job.schedule) {
      this._scheduleRecurring(job);
    } else if (job.type === JobType.SCHEDULED && job.nextRun) {
      this._scheduleOneshot(job);
    }
    
    return job;
  }

  /**
   * Execute job immediately (manual trigger).
   */
  async execute(jobId, executor) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);
    
    job.status = JobStatus.RUNNING;
    job.lastRun = new Date().toISOString();
    job.runCount++;
    job.updatedAt = new Date().toISOString();
    this.jobs.set(jobId, job);

    try {
      const result = await executor(job.payload);
      
      job.status = JobStatus.COMPLETED;
      job.lastError = null;
      
      if (job.type === JobType.RECURRING) {
        job.status = JobStatus.SCHEDULED;
        this._scheduleRecurring(job);
      } else if (job.maxRuns && job.runCount >= job.maxRuns) {
        job.status = JobStatus.COMPLETED;
      }
      
      job.updatedAt = new Date().toISOString();
      this.jobs.set(jobId, job);
      return { success: true, result };
    } catch (err) {
      job.lastError = err.message;
      job.status = JobStatus.FAILED;
      job.updatedAt = new Date().toISOString();
      
      // Retry logic
      if (job.retryPolicy?.maxRetries > 0) {
        job.retryPolicy.maxRetries--;
        setTimeout(() => this.execute(jobId, executor), job.retryPolicy.backoffMs);
      }
      
      this.jobs.set(jobId, job);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get job statistics.
   */
  getStats(agentId = null) {
    let jobs = agentId 
      ? [...this.jobs.values()].filter(j => j.agentId === agentId)
      : [...this.jobs.values()];

    return {
      total: jobs.length,
      byStatus: jobs.reduce((acc, j) => { acc[j.status] = (acc[j.status] || 0) + 1; return acc; }, {}),
      byType: jobs.reduce((acc, j) => { acc[j.type] = (acc[j.type] || 0) + 1; return acc; }, {}),
      totalRuns: jobs.reduce((sum, j) => sum + j.runCount, 0),
    };
  }

  _scheduleOneshot(job) {
    if (this.timers.has(job.id)) {
      clearTimeout(this.timers.get(job.id));
    }
    const delay = new Date(job.nextRun).getTime() - Date.now();
    if (delay <= 0) {
      // Already past due, execute immediately
      this.execute(job.id, () => Promise.resolve()); // Will need actual executor
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(job.id);
      // Executor would be passed here in real usage
    }, delay);
    this.timers.set(job.id, timer);
  }

  _scheduleRecurring(job) {
    // For cron-like scheduling, would use a proper cron library
    // This is a simplified interval-based approach
    if (this.timers.has(job.id)) {
      clearInterval(this.timers.get(job.id));
    }
    // Parse simple interval from schedule (e.g., "every 5m", "every 1h")
    const interval = this._parseSchedule(job.schedule);
    if (interval) {
      const timer = setInterval(() => {
        this.execute(job.id, () => Promise.resolve()); // Would pass real executor
      }, interval);
      this.timers.set(job.id, timer);
    }
  }

  _reschedule(job) {
    if (this.timers.has(job.id)) {
      clearTimeout(this.timers.get(job.id));
      clearInterval(this.timers.get(job.id));
      this.timers.delete(job.id);
    }
    if (job.type === JobType.RECURRING && job.schedule) {
      this._scheduleRecurring(job);
    } else if (job.type === JobType.SCHEDULED && job.nextRun) {
      this._scheduleOneshot(job);
    }
  }

  _parseSchedule(schedule) {
    // Simple parser: "every 5m", "every 1h", "every 1d"
    const match = schedule?.match(/every\s+(\d+)([mhd])/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = { m: 60000, h: 3600000, d: 86400000 };
    return value * (multipliers[unit] || 60000);
  }

  /**
   * Shutdown all timers.
   */
  shutdown() {
    for (const timer of this.timers.values()) {
      if (timer._idleTimeout !== undefined) {
        clearTimeout(timer);
      } else {
        clearInterval(timer);
      }
    }
    this.timers.clear();
  }
}

export default JobManager;