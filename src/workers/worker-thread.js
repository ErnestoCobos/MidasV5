/**
 * Worker Thread Script
 * Runs in a separate thread and processes tasks
 */
const { parentPort, workerData, threadId } = require('worker_threads');
const os = require('os');

// Store the worker's ID
const workerId = workerData?.workerId || `worker-${threadId}`;

// Keep track of the current task being processed
let currentTask = null;

/**
 * Execute a task based on its type
 */
async function executeTask(taskId, payload, type) {
  console.log(`[Worker ${workerId}] Executing task ${taskId} of type ${type}`);
  
  try {
    let result;
    
    // Different processing based on task type
    switch (type) {
      case 'calculation':
        result = await handleCalculationTask(payload);
        break;
      case 'io':
        result = await handleIOTask(payload);
        break;
      case 'network':
        result = await handleNetworkTask(payload);
        break;
      case 'custom':
        result = await handleCustomTask(payload);
        break;
      default:
        throw new Error(`Unknown task type: ${type}`);
    }
    
    // Return the result to the main thread
    parentPort.postMessage({
      type: 'task_result',
      taskId,
      result
    });
    
    currentTask = null;
    
  } catch (error) {
    // Return error to the main thread
    parentPort.postMessage({
      type: 'task_error',
      taskId,
      error: error.message
    });
    
    currentTask = null;
  }
}

/**
 * Handle a CPU-intensive calculation task
 */
async function handleCalculationTask(payload) {
  // Sample implementation: CPU-intensive calculation
  const iterations = payload.iterations || 1000000;
  let result = 0;
  
  // Simulate complex calculation
  for (let i = 0; i < iterations; i++) {
    result += Math.sin(i) * Math.cos(i);
  }
  
  return { result };
}

/**
 * Handle an I/O-bound task
 */
async function handleIOTask(payload) {
  // Sample implementation: filesystem or other I/O operation
  const delay = payload.delay || 100;
  
  // Simulate I/O operation with delay
  await new Promise(resolve => setTimeout(resolve, delay));
  
  return { success: true, processedAt: new Date().toISOString() };
}

/**
 * Handle a network task
 */
async function handleNetworkTask(payload) {
  // Sample implementation: network operation
  const delay = payload.delay || 200;
  const url = payload.url || 'https://example.com';
  
  // Simulate network request
  await new Promise(resolve => setTimeout(resolve, delay));
  
  return { 
    url,
    status: 200, 
    success: true, 
    responseTime: delay 
  };
}

/**
 * Handle a custom task with arbitrary logic
 */
async function handleCustomTask(payload) {
  // Execute any custom logic defined in the payload
  const { operation, params } = payload;
  
  if (typeof operation === 'string' && operation in customOperations) {
    return customOperations[operation](params);
  }
  
  // Default behavior if no operation specified
  return { 
    received: payload,
    processedBy: workerId,
    timestamp: Date.now()
  };
}

/**
 * Custom operations that can be invoked by custom tasks
 */
const customOperations = {
  // Example operation: Sum numbers
  sum: (params) => {
    const numbers = params.numbers || [];
    const sum = numbers.reduce((a, b) => a + b, 0);
    return { sum };
  },
  // Example operation: Transform text
  transformText: (params) => {
    const text = params.text || '';
    const operation = params.operation || 'uppercase';
    
    switch (operation) {
      case 'uppercase':
        return { result: text.toUpperCase() };
      case 'lowercase':
        return { result: text.toLowerCase() };
      case 'reverse':
        return { result: text.split('').reverse().join('') };
      default:
        return { result: text };
    }
  }
};

/**
 * Get CPU and memory usage metrics for this worker
 */
function getMetrics() {
  // In a real implementation, you would use process.cpuUsage()
  // and process.memoryUsage() to get actual metrics
  
  // Simulate CPU usage (random value between 0-100)
  const cpuUsage = Math.random() * 100;
  
  // Get actual memory usage
  const memoryUsage = process.memoryUsage();
  const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
  
  return {
    cpu: cpuUsage,
    memory: memoryUsageMB,
    threadId
  };
}

// Set up message handler for communication with main thread
parentPort.on('message', async (message) => {
  switch (message.type) {
    case 'init':
      // Worker initialization
      parentPort.postMessage({ type: 'ready', workerId });
      break;
      
    case 'execute_task':
      // Execute a task
      currentTask = message.taskId;
      executeTask(message.taskId, message.payload, message.taskType);
      break;
      
    case 'get_metrics':
      // Return worker metrics
      parentPort.postMessage({
        type: 'metrics',
        ...getMetrics(),
        currentTask
      });
      break;
      
    case 'ping':
      // Respond to ping
      parentPort.postMessage({ type: 'pong', workerId });
      break;
      
    case 'terminate':
      // Clean shutdown
      if (currentTask) {
        // Wait for current task to complete
        parentPort.postMessage({ type: 'terminating', workerId });
      } else {
        // Exit cleanly
        process.exit(0);
      }
      break;
      
    case 'custom_message':
      // Handle custom message
      parentPort.postMessage({ 
        type: 'custom_response',
        originalMessage: message.data,
        workerId
      });
      break;
  }
});

// Send heartbeat every 5 seconds
setInterval(() => {
  parentPort.postMessage({
    type: 'heartbeat',
    workerId,
    metrics: getMetrics(),
    timestamp: Date.now()
  });
}, 5000);

// Log worker startup
console.log(`Worker ${workerId} started (Thread ID: ${threadId})`);
