/**
 * ChildProcessPort: Outbound port for Child Process management
 */
import { Worker } from '../../core/domain/worker';
import { Task } from '../../core/domain/task';

export interface ChildProcessPort {
  /**
   * Spawn a new child process
   */
  spawnProcess(command: string, args: string[]): Promise<Worker>;
  
  /**
   * Kill a child process
   */
  killProcess(workerId: string): Promise<boolean>;
  
  /**
   * Execute a task in a child process
   */
  executeTask(workerId: string, task: Task): Promise<unknown>;
  
  /**
   * Get metrics from a child process
   */
  getProcessMetrics(workerId: string): Promise<{
    cpu: number;
    memory: number;
  } | null>;
  
  /**
   * Get all active child processes
   */
  getAllProcesses(): Promise<Worker[]>;

  /**
   * Check if a process is still alive
   */
  isProcessAlive(workerId: string): Promise<boolean>;

  /**
   * Send signal to a process
   */
  sendSignal(workerId: string, signal: string): Promise<boolean>;

  /**
   * Attach event listeners to a process
   */
  attachEventListeners(
    workerId: string, 
    events: { 
      exit?: boolean; 
      error?: boolean; 
      message?: boolean;
      stdout?: boolean;
      stderr?: boolean;
    }
  ): Promise<void>;
}
