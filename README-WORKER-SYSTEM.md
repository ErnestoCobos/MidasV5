# Sistema de Worker Threads para MidasTS

Este sistema implementa una arquitectura de procesamiento paralelo y distribuido para tareas asíncronas en MidasTS, utilizando una arquitectura hexagonal (Ports & Adapters) para mantener la separación de responsabilidades y facilitar el testing y la extensibilidad.

## Características

- **Arquitectura Hexagonal**: Core domain, puertos e implementaciones de adaptadores claramente separados
- **Múltiples estrategias de concurrencia**:
  - Worker Threads: Para tareas CPU-intensivas
  - Cluster: Para balanceo de carga HTTP (estructura preparada)
  - Child Process: Para tareas aisladas (estructura preparada)
- **Distribución automática de tareas** según tipo y prioridad
- **Auto-scaling** basado en carga del sistema
- **Monitoreo en tiempo real** con métricas de rendimiento
- **Tolerancia a fallos** con detección y recuperación de workers problemáticos

## Estructura del proyecto

```
src/
 ├── core/                     # Hexágono interno - dominio y aplicación
 │   ├── domain/               # Entidades y objetos de valor
 │   │   ├── task.ts           # Entidad Task
 │   │   ├── worker.ts         # Entidad Worker
 │   │   └── worker-pool.ts    # Entidad WorkerPool
 │   ├── analysis/             # Funciones puras (FP) para análisis
 │   │   └── task-scheduling.ts # Algoritmos de planificación
 │   ├── math/                 # Funciones puras (FP) para cálculos
 │   │   └── performance-metrics.ts # Cálculos de rendimiento
 │   └── application/          # Casos de uso y servicios de aplicación
 │       ├── task-distribution.ts # Distribución de tareas
 │       ├── worker-management.ts # Gestión de workers
 │       └── monitoring-service.ts # Monitoreo y métricas
 ├── ports/                    # Interfaces para los adaptadores
 │   ├── inbound/              # Puertos primarios (API)
 │   │   ├── task-manager-port.ts # API principal
 │   │   └── task-queue-port.ts # Cola de tareas
 │   └── outbound/             # Puertos secundarios (SPI)
 │       ├── worker-thread-port.ts # Para worker threads
 │       ├── cluster-manager-port.ts # Para Node.js cluster
 │       ├── child-process-port.ts # Para procesos hijo
 │       └── metrics-store-port.ts # Para almacenar métricas
 ├── adapters/                 # Implementaciones concretas
 │   ├── inbound/              # Adaptadores primarios
 │   │   ├── task-manager.ts   # Implementación TaskManager
 │   │   └── in-memory-task-queue.ts # Cola en memoria
 │   └── outbound/             # Adaptadores secundarios
 │       ├── worker-thread-adapter.ts # Impl. worker threads
 │       └── in-memory-metrics-store-adapter.ts # Métricas en memoria
 ├── workers/                  # Código que se ejecuta en workers
 │   └── worker-thread.js      # Worker thread script
 ├── examples/                 # Ejemplos de uso
 │   └── simple-thread-test.ts # Test simple de worker thread
 └── index.ts                  # Punto de entrada principal
```

## Iniciar el sistema

Ahora puedes iniciar todo el sistema con un único comando:

```bash
npm run worker-system
```

Este comando iniciará el sistema completo, incluyendo:
1. Inicialización de worker threads
2. Configuración del task manager
3. Ejecución de tareas de ejemplo
4. Monitoreo de rendimiento

## Ejemplo simplificado

Para probar sólo la funcionalidad de worker threads sin el sistema completo:

```bash
npm run worker-simple
```

También se incluye una herramienta de diagnóstico completa que muestra métricas detalladas del sistema y ejecuta una prueba de carga:

```bash
npm run worker-diagnostics
```

Esta herramienta de diagnóstico ofrece:
- Información detallada sobre el estado de los workers
- Estadísticas de rendimiento
- Detección automática de problemas
- Pruebas de carga con diferentes tipos de tareas
- Monitoreo en tiempo real

## Componentes principales

### Core Domain

- **Task**: Representa una unidad de trabajo que puede ser procesada por un worker
- **Worker**: Representa un worker que puede ejecutar tareas
- **WorkerPool**: Gestiona un grupo de workers del mismo tipo

### Servicios de Aplicación

- **TaskDistributionService**: Distribuye tareas entre workers disponibles
- **WorkerManagementService**: Gestiona el ciclo de vida de los workers
- **MonitoringService**: Recopila y almacena métricas de rendimiento

### Adaptadores

- **TaskManager**: Implementación principal de TaskManagerPort
- **InMemoryTaskQueue**: Cola de tareas en memoria
- **WorkerThreadAdapter**: Implementación de worker threads
- **InMemoryMetricsStoreAdapter**: Almacenamiento de métricas en memoria

## Arquitectura

El sistema sigue una arquitectura hexagonal (Ports & Adapters):

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                      │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │                                              │    │  │
│  │  │              Core Domain                     │    │  │
│  │  │        (Task, Worker, WorkerPool)            │    │  │
│  │  │                                              │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  │                Application Layer                     │  │
│  │  (TaskDistribution, WorkerManagement, Monitoring)    │  │
│  │                                                      │  │
│  └─────────────────┬─────────────────┬─────────────────┘  │
│                    │                 │                    │
│  ┌─────────────────▼────┐  ┌─────────▼─────────────────┐  │
│  │                      │  │                           │  │
│  │   Inbound Ports      │  │    Outbound Ports         │  │
│  │   (Task Manager,     │  │    (Worker Thread,        │  │
│  │    Task Queue)       │  │     Cluster, Metrics)     │  │
│  │                      │  │                           │  │
│  └─────────────────┬────┘  └─────────────┬─────────────┘  │
│                    │                     │                │
│  ┌─────────────────▼────┐  ┌─────────────▼─────────────┐  │
│  │                      │  │                           │  │
│  │  Inbound Adapters    │  │   Outbound Adapters       │  │
│  │  (TaskManager,       │  │   (WorkerThreadAdapter,   │  │
│  │   InMemoryQueue)     │  │    MetricsStoreAdapter)   │  │
│  │                      │  │                           │  │
│  └──────────────────────┘  └───────────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## Ejecutar con un solo comando

Ahora todo el sistema se puede iniciar con un único comando. Esta implementación es 100% compatible con las reglas de arquitectura hexagonal de MidasTS y sigue las mejores prácticas del proyecto:

```bash
npm run worker-system
```

Este comando ejecutará:

1. La inicialización del sistema de worker threads
2. La creación de workers en pools separados según tipo (thread, cluster, child process)
3. La configuración del sistema de distribución automática de tareas
4. El sistema de monitoreo y recolección de métricas
5. Un conjunto de tareas de ejemplo para demostrar el funcionamiento

Para ver solo la funcionalidad de worker threads de forma aislada:

```bash
npm run worker-simple
```

## Extensiones futuras

El sistema está diseñado para ser extensible. Algunas posibles mejoras:

1. Implementar adaptadores completos para Cluster y Child Process
2. Añadir persistencia para las métricas (usando alguna base de datos)
3. Crear una interfaz web para visualizar el estado del sistema
4. Integrar con Telegraf para control remoto vía Telegram
5. Añadir soporte para trabajos programados (scheduled jobs)
