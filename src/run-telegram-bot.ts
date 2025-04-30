/**
 * Script para iniciar el bot de Telegram independientemente de otros servicios
 * 
 * Este script inicia únicamente el servicio de Telegram, útil para ejecutar el bot
 * sin necesidad de iniciar todos los servicios del sistema MidasTS.
 * 
 * Uso: 
 * npm run telegram-bot
 * 
 * Nota: Este script mantiene compatibilidad con versiones anteriores, pero
 * internamente utiliza la funcionalidad centralizada del CLI principal.
 */

import 'dotenv/config';
import { logger } from './utils/logging';
import { telegramCommand } from './index';

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
    // Usar la función centralizada del CLI principal
    await telegramCommand({
      notify: true,  // Siempre enviar notificación de inicio
      debug: false   // Sin información de depuración
    });
    
    // No es necesario manejar señales aquí, ya se hace en telegramCommand
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
