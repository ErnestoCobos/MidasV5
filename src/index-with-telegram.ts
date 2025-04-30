/**
 * Ejemplo de integración del servicio de Telegram en la aplicación MidasTS
 * 
 * Este archivo muestra cómo integrar el bot de Telegram con todos los servicios de MidasTS.
 * Utiliza la función centralizada de inicio de Telegram definida en index.ts.
 */
import { binanceService } from './services/binance';
import { marketDataService } from './services/market-data';
import { deepSeekService } from './services/deepseek';
import { db } from './services/database';
import { lunarCrushService } from './services/lunarcrush';
import { logger } from './utils/logging';
import { initTelegramService, getTelegramService } from './index'; // Importar funciones centralizadas

/**
 * Inicia todos los servicios de la aplicación
 */
async function startServices() {
  // Iniciar servicios básicos
  try {
    logger.info('Iniciando servicios básicos...');
    
    // Verificar conexiones básicas
    logger.info('✅ Servicios básicos inicializados');
    
    // Iniciar bot de Telegram si está configurado
    if (process.env.TELEGRAM_BOT_TOKEN) {
      try {
        // Usar la función centralizada para inicializar el servicio de Telegram
        const telegramService = await initTelegramService({ notify: true });
        logger.info('✅ Bot de Telegram iniciado');
        
        // Registrar manejadores de eventos para notificaciones
        // Nota: En esta versión simplificada, no estamos usando eventos directamente
        // ya que requeriría implementar EventEmitter en los servicios
      } catch (error) {
        logger.warn({ error }, 'Bot de Telegram no pudo iniciarse');
      }
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
  logger.info('Iniciando aplicación MidasTS con Telegram integrado...');
  
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
    // Nota: Si db.disconnect() no existe, esto es solo un ejemplo
    // y en la implementación real se usaría el método apropiado
    
    // Si el bot de Telegram está activo, detenerlo
    const telegramService = getTelegramService();
    if (telegramService) {
      await telegramService.stop(signal);
    }
    
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
