/**
 * Script for starting the Telegram bot using the new TelegramAdapter with multithreading
 * 
 * This script demonstrates the use of our new hexagonal architecture approach:
 * - TelegramAdapter implements TelegramServicePort
 * - Dependencies are properly injected
 * - TaskManager integration enables multithreaded processing
 * - Configuration follows the standard pattern
 */

import 'dotenv/config';
import { logger } from './utils/logging';
import { TelegramAdapter } from './adapters/inbound/telegram-adapter';
import { initializeDatabase } from './utils/db-migration';
import { DatabaseService } from './services/database';
import { getEnv } from './utils/env';
import { binanceService } from './services/binance';
import { deepSeekService } from './services/deepseek';
import { lunarCrushService } from './services/lunarcrush';
import { marketDataService } from './services/market-data';
import { tradeHistoryService } from './services/trade-history';
import { db } from './services/database';

// Import multithreading components
import { initializeSystem } from './index';

// Validate that the Telegram token is configured
if (!process.env.TELEGRAM_BOT_TOKEN) {
  logger.error('TELEGRAM_BOT_TOKEN is not configured in the .env file');
  process.exit(1);
}

// Validate that there are authorized users
if (!process.env.TELEGRAM_AUTHORIZED_USERS) {
  logger.warn('TELEGRAM_AUTHORIZED_USERS is not configured. Only administrators will be able to use the bot.');
}

async function main() {
  try {
    // 1. Initialize the database (create tables and migrations)
    logger.info('Initializing database and tables...');
    
    // Configure database instance before initialization
    const config = getEnv();
    DatabaseService.getInstance({
      connectionString: config.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/midasts',
      ssl: config.DATABASE_SSL,
      max: config.DATABASE_MAX_CONNECTIONS,
      idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT
    });
    
    // Initialize database
    let dbInitialized = false;
    try {
      dbInitialized = await initializeDatabase();
      if (dbInitialized) {
        logger.info('✅ PostgreSQL database initialized successfully');
      } else {
        logger.warn('⚠️ Could not initialize PostgreSQL database');
        logger.warn('The bot will operate in memory mode without persistence');
      }
    } catch (error) {
      logger.warn('⚠️ Error initializing database, continuing in memory mode');
      logger.warn('The bot will have limited functionality without persistence');
    }
    
    // 2. Initialize multithreading system if enabled
    let multithreadingSystem = null;
    const useTaskManager = config.USE_TASK_MANAGER_FOR_TELEGRAM;
    
    if (useTaskManager) {
      try {
        logger.info('Initializing multithreading system for Telegram bot...');
        multithreadingSystem = await initializeSystem();
        logger.info('✅ Multithreading system initialized successfully');
      } catch (error) {
        logger.error({ error }, 'Failed to initialize multithreading system');
        logger.warn('Continuing without multithreading support');
      }
    }
    
    // 3. Initialize service dependencies
    const dependencies = {
      binanceService,
      deepSeekService,
      lunarCrushService,
      marketDataService,
      tradeHistoryService,
      dbService: db,
      // Include task manager if available
      taskManager: multithreadingSystem?.taskManager || null
    };
    
    // 4. Create TelegramAdapter instance with injected dependencies
    logger.info('Initializing the Telegram bot adapter...');
    const telegramAdapter = new TelegramAdapter(dependencies);
    
    // 5. Configure signal handling for controlled shutdown
    process.once('SIGINT', async () => {
      await telegramAdapter.stop('SIGINT');
      if (multithreadingSystem) {
        await multithreadingSystem.shutdown();
      }
    });
    
    process.once('SIGTERM', async () => {
      await telegramAdapter.stop('SIGTERM');
      if (multithreadingSystem) {
        await multithreadingSystem.shutdown();
      }
    });
    
    // 6. Start the bot
    await telegramAdapter.start();
    
    // 7. Send startup notification to administrators
    const adminUsers = process.env.TELEGRAM_ADMIN_USERS ? 
      process.env.TELEGRAM_ADMIN_USERS.split(',').map(id => parseInt(id.trim())) : [];
    
    if (adminUsers.length > 0) {
      await telegramAdapter.sendNotificationToAll('🤖 MidasTS Bot started successfully using the new TelegramAdapter.');
      
      // Add system information to the message
      if (dbInitialized) {
        await telegramAdapter.sendNotificationToAll('✅ Database initialized successfully');
      } else {
        await telegramAdapter.sendNotificationToAll('⚠️ Warning: Database not available. Limited functionality.');
      }
      
      if (multithreadingSystem) {
        await telegramAdapter.sendNotificationToAll('✅ Multithreading system active. Signal processing will use worker threads for improved performance.');
      }
    }
    
    logger.info('Telegram bot started successfully');
  } catch (error) {
    logger.error({ error }, 'Error starting the Telegram bot');
    process.exit(1);
  }
}

// Execute the main function
main().catch(error => {
  logger.fatal({ error }, 'Fatal error starting the Telegram bot');
  process.exit(1);
});
