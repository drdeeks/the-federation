/**
 * Context router — Task and job management API
 * 
 * Uses TaskManager and JobManager for persistent, feature-rich queues.
 */

import express from 'express';
import { TaskManager, TaskStatus, TaskPriority } from './task-manager.js';
import { JobManager, JobType, JobStatus } from './job-manager.js';

const router = express.Router();

// Per-agent task/job managers (in production, these would be persisted)
const taskManagers = new Map();
const jobManagers = new Map();

function getTaskManager(agentId) {
  if (!taskManagers.has(agentId)) {
    taskManagers.set(agentId, new TaskManager());
  }
  return taskManagers.get(agentId);
}

function getJobManager(agentId) {
  if (!jobManagers.has(agentId)) {
    jobManagers.set(agentId, new JobManager());
  }
  return jobManagers.get(agentId);
}

// --- TASKS ---

router.get('/:agentId/tasks', async (req, res) => {
  try {
    const tm = getTaskManager(req.params.agentId);
    const { status, limit = 100, offset = 0 } = req.query;
    const tasks = tm.getByAgent(req.params.agentId, { 
      status, 
      limit: parseInt(limit), 
      offset: parseInt(offset) 
    });
    res.json({ status: 'success', data: tasks });
  } catch (err) {
    console.error('[tasks] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch tasks' }] });
  }
});

router.post('/:agentId/tasks', async (req, res) => {
  try {
    const tm = getTaskManager(req.params.agentId);
    const { title, description, priority, payload, tags, metadata, assignedTo } = req.body;
    
    if (!title) {
      return res.status(400).json({ status: 'error', errors: [{ message: 'Title is required' }] });
    }

    const task = tm.create(req.params.agentId, { title, description, priority, payload, tags, metadata, assignedTo });
    res.status(201).json({ status: 'success', data: task });
  } catch (err) {
    console.error('[tasks] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: err.message || 'Failed to create task' }] });
  }
});

router.get('/:agentId/tasks/:taskId', async (req, res) => {
  try {
    const tm = getTaskManager(req.params.agentId);
    const task = tm.get(req.params.taskId);
    if (!task || task.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Task not found' }] });
    }
    res.json({ status: 'success', data: task });
  } catch (err) {
    console.error('[tasks] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch task' }] });
  }
});

router.patch('/:agentId/tasks/:taskId', async (req, res) => {
  try {
    const tm = getTaskManager(req.params.agentId);
    const task = tm.update(req.params.taskId, req.body);
    if (!task || task.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Task not found' }] });
    }
    res.json({ status: 'success', data: task });
  } catch (err) {
    console.error('[tasks] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to update task' }] });
  }
});

router.post('/:agentId/tasks/:taskId/assign', async (req, res) => {
  try {
    const tm = getTaskManager(req.params.agentId);
    const { assignedTo } = req.body;
    const task = tm.assign(req.params.taskId, assignedTo);
    if (!task || task.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Task not found' }] });
    }
    res.json({ status: 'success', data: task });
  } catch (err) {
    console.error('[tasks] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to assign task' }] });
  }
});

router.post('/:agentId/tasks/:taskId/start', async (req, res) => {
  try {
    const tm = getTaskManager(req.params.agentId);
    const task = tm.start(req.params.taskId);
    if (!task || task.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Task not found' }] });
    }
    res.json({ status: 'success', data: task });
  } catch (err) {
    console.error('[tasks] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to start task' }] });
  }
});

router.post('/:agentId/tasks/:taskId/complete', async (req, res) => {
  try {
    const tm = getTaskManager(req.params.agentId);
    const { result } = req.body;
    const task = tm.complete(req.params.taskId, result);
    if (!task || task.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Task not found' }] });
    }
    res.json({ status: 'success', data: task });
  } catch (err) {
    console.error('[tasks] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to complete task' }] });
  }
});

router.post('/:agentId/tasks/:taskId/fail', async (req, res) => {
  try {
    const tm = getTaskManager(req.params.agentId);
    const { error } = req.body;
    const task = tm.fail(req.params.taskId, error);
    if (!task || task.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Task not found' }] });
    }
    res.json({ status: 'success', data: task });
  } catch (err) {
    console.error('[tasks] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fail task' }] });
  }
});

router.delete('/:agentId/tasks/:taskId', async (req, res) => {
  try {
    const tm = getTaskManager(req.params.agentId);
    const task = tm.get(req.params.taskId);
    if (!task || task.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Task not found' }] });
    }
    tm.delete(req.params.taskId);
    res.json({ status: 'success', data: { removed: true } });
  } catch (err) {
    console.error('[tasks] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to delete task' }] });
  }
});

