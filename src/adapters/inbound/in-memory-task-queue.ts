/**
 * In-Memory Task Queue
 * Implements TaskQueuePort using in-memory storage
 */
import { Task, TaskPriority } from '../../core/domain/task';
import { TaskQueuePort } from '../../ports/inbound/task-queue-port';
import { prioritizeTasks } from '../../core/analysis/task-scheduling';

export class InMemoryTaskQueue implements TaskQueuePort {
  private tasks: Map<string, Task> = new Map();
  
  constructor() {}
  
  /**
   * Add a task to the queue
   */
  async enqueue(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }
  
  /**
   * Get the next task from the queue based on priority
   */
  async dequeue(): Promise<Task | null> {
    if (this.tasks.size === 0) {
      return null;
    }
    
    // Convert to array and sort by priority
    const taskArray = Array.from(this.tasks.values());
    const prioritized = prioritizeTasks(taskArray);
    
    // Get the highest priority task
    const nextTask = prioritized[0];
    
    // Remove it from the queue
    this.tasks.delete(nextTask.id);
    
    return nextTask;
  }
  
  /**
   * Get a task by ID without removing it
   */
  async peek(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) || null;
  }
  
  /**
   * Remove a task from the queue
   */
  async remove(taskId: string): Promise<boolean> {
    return this.tasks.delete(taskId);
  }
  
  /**
   * Get the current length of the queue
   */
  async size(): Promise<number> {
    return this.tasks.size;
  }
  
  /**
   * Get all tasks in the queue
   */
  async getAll(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }
  
  /**
   * Get tasks filtered by status, type or priority
   */
  async getFiltered(filters: {
    status?: string;
    type?: string;
    priority?: string;
  }): Promise<Task[]> {
    let filteredTasks = Array.from(this.tasks.values());
    
    // Apply filters if provided
    if (filters.status) {
      filteredTasks = filteredTasks.filter(task => task.status === filters.status);
    }
    
    if (filters.type) {
      filteredTasks = filteredTasks.filter(task => task.type === filters.type);
    }
    
    if (filters.priority) {
      filteredTasks = filteredTasks.filter(task => task.priority === filters.priority as TaskPriority);
    }
    
    return filteredTasks;
  }
  
  /**
   * Clear the queue
   */
  async clear(): Promise<void> {
    this.tasks.clear();
  }
  
  /**
   * Get stats about the queue
   */
  getStats(): Record<string, number> {
    const tasks = Array.from(this.tasks.values());
    
    // Count by status
    const pendingCount = tasks.filter(t => t.status === 'pending').length;
    const processingCount = tasks.filter(t => t.status === 'processing').length;
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    const failedCount = tasks.filter(t => t.status === 'failed').length;
    
    // Count by type
    const calculationCount = tasks.filter(t => t.type === 'calculation').length;
    const ioCount = tasks.filter(t => t.type === 'io').length;
    const networkCount = tasks.filter(t => t.type === 'network').length;
    const customCount = tasks.filter(t => t.type === 'custom').length;
    
    // Count by priority
    const criticalCount = tasks.filter(t => t.priority === 'critical').length;
    const highCount = tasks.filter(t => t.priority === 'high').length;
    const mediumCount = tasks.filter(t => t.priority === 'medium').length;
    const lowCount = tasks.filter(t => t.priority === 'low').length;
    
    return {
      total: tasks.length,
      
      // By status
      pending: pendingCount,
      processing: processingCount,
      completed: completedCount,
      failed: failedCount,
      
      // By type
      calculation: calculationCount,
      io: ioCount,
      network: networkCount,
      custom: customCount,
      
      // By priority
      critical: criticalCount,
      high: highCount,
      medium: mediumCount,
      low: lowCount
    };
  }
}
