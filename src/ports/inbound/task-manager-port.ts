/**
 * TaskManagerPort: Inbound port for managing tasks from the API or CLI
 */
import { Task, TaskType, TaskPriority } from '../../core/domain/task';

export interface TaskManagerPort {
  /**
   * Submit a new task for processing
   */
  submitTask(
    payload: unknown, 
    type: TaskType, 
    priority: TaskPriority
  ): Promise<Task>;
  
  /**
   * Get a task by its ID
   */
  getTask(taskId: string): Promise<Task | null>;
  
  /**
   * Cancel a pending or processing task
   */
  cancelTask(taskId: string): Promise<boolean>;
  
  /**
   * Get all tasks matching optional filters
   */
  getTasks(filters?: {
    status?: string;
    type?: string;
    priority?: string;
  }): Promise<Task[]>;
  
  /**
   * Get system status including workers and tasks
   */
  getSystemStatus(): Promise<{
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
  }>;
}
