import { Telegraf, Context, Scenes, session } from 'telegraf';
import { message } from 'telegraf/filters';
import { logger } from '../utils/logging';
import { env } from '../utils/env';
import { deepSeekService, TradeSignal, DeepSeekService } from './deepseek';
import { binanceService } from './binance';
import { marketDataService } from './market-data';
import { tradeHistoryService } from './trade-history';
import { lunarCrushService } from './lunarcrush';
import { db } from './database';

// Import telegram components
import { createSettingsScene } from './telegram-settings';
import { scanMarket, MarketOpportunity } from './telegram-scan';
import { getTradeSignal, formatSignalMessage, scanMultipleCoins, formatMultipleSignalsMessage } from './telegram-signal';

// Import types extension
import '../utils/env-extend';

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
  // Current state
  currentSymbol?: string;
}

// Define el tipo context que extiende el original de Telegraf
export interface BotContext extends Context {
  session: BotSession;
  scene: Scenes.SceneContextScene<BotContext>;
}

// Configuración de autorización
interface AuthConfig {
  authorizedUsers: number[]; // Array de user IDs autorizados
  adminUsers: number[]; // Array de administradores
  accessCode?: string; // Código opcional para nuevos usuarios
}

// Interface for advancedSettings
interface AdvancedSettings {
  tradingMode?: string;
  hasApiKeys?: boolean;
  tradeLimit?: number;
}

// Extending BotSession to include advancedSettings
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
  advancedSettings?: AdvancedSettings;
  // Current state
  currentSymbol?: string;
}

// Interfaz para datos de portafolio
interface PortfolioPosition {
  symbol: string;
  amount: number;
  entryPrice: number;
  currentPrice: number;
}

/**
 * Servicio principal para la integración con Telegram
 */
export class TelegramService {
  private bot: Telegraf<BotContext>;
  private stage: Scenes.Stage<BotContext>;
  private authConfig: AuthConfig;
  private isRunning: boolean = false;
  
  constructor() {
    // Obtener token del .env y proporcionar un valor predeterminado si no existe
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    
    if (!token) {
      logger.error('TELEGRAM_BOT_TOKEN no está configurado en el .env');
      throw new Error('Token de Telegram no configurado');
    }
    
    // Inicializar el bot
    this.bot = new Telegraf<BotContext>(token);
    
    // Configurar escenas para flujos conversacionales
    this.stage = new Scenes.Stage<BotContext>([
      this.createAuthScene(),
      this.createTradeScene(),
      createSettingsScene(), // Usar la función importada
      this.createPortfolioScene()
    ]);
    
    // Configuración de autenticación (valores por defecto)
    this.authConfig = {
      authorizedUsers: process.env.TELEGRAM_AUTHORIZED_USERS ? 
        process.env.TELEGRAM_AUTHORIZED_USERS.split(',').map((id: string) => parseInt(id.trim())) : [],
      adminUsers: process.env.TELEGRAM_ADMIN_USERS ?
        process.env.TELEGRAM_ADMIN_USERS.split(',').map((id: string) => parseInt(id.trim())) : [],
      accessCode: process.env.TELEGRAM_ACCESS_CODE
    };
    
    // Configuración del bot
    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbacks();
    
    logger.info('Servicio de Telegram inicializado');
  }
  
  /**
   * Inicia el bot y se conecta a la API de Telegram
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('El bot de Telegram ya está en ejecución');
      return;
    }
    
    try {
      await this.bot.launch();
      this.isRunning = true;
      
      logger.info('Bot de Telegram iniciado correctamente');
      
      // Configurar manejo de señales para cierre graceful
      process.once('SIGINT', () => this.stop('SIGINT'));
      process.once('SIGTERM', () => this.stop('SIGTERM'));
    } catch (error) {
      logger.error({ error }, 'Error al iniciar el bot de Telegram');
      throw error;
    }
  }
  
  /**
   * Detiene el bot
   */
  public async stop(reason: string = 'manual'): Promise<void> {
    if (!this.isRunning) {
      logger.warn('El bot de Telegram no está en ejecución');
      return;
    }
    
    try {
      await this.bot.stop(reason);
      this.isRunning = false;
      logger.info({ reason }, 'Bot de Telegram detenido');
    } catch (error) {
      logger.error({ error, reason }, 'Error al detener el bot de Telegram');
    }
  }
  
