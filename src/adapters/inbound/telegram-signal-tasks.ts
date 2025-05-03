/**
 * Telegram Signal Tasks
 * 
 * This file integrates the Telegram bot with the task system to distribute
 * processing intensive operations like signal generation to the worker thread pool.
 */
import { Task, TaskType, TaskPriority } from '../../core/domain/task';
import { TaskManagerPort } from '../../ports/inbound/task-manager-port';
import { logger } from '../../utils/logging';

// Type for signal payload
interface SignalGenerationPayload {
  symbol: string;
  capital?: number;
  mode?: 'basic' | 'medium' | 'advanced';
}

// Type for scan payload
interface MarketScanPayload {
  maxResults?: number;
  minVolume?: number;
  minGalaxyScore?: number;
}

// Type for signal response
export interface SignalResponse {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  reasoning?: string;
  multiStage?: boolean;
  useTrailingStop?: boolean;
  trailingStopPercent?: number;
  position_size?: number;
}

// Type for scan response with opportunities
export interface ScanResponse {
  opportunities: Array<{
    symbol: string;
    score: number;
    price: number;
    galaxyScore: number;
    recommendation: string;
  }>;
}

/**
 * Service that integrates DeepSeek signal generation with the multithreading system
 */
export class TelegramSignalTasks {
  constructor(private readonly taskManager: TaskManagerPort) {}

  /**
   * Generate a trading signal using the worker thread pool
   * @param symbol The trading symbol (e.g., BTCUSDT)
   * @param capital Optional capital amount for position sizing
   * @param mode Complexity mode for signal generation
   * @returns Trading signal or null if generation fails
   */
  public async generateSignal(
    symbol: string, 
    capital: number = 1000,
    mode: 'basic' | 'medium' | 'advanced' = 'medium'
  ): Promise<SignalResponse | null> {
    try {
      logger.info({ symbol, capital, mode }, 'Submitting signal generation task');
      
      // Create payload for the worker
      const payload: SignalGenerationPayload = {
        symbol,
        capital,
        mode
      };
      
      // Submit task to the task manager
      const task = await this.taskManager.submitTask(
        payload,
        'custom', // Using custom type for flexibility
        'high'    // High priority as users are waiting
      );
      
      logger.info({ taskId: task.id }, 'Signal generation task submitted');
      
      // Poll for task completion - in a real implementation,
      // we might use a more sophisticated approach with event listeners
      return this.waitForTaskCompletion<SignalResponse>(task.id, 30000); // 30s timeout
    } catch (error) {
      logger.error({ error, symbol }, 'Error submitting signal generation task');
      return null;
    }
  }
  
  /**
   * Scan the market for opportunities using the worker thread pool
   * @param maxResults Maximum number of results to return
   * @param minVolume Minimum volume filter (USD)
   * @param minGalaxyScore Minimum galaxy score filter
   * @returns Scan results or null if scan fails
   */
  public async scanMarket(
    maxResults: number = 5,
    minVolume: number = 5000000,
    minGalaxyScore: number = 50
  ): Promise<ScanResponse | null> {
    try {
      logger.info({ maxResults, minVolume, minGalaxyScore }, 'Submitting market scan task');
      
      // Create payload for the worker
      const payload: MarketScanPayload = {
        maxResults,
        minVolume,
        minGalaxyScore
      };
      
      // Submit task to the task manager
      const task = await this.taskManager.submitTask(
        payload,
        'network', // Network type as it involves API calls
        'medium'   // Medium priority 
      );
      
      logger.info({ taskId: task.id }, 'Market scan task submitted');
      
      // Poll for task completion
      return this.waitForTaskCompletion<ScanResponse>(task.id, 45000); // 45s timeout
    } catch (error) {
      logger.error({ error }, 'Error submitting market scan task');
      return null;
    }
  }
  
  /**
   * Utility method to wait for task completion with timeout
   * @param taskId The task ID to wait for
   * @param timeout Maximum time to wait in ms
   * @returns The task result or null on timeout/error
   */
  private async waitForTaskCompletion<T>(taskId: string, timeout: number): Promise<T | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      // Check task status
      const task = await this.taskManager.getTask(taskId);
      
      if (!task) {
        logger.error({ taskId }, 'Task not found');
        return null;
      }
      
      if (task.status === 'completed') {
        logger.info({ taskId }, 'Task completed successfully');
        return task.result as T;
      }
      
      if (task.status === 'failed') {
        logger.error({ taskId, error: task.error }, 'Task failed');
        return null;
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    logger.warn({ taskId, timeout }, 'Task timed out');
    return null;
  }
}