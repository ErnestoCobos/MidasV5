/**
 * TaskQueuePort: Inbound port for task queue operations
 */
import { Task } from '../../core/domain/task';

export interface TaskQueuePort {
  /**
   * Add a task to the queue
   */
  enqueue(task: Task): Promise<void>;
  
  /**
   * Get the next task from the queue based on priority
   */
  dequeue(): Promise<Task | null>;
  
  /**
   * Get a task by ID without removing it
   */
  peek(taskId: string): Promise<Task | null>;
  
  /**
   * Remove a task from the queue
   */
  remove(taskId: string): Promise<boolean>;
  
  /**
   * Get the current length of the queue
   */
  size(): Promise<number>;
  
  /**
   * Get all tasks in the queue
   */
  getAll(): Promise<Task[]>;

  /**
   * Get tasks filtered by status, type or priority
   */
  getFiltered(filters: {
    status?: string;
    type?: string;
    priority?: string;
  }): Promise<Task[]>;

  /**
   * Clear the queue
   */
  clear(): Promise<void>;
}
