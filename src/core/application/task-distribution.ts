/**
 * Core application service: TaskDistributionService
 * Manages the distribution of tasks to appropriate workers
 */
import { Task } from '../domain/task';
import { Worker } from '../domain/worker';
import { WorkerPool } from '../domain/worker-pool';
import { distributeTasksByType } from '../analysis/task-scheduling';
import { TaskQueuePort } from '../../ports/inbound/task-queue-port';
import { WorkerThreadPort } from '../../ports/outbound/worker-thread-port';
import { ClusterManagerPort } from '../../ports/outbound/cluster-manager-port';
import { ChildProcessPort } from '../../ports/outbound/child-process-port';
import { MetricsStorePort } from '../../ports/outbound/metrics-store-port';

export class TaskDistributionService {
  private threadPool: WorkerPool;
  private clusterPool: WorkerPool;
  private processPool: WorkerPool;
  
  constructor(
    private readonly taskQueue: TaskQueuePort,
    private readonly workerThreadPort: WorkerThreadPort,
    private readonly clusterManagerPort: ClusterManagerPort,
    private readonly childProcessPort: ChildProcessPort,
    private readonly metricsStore: MetricsStorePort,
    private readonly maxThreadWorkers: number = 4,
    private readonly maxClusterWorkers: number = 4,
    private readonly maxChildProcesses: number = 2
  ) {
    this.threadPool = new WorkerPool('thread-pool', 'thread', this.maxThreadWorkers);
    this.clusterPool = new WorkerPool('cluster-pool', 'cluster', this.maxClusterWorkers);
    this.processPool = new WorkerPool('process-pool', 'child-process', this.maxChildProcesses);
  }
  
  /**
   * Initialize worker pools
   */
  async initialize(): Promise<void> {
    // Initialize thread pool
    const threadWorkers = await Promise.all(
      Array.from({ length: this.maxThreadWorkers }).map(() => 
        this.workerThreadPort.createWorker()
      )
    );
    
    threadWorkers.forEach(worker => this.threadPool.addWorker(worker));
    
    // Initialize cluster pool
    const clusterWorkers = await this.clusterManagerPort.initialize(this.maxClusterWorkers);
    clusterWorkers.forEach(worker => this.clusterPool.addWorker(worker));
    
    // Initialize process pool (initially empty, created on-demand)
    
    // Log initialization
    await this.metricsStore.storeEvent('system.initialized', {
      threadWorkers: this.threadPool.size,
      clusterWorkers: this.clusterPool.size,
      processWorkers: this.processPool.size
    });
  }
  
  /**
   * Distribute pending tasks to available workers
   */
  async distributeTasks(): Promise<void> {
    // Get only pending tasks, not all tasks
    const allTasks = await this.taskQueue.getAll();
    const pendingTasks = allTasks.filter(task => task.status === 'pending');
    if (pendingTasks.length === 0) return;
    
    // Get available workers
    const threadWorkers = this.threadPool.workers;
    const clusterWorkers = this.clusterPool.workers;
    const processWorkers = this.processPool.workers;
    
    // Distribute tasks to appropriate workers
    const assignments = distributeTasksByType(
      pendingTasks,
      threadWorkers,
      clusterWorkers,
      processWorkers
    );
    
    // Execute assignments
    const executionPromises: Promise<void>[] = [];
    
    for (const [taskId, workerId] of assignments.entries()) {
      const task = await this.taskQueue.peek(taskId);
      if (!task) continue;
      
      // Find which pool the worker belongs to
      let worker: Worker | null = this.threadPool.getWorker(workerId);
      let port = this.workerThreadPort;
      
      if (!worker) {
        worker = this.clusterPool.getWorker(workerId);
        port = this.clusterManagerPort as any;
      }
      
      if (!worker) {
        worker = this.processPool.getWorker(workerId);
        port = this.childProcessPort as any;
      }
      
      if (!worker) continue;
      
      // Mark task as being processed
      task.markAsProcessing(workerId);
      worker.assignTask(taskId);
      
      // Execute task
      const executionPromise = port.executeTask(workerId, task)
        .then(result => {
          task.complete(result);
          worker!.completeTask();
          return this.metricsStore.storeMetric('task.success', 1, {
            type: task.type,
            workerType: worker!.type
          });
        })
        .catch(error => {
          task.fail(error);
          
          // Requeue if can retry
          if (task.canRetry) {
            task.reset();
            return this.taskQueue.enqueue(task);
          }
          
          return this.metricsStore.storeMetric('task.failure', 1, {
            type: task.type,
            workerType: worker!.type
          });
        });
      
      executionPromises.push(executionPromise);
    }
    
    await Promise.allSettled(executionPromises);
    
    // Record metrics
    await this.metricsStore.storeMetric('tasks.assigned', assignments.size);
  }
  
  /**
   * Cleanup resources before shutdown
   */
  async shutdown(): Promise<void> {
    // Terminate all workers
    const threadTerminations = this.threadPool.workers.map(worker => 
      this.workerThreadPort.terminateWorker(worker.id));
    
    await this.clusterManagerPort.shutdown();
    
    const processTerminations = this.processPool.workers.map(worker => 
      this.childProcessPort.killProcess(worker.id));
    
    await Promise.all([...threadTerminations, ...processTerminations]);
    
    await this.metricsStore.storeEvent('system.shutdown', {
      timestamp: Date.now()
    });
  }
  
  /**
   * Get the pool utilization statistics
   */
  getPoolsStatistics(): Record<string, unknown> {
    return {
      threadPool: this.threadPool.getStatistics(),
      clusterPool: this.clusterPool.getStatistics(),
      processPool: this.processPool.getStatistics(),
      timestamp: Date.now()
    };
  }
}
