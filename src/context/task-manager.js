/**
 * Task Manager — Local task queue with CRUD, priority, status tracking
 */

import crypto from 'crypto';

export const TaskStatus = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export const TaskPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
};

export class TaskManager {
  constructor(options = {}) {
    this.tasks = new Map();
    this.maxTasks = options.maxTasks || 10000;
  }

  /**
   * Create a new task.
   */
  create(agentId, taskData) {
    if (this.tasks.size >= this.maxTasks) {
      throw new Error('Task queue full');
    }

    const task = {
      id: crypto.randomUUID(),
      agentId,
      title: taskData.title,
      description: taskData.description || '',
      status: TaskStatus.PENDING,
      priority: taskData.priority || TaskPriority.NORMAL,
      payload: taskData.payload || {},
      result: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      assignedTo: taskData.assignedTo || null,
      tags: Array.isArray(taskData.tags) ? taskData.tags : [],
      metadata: taskData.metadata || {},
    };

    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * Get task by ID.
   */
  get(taskId) {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Get all tasks for an agent.
   */
  getByAgent(agentId, options = {}) {
    const { status, limit = 100, offset = 0 } = options;
    let tasks = [...this.tasks.values()].filter(t => t.agentId === agentId);

    if (status) {
      tasks = tasks.filter(t => t.status === status);
    }

    // Sort: pending/high priority first
    tasks.sort((a, b) => {
      const priorityOrder = { [TaskPriority.CRITICAL]: 0, [TaskPriority.HIGH]: 1, [TaskPriority.NORMAL]: 2, [TaskPriority.LOW]: 3 };
      const statusOrder = { [TaskStatus.PENDING]: 0, [TaskStatus.ASSIGNED]: 1, [TaskStatus.IN_PROGRESS]: 2, [TaskStatus.COMPLETED]: 3, [TaskStatus.FAILED]: 4, [TaskStatus.CANCELLED]: 5 };
      const prioDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (prioDiff !== 0) return prioDiff;
      return statusOrder[a.status] - statusOrder[b.status];
    });

    return tasks.slice(offset, offset + limit);
  }

  /**
   * Update task.
   */
  update(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const allowedUpdates = ['title', 'description', 'status', 'priority', 'payload', 'result', 'error', 'assignedTo', 'tags', 'metadata'];
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) task[key] = updates[key];
    }

    task.updatedAt = new Date().toISOString();

    // Set timestamps on status transitions
    if (updates.status === TaskStatus.IN_PROGRESS && !task.startedAt) {
      task.startedAt = new Date().toISOString();
    }
    if ([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(updates.status) && !task.completedAt) {
      task.completedAt = new Date().toISOString();
    }

    this.tasks.set(taskId, task);
    return task;
  }

  /**
   * Delete task.
   */
  delete(taskId) {
    return this.tasks.delete(taskId);
  }

  /**
   * Assign task to agent/worker.
   */
  assign(taskId, assignedTo) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = TaskStatus.ASSIGNED;
    task.assignedTo = assignedTo;
    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    return task;
  }

  /**
   * Start task execution.
   */
  start(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = TaskStatus.IN_PROGRESS;
    task.startedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    return task;
  }

  /**
   * Complete task with result.
   */
  complete(taskId, result) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = TaskStatus.COMPLETED;
    task.result = result;
    task.completedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    return task;
  }

  /**
   * Fail task with error.
   */
  fail(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    task.status = TaskStatus.FAILED;
    task.error = error;
    task.completedAt = new Date().toISOString();
    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    return task;
  }

  /**
   * Get task statistics.
   */
  getStats(agentId = null) {
    let tasks = agentId 
      ? [...this.tasks.values()].filter(t => t.agentId === agentId)
      : [...this.tasks.values()];

    const stats = {
      total: tasks.length,
      byStatus: {},
      byPriority: {},
      avgCompletionTimeMs: 0,
    };

    let completedWithTimes = 0;
    let totalCompletionTime = 0;

    for (const task of tasks) {
      stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
      stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;

      if (task.completedAt && task.startedAt) {
        totalCompletionTime += new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
        completedWithTimes++;
      }
    }

    if (completedWithTimes > 0) {
      stats.avgCompletionTimeMs = totalCompletionTime / completedWithTimes;
    }

    return stats;
  }

  /**
   * Clear completed/failed/cancelled tasks older than maxAge.
   */
  prune(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const cutoff = Date.now() - maxAgeMs;
    let pruned = 0;
    for (const [id, task] of this.tasks) {
      if ([TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED].includes(task.status)) {
        const updated = new Date(task.updatedAt).getTime();
        if (updated < cutoff) {
          this.tasks.delete(id);
          pruned++;
        }
      }
    }
    return pruned;
  }
}

export default TaskManager;