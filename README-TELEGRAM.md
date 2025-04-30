# MidasTS Bot de Telegram

## Introducción

Esta integración permite controlar el sistema MidasTS a través de un bot de Telegram, ofreciendo una interfaz conversacional y móvil para monitorear el mercado de criptomonedas, recibir señales de trading y gestionar operaciones desde cualquier dispositivo.

## Configuración Rápida

La configuración ya está completa con los siguientes parámetros en tu archivo `.env`:

```
TELEGRAM_BOT_TOKEN=7922915922:AAGjMAGW9u-Qm9_wah1MVMuXRvBvum4KwcU
TELEGRAM_AUTHORIZED_USERS=1336702235
TELEGRAM_ADMIN_USERS=1336702235
```

## ¿Cómo Iniciar el Bot?

Ahora tienes varias formas de iniciar el bot:

### Opción 1: Comando Dedicado (Recomendado)
```bash
node src/index.js telegram
```

### Opción 2: Compatibilidad con Versiones Anteriores
```bash
npm run telegram-bot
```

### Opción 3: Integrado con Comandos de Trading
```bash
node src/index.js trade --with-telegram --notify
node src/index.js micro-trade --with-telegram --notify
```

El servicio verificará las conexiones a las APIs necesarias e iniciará el bot. Cuando se utiliza la opción `--notify`, se enviará una notificación a todos los usuarios autorizados.

## Comandos Disponibles

Una vez iniciado el bot, puedes interactuar con él en Telegram usando los siguientes comandos:

- `/start` - Iniciar o reiniciar el bot
- `/help` - Mostrar los comandos disponibles
- `/status` - Verificar el estado del sistema
- `/price [símbolo]` - Consultar el precio actual (ej: `/price BTC`)
- `/signal [símbolo]` - Solicitar una señal de trading
- `/scan` - Escanear el mercado en busca de oportunidades
- `/portfolio` - Ver tu portafolio actual
- `/settings` - Ajustar tu configuración de notificaciones

## Interfaz de Usuario

El bot utiliza menús interactivos con botones para facilitar la navegación. Después de cada comando principal, se mostrarán opciones relevantes mediante botones que puedes pulsar para realizar acciones adicionales.

### Ejemplo de Flujo

1. Ejecutar `/price BTC`
2. Recibir información actual sobre Bitcoin
3. Usar los botones para:
   - Ver análisis técnico
   - Solicitar señal de trading
   - Establecer alertas de precio

## Personalización

Puedes personalizar las siguientes configuraciones:

- **Notificaciones**: Activar/desactivar notificaciones para señales de trading, ejecución de órdenes y actualizaciones de portafolio
- **Alertas de precio**: Establecer alertas cuando un activo alcance cierto precio
- **Modo de trading**: Configurar el estilo de operaciones (conservador/agresivo)

## Solución de Problemas

Si encuentras problemas al iniciar o usar el bot:

1. **El bot no responde:**
   - Asegúrate de que hayas iniciado una conversación con el bot en Telegram
   - Verifica que tu ID de Telegram esté en la lista de usuarios autorizados

2. **Errores de conexión:**
   - Verifica la configuración de las APIs en el archivo `.env`
   - Asegúrate de que tienes acceso a internet

3. **Comandos que no funcionan:**
   - Algunos comandos dependen de servicios específicos (Binance, LunarCrush)
   - Revisa los logs para identificar errores específicos

## Personalización Avanzada

Para personalizar aún más el bot, puedes modificar los siguientes archivos:

- `src/services/telegram.ts` - Servicio principal del bot
- `src/services/telegram-settings.ts` - Escena de configuración
- `src/services/telegram-scan.ts` - Funcionalidad de escaneo de mercado

## Seguridad

- El bot solo responde a usuarios específicamente autorizados
- Las operaciones críticas requieren confirmación adicional
- Se recomienda no compartir el token del bot o tus IDs de usuario

## Mejoras Futuras

Algunas mejoras que podrías implementar:

- Gráficos en tiempo real dentro de Telegram
- Sistema de autenticación por código de un solo uso
- Integración con más exchanges y fuentes de datos
- Alertas personalizadas basadas en indicadores técnicos
