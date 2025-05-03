/**
 * Core application service: WorkerManagementService
 * Manages worker lifecycle, scaling, and recovery
 */
import { Worker, WorkerType } from '../domain/worker';
import { WorkerPool } from '../domain/worker-pool';
import { detectStalledWorkers, calculateOptimalWorkerCount } from '../math/performance-metrics';
import { WorkerThreadPort } from '../../ports/outbound/worker-thread-port';
import { ClusterManagerPort } from '../../ports/outbound/cluster-manager-port';
import { ChildProcessPort } from '../../ports/outbound/child-process-port';
import { MetricsStorePort } from '../../ports/outbound/metrics-store-port';

export class WorkerManagementService {
  private threadPool: WorkerPool;
  private clusterPool: WorkerPool;
  private processPool: WorkerPool;
  private readonly stallThresholdMs = 30000; // 30 segundos
  
  constructor(
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
   * Scale a worker pool to the target size
   */
  async scaleWorkerPool(
    type: WorkerType, 
    targetCount: number
  ): Promise<WorkerPool> {
    let pool: WorkerPool;
    let port: WorkerThreadPort | ClusterManagerPort | ChildProcessPort;
    let maxSize: number;
    
    // Determine pool and port to use
    switch (type) {
      case 'thread':
        pool = this.threadPool;
        port = this.workerThreadPort;
        maxSize = this.maxThreadWorkers;
        break;
      case 'cluster':
        pool = this.clusterPool;
        port = this.clusterManagerPort;
        maxSize = this.maxClusterWorkers;
        break;
      case 'child-process':
        pool = this.processPool;
        port = this.childProcessPort;
        maxSize = this.maxChildProcesses;
        break;
      default:
        throw new Error(`Unsupported worker type: ${type}`);
    }
    
    // Validate limits
    targetCount = Math.max(pool.minSize, Math.min(maxSize, targetCount));
    
    // Scale up
    if (targetCount > pool.size) {
      const workersToAdd = targetCount - pool.size;
      
      for (let i = 0; i < workersToAdd; i++) {
        let worker: Worker;
        
        if (type === 'thread') {
          worker = await (port as WorkerThreadPort).createWorker();
        } else if (type === 'cluster') {
          const workers = await (port as ClusterManagerPort).scale(targetCount);
          // Filter out workers already in the pool
          const newWorkers = workers.filter(w => !pool.getWorker(w.id));
          
          if (newWorkers.length > 0) {
            worker = newWorkers[0];
          } else {
            continue;
          }
        } else {
          // For child process, spawn on demand with a specific command
          worker = await (port as ChildProcessPort).spawnProcess('node', ['workers/worker-process.js']);
        }
        
        pool.addWorker(worker);
        await this.metricsStore.storeEvent('worker.created', {
          workerId: worker.id,
          workerType: worker.type
        });
      }
    }
    // Scale down
    else if (targetCount < pool.size) {
      const workersToRemove = pool.size - targetCount;
      const availableWorkers = pool.getAvailableWorkers();
      
      // Remove idle workers first
      for (let i = 0; i < Math.min(workersToRemove, availableWorkers.length); i++) {
        const worker = availableWorkers[i];
        pool.removeWorker(worker.id);
        
        if (type === 'thread') {
          await (port as WorkerThreadPort).terminateWorker(worker.id);
        } else if (type === 'cluster') {
          // Cluster might require a different approach when scaling down
          await (port as ClusterManagerPort).scale(targetCount);
        } else {
          await (port as ChildProcessPort).killProcess(worker.id);
        }
        
        await this.metricsStore.storeEvent('worker.terminated', {
          workerId: worker.id,
          workerType: worker.type
        });
      }
    }
    
    return pool;
  }
  
  /**
   * Monitor and recover problematic workers
   */
  async monitorAndRecoverWorkers(): Promise<void> {
    // Check all pools
    await Promise.all([
      this.checkAndRecoverPool(this.threadPool, this.workerThreadPort),
      this.checkAndRecoverPool(this.clusterPool, this.clusterManagerPort), 
      this.checkAndRecoverPool(this.processPool, this.childProcessPort)
    ]);
  }
  
  /**
   * Dynamically adjust worker count based on load
   */
  async autoScale(
    utilizationThreshold: number = 0.7, 
    scaleDownThreshold: number = 0.3
  ): Promise<void> {
    // Auto-scale thread pool
    const threadStats = this.threadPool.getStatistics() as any;
    if (threadStats.utilizationRate > utilizationThreshold) {
      const optimalCount = calculateOptimalWorkerCount(
        this.threadPool.size,
        threadStats.utilizationRate,
        utilizationThreshold,
        this.maxThreadWorkers
      );
      await this.scaleWorkerPool('thread', optimalCount);
    } else if (threadStats.utilizationRate < scaleDownThreshold && this.threadPool.size > this.threadPool.minSize) {
      await this.scaleWorkerPool('thread', this.threadPool.size - 1);
    }
    
    // Auto-scale cluster pool (similar logic)
    const clusterStats = this.clusterPool.getStatistics() as any;
    if (clusterStats.utilizationRate > utilizationThreshold) {
      const optimalCount = calculateOptimalWorkerCount(
        this.clusterPool.size,
        clusterStats.utilizationRate,
        utilizationThreshold,
        this.maxClusterWorkers
      );
      await this.scaleWorkerPool('cluster', optimalCount);
    } else if (clusterStats.utilizationRate < scaleDownThreshold && this.clusterPool.size > this.clusterPool.minSize) {
      await this.scaleWorkerPool('cluster', this.clusterPool.size - 1);
    }
    
    // Auto-scale process pool (only if needed)
    const processStats = this.processPool.getStatistics() as any;
    if (processStats.utilizationRate > utilizationThreshold) {
      const optimalCount = calculateOptimalWorkerCount(
        this.processPool.size,
        processStats.utilizationRate,
        utilizationThreshold,
        this.maxChildProcesses
      );
      await this.scaleWorkerPool('child-process', optimalCount);
    } else if (processStats.utilizationRate < scaleDownThreshold && this.processPool.size > this.processPool.minSize) {
      await this.scaleWorkerPool('child-process', this.processPool.size - 1);
    }
    
    // Log auto-scaling event
    await this.metricsStore.storeEvent('system.autoscale', {
      threadPool: this.threadPool.size,
      clusterPool: this.clusterPool.size,
      processPool: this.processPool.size
    });
  }
  
  private async checkAndRecoverPool(
    pool: WorkerPool,
    port: WorkerThreadPort | ClusterManagerPort | ChildProcessPort
  ): Promise<void> {
    // Detect stalled workers
    const stalledWorkers = detectStalledWorkers(pool.workers, this.stallThresholdMs);
    
    for (const worker of stalledWorkers) {
      await this.metricsStore.storeEvent('worker.stalled', {
        workerId: worker.id,
        workerType: worker.type,
        timeSinceHeartbeat: Date.now() - worker.lastHeartbeat
      });
      
      // Try to recover: terminate and replace
      pool.removeWorker(worker.id);
      
      try {
        if (worker.type === 'thread') {
          await (port as WorkerThreadPort).terminateWorker(worker.id);
          const newWorker = await (port as WorkerThreadPort).createWorker();
          pool.addWorker(newWorker);
        } else if (worker.type === 'cluster') {
          // For cluster, might need a different approach
          await (port as ClusterManagerPort).scale(pool.size); // Maintain same size
        } else {
          await (port as ChildProcessPort).killProcess(worker.id);
          const newWorker = await (port as ChildProcessPort).spawnProcess('node', ['workers/worker-process.js']);
          pool.addWorker(newWorker);
        }
        
        await this.metricsStore.storeEvent('worker.recovered', {
          originalWorkerId: worker.id,
          workerType: worker.type
        });
      } catch (error) {
        await this.metricsStore.storeEvent('worker.recovery_failed', {
          workerId: worker.id,
          workerType: worker.type,
          error: (error as Error).message
        });
      }
    }
    
    // Update metrics of all workers
    for (const worker of pool.workers) {
      try {
        let metrics;
        
        if (worker.type === 'thread') {
          metrics = await (port as WorkerThreadPort).getWorkerMetrics(worker.id);
        } else if (worker.type === 'cluster') {
          const clusterMetrics = await (port as ClusterManagerPort).getClusterMetrics();
          metrics = clusterMetrics.workers.find(w => w.id === worker.id);
        } else {
          metrics = await (port as ChildProcessPort).getProcessMetrics(worker.id);
        }
        
        if (metrics) {
          worker.updateMetrics(metrics);
        }
      } catch (error) {
        console.error(`Error updating metrics for worker ${worker.id}:`, error);
      }
    }
  }
  
  /**
   * Get all workers across all pools
   */
  getAllWorkers(): Worker[] {
    return [
      ...this.threadPool.workers,
      ...this.clusterPool.workers,
      ...this.processPool.workers
    ];
  }
}
