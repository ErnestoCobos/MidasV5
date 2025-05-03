/**
 * Main entry point for the multithreading system
 */
import path from 'path';
import { Task } from './core/domain/task';
import { TaskDistributionService } from './core/application/task-distribution';
import { WorkerManagementService } from './core/application/worker-management';
import { MonitoringService } from './core/application/monitoring-service';

import { InMemoryTaskQueue } from './adapters/inbound/in-memory-task-queue';
import { TaskManager } from './adapters/inbound/task-manager';
import { WorkerThreadAdapter } from './adapters/outbound/worker-thread-adapter';
import { InMemoryMetricsStoreAdapter } from './adapters/outbound/in-memory-metrics-store-adapter';

// Import cluster and child process adapters when implemented
// import { ClusterAdapter } from './adapters/outbound/cluster-adapter';
// import { ChildProcessAdapter } from './adapters/outbound/child-process-adapter';

// Default configuration
const config = {
  workers: {
    thread: 4,
    cluster: 2,
    childProcess: 2
  },
  paths: {
    workerThread: path.resolve(__dirname, './workers/worker-thread.js'),
    clusterWorker: path.resolve(__dirname, './workers/cluster-worker.js'),
    childProcess: path.resolve(__dirname, './workers/worker-process.js')
  }
};

/**
 * Initialize the multithreading system
 */
async function initializeSystem() {
  console.log('Initializing multithreading system...');
  
  // Create adapter instances
  const taskQueue = new InMemoryTaskQueue();
  const metricsStore = new InMemoryMetricsStoreAdapter();
  
  const workerThreadAdapter = new WorkerThreadAdapter(config.paths.workerThread);
  
  // For now, we'll use mock implementations for cluster and child process adapters
  // until we implement them fully
  const mockClusterAdapter = {
    initialize: async () => [],
    scale: async () => [],
    shutdown: async () => {},
    executeTask: async () => {},
    getClusterMetrics: async () => ({ workers: [], totalRequests: 0 }),
    distributeRequest: async () => {},
    getStatus: async () => ({ active: 0, idle: 0, dead: 0 }),
    restartWorker: async () => { throw new Error('Not implemented'); }
  };
  
  const mockChildProcessAdapter = {
    spawnProcess: async () => { throw new Error('Not implemented'); },
    killProcess: async () => true,
    executeTask: async () => { throw new Error('Not implemented'); },
    getProcessMetrics: async () => null,
    getAllProcesses: async () => [],
    isProcessAlive: async () => false,
    sendSignal: async () => false,
    attachEventListeners: async () => {}
  };
  
  // Create application services
  const taskDistribution = new TaskDistributionService(
    taskQueue,
    workerThreadAdapter,
    mockClusterAdapter as any,
    mockChildProcessAdapter as any,
    metricsStore,
    config.workers.thread,
    config.workers.cluster,
    config.workers.childProcess
  );
  
  const workerManagement = new WorkerManagementService(
    workerThreadAdapter,
    mockClusterAdapter as any,
    mockChildProcessAdapter as any,
    metricsStore,
    config.workers.thread,
    config.workers.cluster,
    config.workers.childProcess
  );
  
  // Create monitoring service - we need to get the pool references somehow
  // For now, we'll create dummy pools just for the monitoring service
  const { WorkerPool } = require('./core/domain/worker-pool');
  const threadPool = new WorkerPool('thread-pool', 'thread', config.workers.thread);
  const clusterPool = new WorkerPool('cluster-pool', 'cluster', config.workers.cluster);
  const processPool = new WorkerPool('process-pool', 'child-process', config.workers.childProcess);
  
  const monitoring = new MonitoringService(
    metricsStore,
    threadPool,
    clusterPool,
    processPool
  );
  
  // Create the task manager that ties everything together
  const taskManager = new TaskManager(
    taskQueue,
    taskDistribution,
    workerManagement,
    monitoring
  );
  
  // Initialize the system
  await taskManager.initialize();
  
  console.log('Multithreading system initialized successfully!');
  
  return {
    taskManager,
    taskDistribution,
    workerManagement,
    monitoring,
    shutdown: async () => {
      console.log('Shutting down multithreading system...');
      await taskManager.shutdown();
      console.log('Multithreading system shutdown complete.');
    }
  };
}

