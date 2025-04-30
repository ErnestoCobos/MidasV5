# Actualización de Integración de Telegram en MidasTS

## Resumen de Cambios

Se ha unificado la funcionalidad de Telegram en el CLI principal del sistema. Ahora podrás:

1. Iniciar el bot de Telegram directamente desde el CLI principal
2. Combinar el bot de Telegram con otros comandos de trading
3. Recibir notificaciones de inicio automáticas al ejecutar cualquier comando

## Nuevos Comandos y Opciones

### Comando Específico de Telegram

```bash
node src/index.js telegram [opciones]
```

**Opciones disponibles:**
- `--no-notify`: No enviar notificación de inicio
- `--debug`: Mostrar información de depuración adicional

**Ejemplo:**
```bash
node src/index.js telegram
```

### Integración con Comandos Existentes

Ahora todos los comandos de trading tienen nuevas opciones para integrar Telegram:

```bash
node src/index.js [comando] [--with-telegram] [--notify]
```

**Opciones:**
- `--with-telegram`: Iniciar también el bot de Telegram
- `--notify`: Enviar notificación de inicio por Telegram

**Ejemplos:**
```bash
# Iniciar trading estándar con notificaciones de Telegram
node src/index.js trade --symbol BTCUSDT --with-telegram --notify

# Iniciar micro-trading con bot de Telegram
node src/index.js micro-trade --capital 100 --with-telegram
```

## Compatibilidad

Se mantiene el comando original `npm run telegram-bot` para compatibilidad, aunque internamente ahora utiliza la misma funcionalidad centralizada.

```bash
npm run telegram-bot
```

## Notificaciones Automáticas

Al iniciar el bot con la opción `--notify` o mediante el comando `telegram`, se enviará una notificación a todos los usuarios autorizados con los siguientes datos:

- Fecha y hora de inicio
- Tipo de sistema iniciado
- Parámetros principales de configuración (símbolo, capital, etc.)

## Estructura Técnica

Los cambios realizados incluyen:

1. **Centralización** de la funcionalidad en `src/index.ts`
2. **Reutilización** del mismo servicio de Telegram para todos los comandos
3. **Compatibilidad** con los scripts anteriores
4. **Notificaciones** unificadas desde un único punto

## Mejoras Futuras Planificadas

Para futuras versiones, se planean las siguientes mejoras:

1. Sistema de gestión de servicios con detección automática de dependencias
2. Manejo centralizado de eventos para mejor integración entre servicios
3. Sistema de notificaciones inteligente con prioridad y agrupación

## Solución de Problemas

Si encuentras problemas con la nueva integración:

1. Verifica que las variables de entorno de Telegram estén configuradas correctamente en `.env`
2. Asegúrate de que el token del bot sea válido
3. Comprueba que tu ID de Telegram esté en la lista de usuarios autorizados
