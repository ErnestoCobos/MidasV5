/**
 * Ejemplo de integración del servicio de Telegram en la aplicación MidasTS
 */
import { binanceService } from './services/binance';
import { marketDataService } from './services/market-data';
import { portfolioManagerService } from './services/portfolio-manager';
import { deepSeekService } from './services/deepseek';
import { db } from './services/database';
import { lunarCrushService } from './services/lunarcrush';
import { TelegramService } from './services/telegram';
import { logger } from './utils/logging';

// Validar variables de entorno necesarias para el bot de Telegram
function validateTelegramConfig(): boolean {
  const missingVars = [];
  
  if (!process.env.TELEGRAM_BOT_TOKEN) missingVars.push('TELEGRAM_BOT_TOKEN');
  
  if (missingVars.length > 0) {
    logger.warn(`Configuración de Telegram incompleta. Faltan variables: ${missingVars.join(', ')}`);
    return false;
  }
  
  return true;
}

/**
 * Inicia todos los servicios de la aplicación
 */
async function startServices() {
  // Iniciar servicios básicos
  try {
    logger.info('Iniciando servicios básicos...');
    
    // Conectar a la base de datos
    await db.connect();
    logger.info('✅ Conexión a base de datos establecida');
    
    // Iniciar servicios principales
    await binanceService.init();
    logger.info('✅ Servicio de Binance inicializado');
    
    await lunarCrushService.init();
    logger.info('✅ Servicio de LunarCrush inicializado');
    
    // Iniciar servicios derivados
    await marketDataService.init();
    logger.info('✅ Servicio de datos de mercado inicializado');
    
    await deepSeekService.init();
    logger.info('✅ Servicio de DeepSeek inicializado');
    
    await portfolioManagerService.init();
    logger.info('✅ Gestor de portafolio inicializado');
    
    // Iniciar bot de Telegram si está configurado
    if (validateTelegramConfig()) {
      const telegramService = new TelegramService();
      await telegramService.start();
      logger.info('✅ Bot de Telegram iniciado');
      
      // Enviar notificación de inicio a todos los usuarios autorizados
      await telegramService.sendNotificationToAll(`
🚀 <b>MidasTS Sistema Completo Iniciado</b>

El sistema de trading está ahora en línea y listo para operar.
Todos los servicios están conectados y funcionando.
Usa /menu para ver las opciones disponibles.

<i>Iniciado: ${new Date().toLocaleString()}</i>
      `);
      
      // Registrar manejadores de señales para notificaciones
      marketDataService.on('signal', (symbol, signal) => {
        telegramService.sendTradingSignal(symbol, signal)
          .catch(err => logger.error({ error: err }, 'Error al enviar señal de trading a Telegram'));
      });
      
      binanceService.on('orderExecuted', (order) => {
        telegramService.sendOrderNotification(order)
          .catch(err => logger.error({ error: err }, 'Error al enviar notificación de orden a Telegram'));
      });
    } else {
      logger.warn('Bot de Telegram no iniciado por falta de configuración');
    }
    
    logger.info('🚀 Todos los servicios iniciados correctamente');
  } catch (error) {
    logger.error({ error }, 'Error al iniciar servicios');
    process.exit(1);
  }
}

/**
 * Función principal
 */
async function main() {
  logger.info('Iniciando aplicación MidasTS...');
  
  // Configurar manejo de señales para cierre graceful
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  
  // Iniciar servicios
  await startServices();
}

/**
 * Cierre controlado de la aplicación
 */
async function shutdown(signal: string) {
  logger.info({ signal }, 'Apagando servicios...');
  
  try {
    // Cerrar conexiones y liberar recursos
    await db.disconnect();
    
    // Si el bot de Telegram está activo, detenerlo
    // (en una implementación real, se mantendría una referencia al servicio)
    
    logger.info('Servicios cerrados correctamente');
  } catch (error) {
    logger.error({ error }, 'Error durante el apagado');
  } finally {
    process.exit(0);
  }
}

// Iniciar aplicación
if (require.main === module) {
  main().catch(error => {
    logger.fatal({ error }, 'Error fatal en aplicación');
    process.exit(1);
  });
}

export { main };