/**
 * Example usage
 */
async function runExample() {
  // Initialize the system
  const system = await initializeSystem();
  
  try {
    // Submit some sample tasks
    const calculationTask = await system.taskManager.submitTask(
      { iterations: 10000000 },
      'calculation',
      'high'
    );
    
    console.log(`Submitted calculation task: ${calculationTask.id}`);
    
    const ioTask = await system.taskManager.submitTask(
      { delay: 500 },
      'io',
      'medium'
    );
    
    console.log(`Submitted I/O task: ${ioTask.id}`);
    
    const networkTask = await system.taskManager.submitTask(
      { url: 'https://example.com', delay: 300 },
      'network',
      'low'
    );
    
    console.log(`Submitted network task: ${networkTask.id}`);
    
    const customTask = await system.taskManager.submitTask(
      { 
        operation: 'transformText', 
        params: { 
          text: 'Hello, Multithreaded World!', 
          operation: 'reverse' 
        } 
      },
      'custom',
      'critical'
    );
    
    console.log(`Submitted custom task: ${customTask.id}`);
    
    // Wait for tasks to complete
    console.log('Waiting for tasks to complete...');
    
    // Poll for task completion
    const checkInterval = setInterval(async () => {
      const tasks = await system.taskManager.getTasks();
      const pendingCount = tasks.filter(t => t.status === 'pending').length;
      const processingCount = tasks.filter(t => t.status === 'processing').length;
      const completedCount = tasks.filter(t => t.status === 'completed').length;
      const failedCount = tasks.filter(t => t.status === 'failed').length;
      
      console.log(`Status: Pending=${pendingCount}, Processing=${processingCount}, Completed=${completedCount}, Failed=${failedCount}`);
      
      if (pendingCount === 0 && processingCount === 0) {
        clearInterval(checkInterval);
        
        // All tasks completed, show results
        console.log('\nTask Results:');
        for (const task of tasks) {
          console.log(`- Task ${task.id} (${task.type}): ${task.status}`);
          if (task.result) {
            console.log(`  Result: ${JSON.stringify(task.result)}`);
          }
          if (task.error) {
            console.log(`  Error: ${task.error}`);
          }
        }
        
        // Get system status
        const status = await system.taskManager.getSystemStatus();
        console.log('\nSystem Status:', JSON.stringify(status, null, 2));
        
        // Shutdown the system
        await system.shutdown();
        process.exit(0);
      }
    }, 500);
  } catch (error) {
    console.error('Error in example:', error);
    await system.shutdown();
    process.exit(1);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runExample().catch(console.error);
}

// Telegram service management
let telegramServiceInstance: any = null;

/**
 * Initialize the Telegram service
 */
async function initTelegramService(options: { notify: boolean } = { notify: true }) {
  // Import dependencies here to avoid circular dependencies
  const { TelegramAdapter } = require('./adapters/inbound/telegram-adapter');
  
  // Import required services
  const { binanceService } = require('./services/binance');
  const { deepSeekService } = require('./services/deepseek');
  const { lunarCrushService } = require('./services/lunarcrush');
  const { marketDataService } = require('./services/market-data');
  const { tradeHistoryService } = require('./services/trade-history');
  const { db } = require('./services/database');
  
  // Create telegram service
  const dependencies = {
    binanceService,
    deepSeekService,
    lunarCrushService,
    marketDataService,
    tradeHistoryService,
    dbService: db
  };
  
  const telegramService = new TelegramAdapter(dependencies);
  await telegramService.start();
  
  // Store the instance
  telegramServiceInstance = telegramService;
  
  return telegramService;
}

/**
 * Get the current Telegram service instance
 */
function getTelegramService() {
  return telegramServiceInstance;
}

// Export for programmatic usage
export { initializeSystem, initTelegramService, getTelegramService };
