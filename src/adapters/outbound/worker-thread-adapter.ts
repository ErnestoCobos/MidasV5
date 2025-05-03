/**
 * Worker Thread Adapter
 * Implements WorkerThreadPort using Node.js Worker Threads
 */
import { Worker as NodeWorker } from 'worker_threads';
import { Worker, WorkerType } from '../../core/domain/worker';
import { Task } from '../../core/domain/task';
import { WorkerThreadPort } from '../../ports/outbound/worker-thread-port';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

export class WorkerThreadAdapter implements WorkerThreadPort {
  private workers: Map<string, NodeWorker> = new Map();
  private messageHandlers: Map<string, Set<(message: any) => void>> = new Map();
  
  constructor(
    private readonly workerScriptPath: string = path.resolve(__dirname, '../../workers/worker-thread.js'),
    private readonly resourceLimits: { maxOldGenerationSizeMb?: number } = {}
  ) {}
  
  /**
   * Create a new worker thread
   */
  async createWorker(): Promise<Worker> {
    const workerId = crypto.randomUUID();
    
    // Configure and create the Node.js worker thread
    const nodeWorker = new NodeWorker(this.workerScriptPath, {
      workerData: { workerId },
      resourceLimits: this.resourceLimits
    });
    
    // Store reference to the worker
    this.workers.set(workerId, nodeWorker);
    this.messageHandlers.set(workerId, new Set());
    
    // Create domain model Worker
    const worker = new Worker(
      workerId,
      'thread',
      nodeWorker.threadId
    );
    
    // Wait for the worker to be ready
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Worker initialization timed out'));
      }, 10000); // 10s timeout
      
      const messageHandler = (message: any) => {
        if (message.type === 'ready') {
          cleanup();
          resolve(worker);
        }
      };
      
      const errorHandler = (error: Error) => {
        cleanup();
        reject(error);
      };
      
      const exitHandler = (code: number) => {
        if (code !== 0) {
          cleanup();
          reject(new Error(`Worker exited with code ${code} during initialization`));
        }
      };
      
      // Cleanup function to remove listeners
      const cleanup = () => {
        clearTimeout(timeout);
        nodeWorker.off('message', messageHandler);
        nodeWorker.off('error', errorHandler);
        nodeWorker.off('exit', exitHandler);
      };
      
      // Set up event listeners
      nodeWorker.on('message', messageHandler);
      nodeWorker.on('error', errorHandler);
      nodeWorker.on('exit', exitHandler);
      
      // Send initialization message to worker
      nodeWorker.postMessage({ type: 'init' });
    });
  }
  
  /**
   * Terminate a worker thread
   */
  async terminateWorker(workerId: string): Promise<boolean> {
    const nodeWorker = this.workers.get(workerId);
    
    if (!nodeWorker) {
      return false;
    }
    
    try {
      // Try graceful termination first
      nodeWorker.postMessage({ type: 'terminate' });
      
      // Give it a chance to clean up
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force terminate if still alive
      await nodeWorker.terminate();
      
      // Clean up
      this.workers.delete(workerId);
      this.messageHandlers.delete(workerId);
      
      return true;
    } catch (error) {
      console.error(`Error terminating worker ${workerId}:`, error);
      return false;
    }
  }
  
  /**
   * Execute a task on a worker thread
   */
  async executeTask(workerId: string, task: Task): Promise<unknown> {
    const nodeWorker = this.workers.get(workerId);
    
    if (!nodeWorker) {
      throw new Error(`Worker thread ${workerId} not found`);
    }
    
    return new Promise((resolve, reject) => {
      // Timeout to prevent indefinite waiting
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Task execution timed out for task ${task.id}`));
      }, 30000); // 30s timeout
      
      // Handle task completion message
      const messageHandler = (message: any) => {
        if (message.type === 'task_result' && message.taskId === task.id) {
          cleanup();
          resolve(message.result);
        }
      };
      
      // Handle errors
      const errorHandler = (error: Error) => {
        cleanup();
        reject(error);
      };
      
      // Handle worker exit during task execution
      const exitHandler = (code: number) => {
        cleanup();
        reject(new Error(`Worker exited with code ${code} while processing task ${task.id}`));
      };
      
      // Cleanup function to remove listeners
      const cleanup = () => {
        clearTimeout(timeout);
        nodeWorker.off('message', messageHandler);
        nodeWorker.off('error', errorHandler);
        nodeWorker.off('exit', exitHandler);
      };
      
      // Set up event listeners
      nodeWorker.on('message', messageHandler);
      nodeWorker.on('error', errorHandler);
      nodeWorker.on('exit', exitHandler);
      
      // Send task to worker
      nodeWorker.postMessage({
        type: 'execute_task',
        taskId: task.id,
        payload: task.payload,
        taskType: task.type
      });
    });
  }
  
  /**
   * Get metrics from a worker thread
   */
  async getWorkerMetrics(workerId: string): Promise<{ cpu: number; memory: number } | null> {
    const nodeWorker = this.workers.get(workerId);
    
    if (!nodeWorker) {
      return null;
    }
    
    return new Promise((resolve) => {
      // Timeout for metrics request
      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 2000); // 2s timeout
      
      // Handle metrics response
      const messageHandler = (message: any) => {
        if (message.type === 'metrics') {
          cleanup();
          resolve({
            cpu: message.cpu || 0,
            memory: message.memory || 0
          });
        }
      };
      
      // Cleanup function
      const cleanup = () => {
        clearTimeout(timeout);
        nodeWorker.off('message', messageHandler);
      };
      
      // Set up message listener
      nodeWorker.on('message', messageHandler);
      
      // Request metrics
      nodeWorker.postMessage({ type: 'get_metrics' });
    });
  }
  
  /**
   * Get all active worker threads
   */
  async getAllWorkers(): Promise<Worker[]> {
    const workers: Worker[] = [];
    
    for (const [workerId, nodeWorker] of this.workers.entries()) {
      if (nodeWorker.threadId) {
        const worker = new Worker(
          workerId,
          'thread',
          nodeWorker.threadId
        );
        
        // Try to get metrics if available
        const metrics = await this.getWorkerMetrics(workerId);
        if (metrics) {
          worker.updateMetrics(metrics);
        }
        
        workers.push(worker);
      }
    }
    
    return workers;
  }
  
  /**
   * Check if a worker is responsive
   */
  async isWorkerResponsive(workerId: string): Promise<boolean> {
    const nodeWorker = this.workers.get(workerId);
    
    if (!nodeWorker) {
      return false;
    }
    
    return new Promise((resolve) => {
      // Timeout for ping
      const timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 3000); // 3s timeout
      
      // Handle ping response
      const messageHandler = (message: any) => {
        if (message.type === 'pong') {
          cleanup();
          resolve(true);
        }
      };
      
      // Cleanup function
      const cleanup = () => {
        clearTimeout(timeout);
        nodeWorker.off('message', messageHandler);
      };
      
      // Set up message listener
      nodeWorker.on('message', messageHandler);
      
      // Send ping
      nodeWorker.postMessage({ type: 'ping' });
    });
  }
  
  /**
   * Send a message to a worker
   */
  async sendMessage(workerId: string, message: any): Promise<void> {
    const nodeWorker = this.workers.get(workerId);
    
    if (!nodeWorker) {
      throw new Error(`Worker thread ${workerId} not found`);
    }
    
    nodeWorker.postMessage({
      type: 'custom_message',
      data: message
    });
  }
}
