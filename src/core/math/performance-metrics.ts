/**
 * Pure functions for performance metrics calculations
 * Follows functional programming paradigm
 */
import { Task } from '../domain/task';
import { Worker } from '../domain/worker';
import { WorkerPool } from '../domain/worker-pool';

/**
 * Calculates the throughput of completed tasks per unit of time
 * @param completedTasks List of completed tasks
 * @param timeWindowMs Time window in milliseconds
 * @returns Tasks per second
 */
export function calculateThroughput(
  completedTasks: Task[], 
  timeWindowMs: number
): number {
  if (timeWindowMs <= 0 || completedTasks.length === 0) {
    return 0;
  }
  
  return (completedTasks.length / timeWindowMs) * 1000;
}

/**
 * Calculates average task latency
 * @param tasks List of tasks with duration
 * @returns Average latency in milliseconds
 */
export function calculateAverageLatency(tasks: Task[]): number {
  const tasksWithDuration = tasks.filter(task => 
    task.duration !== null && task.status === 'completed'
  );
  
  if (tasksWithDuration.length === 0) {
    return 0;
  }
  
  const totalDuration = tasksWithDuration.reduce(
    (sum, task) => sum + (task.duration as number), 
    0
  );
  
  return totalDuration / tasksWithDuration.length;
}

/**
 * Calculates resource utilization for a worker pool
 * @param pool Worker pool to analyze
 * @returns Utilization rates for different resources
 */
export function calculatePoolUtilization(pool: WorkerPool): {
  worker: number;
  cpu: number;
  memory: number;
} {
  const workers = pool.workers;
  
  if (workers.length === 0) {
    return { worker: 0, cpu: 0, memory: 0 };
  }
  
  // Worker utilization (busy workers / total workers)
  const busyWorkers = workers.filter(w => w.status === 'busy').length;
  const workerUtilization = busyWorkers / workers.length;
  
  // CPU utilization (average across workers with metrics)
  const workersWithCpuMetrics = workers.filter(w => w.cpuUsage !== null);
  const cpuUtilization = workersWithCpuMetrics.length > 0
    ? workersWithCpuMetrics.reduce((sum, w) => sum + (w.cpuUsage as number), 0) / workersWithCpuMetrics.length
    : 0;
  
  // Memory utilization (average across workers with metrics)
  const workersWithMemoryMetrics = workers.filter(w => w.memoryUsage !== null);
  const memoryUtilization = workersWithMemoryMetrics.length > 0
    ? workersWithMemoryMetrics.reduce((sum, w) => sum + (w.memoryUsage as number), 0) / workersWithMemoryMetrics.length
    : 0;
  
  return {
    worker: workerUtilization,
    cpu: cpuUtilization,
    memory: memoryUtilization
  };
}

/**
 * Detects workers that appear to be stalled
 * @param workers List of workers to check
 * @param stallThresholdMs Time threshold to consider a worker stalled
 * @returns List of workers that appear to be stalled
 */
export function detectStalledWorkers(
  workers: Worker[], 
  stallThresholdMs: number
): Worker[] {
  const now = Date.now();
  
  return workers.filter(worker => {
    const isBusy = worker.status === 'busy';
    const timeSinceHeartbeat = now - worker.lastHeartbeat;
    
    return isBusy && timeSinceHeartbeat > stallThresholdMs;
  });
}

/**
 * Calculates exponential moving average for a time series metric
 * @param currentAvg Current average value
 * @param newValue New data point
 * @param alpha Weight factor (0-1) where higher values give more weight to new data
 * @returns Updated exponential moving average
 */
export function calculateExponentialMovingAverage(
  currentAvg: number,
  newValue: number,
  alpha: number = 0.2
): number {
  if (alpha < 0 || alpha > 1) {
    throw new Error('Alpha must be between 0 and 1');
  }
  
  return alpha * newValue + (1 - alpha) * currentAvg;
}

/**
 * Calculates optimal number of workers based on current utilization
 * @param currentWorkers Current number of workers
 * @param utilizationRate Current utilization rate (0-1)
 * @param targetUtilization Target utilization rate (0-1), typically 0.7-0.8
 * @param maxWorkers Maximum allowed workers
 * @returns Recommended number of workers
 */
export function calculateOptimalWorkerCount(
  currentWorkers: number,
  utilizationRate: number,
  targetUtilization: number = 0.7,
  maxWorkers: number
): number {
  if (utilizationRate <= 0) {
    return 1; // Always keep at least one worker
  }
  
  // Calculate optimal worker count to achieve target utilization
  const optimalWorkers = Math.ceil((utilizationRate * currentWorkers) / targetUtilization);
  
  // Ensure we stay within bounds
  return Math.max(1, Math.min(maxWorkers, optimalWorkers));
}