  /**
   * Envía una notificación a todos los usuarios autorizados
   */
  public async sendNotificationToAll(message: string): Promise<void> {
    for (const userId of this.authConfig.authorizedUsers) {
      try {
        await this.bot.telegram.sendMessage(userId, message, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error({ error, userId }, 'Error al enviar notificación');
      }
    }
  }
  
  /**
   * Envía una alerta de señal de trading a usuarios que tengan activadas las notificaciones
   */
  public async sendTradingSignal(symbol: string, signal: any): Promise<void> {
    // Construir mensaje formateado
    const message = `
<b>🔔 Nueva Señal de Trading</b>

<b>Símbolo:</b> ${symbol}
<b>Acción:</b> ${signal.action}
<b>Confianza:</b> ${(signal.confidence * 100).toFixed(1)}%
${signal.entry ? `<b>Entrada:</b> $${signal.entry}` : ''}
${signal.stopLoss ? `<b>Stop Loss:</b> $${signal.stopLoss}` : ''}
${signal.takeProfit ? `<b>Take Profit:</b> $${signal.takeProfit}` : ''}
${signal.reasoning ? `\n<b>Análisis:</b> ${signal.reasoning}` : ''}

<i>Generado por DeepSeek Reasoner a las ${new Date().toLocaleTimeString()}</i>
    `;
    
    // Enviar a todos los usuarios con notificaciones de señales activadas
    await this.sendNotificationToAll(message);
  }
  
  /**
   * Envía notificación de ejecución de orden
   */
  public async sendOrderNotification(order: any): Promise<void> {
    // Construir mensaje de orden ejecutada
    const message = `
<b>✅ Orden Ejecutada</b>

<b>Tipo:</b> ${order.side === 'BUY' ? '🟢 Compra' : '🔴 Venta'}
<b>Símbolo:</b> ${order.symbol}
<b>Precio:</b> $${parseFloat(order.price).toFixed(4)}
<b>Cantidad:</b> ${parseFloat(order.quantity).toFixed(6)}
<b>Total:</b> $${(parseFloat(order.price) * parseFloat(order.quantity)).toFixed(2)}

<i>Ejecutado en Binance a las ${new Date().toLocaleTimeString()}</i>
    `;
    
    await this.sendNotificationToAll(message);
  }
  
  /**
   * Configura el middleware del bot
   */
  private setupMiddleware(): void {
    // Middleware de sesión para mantener estado
    this.bot.use(session());
    
    // Middleware de escenas
    this.bot.use(this.stage.middleware());
    
    // Middleware de autenticación
    this.bot.use(async (ctx, next: () => Promise<void>) => {
      const botCtx = ctx as BotContext;
      
      // Inicializar la sesión si no existe
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
      
      // Verificar si el usuario está autorizado
      const userId = ctx.from?.id;
      if (userId && this.authConfig.authorizedUsers.includes(userId)) {
        (ctx.session as BotSession).authenticated = true;
        return next();
      }
      
      // Si no está autorizado, permitir solo comando /start para autenticación
      if (ctx.message && 'text' in ctx.message && ctx.message.text === '/start') {
        return next();
      }
      
      // Rechazar acceso para usuarios no autorizados
      await ctx.reply('⛔ No estás autorizado para usar este bot. Usa /start para solicitar acceso.');
      return;
    });
    
    // Logging de comandos (después de autenticación)
    this.bot.use(async (ctx: Context, next: () => Promise<void>) => {
      if (ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/')) {
        const command = ctx.message.text.split(' ')[0];
        logger.info({
          userId: ctx.from?.id,
          username: ctx.from?.username,
          command
        }, 'Comando de Telegram recibido');
      }
      return next();
    });
  }
  
  /**
   * Configura los comandos básicos del bot
   */
  private setupCommands(): void {
    // Comando /start - Inicio y autenticación
    this.bot.command('start', async (ctx) => {
      const botCtx = ctx as BotContext;
      const userId = ctx.from?.id;
      const username = ctx.from?.username || ctx.from?.first_name || 'Usuario';
      
      // Si ya está autorizado
      if (botCtx.session.authenticated) {
        await ctx.reply(`¡Bienvenido de nuevo, ${username}! El bot de MidasTS está listo para ayudarte.`);
        await this.sendMainMenu(botCtx);
        return;
      }
      
      // Si no está autorizado pero hay código de acceso configurado
      if (this.authConfig.accessCode) {
        await (ctx as any).scene.enter('auth');
        return;
      }
      
      // Si no hay código y no está en la lista, informar al administrador
      await ctx.reply(`Hola ${username}, tu ID (${userId}) no está autorizado. Un administrador debe añadirte.`);
      
      // Notificar a los administradores
      for (const adminId of this.authConfig.adminUsers) {
        try {
          await this.bot.telegram.sendMessage(
            adminId,
            `🔔 Nuevo usuario solicitando acceso:\nID: ${userId}\nUsuario: @${username}\n\nPara autorizar, añade este ID a las variables de entorno o usa /authorize ${userId}`
          );
        } catch (error) {
          logger.error({ error, adminId }, 'Error al notificar a administrador');
        }
      }
    });
    
    // Comando /help - Mostrar ayuda
    this.bot.command('help', async (ctx: Context) => {
      const helpMessage = `
<b>🤖 Bot de MidasTS - Comandos disponibles</b>

<b>Comandos básicos:</b>
/start - Inicia el bot e inicia sesión
/help - Muestra este mensaje de ayuda
/status - Muestra el estado del sistema
/menu - Muestra el menú principal

<b>Comandos de trading:</b>
/price [símbolo] - Consulta precio actual (ej: /price BTC)
/signal [símbolo] - Solicita señal de trading
/portfolio - Muestra tu portafolio actual
/stats - Muestra estadísticas de rendimiento

<b>Comandos avanzados:</b>
/scan - Escanea el mercado para oportunidades
/setnotify - Configura notificaciones
/settings - Ajusta configuración personal

<b>Control del sistema:</b>
/startbot [modo] - Inicia el sistema de trading
/stopbot - Detiene el sistema de trading

Para más información, visita: https://github.com/usuario/midasTS
      `;
      
      await ctx.reply(helpMessage, { parse_mode: 'HTML' });
    });
    
    // Comando /status - Estado del sistema
    this.bot.command('status', async (ctx: Context) => {
      try {
        // Verificar conexiones a las APIs
        const binanceStatus = await this.checkBinanceConnection();
        const lunarCrushStatus = await this.checkLunarCrushConnection();
        const dbStatus = await this.checkDatabaseConnection();
        
        // Convertir el contexto a BotContext para acceder a la sesión de forma segura
        const botCtx = ctx as BotContext;
        
        // Construir mensaje de estado
        const statusMessage = `
<b>📊 Estado del Sistema MidasTS</b>

<b>Conexiones:</b>
- Binance API: ${binanceStatus ? '✅ Conectado' : '❌ Error de conexión'}
- LunarCrush API: ${lunarCrushStatus ? '✅ Conectado' : '❌ Error de conexión'}
- Base de datos: ${dbStatus ? '✅ Conectado' : '❌ Error de conexión'}

<b>Rendimiento:</b>
- Operaciones totales: ${await this.getTotalTradesCount()}
- Tasa de éxito: ${await this.getSuccessRate()}%

<b>Estado del Bot:</b>
- Sesión iniciada como: @${botCtx.session.username}
- Notificaciones: ${botCtx.session.notifications.signals ? '✅' : '❌'} Señales, ${botCtx.session.notifications.trades ? '✅' : '❌'} Operaciones

<i>Actualizado: ${new Date().toLocaleString()}</i>
        `;
        
        await ctx.reply(statusMessage, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error({ error }, 'Error al obtener estado del sistema');
        await ctx.reply('❌ Error al obtener el estado del sistema. Intenta nuevamente más tarde.');
      }
    });
    
    // Comando /menu - Mostrar menú principal
    this.bot.command('menu', async (ctx) => {
      const botCtx = ctx as BotContext;
      await this.sendMainMenu(botCtx);
    });
    
    // Comando /price - Obtener precio actual
    this.bot.command('price', async (ctx: Context) => {
      // Convertir a BotContext para manejar la sesión
      const botCtx = ctx as BotContext;
      // Verificar si el mensaje tiene texto y extraer las partes
      const messageText = 'text' in ctx.message! ? ctx.message.text : '';
      const parts = messageText?.split(' ');
      
      if (!parts || parts.length < 2) {
        await ctx.reply('⚠️ Uso correcto: /price SÍMBOLO\nEjemplo: /price BTC');
        return;
      }
      
      let symbol = parts[1].toUpperCase();
      // Añadir USDT si no se especifica par completo
      if (!symbol.includes('USDT') && !symbol.includes('/')) {
        symbol = `${symbol}USDT`;
      }
      
      try {
        const ticker = await binanceService.getTicker24H(symbol);
        
        if (!ticker) {
          await ctx.reply(`❌ No se encontraron datos para ${symbol}`);
          return;
        }
        
        // Guardar símbolo actual en sesión para uso posterior
        botCtx.session.currentSymbol = symbol;
        
        // Preparar mensaje con datos del ticker
        const priceMessage = `
<b>💲 Precio de ${symbol}</b>

<b>Actual:</b> $${parseFloat(ticker.lastPrice).toFixed(4)}
<b>Cambio 24h:</b> ${parseFloat(ticker.priceChangePercent).toFixed(2)}%
<b>Rango 24h:</b> $${parseFloat(ticker.lowPrice).toFixed(4)} - $${parseFloat(ticker.highPrice).toFixed(4)}
<b>Volumen 24h:</b> $${Math.round(parseFloat(ticker.quoteVolume)).toLocaleString()} USD

<i>Datos proporcionados por Binance</i>
        `;
        
        // Opciones inline para acciones adicionales
        const inlineKeyboard = {
          inline_keyboard: [
            [
              { text: '📊 Análisis Técnico', callback_data: `technicals_${symbol}` },
              { text: '🔮 Señal de Trading', callback_data: `signal_${symbol}` }
            ],
            [
              { text: '📈 Más Datos', callback_data: `moredata_${symbol}` },
              { text: '📱 Establecer Alerta', callback_data: `setalert_${symbol}` }
            ]
          ]
        };
        
        await ctx.reply(priceMessage, { 
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard
        });
      } catch (error) {
        logger.error({ error, symbol }, 'Error al obtener precio');
        await ctx.reply(`❌ Error al obtener el precio de ${symbol}. Comprueba que el símbolo sea válido.`);
      }
    });
    
    // Comando /signal - Obtener señal de trading
    this.bot.command('signal', async (ctx: Context) => {
      // Convertir a BotContext para manejar la sesión
      const botCtx = ctx as BotContext;
      // Verificar si el mensaje tiene texto y extraer las partes
      const messageText = 'text' in ctx.message! ? ctx.message.text : '';
      const parts = messageText?.split(' ');
      
      // Si no se especifica símbolo, escanear múltiples monedas
      if (!parts || parts.length < 2) {
        await ctx.reply('🔍 <b>Escaneando el mercado en busca de oportunidades...</b>\nEsto tomará un momento.', {
          parse_mode: 'HTML'
        });
        
        try {
          // Obtener señales para múltiples monedas (limitado a 8 para no sobrecargar)
          const results = await scanMultipleCoins(8, 1000);
          
          if (results.length === 0) {
            await ctx.reply('❌ No se pudieron generar señales de trading. Intenta nuevamente más tarde.');
            return;
          }
          
          // Formatear mensaje con múltiples señales
          const signalsMessage = formatMultipleSignalsMessage(results);
          
          // Generar botones para cada señal de compra/venta
          const actionableSignals = results
            .filter(r => r.signal.action !== 'HOLD')
            .slice(0, 5); // Limitar a 5 botones
          
          let inlineKeyboard;
          if (actionableSignals.length > 0) {
            inlineKeyboard = {
              inline_keyboard: [
                ...actionableSignals.map(result => [{
                  text: `📊 Detalles ${result.symbol}`,
                  callback_data: `signal_${result.symbol}`
                }]),
                [{ 
                  text: '🔄 Actualizar Señales', 
                  callback_data: 'refresh_all_signals' 
                }]
              ]
            };
          } else {
            inlineKeyboard = {
              inline_keyboard: [
                [{ 
                  text: '🔄 Actualizar Señales', 
                  callback_data: 'refresh_all_signals' 
                }]
              ]
            };
          }
          
          // Enviar mensaje con todas las señales
          await ctx.reply(signalsMessage, { 
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard
          });
        } catch (error) {
          logger.error({ error }, 'Error al escanear múltiples monedas');
          await ctx.reply('❌ Error al escanear el mercado. Intenta nuevamente más tarde.');
        }
        return;
      }
      
      // Si se especifica símbolo, generar señal individual
      let symbol = parts[1].toUpperCase();
      // Añadir USDT si no se especifica par completo
      if (!symbol.includes('USDT') && !symbol.includes('/')) {
        symbol = `${symbol}USDT`;
      }
      
      try {
        // Enviar mensaje de espera
        const waitMessage = await ctx.reply('🔮 <b>Generando señal de trading...</b>\nEsto puede tomar hasta 15 segundos.', {
          parse_mode: 'HTML'
        });
        
        // Obtener señal de trading
        const signal = await getTradeSignal(symbol, 1000); // Capital predeterminado de 1000 USD
        
        if (!signal) {
          await ctx.reply(`❌ No se pudo generar señal para ${symbol}. Comprueba que el símbolo sea válido.`);
          return;
        }
        
        // Guardar símbolo actual en sesión para uso posterior
        botCtx.session.currentSymbol = symbol;
        
        // Formatear mensaje de señal
        const signalMessage = formatSignalMessage(symbol, signal);
        
        // Opciones inline para acciones adicionales
        const inlineKeyboard = {
          inline_keyboard: [
            [
              { text: '📊 Ver Precio', callback_data: `price_${symbol}` },
              { text: '💰 Ejecutar', callback_data: `execute_${signal.action.toLowerCase()}_${symbol}` }
            ],
            [
              { text: '🔄 Actualizar Señal', callback_data: `refresh_signal_${symbol}` }
            ]
          ]
        };
        
        // Enviar mensaje con la señal
        await ctx.reply(signalMessage, { 
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard
        });
      } catch (error) {
        logger.error({ error, symbol }, 'Error al obtener señal de trading');
        await ctx.reply(`❌ Error al generar señal para ${symbol}. Intenta nuevamente más tarde.`);
      }
    });
    
    // Implementaciones de otros comandos...
    
    // Comando /scan - Escanear mercado para oportunidades
    this.bot.command('scan', async (ctx: Context) => {
      try {
        await ctx.reply('🔍 <b>Escaneando el mercado en busca de oportunidades...</b>\nEsto puede tomar un momento.', {
          parse_mode: 'HTML'
        });
        
        // Obtener oportunidades de mercado usando la función del módulo
        const opportunities = await scanMarket(5);
        
        if (!opportunities || opportunities.length === 0) {
          await ctx.reply('❌ No se encontraron oportunidades que cumplan los criterios en este momento. Intenta más tarde.');
          return;
        }
        
        // Preparar mensaje con las oportunidades
        let scanMessage = '<b>✅ Escaneo de mercado completado</b>\n\n';
        scanMessage += '<b>🔝 Mejores oportunidades encontradas:</b>\n\n';
        
        opportunities.forEach((opportunity, index) => {
          scanMessage += `<b>${index + 1}. ${opportunity.symbol}</b> - $${opportunity.price.toFixed(4)}\n`;
          scanMessage += `📊 Score: ${(opportunity.score * 100).toFixed(1)}%\n`;
          scanMessage += `🌟 Galaxy Score: ${opportunity.galaxyScore}\n`;
          scanMessage += `${opportunity.recommendation}\n\n`;
        });
        
        scanMessage += `<i>Actualizado: ${new Date().toLocaleString()}</i>`;
        
        // Preparar botones para ver detalles o analizar más a fondo
        const inlineKeyboard = {
          inline_keyboard: opportunities.map(opp => {
            return [{ 
              text: `📊 Ver ${opp.symbol}`, 
              callback_data: `price_${opp.symbol}` 
            }];
          })
        };
        
        await ctx.reply(scanMessage, { 
          parse_mode: 'HTML',
          reply_markup: inlineKeyboard
        });
      } catch (error) {
        logger.error({ error }, 'Error al escanear mercado');
        await ctx.reply('❌ Error al escanear el mercado. Intenta nuevamente más tarde.');
      }
    });
  }

  /**
   * Envía el menú principal al usuario
   */
  private async sendMainMenu(ctx: BotContext): Promise<void> {
    await ctx.reply('🤖 <b>MidasTS Trading Bot</b>', {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💲 Precios', callback_data: 'menu_prices' },
            { text: '📊 Portfolio', callback_data: 'menu_portfolio' }
          ],
          [
            { text: '📈 Señales', callback_data: 'menu_signals' },
            { text: '🔍 Escanear', callback_data: 'menu_scan' }
          ],
          [
            { text: '📊 Estadísticas', callback_data: 'menu_stats' },
            { text: '⚙️ Configuración', callback_data: 'menu_settings' }
          ]
        ]
      }
    });
  }

  /**
   * Configura los callbacks
   */
  private setupCallbacks(): void {
    // Menu callbacks
    this.bot.action(/menu_(.+)/, async (ctx) => {
      const action = ctx.match ? ctx.match[1] : '';
      await ctx.answerCbQuery();
      
      switch (action) {
        case 'prices':
          await ctx.reply('🔍 Introduce el símbolo para consultar precio.\nEjemplo: /price BTC');
          break;
        case 'portfolio':
          await ctx.scene.enter('portfolio');
          break;
        case 'signals':
          await ctx.reply('📊 Introduce el símbolo para obtener señal.\nEjemplo: /signal ETH');
          break;
        case 'scan':
          // Simular comando scan
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
          // Simular comando stats
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
    
    // Callback para solicitar señal de trading
    this.bot.action(/signal_(.+)/, async (ctx) => {
      // Extraer símbolo del callback data (usando type assertion)
      const callbackData = (ctx.callbackQuery as any)?.data;
      const match = callbackData?.match(/signal_(.+)/);
      const symbol = match ? match[1] : '';
      
      // Eliminar mensaje original para evitar múltiples clics
      await ctx.answerCbQuery(`Generando señal para ${symbol}...`);
      
      // Simular comando /signal
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
    
    // Callback para mostrar análisis técnico
    this.bot.action(/technicals_(.+)/, async (ctx) => {
      // Extraer símbolo del callback data (usando type assertion)
      const callbackData = (ctx.callbackQuery as any)?.data;
      const match = callbackData?.match(/technicals_(.+)/);
      const symbol = match ? match[1] : '';
      await ctx.answerCbQuery(`Analizando ${symbol}...`);
      
      try {
        // Obtener datos mejorados del mercado
        const md = await marketDataService.getEnhancedMarketData(symbol);
        
        const message = `
<b>📊 Análisis Técnico: ${symbol}</b>

<b>Indicadores:</b>
- RSI(14): ${md.technicals?.rsi?.toFixed(2) || 'N/A'} ${this.getRsiEmoji(md.technicals?.rsi)}
- Tendencia EMA: ${md.technicals?.ema_cross || 'N/A'} ${this.getTrendEmoji(md.technicals?.ema_cross)}
- Volatilidad (ATR): ${this.getAtr(md.technicals)} 
- Posición Bollinger: ${md.technicals?.bband_percent?.toFixed(2) || 'N/A'} ${this.getBBandEmoji(md.technicals?.bband_percent)}
- Relación Vol/Promedio: ${md.technicals?.volume_ratio?.toFixed(2) || 'N/A'}x

<b>Niveles clave:</b>
- Soportes: ${md.technicals?.supports?.map(s => '$' + s.toFixed(2)).join(', ') || 'N/A'}
- Resistencias: ${md.technicals?.resistances?.map(r => '$' + r.toFixed(2)).join(', ') || 'N/A'}

<i>Actualizado: ${new Date().toLocaleString()}</i>
        `;
        
        await ctx.editMessageText(message, { parse_mode: 'HTML' });
      } catch (error) {
        logger.error({ error, symbol }, 'Error al obtener análisis técnico');
        await ctx.reply('❌ Error al obtener análisis técnico. Intenta nuevamente más tarde.');
      }
    });

    // Callback para actualizar señal de trading
    this.bot.action(/refresh_signal_(.+)/, async (ctx) => {
      const callbackData = (ctx.callbackQuery as any)?.data;
      const match = callbackData?.match(/refresh_signal_(.+)/);
      const symbol = match ? match[1] : '';
      
      await ctx.answerCbQuery(`Actualizando señal para ${symbol}...`);
      
      try {
        // Obtener una nueva señal
        const signal = await getTradeSignal(symbol, 1000);
        
        if (!signal) {
          await ctx.reply(`❌ No se pudo actualizar la señal para ${symbol}.`);
          return;
        }
        
        // Formatear el mensaje con la nueva señal
        const signalMessage = formatSignalMessage(symbol, signal);
        
        // Opciones inline actualizadas
        const inlineKeyboard = {
          inline_keyboard: [
            [
              { text: '📊 Ver Precio', callback_data: `price_${symbol}` },
              { text: '💰 Ejecutar', callback_data: `execute_${signal.action.toLowerCase()}_${symbol}` }
            ],
            [
              { text: '🔄 Actualizar Señal', callback_data: `refresh_signal_${symbol}` }
            ]
          ]
        };
        
        // Intentar editar el mensaje actual o enviar uno nuevo
        try {
          await ctx.editMessageText(signalMessage, { 
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard
          });
        } catch (error) {
          // Si no se puede editar, enviar un nuevo mensaje
          await ctx.reply(signalMessage, { 
            parse_mode: 'HTML',
            reply_markup: inlineKeyboard
          });
        }
      } catch (error) {
        logger.error({ error, symbol }, 'Error al actualizar señal de trading');
        await ctx.reply('❌ Error al actualizar la señal. Intenta nuevamente más tarde.');
      }
    });
    
    // Callback para actualizar todas las señales
    this.bot.action('refresh_all_signals', async (ctx) => {
      await ctx.answerCbQuery('Actualizando señales de todo el mercado...');
      
      // Simular comando /signal sin parámetros
      await ctx.reply('/signal');
      await this.bot.handleUpdate({
        update_id: 0,
        message: {
          message_id: 0,
          date: Math.floor(Date.now() / 1000),
          chat: ctx.chat!,
          from: ctx.from!,
          text: '/signal'
        }
      } as any);
    });
    
    // Callback para ejecutar órdenes
    this.bot.action(/execute_(buy|sell)_(.+)/, async (ctx) => {
      const callbackData = (ctx.callbackQuery as any)?.data;
      const match = callbackData?.match(/execute_(buy|sell)_(.+)/);
      
      if (!match || match.length < 3) {
        await ctx.answerCbQuery('Error: Datos de callback inválidos');
        return;
      }
      
      const action = match[1].toUpperCase();
      const symbol = match[2];
      
      await ctx.answerCbQuery(`Preparando orden de ${action} para ${symbol}...`);
      
      // En una implementación real, aquí se ejecutaría la orden a través de Binance
      // Por ahora, simplemente mostrar la interfaz de la escena de trading
      const botCtx = ctx as BotContext;
      botCtx.session.currentSymbol = symbol;
      
      await ctx.scene.enter('trade');
    });
  }

  /**
   * Obtiebe emoji según valor RSI
   */
  private getRsiEmoji(rsi?: number): string {
    if (!rsi) return '';
    if (rsi > 70) return '🔴'; // Sobrecompra
    if (rsi < 30) return '🟢'; // Sobreventa
    return '⚪'; // Neutral
  }

  /**
   * Obtiene emoji según tendencia
   */
  private getTrendEmoji(trend?: string): string {
    if (!trend) return '';
    if (trend === 'bullish') return '📈';
    if (trend === 'bearish') return '📉';
    return '↔️'; // Lateral
  }

  /**
   * Obtiene emoji para posición Bollinger Band
   */
  private getBBandEmoji(bbandPercent?: number): string {
    if (bbandPercent === undefined) return '';
    if (bbandPercent < 0.2) return '🟢'; // Cerca de soporte
    if (bbandPercent > 0.8) return '🔴'; // Cerca de resistencia
    return '⚪'; // En medio
  }

  /**
   * Obtiene el valor de ATR desde los datos técnicos
   */
  private getAtr(technicals: any): string {
    return technicals && 'atr' in technicals ? technicals.atr.toFixed(4) : 'N/A';
  }

  /**
   * Verifica la conexión con Binance
   */
  private async checkBinanceConnection(): Promise<boolean> {
    try {
      const ticker = await binanceService.getTicker24H('BTCUSDT');
      return !!ticker;
    } catch (error) {
      logger.error({ error }, 'Error al verificar conexión con Binance');
      return false;
    }
  }

  /**
   * Verifica la conexión con LunarCrush
   */
  private async checkLunarCrushConnection(): Promise<boolean> {
    try {
      const score = await lunarCrushService.galaxyScore('BTC');
      return score > 0;
    } catch (error) {
      logger.error({ error }, 'Error al verificar conexión con LunarCrush');
      return false;
    }
  }

  /**
   * Verifica la conexión con la base de datos
   */
  private async checkDatabaseConnection(): Promise<boolean> {
    try {
      return await db.testConnection();
    } catch (error) {
      logger.error({ error }, 'Error al verificar conexión con base de datos');
      return false;
    }
  }

  /**
   * Obtiene el número total de operaciones
   */
  private async getTotalTradesCount(): Promise<number> {
    try {
      const stats = await tradeHistoryService.getPerformanceStats();
      return stats.totalTrades;
    } catch (error) {
      logger.error({ error }, 'Error al obtener total de operaciones');
      return 0;
    }
  }

  /**
   * Obtiene la tasa de éxito
   */
  private async getSuccessRate(): Promise<number> {
    try {
      const stats = await tradeHistoryService.getPerformanceStats();
      return stats.winRate;
    } catch (error) {
      logger.error({ error }, 'Error al obtener tasa de éxito');
      return 0;
    }
  }

  /**
   * Obtiene datos de portafolio 
   */
  private async getPortfolioData(): Promise<PortfolioPosition[]> {
    try {
      // Implementación básica - En la integración real, obtener de Binance
          const positions: PortfolioPosition[] = [];
          
          // Obtener posiciones abiertas desde el historial
          const openTrades = await tradeHistoryService.getTradeHistory({ status: 'OPEN' });
          
          // Para cada trade, obtener precio actual
          for (const trade of openTrades) {
            const ticker = await binanceService.getTicker24H(trade.symbol);
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
      logger.error({ error }, 'Error al obtener datos de portafolio');
      return [];
    }
  }

  /**
   * Crea la escena de autenticación
   */
  private createAuthScene(): Scenes.BaseScene<BotContext> {
    const scene = new Scenes.BaseScene<BotContext>('auth');
    
    scene.enter(async (ctx) => {
      await ctx.reply('Por favor, introduce el código de acceso para usar el bot:');
    });
    
    scene.on(message('text'), async (ctx) => {
      const accessCode = ctx.message.text;
      
      if (accessCode === this.authConfig.accessCode) {
        // Autorizar al usuario
        const userId = ctx.from?.id;
        if (userId) {
          this.authConfig.authorizedUsers.push(userId);
          ctx.session.authenticated = true;
          await ctx.reply('✅ Acceso concedido. Ahora puedes usar el bot.');
          await this.sendMainMenu(ctx);
        }
        await ctx.scene.leave();
      } else {
        await ctx.reply('❌ Código incorrecto. Inténtalo nuevamente o contacta al administrador.');
      }
    });
    
    return scene;
  }
  
  /**
   * Crea la escena de trading
   */
  private createTradeScene(): Scenes.BaseScene<BotContext> {
    const scene = new Scenes.BaseScene<BotContext>('trade');
    
    scene.enter(async (ctx) => {
      const symbol = ctx.session.currentSymbol || 'BTCUSDT';
      
      await ctx.reply(`
<b>💱 Operaciones de Trading</b>

Símbolo actual: ${symbol}

Selecciona una operación:
      `, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🟢 Comprar', callback_data: `trade_buy_${symbol}` },
              { text: '🔴 Vender', callback_data: `trade_sell_${symbol}` }
            ],
            [
              { text: '📊 Análisis', callback_data: `trade_analysis_${symbol}` }
            ],
            [
              { text: '🔙 Volver al Menú', callback_data: 'trade_back' }
            ]
          ]
        }
      });
    });
    
    // Callbacks para compra/venta
    scene.action(/trade_buy_(.+)/, async (ctx) => {
      // Lógica para comprar
      await ctx.answerCbQuery('Procesando orden de compra...');
      const match = ctx.match ? ctx.match[1] : '';
      await ctx.reply(`Simulando compra de ${match}. En un entorno real, aquí se ejecutaría la orden.`);
    });
    
    scene.action(/trade_sell_(.+)/, async (ctx) => {
      // Lógica para vender
      await ctx.answerCbQuery('Procesando orden de venta...');
      const match = ctx.match ? ctx.match[1] : '';
      await ctx.reply(`Simulando venta de ${match}. En un entorno real, aquí se ejecutaría la orden.`);
    });
    
    scene.action('trade_back', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.leave();
      await this.sendMainMenu(ctx);
    });
    
    return scene;
  }
  
  /**
   * Crea la escena de portafolio
   */
  private createPortfolioScene(): Scenes.BaseScene<BotContext> {
    const scene = new Scenes.BaseScene<BotContext>('portfolio');
    
    scene.enter(async (ctx) => {
      try {
        // Obtener datos de portafolio
        const positions = await this.getPortfolioData();
        
        if (positions.length === 0) {
          await ctx.reply('📊 <b>Tu Portafolio</b>\n\nNo tienes posiciones abiertas actualmente.', {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '🔙 Volver al Menú', callback_data: 'portfolio_back' }
              ]]
            }
          });
          return;
        }
        
        // Calcular valor total y PnL
        let totalValue = 0;
        let totalPnL = 0;
        
        // Crear mensaje de portafolio
        let portfolioMessage = '<b>📊 Tu Portafolio</b>\n\n';
        
        positions.forEach(pos => {
          const currentValue = pos.amount * pos.currentPrice;
          const entryValue = pos.amount * pos.entryPrice;
          const pnl = currentValue - entryValue;
          const pnlPercent = (pnl / entryValue) * 100;
          
          totalValue += currentValue;
          totalPnL += pnl;
          
          portfolioMessage += `<b>${pos.symbol}</b>: ${pos.amount} unidades\n`;
          portfolioMessage += `📈 Precio: $${pos.entryPrice.toFixed(4)} → $${pos.currentPrice.toFixed(4)}\n`;
          portfolioMessage += `💰 PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)\n\n`;
        });
        
        // Añadir resumen
        portfolioMessage += `<b>Valor Total:</b> $${totalValue.toFixed(2)}\n`;
        portfolioMessage += `<b>PnL Total:</b> ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}\n`;
        portfolioMessage += `\n<i>Actualizado: ${new Date().toLocaleString()}</i>`;
        
        await ctx.reply(portfolioMessage, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📊 Actualizar', callback_data: 'portfolio_refresh' },
                { text: '📈 Rendimiento', callback_data: 'portfolio_performance' }
              ],
              [
                { text: '🔙 Volver al Menú', callback_data: 'portfolio_back' }
              ]
            ]
          }
        });
      } catch (error) {
        await ctx.reply('❌ Error al obtener los datos del portafolio. Intenta nuevamente más tarde.');
      }
    });
    
    // Callbacks
    scene.action('portfolio_refresh', async (ctx) => {
      await ctx.answerCbQuery('Actualizando portafolio...');
      await ctx.scene.reenter();
    });
    
    scene.action('portfolio_back', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.leave();
      await this.sendMainMenu(ctx);
    });
    
    return scene;
  }
  
  /**
   * Obtiene una sesión de usuario por ID
   */
  private async getUserSession(userId: number): Promise<BotSession | null> {
    // En una implementación real, esto podría obtener la sesión de una base de datos
    // Para esta implementación simple, devolvemos un valor predeterminado
    return {
      authenticated: true,
      userId: userId,
      username: 'user',
      notifications: {
        signals: true,
        trades: true,
        portfolioUpdates: false
      }
    };
  }
  
  /**
   * Escanea el mercado en busca de oportunidades
   * Reemplazado por la función importada de telegram-scan.ts
   */
  private async scanMarket(): Promise<MarketOpportunity[]> {
    // Usar la función importada del módulo especializado
    return scanMarket(5); // Limitar a 5 resultados
  }
}
