/**
 * Pure functions for task scheduling and assignment
 * Follows functional programming paradigm
 */
import { Task } from '../domain/task';
import { Worker } from '../domain/worker';

/**
 * Ranks workers by load and availability for fair task distribution
 * @param workers List of workers to rank
 * @returns Workers sorted by preference for task assignment
 */
export function rankWorkersByLoad(workers: Worker[]): Worker[] {
  return [...workers].sort((a, b) => {
    // First sorting criteria: availability
    if (a.isAvailable && !b.isAvailable) return -1;
    if (!b.isAvailable && a.isAvailable) return 1;
    
    // Second sorting criteria: task count
    return a.taskCount - b.taskCount;
  });
}

/**
 * Prioritizes tasks based on different criteria
 * @param tasks List of tasks to prioritize
 * @returns Tasks sorted by execution priority
 */
export function prioritizeTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // First by explicit priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    // Then by retry count (higher retry count = higher priority)
    // Access the private property via getter for type safety
    const aRetryCount = (a as any)._retryCount || 0;
    const bRetryCount = (b as any)._retryCount || 0;
    if (aRetryCount !== bRetryCount) {
      return bRetryCount - aRetryCount;
    }
    
    // Finally by age (older = higher priority, using ID as approximation)
    return a.id.localeCompare(b.id);
  });
}

/**
 * Optimally matches tasks to workers based on task type and worker capabilities
 * @param tasks Tasks to be assigned
 * @param workers Available workers
 * @returns Map of task IDs to worker IDs for optimal assignment
 */
export function matchTasksToWorkers(tasks: Task[], workers: Worker[]): Map<string, string> {
  const assignments = new Map<string, string>();
  const availableWorkers = workers.filter(w => w.isAvailable);
  
  if (availableWorkers.length === 0 || tasks.length === 0) {
    return assignments;
  }
  
  // Sort tasks by priority
  const prioritizedTasks = prioritizeTasks(tasks);
  
  // Sort workers by load
  const rankedWorkers = rankWorkersByLoad(availableWorkers);
  
  // Simple round-robin assignment
  prioritizedTasks.forEach((task, index) => {
    if (index < rankedWorkers.length) {
      assignments.set(task.id, rankedWorkers[index].id);
    }
  });
  
  return assignments;
}

/**
 * Distributes tasks intelligently among different types of workers
 * @param tasks Tasks to distribute
 * @param threadWorkers Worker threads (best for CPU-intensive tasks)
 * @param clusterWorkers Cluster workers (best for high-concurrency HTTP)
 * @param processWorkers Child processes (best for isolated tasks)
 * @returns Assignments map of task IDs to worker IDs
 */
export function distributeTasksByType(
  tasks: Task[],
  threadWorkers: Worker[],
  clusterWorkers: Worker[],
  processWorkers: Worker[]
): Map<string, string> {
  const assignments = new Map<string, string>();
  
  // Group tasks by type
  const calculationTasks = tasks.filter(t => t.type === 'calculation');
  const networkTasks = tasks.filter(t => t.type === 'network');
  const ioTasks = tasks.filter(t => t.type === 'io');
  const customTasks = tasks.filter(t => t.type === 'custom');
  
  // Match tasks to appropriate worker types
  const threadAssignments = matchTasksToWorkers(calculationTasks, threadWorkers);
  const clusterAssignments = matchTasksToWorkers(networkTasks, clusterWorkers);
  const processAssignments = matchTasksToWorkers([...ioTasks, ...customTasks], processWorkers);
  
  // Combine all assignments
  for (const [taskId, workerId] of threadAssignments.entries()) {
    assignments.set(taskId, workerId);
  }
  
  for (const [taskId, workerId] of clusterAssignments.entries()) {
    assignments.set(taskId, workerId);
  }
  
  for (const [taskId, workerId] of processAssignments.entries()) {
    assignments.set(taskId, workerId);
  }
  
  return assignments;
}
