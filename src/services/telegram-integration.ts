/**
 * Instrucciones para integrar todas las partes del servicio de Telegram
 * 
 * Este archivo muestra cómo integrar los diferentes componentes desarrollados:
 * 1. telegram.ts - Servicio principal
 * 2. telegram-settings.ts - Escena de configuración
 * 3. telegram-scan.ts - Funcionalidad de escaneo de mercado
 */

/**
 * PASO 1: Importar los componentes en telegram.ts
 */

// Al inicio de telegram.ts, añadir:
import { createSettingsScene } from './telegram-settings';
import { scanMarket, MarketOpportunity } from './telegram-scan';

/**
 * PASO 2: Usar la función createSettingsScene() en el constructor
 * 
 * En la clase TelegramService, actualizar el constructor para usar la función importada:
 */

constructor() {
  // ... código existente ...
  
  // Configurar escenas para flujos conversacionales
  this.stage = new Scenes.Stage<BotContext>([
    this.createAuthScene(),
    this.createTradeScene(),
    createSettingsScene(), // Usar la función importada
    this.createPortfolioScene()
  ]);
  
  // ... resto del código ...
}

/**
 * PASO 3: Implementar el método scanMarket en la clase TelegramService
 * 
 * Reemplazar el método existente por una llamada a la función importada:
 */

private async scanMarket(): Promise<MarketOpportunity[]> {
  // Usar la función importada del módulo especializado
  return scanMarket(5); // Limitar a 5 resultados
}

/**
 * PASO 4: Completar el método createPortfolioScene si es necesario
 * 
 * Si falta implementar createPortfolioScene, puedes mantener la implementación
 * actual o crear un archivo separado similar a telegram-settings.ts
 */

/**
 * PASO 5: Añadir al archivo .env las variables necesarias
 * 
 * Asegúrate de tener en tu archivo .env:
 * 
 * # Telegram Bot
 * TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
 * TELEGRAM_AUTHORIZED_USERS=1234567,7654321
 * TELEGRAM_ADMIN_USERS=1234567
 * TELEGRAM_ACCESS_CODE=optional_access_code
 */

/**
 * PASO 6: Inicializar el servicio en la aplicación principal
 * 
 * En el archivo principal (index.ts o similar), agregar:
 */

import { TelegramService } from './services/telegram';

// Dentro de la función de inicio
const telegramService = new TelegramService();
await telegramService.start();
logger.info('Bot de Telegram iniciado');

/**
 * PASO 7: Instalar la dependencia de Telegraf
 * 
 * Ejecutar en la terminal:
 * npm install telegraf
 * 
 * O si usas yarn:
 * yarn add telegraf
 */

/**
 * NOTA IMPORTANTE:
 * 
 * Si encuentras errores de TypeScript relacionados con los tipos de Telegraf,
 * asegúrate de que los tipos se instalen correctamente:
 * 
 * npm install --save-dev @types/node
 */
