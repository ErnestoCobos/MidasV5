# Integración de Telegram con MidasTS

Este documento explica cómo integrar un bot de Telegram con el sistema de trading MidasTS, permitiendo recibir señales de trading, consultar precios, gestionar el portafolio y más, todo desde la comodidad de la aplicación Telegram.

## Configuración Inicial

### 1. Obtener un token de Telegram Bot

Para crear un bot de Telegram, necesitas obtener un token de acceso del BotFather:

1. Abre Telegram y busca `@BotFather`
2. Inicia una conversación y usa el comando `/newbot`
3. Sigue las instrucciones para asignar un nombre y nombre de usuario a tu bot
4. Copia el token proporcionado por BotFather

### 2. Configuración de Variables de Entorno

Añade las siguientes variables al archivo `.env` (puedes copiarlas desde `.env.example`):

```
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_AUTHORIZED_USERS=1234567,7654321
TELEGRAM_ADMIN_USERS=1234567
TELEGRAM_ACCESS_CODE=your_access_code
```

Donde:
- `TELEGRAM_BOT_TOKEN`: El token obtenido del BotFather
- `TELEGRAM_AUTHORIZED_USERS`: Lista de IDs de usuario de Telegram autorizados, separados por comas
- `TELEGRAM_ADMIN_USERS`: Lista de IDs de administradores del bot, separados por comas
- `TELEGRAM_ACCESS_CODE`: Código opcional para permitir a nuevos usuarios autorizarse

### 3. Instalar dependencias

```bash
npm install telegraf
```

## Características Implementadas

El servicio de bot de Telegram (`TelegramService`) implementa las siguientes funcionalidades:

- **Autenticación de usuarios**: Control de acceso mediante lista de usuarios permitidos y/o código de acceso
- **Comandos básicos**:
  - `/start` - Inicia el bot e inicia sesión
  - `/help` - Muestra mensajes de ayuda
  - `/status` - Muestra estado del sistema
  - `/menu` - Muestra menú principal con botones
- **Comandos de trading**:
  - `/price [símbolo]` - Consulta precio actual
  - `/signal [símbolo]` - Solicita señal de trading 
  - `/portfolio` - Muestra portafolio actual
  - `/scan` - Escanea mercado para oportunidades
- **Interacción avanzada**:
  - Menús con botones
  - Flujos conversacionales mediante escenas
  - Notificaciones automáticas

## Integración en la Aplicación

Para integrar el bot de Telegram en tu aplicación MidasTS, debes crear una instancia del servicio y arrancarla junto con el resto de la aplicación:

```typescript
// En src/index.ts o donde inicialices la aplicación
import { TelegramService } from './services/telegram';

async function main() {
  // Inicializar otros servicios...
  
  // Inicializar el servicio de Telegram
  const telegramService = new TelegramService();
  await telegramService.start();
  
  console.log('Servicios iniciados correctamente');
}

main().catch(error => {
  console.error('Error iniciando la aplicación:', error);
  process.exit(1);
});
```

## Completar la Implementación

Algunos métodos en `src/services/telegram.ts` están incompletos o requieren mayor implementación:

1. **Método `scanMarket()`**: Completar la lógica para buscar oportunidades de trading.
2. **Método `createSettingsScene()`**: Implementar la escena para configuración de usuario.
3. **Método `createPortfolioScene()`**: Mejorar la visualización del portafolio.

## Consideraciones de Seguridad

- No compartas tu token de bot en repositorios públicos
- Limita el acceso solo a usuarios autorizados
- Implementa la verificación en dos pasos para operaciones críticas
- Limita las cantidades de trading automático para evitar errores costosos

## Mejoras Futuras

- Implementar autenticación con código de un solo uso (OTP)
- Añadir soporte para gráficos y visualizaciones
- Integrar alertas personalizadas por usuario
- Añadir soporte para múltiples idiomas

## Depuración y Solución de Problemas

Para depurar el bot, puedes activar logs detallados:

```typescript
// Establecer nivel de log a debug en el archivo .env
LOG_LEVEL=debug
```

Los errores comunes incluyen:
- Token de bot inválido
- Problemas de red al conectar con la API de Telegram
- Errores en la configuración de comandos o respuestas

## Referencias

- [Documentación oficial de Telegraf](https://telegraf.js.org/)
- [API de Telegram Bot](https://core.telegram.org/bots/api)
- [Mejores prácticas para bots de Telegram](https://core.telegram.org/bots/features)
