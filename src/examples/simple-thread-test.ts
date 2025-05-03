/**
 * Simple Worker Thread Test Example
 * 
 * This is a simplified example to demonstrate how to use worker threads with
 * the hexagonal architecture. It bypasses the full system and focuses only on
 * the worker thread adapter and direct task execution.
 */
import path from 'path';
import { WorkerThreadAdapter } from '../adapters/outbound/worker-thread-adapter';
import { Task } from '../core/domain/task';

async function main() {
  console.log('Starting simple worker thread test');
  
  // Create a worker thread adapter
  const workerAdapter = new WorkerThreadAdapter(
    path.resolve(__dirname, '../workers/worker-thread.js')
  );
  
  try {
    // Create a worker
    console.log('Creating worker thread...');
    const worker = await workerAdapter.createWorker();
    console.log(`Worker created: ${worker.id}`);
    
    // Check if the worker is responsive
    const isResponsive = await workerAdapter.isWorkerResponsive(worker.id);
    console.log(`Worker is responsive: ${isResponsive}`);
    
    // Get initial metrics
    const initialMetrics = await workerAdapter.getWorkerMetrics(worker.id);
    console.log('Initial metrics:', initialMetrics);
    
    // Create a calculation task manually (bypassing the queue)
    const task = new Task(
      { iterations: 5000000 }, // Payload
      'calculation',           // Type
      'high'                   // Priority
    );
    
    console.log(`Executing task ${task.id} on worker ${worker.id}...`);
    
    // Execute the task
    const startTime = Date.now();
    const result = await workerAdapter.executeTask(worker.id, task);
    const endTime = Date.now();
    
    console.log(`Task executed in ${endTime - startTime}ms`);
    console.log('Task result:', result);
    
    // Get metrics after task
    const metrics = await workerAdapter.getWorkerMetrics(worker.id);
    console.log('Worker metrics after task:', metrics);
    
    // Send a custom message to the worker
    await workerAdapter.sendMessage(worker.id, {
      greeting: 'Hello, worker!',
      timestamp: Date.now()
    });
    
    // Give the worker time to process the message (in a real implementation, we'd listen for the response)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Terminate the worker
    console.log('Terminating worker...');
    const terminated = await workerAdapter.terminateWorker(worker.id);
    console.log(`Worker terminated: ${terminated}`);
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error in worker thread test:', error);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
