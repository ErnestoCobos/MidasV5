/**
 * WorkerThreadPort: Outbound port for Worker Threads management
 */
import { Worker } from '../../core/domain/worker';
import { Task } from '../../core/domain/task';

export interface WorkerThreadPort {
  /**
   * Create a new worker thread
   */
  createWorker(): Promise<Worker>;
  
  /**
   * Terminate a worker thread
   */
  terminateWorker(workerId: string): Promise<boolean>;
  
  /**
   * Execute a task on a worker thread
   */
  executeTask(workerId: string, task: Task): Promise<unknown>;
  
  /**
   * Get metrics from a worker thread
   */
  getWorkerMetrics(workerId: string): Promise<{
    cpu: number;
    memory: number;
  } | null>;
  
  /**
   * Get all active worker threads
   */
  getAllWorkers(): Promise<Worker[]>;

  /**
   * Check if a worker is responsive
   */
  isWorkerResponsive(workerId: string): Promise<boolean>;
  
  /**
   * Send a message to a worker
   */
  sendMessage(workerId: string, message: any): Promise<void>;
}
