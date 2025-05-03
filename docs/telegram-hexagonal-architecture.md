# Arquitectura Hexagonal del Bot de Telegram

Este documento describe la implementación de la arquitectura hexagonal (también conocida como puertos y adaptadores) para el bot de Telegram en MidasTS.

## Visión General

La arquitectura hexagonal separa la lógica de negocio central de los detalles técnicos externos como APIs, interfaces de usuario, bases de datos, etc. En esta arquitectura:

- El **dominio** contiene las entidades de negocio y la lógica central
- Los **puertos** definen interfaces para comunicarse con el exterior
- Los **adaptadores** implementan estas interfaces

## Estructura del Bot de Telegram

### Puertos

El puerto principal para la integración de Telegram es `TelegramServicePort` que define el contrato que cualquier adaptador de Telegram debe implementar:

```typescript
export interface TelegramServicePort {
  start(): Promise<void>;
  stop(reason?: string): Promise<void>;
  sendNotificationToAll(message: string): Promise<void>;
  sendTradingSignal(symbol: string, signal: any): Promise<void>;
  sendOrderNotification(order: any): Promise<void>;
  isRunning(): boolean;
}
```

### Adaptadores

Existen dos adaptadores principales para Telegram:

1. **TelegramAdapter**: La implementación principal completa del bot con todas las funcionalidades
2. **TelegramAdapter-Simple**: Una implementación simplificada para casos de uso básicos

### Integración con Sistema de Tareas

El bot de Telegram está integrado con el sistema de multithreading a través de los siguientes componentes:

1. **TelegramSignalTasks**: Clase que conecta las operaciones intensivas del bot con el TaskManager

```typescript
export class TelegramSignalTasks {
  constructor(private readonly taskManager: TaskManagerPort) {}
  
  public async generateSignal(symbol: string, capital: number, mode: string): Promise<SignalResponse | null> {
    // Envía la generación de señal como una tarea para procesar en worker threads
  }
  
  public async scanMarket(maxResults: number, minVolume: number, minGalaxyScore: number): Promise<ScanResponse | null> {
    // Envía el escaneo de mercado como una tarea para procesar en worker threads
  }
}
```

2. **Task**: Representación de una unidad de trabajo para ser procesada por workers

```typescript
export class Task {
  // Propiedades y métodos para gestionar tareas
}
```

## Flujo de Trabajo

1. El usuario envía un comando como `/signal BTC` al bot de Telegram
2. El `TelegramAdapter` recibe el comando y lo procesa
3. Para operaciones intensivas (generación de señales, escaneo de mercado), el adaptador usa `TelegramSignalTasks`
4. `TelegramSignalTasks` crea una tarea y la envía al `TaskManager`
5. El `TaskManager` distribuye la tarea a un worker thread disponible
6. Una vez completada la tarea, el resultado se devuelve al adaptador
7. El adaptador formatea la respuesta y la envía al usuario a través de Telegram

## Configuración

Las variables de entorno relacionadas incluyen:

```
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
TELEGRAM_AUTHORIZED_USERS=123456789,987654321
TELEGRAM_ADMIN_USERS=123456789
TELEGRAM_ACCESS_CODE=optional_access_code_here

# Task System Configuration for Telegram
USE_TASK_MANAGER_FOR_TELEGRAM=true
MAX_THREAD_WORKERS=4
MAX_CLUSTER_WORKERS=2
MAX_CHILD_PROCESSES=2
```

## Ventajas de Esta Arquitectura

1. **Separación de responsabilidades**: La lógica de negocio está separada de la API de Telegram
2. **Testabilidad**: Los componentes se pueden probar de forma aislada
3. **Flexibilidad**: Se pueden reemplazar adaptadores sin cambiar la lógica central
4. **Rendimiento**: Las operaciones intensivas se distribuyen a través del sistema de worker threads
5. **Mantenibilidad**: La base de código es más organizada y modular

## Implementación de Worker para Tareas de Telegram

Para implementar tareas específicas procesadas por los workers, se debe crear un archivo en la carpeta `workers/` que maneje los dos tipos principales de tareas:

1. **Generación de señal**: Procesa los datos de mercado y genera una señal de trading
2. **Escaneo de mercado**: Analiza múltiples criptomonedas para encontrar oportunidades

El worker debe recibir mensajes con el payload, realizar el procesamiento necesario y devolver el resultado.

## Conclusión

La arquitectura hexagonal permite que el bot de Telegram crezca y evolucione de manera sostenible, facilitando la integración con nuevos sistemas y mejorando la calidad del código. El uso del sistema de multithreading para operaciones intensivas mejora el rendimiento y la capacidad de respuesta del bot.