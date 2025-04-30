/**
 * Script para iniciar el bot de Telegram independientemente de otros servicios
 * 
 * Este script inicia únicamente el servicio de Telegram, útil para ejecutar el bot
 * sin necesidad de iniciar todos los servicios del sistema MidasTS.
 * 
 * Uso: 
 * npm run telegram-bot
 */

import 'dotenv/config';
import { logger } from './utils/logging';
import { TelegramService } from './services/telegram';
import { binanceService } from './services/binance';
import { lunarCrushService } from './services/lunarcrush';
import { marketDataService } from './services/market-data';
import { deepSeekService } from './services/deepseek';
import { db } from './services/database';

// Validar que el token de Telegram esté configurado
if (!process.env.TELEGRAM_BOT_TOKEN) {
  logger.error('TELEGRAM_BOT_TOKEN no está configurado en el archivo .env');
  process.exit(1);
}

// Validar que hay usuarios autorizados
if (!process.env.TELEGRAM_AUTHORIZED_USERS) {
  logger.warn('TELEGRAM_AUTHORIZED_USERS no está configurado. Solo los administradores podrán usar el bot.');
}

async function main() {
  try {
    logger.info('Inicializando servicios necesarios para el bot de Telegram...');
    
    // Inicializar servicios básicos que el bot necesita
    // Nota: Se asume que estos servicios ya están inicializados o no necesitan inicialización explícita
    logger.info('Verificando conexión a servicios...');
    
    try {
      // Comprobar conexión a Binance
      await binanceService.getTicker24H('BTCUSDT');
      logger.info('✅ Servicio de Binance conectado');
      
      // Comprobar conexión a LunarCrush
      await lunarCrushService.galaxyScore('BTC');
      logger.info('✅ Servicio de LunarCrush conectado');
      
      // Comprobar conexión a base de datos (si el método existe)
      if (typeof db.testConnection === 'function') {
        await db.testConnection();
        logger.info('✅ Base de datos conectada');
      } else {
        logger.info('⚠️ No se pudo verificar la conexión a la base de datos');
      }
    } catch (error) {
      logger.warn({ error }, 'Algunas conexiones no están disponibles. El bot puede funcionar con limitaciones.');
    }
    
    // Iniciar el bot de Telegram
    logger.info('Iniciando el bot de Telegram...');
    const telegramService = new TelegramService();
    await telegramService.start();
    
    logger.info('🤖 Bot de Telegram iniciado correctamente');
    logger.info('Presiona Ctrl+C para detener el bot');
    
    // Enviar notificación de inicio a todos los usuarios autorizados
    await telegramService.sendNotificationToAll(`
🚀 <b>Bot de MidasTS Iniciado</b>

El sistema de trading está ahora en línea y listo para operar.
Usa /menu para ver las opciones disponibles.

<i>Iniciado: ${new Date().toLocaleString()}</i>
    `);
    
    // Configurar manejo de señales para apagado graceful
    process.once('SIGINT', async () => {
      logger.info('Recibida señal SIGINT, deteniendo el bot...');
      await telegramService.stop('SIGINT');
      process.exit(0);
    });
    
    process.once('SIGTERM', async () => {
      logger.info('Recibida señal SIGTERM, deteniendo el bot...');
      await telegramService.stop('SIGTERM');
      process.exit(0);
    });
  } catch (error) {
    logger.error({ error }, 'Error al iniciar el bot de Telegram');
    process.exit(1);
  }
}

// Ejecutar la función principal
main().catch(error => {
  logger.fatal({ error }, 'Error fatal al iniciar el bot de Telegram');
  process.exit(1);
});
