/**
 * Implementación de la escena de configuración para el bot de Telegram
 */
import { Scenes, Context } from 'telegraf';
import { logger } from '../utils/logging';

import { BotContext } from './telegram'; // Import BotContext from telegram.ts

// Extend BotSession interface from telegram.ts with advanced settings
declare module './telegram' {
  interface BotSession {
    advancedSettings?: {
      tradingMode?: string;
      hasApiKeys?: boolean;
      tradeLimit?: number;
    }
  }
}

/**
 * Crea una escena para gestionar la configuración del usuario
 */
export function createSettingsScene(): Scenes.BaseScene<BotContext> {
  const scene = new Scenes.BaseScene<BotContext>('settings');
  
  scene.enter(async (ctx) => {
    const notifySettings = ctx.session.notifications;
    
    await ctx.reply(`
<b>⚙️ Configuración del Bot</b>

Personaliza tu experiencia ajustando las siguientes opciones:

<b>Notificaciones:</b>
- Señales de trading: ${notifySettings.signals ? '✅' : '❌'}
- Ejecución de operaciones: ${notifySettings.trades ? '✅' : '❌'}
- Actualizaciones de portafolio: ${notifySettings.portfolioUpdates ? '✅' : '❌'}

Selecciona una opción para cambiar:
    `, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { 
              text: `🔔 Señales: ${notifySettings.signals ? 'Desactivar' : 'Activar'}`, 
              callback_data: `settings_toggle_signals` 
            }
          ],
          [
            { 
              text: `💰 Operaciones: ${notifySettings.trades ? 'Desactivar' : 'Activar'}`, 
              callback_data: `settings_toggle_trades` 
            }
          ],
          [
            { 
              text: `📊 Portafolio: ${notifySettings.portfolioUpdates ? 'Desactivar' : 'Activar'}`, 
              callback_data: `settings_toggle_portfolio` 
            }
          ],
          [
            { text: '💾 Guardar Configuración', callback_data: 'settings_save' }
          ],
          [
            { text: '🔙 Volver al Menú', callback_data: 'settings_back' }
          ]
        ]
      }
    });
  });
  
  // Callbacks para cambiar configuraciones
  scene.action(/settings_toggle_(.+)/, async (ctx) => {
    const match = ctx.match ? ctx.match[1] : '';
    
    // Cambiar el estado de la notificación
    switch (match) {
      case 'signals':
        ctx.session.notifications.signals = !ctx.session.notifications.signals;
        break;
      case 'trades':
        ctx.session.notifications.trades = !ctx.session.notifications.trades;
        break;
      case 'portfolio':
        ctx.session.notifications.portfolioUpdates = !ctx.session.notifications.portfolioUpdates;
        break;
    }
    
    await ctx.answerCbQuery('Configuración actualizada');
    
    // Actualizar mensaje con nuevos valores
    const notifySettings = ctx.session.notifications;
    
    await ctx.editMessageText(`
<b>⚙️ Configuración del Bot</b>

Personaliza tu experiencia ajustando las siguientes opciones:

<b>Notificaciones:</b>
- Señales de trading: ${notifySettings.signals ? '✅' : '❌'}
- Ejecución de operaciones: ${notifySettings.trades ? '✅' : '❌'}
- Actualizaciones de portafolio: ${notifySettings.portfolioUpdates ? '✅' : '❌'}

Selecciona una opción para cambiar:
    `, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { 
              text: `🔔 Señales: ${notifySettings.signals ? 'Desactivar' : 'Activar'}`, 
              callback_data: `settings_toggle_signals` 
            }
          ],
          [
            { 
              text: `💰 Operaciones: ${notifySettings.trades ? 'Desactivar' : 'Activar'}`, 
              callback_data: `settings_toggle_trades` 
            }
          ],
          [
            { 
              text: `📊 Portafolio: ${notifySettings.portfolioUpdates ? 'Desactivar' : 'Activar'}`, 
              callback_data: `settings_toggle_portfolio` 
            }
          ],
          [
            { text: '💾 Guardar Configuración', callback_data: 'settings_save' }
          ],
          [
            { text: '🔙 Volver al Menú', callback_data: 'settings_back' }
          ]
        ]
      }
    });
  });
  
  // Callback para guardar configuración
  scene.action('settings_save', async (ctx) => {
    try {
      // Aquí se podría añadir lógica para persistir la configuración en la BD
      // Por ejemplo: await userSettingsRepository.saveSettings(ctx.session.userId, ctx.session.notifications);
      
      await ctx.answerCbQuery('✅ Configuración guardada correctamente');
      await ctx.reply('✅ Tu configuración ha sido guardada correctamente.');
      
      // Volver al menú principal después de guardar
      await ctx.scene.leave();
      // Enviar menú principal (esto se maneja desde TelegramService)
    } catch (error) {
      logger.error({ error }, 'Error al guardar configuración de usuario');
      await ctx.answerCbQuery('❌ Error al guardar la configuración');
      await ctx.reply('❌ Ha ocurrido un error al guardar tu configuración. Por favor, intenta nuevamente.');
    }
  });
  
  // Callback para volver al menú principal
  scene.action('settings_back', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    // El menú principal se envía desde TelegramService
  });
  
  // Sección para configuraciones avanzadas (opcional)
  scene.command('advanced', async (ctx) => {
    await ctx.reply(`
<b>⚙️ Configuraciones Avanzadas</b>

Estas opciones son para usuarios experimentados:

1. Modo de trading: ${ctx.session.advancedSettings?.tradingMode || 'Conservador'}
2. API Keys: ${ctx.session.advancedSettings?.hasApiKeys ? 'Configuradas' : 'No configuradas'}
3. Límites: $${ctx.session.advancedSettings?.tradeLimit || '100'} por operación

Usa los comandos:
/setmode [conservador|moderado|agresivo]
/setlimit [monto]
    `, { parse_mode: 'HTML' });
  });
  
  return scene;
}
