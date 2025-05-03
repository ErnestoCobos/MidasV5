/**
 * Core application service: MonitoringService
 * Collects and stores performance metrics
 */
import { WorkerPool } from '../domain/worker-pool';
import { Task } from '../domain/task';
import { 
  calculateThroughput, 
  calculateAverageLatency, 
  calculatePoolUtilization,
  calculateExponentialMovingAverage 
} from '../math/performance-metrics';
import { MetricsStorePort } from '../../ports/outbound/metrics-store-port';

export class MonitoringService {
  private completedTasksWindow: Task[] = [];
  private readonly metricsWindowMs = 60000; // 1 minuto
  private avgThroughput: number = 0;
  private avgLatency: number = 0;
  
  constructor(
    private readonly metricsStore: MetricsStorePort,
    private readonly threadPool: WorkerPool,
    private readonly clusterPool: WorkerPool,
    private readonly processPool: WorkerPool
  ) {}
  
  /**
   * Register a completed task for metrics
   */
  recordCompletedTask(task: Task): void {
    const now = Date.now();
    
    // Clean out old tasks from window
    this.completedTasksWindow = this.completedTasksWindow
      .filter(t => {
        const endTime = (t as any)._endTime;
        return endTime && now - endTime < this.metricsWindowMs;
      });
    
    // Add new completed task
    this.completedTasksWindow.push(task);
  }
  
  /**
   * Calculate and store performance metrics
   */
  async collectAndStoreMetrics(): Promise<void> {
    // Calculate throughput
    const throughput = calculateThroughput(
      this.completedTasksWindow,
      this.metricsWindowMs
    );
    
    // Update moving average of throughput
    this.avgThroughput = calculateExponentialMovingAverage(
      this.avgThroughput,
      throughput
    );
    
    // Calculate average latency
    const latency = calculateAverageLatency(
      this.completedTasksWindow
    );
    
    // Update moving average of latency
    if (latency > 0) {
      this.avgLatency = calculateExponentialMovingAverage(
        this.avgLatency,
        latency
      );
    }
    
    // Calculate pool utilizations
    const threadPoolUtilization = calculatePoolUtilization(this.threadPool);
    const clusterPoolUtilization = calculatePoolUtilization(this.clusterPool);
    const processPoolUtilization = calculatePoolUtilization(this.processPool);
    
    // Store metrics
    await Promise.all([
      this.metricsStore.storeMetric('system.throughput', throughput),
      this.metricsStore.storeMetric('system.latency', latency),
      
      this.metricsStore.storeMetric('pool.thread.utilization.worker', 
        threadPoolUtilization.worker),
      this.metricsStore.storeMetric('pool.thread.utilization.cpu', 
        threadPoolUtilization.cpu),
      this.metricsStore.storeMetric('pool.thread.utilization.memory', 
        threadPoolUtilization.memory),
      
      this.metricsStore.storeMetric('pool.cluster.utilization.worker', 
        clusterPoolUtilization.worker),
      this.metricsStore.storeMetric('pool.cluster.utilization.cpu', 
        clusterPoolUtilization.cpu),
      this.metricsStore.storeMetric('pool.cluster.utilization.memory', 
        clusterPoolUtilization.memory),
      
      this.metricsStore.storeMetric('pool.process.utilization.worker', 
        processPoolUtilization.worker),
      this.metricsStore.storeMetric('pool.process.utilization.cpu', 
        processPoolUtilization.cpu),
      this.metricsStore.storeMetric('pool.process.utilization.memory', 
        processPoolUtilization.memory)
    ]);
  }
  
  /**
   * Get system status summary
   */
  async getSystemStatus(): Promise<Record<string, unknown>> {
    // Current metrics
    const throughput = calculateThroughput(
      this.completedTasksWindow,
      this.metricsWindowMs
    );
    
    const latency = calculateAverageLatency(
      this.completedTasksWindow
    );
    
    // Pool statistics
    const threadPoolStats = this.threadPool.getStatistics();
    const clusterPoolStats = this.clusterPool.getStatistics();
    const processPoolStats = this.processPool.getStatistics();
    
    // Historical metrics (last 24h with aggregation)
    const historicalThroughput = await this.metricsStore.queryMetrics(
      'system.throughput',
      24 * 60 * 60 * 1000, // 24 hours
      'avg'
    );
    
    const historicalLatency = await this.metricsStore.queryMetrics(
      'system.latency',
      24 * 60 * 60 * 1000,
      'avg'
    );
    
    // Recent events (last 10)
    const recentEvents = await this.metricsStore.getRecentEvents(10);
    
    // System health
    const systemHealth = await this.metricsStore.getSystemHealth();
    
    return {
      currentMetrics: {
        throughput,
        latency,
        movingAverageThroughput: this.avgThroughput,
        movingAverageLatency: this.avgLatency,
        workerPools: {
          thread: threadPoolStats,
          cluster: clusterPoolStats,
          process: processPoolStats
        }
      },
      historicalMetrics: {
        throughput: historicalThroughput,
        latency: historicalLatency
      },
      recentEvents,
      systemHealth
    };
  }
}
