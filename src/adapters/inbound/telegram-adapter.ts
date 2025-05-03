/**
 * TelegramAdapter: Inbound adapter implementing TelegramServicePort
 * Follows hexagonal architecture pattern for MidasTS
 */
import { Telegraf, Scenes, session, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { logger } from '../../utils/logging';
import { TelegramServicePort } from '../../ports/inbound/telegram-service-port';

// Import telegram components
import { createSettingsScene } from '../../services/telegram-settings';
import { TelegramSignalTasks } from './telegram-signal-tasks';
import { handleSignalCommand } from './telegram-adapter-signal-command';

// Interfaces
interface BotSession extends Scenes.SceneSession {
  // Session data for authenticated users
  authenticated: boolean;
  userId: number;
  username: string;
  // User preferences
  notifications: {
    signals: boolean;
    trades: boolean;
    portfolioUpdates: boolean;
  };
  // Advanced settings
  advancedSettings?: {
    tradingMode?: string;
    hasApiKeys?: boolean;
    tradeLimit?: number;
  };
  // Current state
  currentSymbol?: string;
}

// Define context type extending Telegraf's Context
export interface BotContext extends Context {
  session: BotSession;
  scene: Scenes.SceneContextScene<BotContext>;
}

// Configuration for authorization
interface AuthConfig {
  authorizedUsers: number[]; // Array of authorized user IDs
  adminUsers: number[]; // Array of admin users
  accessCode?: string; // Optional code for new users
}

// Interface for portfolio positions
interface PortfolioPosition {
  symbol: string;
  amount: number;
  entryPrice: number;
  currentPrice: number;
}

// Service dependencies interface
interface TelegramAdapterDependencies {
  binanceService: any;
  deepSeekService: any;
  lunarCrushService: any;
  marketDataService: any;
  tradeHistoryService: any;
  dbService: any;
  taskManager?: any; // Optional task manager for multithreading
}

/**
 * Telegram adapter implementing TelegramServicePort
 * Acts as an inbound adapter in the hexagonal architecture
 */
export class TelegramAdapter implements TelegramServicePort {
  private bot: Telegraf<BotContext>;
  private stage: Scenes.Stage<BotContext>;
  private authConfig: AuthConfig;
  private _isRunning: boolean = false;
  private dependencies: TelegramAdapterDependencies;
  private signalTasks: TelegramSignalTasks | null = null;
  
  constructor(dependencies: TelegramAdapterDependencies) {
    this.dependencies = dependencies;
    
    // Get token from .env and provide a default value if it doesn't exist
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    
    if (!token) {
      logger.error('TELEGRAM_BOT_TOKEN not configured in .env');
      throw new Error('Telegram token not configured');
    }
    
    // Initialize signal tasks if task manager is provided
    if (dependencies.taskManager) {
      this.signalTasks = new TelegramSignalTasks(dependencies.taskManager);
      logger.info('Task manager integration enabled for signal processing');
    }
    
    // Initialize the bot
    this.bot = new Telegraf<BotContext>(token);
    
    // Configure scenes for conversational flows
    this.stage = new Scenes.Stage<BotContext>([
      this.createAuthScene(),
      this.createTradeScene(),
      createSettingsScene(),
      this.createPortfolioScene()
    ]);
    
    // Authentication configuration (default values)
    this.authConfig = {
      authorizedUsers: process.env.TELEGRAM_AUTHORIZED_USERS ? 
        process.env.TELEGRAM_AUTHORIZED_USERS.split(',').map((id: string) => parseInt(id.trim())) : [],
      adminUsers: process.env.TELEGRAM_ADMIN_USERS ?
        process.env.TELEGRAM_ADMIN_USERS.split(',').map((id: string) => parseInt(id.trim())) : [],
      accessCode: process.env.TELEGRAM_ACCESS_CODE
    };
    
    // Bot configuration
    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbacks();
    
    logger.info('Telegram service initialized');
  }
  
  /**
   * Start the Telegram bot and connect to the Telegram API
   */
  public async start(): Promise<void> {
    if (this._isRunning) {
      logger.warn('Telegram bot is already running');
      return;
    }
    
    try {
      await this.bot.launch();
      this._isRunning = true;
      
      logger.info('Telegram bot started successfully');
      
      // Set up signal handling for graceful shutdown
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));
    } catch (error) {
      logger.error({ error }, 'Error starting Telegram bot');
      throw error;
    }
  }
  
  /**
   * Stop the bot
   */
  public async stop(reason: string = 'manual'): Promise<void> {
    if (!this._isRunning) {
      logger.warn('Telegram bot is not running');
      return;
    }
    
    try {
      await this.bot.stop(reason);
      this._isRunning = false;
      logger.info({ reason }, 'Telegram bot stopped');
    } catch (error) {
      logger.error({ error, reason }, 'Error stopping Telegram bot');
    }
  }
  
  /**
   * Send a notification to all authorized users
   */
  public async sendNotificationToAll(message: string): Promise<void> {
    for (const userId of this.authConfig.authorizedUsers) {
      try {
        await this.bot.telegram.sendMessage(userId, message, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error({ error, userId }, 'Error sending notification');
      }
    }
  }
  
  /**
   * Send a trading signal alert to users with signal notifications enabled
   */
  public async sendTradingSignal(symbol: string, signal: any): Promise<void> {
    // Build formatted message
    const message = `
<b>🔔 New Trading Signal</b>

<b>Symbol:</b> ${symbol}
<b>Action:</b> ${signal.action}
<b>Confidence:</b> ${(signal.confidence * 100).toFixed(1)}%
${signal.entry ? `<b>Entry:</b> $${signal.entry}` : ''}
${signal.stopLoss ? `<b>Stop Loss:</b> $${signal.stopLoss}` : ''}
${signal.takeProfit ? `<b>Take Profit:</b> $${signal.takeProfit}` : ''}
${signal.reasoning ? `\n<b>Analysis:</b> ${signal.reasoning}` : ''}

<i>Generated by DeepSeek Reasoner at ${new Date().toLocaleTimeString()}</i>
    `;
    
    // Send to all users with signal notifications enabled
    await this.sendNotificationToAll(message);
  }
  
  /**
   * Send order execution notification
   */
  public async sendOrderNotification(order: any): Promise<void> {
    // Build order execution message
    const message = `
<b>✅ Order Executed</b>

<b>Type:</b> ${order.side === 'BUY' ? '🟢 Buy' : '🔴 Sell'}
<b>Symbol:</b> ${order.symbol}
<b>Price:</b> $${parseFloat(order.price).toFixed(4)}
<b>Quantity:</b> ${parseFloat(order.quantity).toFixed(6)}
<b>Total:</b> $${(parseFloat(order.price) * parseFloat(order.quantity)).toFixed(2)}

<i>Executed on Binance at ${new Date().toLocaleTimeString()}</i>
    `;
    
    await this.sendNotificationToAll(message);
  }
  
  /**
   * Check if the bot is currently running
   */
  public isRunning(): boolean {
    return this._isRunning;
  }
  
  /**
   * Configure the bot middleware
   */
  private setupMiddleware(): void {
    // Session middleware to maintain state
    this.bot.use(session());
    
    // Scenes middleware
    this.bot.use(this.stage.middleware());
    
    // Authentication middleware
    this.bot.use(async (ctx, next: () => Promise<void>) => {
      const botCtx = ctx as BotContext;
      
      // Initialize session if it doesn't exist
      if (!botCtx.session) {
        botCtx.session = {
          authenticated: false,
          userId: ctx.from?.id || 0,
          username: ctx.from?.username || 'unknown',
          notifications: {
            signals: true,
            trades: true,
            portfolioUpdates: false
          }
        };
      }
      
      // Check if the user is authorized
      const userId = ctx.from?.id;
      if (userId && this.authConfig.authorizedUsers.includes(userId)) {
        (ctx.session as BotSession).authenticated = true;
        return next();
      }
      
      // If not authorized, only allow /start command for authentication
      if (ctx.message && 'text' in ctx.message && ctx.message.text === '/start') {
        return next();
      }
      
      // Reject access for unauthorized users
      await ctx.reply('⛔ You are not authorized to use this bot. Use /start to request access.');
      return;
    });
    
    // Command logging (after authentication)
    this.bot.use(async (ctx: Context, next: () => Promise<void>) => {
      if (ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/')) {
        const command = ctx.message.text.split(' ')[0];
        logger.info({
          userId: ctx.from?.id,
          username: ctx.from?.username,
          command
        }, 'Telegram command received');
      }
      return next();
    });
  }
  
  /**
   * Configure basic bot commands
   */
  private setupCommands(): void {
    // /start command - Start and authentication
    this.bot.command('start', async (ctx) => {
      const botCtx = ctx as BotContext;
      const userId = ctx.from?.id;
      const username = ctx.from?.username || ctx.from?.first_name || 'User';
      
      // If already authorized
      if (botCtx.session.authenticated) {
        await ctx.reply(`Welcome back, ${username}! The MidasTS bot is ready to help you.`);
        await this.sendMainMenu(botCtx);
        return;
      }
      
      // If not authorized but there's an access code configured
      if (this.authConfig.accessCode) {
        await (ctx as any).scene.enter('auth');
        return;
      }
      
      // If no code and not on the list, inform the admin
      await ctx.reply(`Hello ${username}, your ID (${userId}) is not authorized. An administrator must add you.`);
      
      // Notify administrators
      for (const adminId of this.authConfig.adminUsers) {
        try {
          await this.bot.telegram.sendMessage(
            adminId,
            `🔔 New user requesting access:\nID: ${userId}\nUser: @${username}\n\nTo authorize, add this ID to the environment variables or use /authorize ${userId}`
          );
        } catch (error) {
          logger.error({ error, adminId }, 'Error notifying administrator');
        }
      }
    });
    
    // /help command - Show help
    this.bot.command('help', async (ctx: Context) => {
      const helpMessage = `
<b>🤖 MidasTS Bot - Available Commands</b>

<b>Basic commands:</b>
/start - Start the bot and log in
/help - Show this help message
/status - Show system status
/menu - Show main menu

<b>Trading commands:</b>
/price [symbol] - Check current price (e.g.: /price BTC)
/signal [symbol] - Request trading signal
/portfolio - Show your current portfolio
/stats - Show performance statistics

<b>Advanced commands:</b>
/scan - Scan the market for opportunities
/setnotify - Configure notifications
/settings - Adjust personal settings

<b>System control:</b>
/startbot [mode] - Start the trading system
/stopbot - Stop the trading system

For more information, visit: https://github.com/usuario/midasTS
      `;
      
      await ctx.reply(helpMessage, { parse_mode: 'HTML' });
    });
    
    // /status command - System status
    this.bot.command('status', async (ctx: Context) => {
      try {
        // Check API connections
        const binanceStatus = await this.checkBinanceConnection();
        const lunarCrushStatus = await this.checkLunarCrushConnection();
        const dbStatus = await this.checkDatabaseConnection();
        
        // Convert context to BotContext to safely access the session
        const botCtx = ctx as BotContext;
        
        // Build status message
        const statusMessage = `
<b>📊 MidasTS System Status</b>

<b>Connections:</b>
- Binance API: ${binanceStatus ? '✅ Connected' : '❌ Connection error'}
- LunarCrush API: ${lunarCrushStatus ? '✅ Connected' : '❌ Connection error'}
- Database: ${dbStatus ? '✅ Connected' : '❌ Connection error'}

<b>Performance:</b>
- Total operations: ${await this.getTotalTradesCount()}
- Success rate: ${await this.getSuccessRate()}%

<b>Bot Status:</b>
- Session started as: @${botCtx.session.username}
- Notifications: ${botCtx.session.notifications.signals ? '✅' : '❌'} Signals, ${botCtx.session.notifications.trades ? '✅' : '❌'} Operations

<i>Updated: ${new Date().toLocaleString()}</i>
        `;
        
        await ctx.reply(statusMessage, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error({ error }, 'Error getting system status');
        await ctx.reply('❌ Error getting system status. Please try again later.');
      }
    });
    
    // /menu command - Show main menu
    this.bot.command('menu', async (ctx) => {
      const botCtx = ctx as BotContext;
      await this.sendMainMenu(botCtx);
    });
    
    // /price command - Get current price
    this.bot.command('price', async (ctx: Context) => {
      // Convert to BotContext to handle the session
      const botCtx = ctx as BotContext;
      // Check if the message has text and extract the parts
      const messageText = 'text' in ctx.message! ? ctx.message.text : '';
      const parts = messageText?.split(' ');
      
      if (!parts || parts.length < 2) {
        await ctx.reply('⚠️ Correct usage: /price SYMBOL\nExample: /price BTC');
        return;
      }
      
      let symbol = parts[1].toUpperCase();
      // Add USDT if no complete pair is specified
      if (!symbol.includes('USDT') && !symbol.includes('/')) {
        symbol = `${symbol}USDT`;
      }
      
      try {
        const ticker = await this.dependencies.binanceService.getTicker24H(symbol);
        
        if (!ticker) {
          await ctx.reply(`❌ No data found for ${symbol}`);
          return;
        }
        
        // Save current symbol in session for later use
        botCtx.session.currentSymbol = symbol;
        
        // Prepare message with ticker data
        const priceMessage = `
<b>💲 Price of ${symbol}</b>

<b>Current:</b> $${parseFloat(ticker.lastPrice).toFixed(4)}
<b>24h Change:</b> ${parseFloat(ticker.priceChangePercent).toFixed(2)}%
<b>24h Range:</b> $${parseFloat(ticker.lowPrice).toFixed(4)} - $${parseFloat(ticker.highPrice).toFixed(4)}
<b>24h Volume:</b> $${Math.round(parseFloat(ticker.quoteVolume)).toLocaleString()} USD

<i>Data provided by Binance</i>
        `;
        
        // Inline options for additional actions
        const inlineKeyboard = {
          inline_keyboard: [
            [
              { text: '📊 Technical Analysis', callback_data: `technicals_${symbol}` },
              { text: '🔮 Trading Signal', callback_data: `signal_${symbol}` }
            ],
            [
              { text: '📈 More Data', callback_data: `moredata_${symbol}` },
              { text: '📱 Set Alert', callback_data: `setalert_${symbol}` }
            ]
          ]
        };
        
        await ctx.reply(priceMessage, { 
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard
        });
      } catch (error) {
        logger.error({ error, symbol }, 'Error getting price');
        await ctx.reply(`❌ Error getting price for ${symbol}. Check that the symbol is valid.`);
      }
    });
    
    // /signal command - Get trading signal with AI analysis
    this.bot.command('signal', async (ctx: Context) => {
      const botCtx = ctx as BotContext;
      await handleSignalCommand(ctx, botCtx, this.signalTasks, this.dependencies);
    });
    
    // /scan command - Scan market for opportunities
    this.bot.command('scan', async (ctx: Context) => {
      try {
        await ctx.reply('🔍 <b>Scanning the market for opportunities...</b>\nThis may take a moment.', {
          parse_mode: 'HTML'
        });
        
        // Use signalTasks for market scanning
        if (!this.signalTasks) {
          await ctx.reply('❌ Market scanning requires the task system to be enabled. Please check your configuration.');
          return;
        }
        
        const scanResponse = await this.signalTasks.scanMarket(5, 5000000, 50);
        const opportunities = scanResponse?.opportunities || [];
        
        if (!opportunities || opportunities.length === 0) {
          await ctx.reply('❌ No opportunities meeting the criteria were found at this time. Try again later.');
          return;
        }
        
        // Prepare message with opportunities
        let scanMessage = '<b>✅ Market scan completed</b>\n\n';
        scanMessage += '<b>🔝 Best opportunities found:</b>\n\n';
        
        opportunities.forEach((opportunity, index) => {
          scanMessage += `<b>${index + 1}. ${opportunity.symbol}</b> - $${opportunity.price.toFixed(4)}\n`;
          scanMessage += `📊 Score: ${(opportunity.score * 100).toFixed(1)}%\n`;
          scanMessage += `🌟 Galaxy Score: ${opportunity.galaxyScore}\n`;
          scanMessage += `${opportunity.recommendation}\n\n`;
        });
        
        scanMessage += `<i>Updated: ${new Date().toLocaleString()}</i>`;
        
        // Prepare buttons to view details or analyze further
        const inlineKeyboard = {
          inline_keyboard: opportunities.map(opp => {
            return [{ 
              text: `📊 View ${opp.symbol}`, 
              callback_data: `price_${opp.symbol}` 
            }];
          })
        };
        
        await ctx.reply(scanMessage, { 
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard
        });
      } catch (error) {
        logger.error({ error }, 'Error scanning market');
        await ctx.reply('❌ Error scanning the market. Please try again later.');
      }
    });
  }

  /**
   * Send the main menu to the user
   */
  private async sendMainMenu(ctx: BotContext): Promise<void> {
    await ctx.reply('🤖 <b>MidasTS Trading Bot</b>', {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💲 Prices', callback_data: 'menu_prices' },
            { text: '📊 Portfolio', callback_data: 'menu_portfolio' }
          ],
          [
            { text: '📈 Signals', callback_data: 'menu_signals' },
            { text: '🔍 Scan', callback_data: 'menu_scan' }
          ],
          [
            { text: '📊 Statistics', callback_data: 'menu_stats' },
            { text: '⚙️ Settings', callback_data: 'menu_settings' }
          ]
        ]
      }
    });
  }

  /**
   * Configure callbacks
   */
  private setupCallbacks(): void {
    // Menu callbacks
    this.bot.action(/menu_(.+)/, async (ctx) => {
      const action = ctx.match ? ctx.match[1] : '';
      await ctx.answerCbQuery();
      
      switch (action) {
        case 'prices':
          await ctx.reply('🔍 Enter the symbol to check price.\nExample: /price BTC');
          break;
        case 'portfolio':
          await ctx.scene.enter('portfolio');
          break;
        case 'signals':
          await ctx.reply('📊 Enter the symbol to get a signal.\nExample: /signal ETH');
          break;
        case 'scan':
          // Simulate scan command
          await ctx.reply('/scan');
          await this.bot.handleUpdate({
            update_id: 0,
            message: {
              message_id: 0,
              date: Math.floor(Date.now() / 1000),
              chat: ctx.chat!,
              from: ctx.from!,
              text: '/scan'
            }
          } as any);
          break;
        case 'stats':
          // Simulate stats command
          await ctx.reply('/stats');
          await this.bot.handleUpdate({
            update_id: 0,
            message: {
              message_id: 0,
              date: Math.floor(Date.now() / 1000),
              chat: ctx.chat!,
              from: ctx.from!,
              text: '/stats'
            }
          } as any);
          break;
        case 'settings':
          await ctx.scene.enter('settings');
          break;
      }
    });
    
    // Callback for requesting trading signal
    this.bot.action(/signal_(.+)/, async (ctx) => {
      // Extract symbol from callback data
      const callbackData = (ctx.callbackQuery as any)?.data;
      const match = callbackData?.match(/signal_(.+)/);
      const symbol = match ? match[1] : '';
      
      // Delete original message to prevent multiple clicks
      await ctx.answerCbQuery(`Generating signal for ${symbol}...`);
      
      // Simulate /signal command
      await ctx.reply(`/signal ${symbol}`);
      await this.bot.handleUpdate({
        update_id: 0,
        message: {
          message_id: 0,
          date: Math.floor(Date.now() / 1000),
          chat: ctx.chat!,
          from: ctx.from!,
          text: `/signal ${symbol}`
        }
      } as any);
    });
    
    // Callback for showing technical analysis
    this.bot.action(/technicals_(.+)/, async (ctx) => {
      // Extract symbol from callback data
      const callbackData = (ctx.callbackQuery as any)?.data;
      const match = callbackData?.match(/technicals_(.+)/);
      const symbol = match ? match[1] : '';
      await ctx.answerCbQuery(`Analyzing ${symbol}...`);
      
      try {
        // Get enhanced market data
        const md = await this.dependencies.marketDataService.getEnhancedMarketData(symbol);
        
        const message = `
<b>📊 Technical Analysis: ${symbol}</b>

<b>Indicators:</b>
- RSI(14): ${md.technicals?.rsi?.toFixed(2) || 'N/A'} ${this.getRsiEmoji(md.technicals?.rsi)}
- EMA Trend: ${md.technicals?.ema_cross || 'N/A'} ${this.getTrendEmoji(md.technicals?.ema_cross)}
- Volatility (ATR): ${this.getAtr(md.technicals)} 
- Bollinger Position: ${md.technicals?.bband_percent?.toFixed(2) || 'N/A'} ${this.getBBandEmoji(md.technicals?.bband_percent)}
- Volume/Average Ratio: ${md.technicals?.volume_ratio?.toFixed(2) || 'N/A'}x

<b>Key levels:</b>
- Support: ${md.technicals?.supports?.map((s: number) => '$' + s.toFixed(2)).join(', ') || 'N/A'}
- Resistance: ${md.technicals?.resistances?.map((r: number) => '$' + r.toFixed(2)).join(', ') || 'N/A'}

<i>Updated: ${new Date().toLocaleString()}</i>
        `;
        
        await ctx.editMessageText(message, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error({ error, symbol }, 'Error getting technical analysis');
        await ctx.reply('❌ Error getting technical analysis. Please try again later.');
      }
    });
  }

  /**
   * Get emoji based on RSI value
   */
  private getRsiEmoji(rsi?: number): string {
    if (!rsi) return '';
    if (rsi > 70) return '🔴'; // Overbought
    if (rsi < 30) return '🟢'; // Oversold
    return '⚪'; // Neutral
  }

  /**
   * Get emoji based on trend
   */
  private getTrendEmoji(trend?: string): string {
    if (!trend) return '';
    if (trend === 'bullish') return '📈';
    if (trend === 'bearish') return '📉';
    return '↔️'; // Sideways
  }

  /**
   * Get emoji for Bollinger Band position
   */
  private getBBandEmoji(bbandPercent?: number): string {
    if (bbandPercent === undefined) return '';
    if (bbandPercent < 0.2) return '🟢'; // Near support
    if (bbandPercent > 0.8) return '🔴'; // Near resistance
    return '⚪'; // In the middle
  }

  /**
   * Get ATR value from technical data
   */
  private getAtr(technicals: any): string {
    return technicals && 'atr' in technicals ? technicals.atr.toFixed(4) : 'N/A';
  }

  /**
   * Check Binance connection
   */
  private async checkBinanceConnection(): Promise<boolean> {
    try {
      const ticker = await this.dependencies.binanceService.getTicker24H('BTCUSDT');
      return !!ticker;
    } catch (error) {
      logger.error({ error }, 'Error checking Binance connection');
      return false;
    }
  }

  /**
   * Check LunarCrush connection
   */
  private async checkLunarCrushConnection(): Promise<boolean> {
    try {
      const score = await this.dependencies.lunarCrushService.galaxyScore('BTC');
      return score > 0;
    } catch (error) {
      logger.error({ error }, 'Error checking LunarCrush connection');
      return false;
    }
  }

  /**
   * Check database connection
   */
  private async checkDatabaseConnection(): Promise<boolean> {
    try {
      return await this.dependencies.dbService.testConnection();
    } catch (error) {
      logger.error({ error }, 'Error checking database connection');
      return false;
    }
  }

  /**
   * Get total number of operations
   */
  private async getTotalTradesCount(): Promise<number> {
    try {
      const stats = await this.dependencies.tradeHistoryService.getPerformanceStats();
      return stats.totalTrades;
    } catch (error) {
      logger.error({ error }, 'Error getting total operations');
      return 0;
    }
  }

  /**
   * Get success rate
   */
  private async getSuccessRate(): Promise<number> {
    try {
      const stats = await this.dependencies.tradeHistoryService.getPerformanceStats();
      return stats.winRate;
    } catch (error) {
      logger.error({ error }, 'Error getting success rate');
      return 0;
    }
  }

  /**
   * Get portfolio data
   */
  private async getPortfolioData(): Promise<PortfolioPosition[]> {
    try {
      const positions: PortfolioPosition[] = [];
      
      // Get open positions from history
      const openTrades = await this.dependencies.tradeHistoryService.getTradeHistory({ status: 'OPEN' });
      
      // For each trade, get current price
      for (const trade of openTrades) {
        const ticker = await this.dependencies.binanceService.getTicker24H(trade.symbol);
        if (ticker) {
          positions.push({
            symbol: trade.symbol,
            amount: typeof trade.quantity === 'string' ? parseFloat(trade.quantity) : trade.quantity,
            entryPrice: trade.entry,
            currentPrice: parseFloat(ticker.lastPrice)
          });
        }
      }
      
      return positions;
    } catch (error) {
      logger.error({ error }, 'Error getting portfolio data');
      return [];
    }
  }

  /**
   * Create authentication scene
   */
  private createAuthScene(): Scenes.BaseScene<BotContext> {
    const scene = new Scenes.BaseScene<BotContext>('auth');
    
    scene.enter(async (ctx) => {
      await ctx.reply('Please enter the access code to use the bot:');
    });
    
    scene.on(message('text'), async (ctx) => {
      const accessCode = ctx.message.text;
      
      if (accessCode === this.authConfig.accessCode) {
        // Authorize the user
        const userId = ctx.from?.id;
        if (userId) {
          this.authConfig.authorizedUsers.push(userId);
          ctx.session.authenticated = true;
          await ctx.reply('✅ Access granted. You can now use the bot.');
          await this.sendMainMenu(ctx);
        }
        await ctx.scene.leave();
      } else {
        await ctx.reply('❌ Incorrect code. Please try again or contact the administrator.');
      }
    });
    
    return scene;
  }
  
  /**
   * Create trading scene
   */
  private createTradeScene(): Scenes.BaseScene<BotContext> {
    const scene = new Scenes.BaseScene<BotContext>('trade');
    
    scene.enter(async (ctx) => {
      const symbol = ctx.session.currentSymbol || 'BTCUSDT';
      
      await ctx.reply(`
<b>💱 Trading Operations</b>

Current symbol: ${symbol}

Select an operation:
      `, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🟢 Buy', callback_data: `trade_buy_${symbol}` },
              { text: '🔴 Sell', callback_data: `trade_sell_${symbol}` }
            ],
            [
              { text: '📊 Analysis', callback_data: `trade_analysis_${symbol}` }
            ],
            [
              { text: '🔙 Back to Menu', callback_data: 'trade_back' }
            ]
          ]
        }
      });
    });
    
    // Callbacks for buy/sell
    scene.action(/trade_buy_(.+)/, async (ctx) => {
      // Logic for buying
      // Safely extract the data - TypeScript needs the type assertion
      const callbackData = (ctx.callbackQuery as any)?.data || '';
      const match = callbackData.match(/trade_buy_(.+)/);
      const symbol = match ? match[1] : '';
      
      await ctx.answerCbQuery(`Processing buy order for ${symbol}...`);
      await ctx.reply(`🟢 Buy order for ${symbol} is being processed.`);
      
      // Here you would connect to the binance service to place the actual order
      // For now we just simulate the flow
      await ctx.reply(`Order simulation for demo purposes`);
    });
    
    // Callback for sell operation
    scene.action(/trade_sell_(.+)/, async (ctx) => {
      // Similar logic for selling
      const callbackData = (ctx.callbackQuery as any)?.data || '';
      const match = callbackData.match(/trade_sell_(.+)/);
      const symbol = match ? match[1] : '';
      
      await ctx.answerCbQuery(`Processing sell order for ${symbol}...`);
      await ctx.reply(`🔴 Sell order for ${symbol} is being processed.`);
      
      // Simulation for demo purposes
      await ctx.reply(`Order simulation for demo purposes`);
    });
    
    // Back to main menu
    scene.action('trade_back', async (ctx) => {
      await ctx.answerCbQuery('Returning to main menu...');
      await ctx.scene.leave();
      await this.sendMainMenu(ctx as BotContext);
    });
    
    return scene;
  }
  
  /**
   * Create portfolio scene
   */
  private createPortfolioScene(): Scenes.BaseScene<BotContext> {
    const scene = new Scenes.BaseScene<BotContext>('portfolio');
    
    scene.enter(async (ctx) => {
      await ctx.reply('📊 <b>Loading portfolio...</b>', { parse_mode: 'HTML' });
      
      try {
        // Get portfolio data
        const positions = await this.getPortfolioData();
        
        if (positions.length === 0) {
          await ctx.reply('No active positions found in your portfolio.');
          return;
        }
        
        // Calculate total value
        let totalValue = 0;
        let portfolioMessage = '<b>📊 Your Current Portfolio</b>\n\n';
        
        positions.forEach((position, index) => {
          const currentValue = position.amount * position.currentPrice;
          totalValue += currentValue;
          
          const profitLoss = position.currentPrice - position.entryPrice;
          const profitLossPercent = (profitLoss / position.entryPrice) * 100;
          
          portfolioMessage += `<b>${index + 1}. ${position.symbol}</b>\n`;
          portfolioMessage += `Amount: ${position.amount.toFixed(6)}\n`;
          portfolioMessage += `Entry: $${position.entryPrice.toFixed(4)}\n`;
          portfolioMessage += `Current: $${position.currentPrice.toFixed(4)}\n`;
          portfolioMessage += `P/L: ${profitLoss >= 0 ? '📈' : '📉'} ${profitLossPercent.toFixed(2)}%\n`;
          portfolioMessage += `Value: $${currentValue.toFixed(2)}\n\n`;
        });
        
        portfolioMessage += `<b>Total Portfolio Value:</b> $${totalValue.toFixed(2)}`;
        
        // Show portfolio with action buttons
        await ctx.reply(portfolioMessage, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🔁 Refresh', callback_data: 'portfolio_refresh' },
                { text: '📈 Performance', callback_data: 'portfolio_performance' }
              ],
              [
                { text: '🔙 Back to Menu', callback_data: 'portfolio_back' }
              ]
            ]
          }
        });
      } catch (error) {
        logger.error({ error }, 'Error getting portfolio data');
        await ctx.reply('❌ Error loading portfolio data. Please try again later.');
      }
    });
    
    // Refresh portfolio
    scene.action('portfolio_refresh', async (ctx) => {
      await ctx.answerCbQuery('Refreshing portfolio...');
      await ctx.scene.reenter();
    });
    
    // Back to main menu
    scene.action('portfolio_back', async (ctx) => {
      await ctx.answerCbQuery('Returning to main menu...');
      await ctx.scene.leave();
      await this.sendMainMenu(ctx as BotContext);
    });
    
    return scene;
  }
}
