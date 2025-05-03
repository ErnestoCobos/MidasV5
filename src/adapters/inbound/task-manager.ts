/**
 * Task Manager
 * Implements TaskManagerPort to manage the task processing system
 */
import { Task, TaskType, TaskPriority } from '../../core/domain/task';
import { TaskManagerPort } from '../../ports/inbound/task-manager-port';
import { TaskQueuePort } from '../../ports/inbound/task-queue-port';
import { TaskDistributionService } from '../../core/application/task-distribution';
import { WorkerManagementService } from '../../core/application/worker-management';
import { MonitoringService } from '../../core/application/monitoring-service';

export class TaskManager implements TaskManagerPort {
  constructor(
    private readonly taskQueue: TaskQueuePort,
    private readonly taskDistribution: TaskDistributionService,
    private readonly workerManagement: WorkerManagementService,
    private readonly monitoring: MonitoringService
  ) {}
  
  /**
   * Initialize the system
   */
  async initialize(): Promise<void> {
    // Initialize task distribution (which sets up worker pools)
    await this.taskDistribution.initialize();
    
    // Start task distribution process
    this.startTaskDistributionLoop();
    
    // Start worker monitoring process
    this.startWorkerMonitoringLoop();
    
    // Start metrics collection
    this.startMetricsCollectionLoop();
  }
  
  /**
   * Submit a new task for processing
   */
  async submitTask(
    payload: unknown, 
    type: TaskType, 
    priority: TaskPriority
  ): Promise<Task> {
    // Create a new task
    const task = new Task(payload, type, priority);
    
    // Add to queue
    await this.taskQueue.enqueue(task);
    
    // Return the created task
    return task;
  }
  
  /**
   * Get a task by its ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    return this.taskQueue.peek(taskId);
  }
  
  /**
   * Cancel a pending or processing task
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = await this.taskQueue.peek(taskId);
    
    if (!task) {
      return false;
    }
    
    // Only cancel if it's pending
    if (task.status === 'pending') {
      return this.taskQueue.remove(taskId);
    }
    
    // For processing tasks, it's harder to cancel as they're already running
    // In a real implementation, we'd need a cancellation token system
    // This is simplified and only cancels pending tasks
    return false;
  }
  
  /**
   * Get all tasks matching optional filters
   */
  async getTasks(filters?: {
    status?: string;
    type?: string;
    priority?: string;
  }): Promise<Task[]> {
    if (!filters) {
      return this.taskQueue.getAll();
    }
    
    return this.taskQueue.getFiltered(filters);
  }
  
  /**
   * Get system status including workers and tasks
   */
  async getSystemStatus(): Promise<{
    workers: {
      total: number;
      available: number;
      busy: number;
      unhealthy: number;
    };
    tasks: {
      pending: number;
      processing: number;
      completed: number;
      failed: number;
    };
    performance: {
      throughput: number;
      averageLatency: number;
      resourceUtilization: {
        worker: number;
        cpu: number;
        memory: number;
      };
    };
  }> {
    // Get workers stats
    const allWorkers = this.workerManagement.getAllWorkers();
    const availableWorkers = allWorkers.filter(w => w.isAvailable);
    const busyWorkers = allWorkers.filter(w => w.status === 'busy');
    const unhealthyWorkers = allWorkers.filter(w => !w.isHealthy);
    
    // Get tasks stats from queue (we might need to add some custom counts)
    const queueStats = (this.taskQueue as any).getStats?.() || {};
    
    // Get performance metrics from monitoring service
    const monitoringStatus = await this.monitoring.getSystemStatus() as Record<string, any>;
    
    // Compile the result
    return {
      workers: {
        total: allWorkers.length,
        available: availableWorkers.length,
        busy: busyWorkers.length,
        unhealthy: unhealthyWorkers.length
      },
      tasks: {
        pending: queueStats.pending || 0,
        processing: queueStats.processing || 0,
        completed: queueStats.completed || 0,
        failed: queueStats.failed || 0
      },
      performance: {
        throughput: 
          (monitoringStatus.currentMetrics && monitoringStatus.currentMetrics.throughput) || 0,
        averageLatency: 
          (monitoringStatus.currentMetrics && monitoringStatus.currentMetrics.latency) || 0,
        resourceUtilization: {
          worker: (monitoringStatus.currentMetrics?.workerPools?.thread?.utilizationRate as number) || 0,
          cpu: (monitoringStatus.currentMetrics?.workerPools?.thread?.cpu as number) || 0,
          memory: (monitoringStatus.currentMetrics?.workerPools?.thread?.memory as number) || 0
        }
      }
    };
  }
  
  /**
   * Shutdown the system
   */
  async shutdown(): Promise<void> {
    // Stop the task distribution loop
    this.isRunning = false;
    
    // Shutdown task distribution service
    await this.taskDistribution.shutdown();
  }
  
  // Private properties
  private isRunning = false;
  
  // Private methods
  
  /**
   * Start continuous task distribution loop
   */
  private startTaskDistributionLoop(): void {
    this.isRunning = true;
    
    const distributionLoop = async () => {
      if (!this.isRunning) return;
      
      try {
        // Distribute tasks to available workers
        await this.taskDistribution.distributeTasks();
      } catch (error) {
        console.error('Error in task distribution loop:', error);
      }
      
      // Schedule next iteration
      setTimeout(distributionLoop, 100); // Run every 100ms
    };
    
    // Start the loop
    distributionLoop();
  }
  
  /**
   * Start worker monitoring and recovery loop
   */
  private startWorkerMonitoringLoop(): void {
    const monitoringLoop = async () => {
      if (!this.isRunning) return;
      
      try {
        // Monitor and recover problematic workers
        await this.workerManagement.monitorAndRecoverWorkers();
        
        // Auto-scale workers based on demand
        await this.workerManagement.autoScale();
      } catch (error) {
        console.error('Error in worker monitoring loop:', error);
      }
      
      // Schedule next iteration
      setTimeout(monitoringLoop, 5000); // Run every 5 seconds
    };
    
    // Start the loop
    monitoringLoop();
  }
  
  /**
   * Start metrics collection loop
   */
  private startMetricsCollectionLoop(): void {
    const metricsLoop = async () => {
      if (!this.isRunning) return;
      
      try {
        // Collect and store metrics
        await this.monitoring.collectAndStoreMetrics();
      } catch (error) {
        console.error('Error in metrics collection loop:', error);
      }
      
      // Schedule next iteration
      setTimeout(metricsLoop, 1000); // Run every 1 second
    };
    
    // Start the loop
    metricsLoop();
  }
}
