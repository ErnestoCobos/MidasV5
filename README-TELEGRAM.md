# MidasTS - Bot de Telegram

## Configuración

Para configurar el bot de Telegram, sigue estos pasos:

1. Crea un bot en Telegram utilizando [@BotFather](https://t.me/BotFather) y obtén tu token
2. Copia el archivo `.env.example` a `.env` y configura las siguientes variables:

```
# Configuración del Bot
TELEGRAM_BOT_TOKEN=tu_token_de_bot_aquí
TELEGRAM_AUTHORIZED_USERS=id1,id2,id3
TELEGRAM_ADMIN_USERS=id_admin1,id_admin2
TELEGRAM_ACCESS_CODE=código_opcional_de_acceso

# Configuración de Multithreading
USE_TASK_MANAGER_FOR_TELEGRAM=true
MAX_THREAD_WORKERS=4
MAX_CLUSTER_WORKERS=2
MAX_CHILD_PROCESSES=2
```

* `TELEGRAM_BOT_TOKEN`: Token proporcionado por BotFather
* `TELEGRAM_AUTHORIZED_USERS`: IDs de usuarios autorizados a usar el bot (separados por comas)
* `TELEGRAM_ADMIN_USERS`: IDs de administradores que recibirán notificaciones especiales
* `TELEGRAM_ACCESS_CODE`: Código opcional para que nuevos usuarios puedan registrarse
* `USE_TASK_MANAGER_FOR_TELEGRAM`: Activa el procesamiento multihilo para señales de trading
* `MAX_THREAD_WORKERS`: Número máximo de worker threads para procesamiento paralelo
* `MAX_CLUSTER_WORKERS`: Número máximo de workers en el cluster
* `MAX_CHILD_PROCESSES`: Número máximo de procesos hijo

## Ejecución

Puedes iniciar el bot con:

```bash
# Versión con arquitectura hexagonal y multithreading
npm run telegram-bot-adapter

# Versión original (legado)
npm run telegram-bot
```

## Funcionalidades

El bot de Telegram de MidasTS ofrece las siguientes funcionalidades:

### Comandos básicos
- `/start` - Inicia el bot e inicia sesión
- `/help` - Muestra mensaje de ayuda
- `/status` - Muestra el estado del sistema
- `/menu` - Muestra el menú principal

### Comandos de trading
- `/price [símbolo]` - Consulta precio actual (ej: `/price BTC`)
- `/signal [símbolo]` - Solicita señal de trading con análisis DeepSeek AI
- `/scan` - Escanea el mercado para oportunidades de trading

### Características
- **Análisis técnico**: RSI, EMA, Bollinger Bands, soportes/resistencias
- **Señales de AI**: Integración con DeepSeek para obtener señales de trading
- **Escaneo de mercado**: Identifica las mejores oportunidades en tiempo real
- **Menú interactivo**: Interfaz fácil de usar con botones integrados
- **Procesamiento multihilo**: Generación de señales utilizando worker threads para mejor rendimiento

## Seguridad

El bot cuenta con múltiples capas de seguridad:

1. Lista de usuarios autorizados
2. Sistema de código de acceso opcional
3. Separación de usuarios normales y administradores

## Arquitectura

El bot está implementado siguiendo el patrón de arquitectura hexagonal (puertos y adaptadores):

```
src/
  ├── ports/
  │   └── inbound/
  │       ├── telegram-service-port.ts  # Interfaz para el servicio de Telegram
  │       ├── task-manager-port.ts      # Interfaz para gestión de tareas
  │       └── task-queue-port.ts        # Interfaz para cola de tareas
  ├── adapters/
  │   └── inbound/
  │       ├── telegram-adapter.ts          # Implementación hexagonal del bot
  │       ├── telegram-signal-tasks.ts     # Integración con sistema de tareas
  │       ├── task-manager.ts              # Gestor de tareas para multithreading
  │       └── in-memory-task-queue.ts      # Cola de tareas en memoria
  ├── core/
  │   ├── domain/
  │   │   ├── task.ts                      # Entidad de tarea
  │   │   ├── worker.ts                    # Entidad de worker
  │   │   └── worker-pool.ts               # Grupo de workers
  │   └── application/
  │       ├── task-distribution.ts         # Distribución de tareas a workers
  │       ├── worker-management.ts         # Gestión de worker threads
  │       └── monitoring-service.ts        # Monitoreo del sistema
  ├── services/
  │   ├── telegram-settings.ts             # Escena de configuración
  │   ├── telegram-scan.ts                 # Escaner de mercado
  │   └── telegram-signal.ts               # Integración con DeepSeek AI
  └── workers/
      └── worker-thread.js                 # Worker para procesamiento paralelo
```

## Sistema de Multithreading

El bot de Telegram está integrado con un sistema de multithreading que permite:

1. **Procesamiento paralelo**: Las operaciones intensivas como generación de señales y escaneo de mercado se ejecutan en worker threads separados, liberando el hilo principal.

2. **Mejor rendimiento**: Múltiples señales pueden generarse simultáneamente sin bloquear la interfaz del bot.

3. **Escalabilidad**: El sistema puede escalar horizontalmente según la carga del sistema.

4. **Recuperación ante fallos**: Los workers pueden reiniciarse automáticamente si fallan.

Para más detalles sobre la arquitectura, consulta el archivo de documentación [docs/telegram-hexagonal-architecture.md](docs/telegram-hexagonal-architecture.md).

## Personalización

Puedes personalizar el comportamiento del bot editando los siguientes archivos:

- `src/adapters/inbound/telegram-adapter.ts`: Implementación completa del bot (arquitectura hexagonal)
- `src/adapters/inbound/telegram-signal-tasks.ts`: Configuración del procesamiento de señales
- `src/services/telegram-signal.ts`: Lógica de generación de señales
- `src/services/telegram-scan.ts`: Configuración de escaneo de mercado