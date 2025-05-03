/**
 * ClusterManagerPort: Outbound port for Node.js Cluster management
 */
import { Worker } from '../../core/domain/worker';
import { Task } from '../../core/domain/task';

export interface ClusterManagerPort {
  /**
   * Initialize the cluster with a number of workers
   */
  initialize(numWorkers: number): Promise<Worker[]>;
  
  /**
   * Scale the cluster up or down
   */
  scale(targetWorkerCount: number): Promise<Worker[]>;
  
  /**
   * Distribute HTTP workload across cluster workers
   */
  distributeRequest(req: unknown, res: unknown): Promise<void>;
  
  /**
   * Execute a task on a specific cluster worker
   */
  executeTask(workerId: string, task: Task): Promise<unknown>;
  
  /**
   * Get metrics from all cluster workers
   */
  getClusterMetrics(): Promise<{
    workers: Array<{
      id: string;
      cpu: number;
      memory: number;
      requests: number;
    }>;
    totalRequests: number;
  }>;
  
  /**
   * Gracefully shutdown the cluster
   */
  shutdown(): Promise<void>;

  /**
   * Get status of all cluster workers
   */
  getStatus(): Promise<{
    active: number;
    idle: number;
    dead: number;
  }>;

  /**
   * Restart a specific worker
   */
  restartWorker(workerId: string): Promise<Worker>;
}