router.get('/:agentId/tasks/stats', async (req, res) => {
  try {
    const tm = getTaskManager(req.params.agentId);
    const stats = tm.getStats(req.params.agentId);
    res.json({ status: 'success', data: stats });
  } catch (err) {
    console.error('[tasks] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch stats' }] });
  }
});

// --- JOBS ---

router.get('/:agentId/jobs', async (req, res) => {
  try {
    const jm = getJobManager(req.params.agentId);
    const { status, limit = 100, offset = 0 } = req.query;
    const jobs = jm.getByAgent(req.params.agentId, { 
      status, 
      limit: parseInt(limit), 
      offset: parseInt(offset) 
    });
    res.json({ status: 'success', data: jobs });
  } catch (err) {
    console.error('[jobs] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch jobs' }] });
  }
});

router.get('/:agentId/jobs/:jobId', async (req, res) => {
  try {
    const jm = getJobManager(req.params.agentId);
    const job = jm.get(req.params.jobId);
    if (!job || job.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Job not found' }] });
    }
    res.json({ status: 'success', data: job });
  } catch (err) {
    console.error('[jobs] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch job' }] });
  }
});

router.post('/:agentId/jobs', async (req, res) => {
  try {
    const jm = getJobManager(req.params.agentId);
    const { name, type, schedule, payload, maxRuns, timeout, retryPolicy, nextRun, metadata } = req.body;
    
    if (!name) {
      return res.status(400).json({ status: 'error', errors: [{ message: 'Name is required' }] });
    }

    const job = jm.create(req.params.agentId, { name, type, schedule, payload, maxRuns, timeout, retryPolicy, nextRun, metadata });
    res.status(201).json({ status: 'success', data: job });
  } catch (err) {
    console.error('[jobs] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: err.message || 'Failed to create job' }] });
  }
});

router.patch('/:agentId/jobs/:jobId', async (req, res) => {
  try {
    const jm = getJobManager(req.params.agentId);
    const job = jm.update(req.params.jobId, req.body);
    if (!job || job.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Job not found' }] });
    }
    res.json({ status: 'success', data: job });
  } catch (err) {
    console.error('[jobs] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to update job' }] });
  }
});

router.post('/:agentId/jobs/:jobId/pause', async (req, res) => {
  try {
    const jm = getJobManager(req.params.agentId);
    const job = jm.pause(req.params.jobId);
    if (!job || job.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Job not found' }] });
    }
    res.json({ status: 'success', data: job });
  } catch (err) {
    console.error('[jobs] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to pause job' }] });
  }
});

router.post('/:agentId/jobs/:jobId/resume', async (req, res) => {
  try {
    const jm = getJobManager(req.params.agentId);
    const job = jm.resume(req.params.jobId);
    if (!job || job.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Job not found' }] });
    }
    res.json({ status: 'success', data: job });
  } catch (err) {
    console.error('[jobs] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to resume job' }] });
  }
});

router.post('/:agentId/jobs/:jobId/execute', async (req, res) => {
  try {
    const jm = getJobManager(req.params.agentId);
    // In real usage, executor would be injected
    const job = await jm.execute(req.params.jobId, async (payload) => {
      // Placeholder executor - in real usage this would call the agent
      return { executed: true, payload };
    });
    res.json({ status: 'success', data: job });
  } catch (err) {
    console.error('[jobs] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: err.message || 'Failed to execute job' }] });
  }
});

router.delete('/:agentId/jobs/:jobId', async (req, res) => {
  try {
    const jm = getJobManager(req.params.agentId);
    const job = jm.get(req.params.jobId);
    if (!job || job.agentId !== req.params.agentId) {
      return res.status(404).json({ status: 'error', errors: [{ message: 'Job not found' }] });
    }
    jm.delete(req.params.jobId);
    res.json({ status: 'success', data: { removed: true } });
  } catch (err) {
    console.error('[jobs] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to delete job' }] });
  }
});

router.get('/:agentId/jobs/stats', async (req, res) => {
  try {
    const jm = getJobManager(req.params.agentId);
    const stats = jm.getStats(req.params.agentId);
    res.json({ status: 'success', data: stats });
  } catch (err) {
    console.error('[jobs] error:', err);
    res.status(500).json({ status: 'error', errors: [{ message: 'Failed to fetch stats' }] });
  }
});

export default router;