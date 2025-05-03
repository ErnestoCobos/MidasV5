/**
 * Script for starting the Telegram bot using the simplified TelegramAdapter
 * 
 * This script uses the new TelegramAdapter implementation with proper
 * hexagonal architecture principles:
 * - Uses TelegramAdapter that implements TelegramServicePort
 * - Injects all dependencies properly
 * - Simple, maintainable implementation
 */

import 'dotenv/config';
import { logger } from './utils/logging';
import { TelegramAdapter } from './adapters/inbound/telegram-adapter-simple';
import { initializeDatabase } from './utils/db-migration';
import { DatabaseService } from './services/database';
import { getEnv } from './utils/env';
import { binanceService } from './services/binance';
import { deepSeekService } from './services/deepseek';
import { lunarCrushService } from './services/lunarcrush';
import { marketDataService } from './services/market-data';
import { tradeHistoryService } from './services/trade-history';
import { db } from './services/database';

// Validate that the Telegram token is configured
if (!process.env.TELEGRAM_BOT_TOKEN) {
  logger.error('TELEGRAM_BOT_TOKEN is not configured in the .env file');
  process.exit(1);
}

// Validate that there are authorized users
if (!process.env.TELEGRAM_AUTHORIZED_USERS) {
  logger.warn('TELEGRAM_AUTHORIZED_USERS is not configured. No users will be able to access the bot.');
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
    
    // 2. Initialize service dependencies
    const dependencies = {
      binanceService,
      deepSeekService,
      lunarCrushService,
      marketDataService,
      tradeHistoryService,
      dbService: db
    };
    
    // 3. Create TelegramAdapter instance with injected dependencies
    logger.info('Initializing the Telegram bot adapter...');
    const telegramAdapter = new TelegramAdapter(dependencies);
    
    // 4. Configure signal handling for controlled shutdown
    process.once('SIGINT', () => telegramAdapter.stop('SIGINT'));
    process.once('SIGTERM', () => telegramAdapter.stop('SIGTERM'));
    
    // 5. Start the bot
    await telegramAdapter.start();
    
    // 6. Send startup notification to administrators
    await telegramAdapter.sendNotificationToAll(
      '🤖 <b>MidasTS Telegram Bot Started</b>\n\n' +
      'The bot has been started with the new simplified adapter implementation.\n\n' +
      `<i>Server time: ${new Date().toLocaleString()}</i>`
    );
    
    if (dbInitialized) {
      await telegramAdapter.sendNotificationToAll('✅ Database initialized successfully');
    } else {
      await telegramAdapter.sendNotificationToAll('⚠️ Warning: Database not available. Limited functionality.');
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
