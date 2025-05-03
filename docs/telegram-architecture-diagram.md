# Diagrama de Arquitectura del Bot de Telegram

Este documento contiene un diagrama ASCII que ilustra la arquitectura hexagonal del bot de Telegram y su integración con el sistema de multithreading.

## Diagrama de Arquitectura Hexagonal

```
┌─────────────────────────────────────────────────────────────────────┐
│                        APLICACIÓN TELEGRAM                           │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            PUERTOS                                   │
│                                                                     │
│  ┌────────────────────┐   ┌────────────────────┐  ┌───────────────┐ │
│  │ TelegramServicePort│   │  TaskManagerPort   │  │TaskQueuePort  │ │
│  └────────────────────┘   └────────────────────┘  └───────────────┘ │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          ADAPTADORES                                 │
│                                                                     │
│  ┌────────────────────┐   ┌────────────────────┐  ┌───────────────┐ │
│  │  TelegramAdapter   │   │    TaskManager     │  │InMemoryTaskQ. │ │
│  └─────────┬──────────┘   └─────────┬──────────┘  └───────┬───────┘ │
│            │                        │                     │         │
│  ┌─────────▼──────────┐             │                     │         │
│  │TelegramSignalTasks │◄────────────┘                     │         │
│  └────────────────────┘                                   │         │
└──────────────────────────────────────┬────────────────────┼─────────┘
                                      │                    │
                                      ▼                    │
┌─────────────────────────────────────────────────────────▼─────────┐
│                        DOMINIO CORE                                │
│                                                                   │
│   ┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐   │
│   │    Task     │  │   WorkerPool     │  │       Worker       │   │
│   └─────────────┘  └──────────────────┘  └────────────────────┘   │
│                                                                   │
│   ┌───────────────────────┐  ┌─────────────────────────────────┐  │
│   │ TaskDistributionSvc   │  │     WorkerManagementSvc         │  │
│   └───────────────────────┘  └─────────────────────────────────┘  │
└───────────────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                     WORKER THREADS                                │
│                                                                  │
│   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐        │
│   │  Worker 1     │  │  Worker 2     │  │  Worker N     │        │
│   │  (Signal)     │  │  (Scan)       │  │  (Analysis)   │        │
│   └───────────────┘  └───────────────┘  └───────────────┘        │
└──────────────────────────────────────────────────────────────────┘
```

## Flujo de Ejecución para Generación de Señales

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│               │     │               │     │               │
│    Usuario    ├────►│  TelegramBot  ├────►│ TelegramAdapt.│
│   Telegram    │     │   (Telegraf)  │     │  (Interface)  │
│               │     │               │     │               │
└───────────────┘     └───────────────┘     └───────┬───────┘
                                                   │
                                                   ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│               │     │               │     │               │
│  Worker #1    │◄────┤  TaskManager  │◄────┤ TelegramSignal│
│ (Processing)  │     │ (Distribution)│     │    Tasks      │
│               │     │               │     │               │
└───────┬───────┘     └───────────────┘     └───────────────┘
        │
        ▼
┌───────────────┐     ┌───────────────┐
│               │     │               │
│  DeepSeek API │     │   Binance,    │
│  (Analysis)   │     │   Market Data │
│               │     │               │
└───────────────┘     └───────────────┘
```

## Componentes Clave y Responsabilidades

### Puertos (Interfaces)
- **TelegramServicePort**: Define el contrato para cualquier adaptador de Telegram
- **TaskManagerPort**: Define la gestión de tareas para procesamiento asíncrono
- **TaskQueuePort**: Define las operaciones para la cola de tareas

### Adaptadores
- **TelegramAdapter**: Implementa el puerto TelegramServicePort
- **TaskManager**: Implementa el puerto TaskManagerPort
- **InMemoryTaskQueue**: Implementa el puerto TaskQueuePort
- **TelegramSignalTasks**: Conecta el bot con el sistema de tareas

### Dominio Core
- **Task**: Entidad que representa una unidad de trabajo
- **Worker**: Entidad que representa un worker thread
- **WorkerPool**: Grupo de workers para un tipo específico (thread, cluster, proceso)
- **TaskDistributionService**: Distribuye tareas a los workers apropiados
- **WorkerManagementService**: Gestiona el ciclo de vida de los workers

### Worker Threads
- **Worker Thread**: Procesa tareas específicas en hilos separados
- **Señales**: Operaciones intensivas como generación de señales de trading
- **Escaneo**: Análisis de múltiples criptomonedas para identificar oportunidades