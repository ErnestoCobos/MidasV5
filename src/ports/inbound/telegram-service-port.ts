/**
 * TelegramServicePort: Inbound port for Telegram bot integration
 * Follows hexagonal architecture pattern for MidasTS
 */

export interface TelegramServicePort {
  /**
   * Start the Telegram bot service
   */
  start(): Promise<void>;
  
  /**
   * Stop the Telegram bot service
   * @param reason Optional reason for stopping
   */
  stop(reason?: string): Promise<void>;
  
  /**
   * Send notification to all authorized users
   * @param message Message to send
   */
  sendNotificationToAll(message: string): Promise<void>;
  
  /**
   * Send trading signal to users with signal notifications enabled
   * @param symbol Trading pair symbol
   * @param signal Trading signal data
   */
  sendTradingSignal(symbol: string, signal: any): Promise<void>;
  
  /**
   * Send order execution notification
   * @param order Order details
   */
  sendOrderNotification(order: any): Promise<void>;
  
  /**
   * Check if the bot is currently running
   */
  isRunning(): boolean;
}
