# Guía de Multithreading para el Bot de Telegram

Esta guía explica cómo utilizar y configurar el sistema de multithreading para el bot de Telegram en MidasTS.

## Introducción

El bot de Telegram de MidasTS utiliza un sistema de multithreading para procesar operaciones intensivas como la generación de señales de trading y el escaneo de mercado. Esto permite que el bot responda rápidamente a los usuarios mientras realiza cálculos complejos en threads separados.

## Configuración

### Variables de Entorno

El sistema de multithreading se configura a través de variables de entorno:

```env
# Activar/desactivar multithreading para Telegram
USE_TASK_MANAGER_FOR_TELEGRAM=true

# Configuración de Workers
MAX_THREAD_WORKERS=4     # Número de worker threads
MAX_CLUSTER_WORKERS=2    # Número de workers en cluster
MAX_CHILD_PROCESSES=2    # Número de procesos hijo
```

### Ajustes Recomendados

- **CPU de 2 núcleos**: `MAX_THREAD_WORKERS=2`, `MAX_CLUSTER_WORKERS=1`, `MAX_CHILD_PROCESSES=1`
- **CPU de 4 núcleos**: `MAX_THREAD_WORKERS=4`, `MAX_CLUSTER_WORKERS=2`, `MAX_CHILD_PROCESSES=2`
- **CPU de 8+ núcleos**: `MAX_THREAD_WORKERS=8`, `MAX_CLUSTER_WORKERS=4`, `MAX_CHILD_PROCESSES=2`

## Funcionamiento

El sistema de multithreading opera de la siguiente manera:

1. **Creación de Tarea**: Cuando un usuario solicita una señal de trading (`/signal`) o un escaneo de mercado (`/scan`), el TelegramAdapter crea una tarea para procesar la solicitud.

2. **Distribución**: La tarea se envía al TaskManager, que la distribuye a un worker disponible en el WorkerPool.

3. **Procesamiento**: El worker procesa la tarea en un thread separado, lo que permite que el hilo principal del bot siga respondiendo a otras solicitudes.

4. **Resultados**: Una vez completada la tarea, el resultado se devuelve al usuario a través del bot.

## Tipos de Tareas

El sistema maneja principalmente dos tipos de tareas para el bot de Telegram:

### 1. Generación de Señales

```typescript
// Ejemplo de creación de tarea para señal de trading
const signal = await signalTasks.generateSignal('BTCUSDT', 1000, 'medium');
```

Parámetros:
- `symbol`: El símbolo de trading (ej: 'BTCUSDT')
- `capital`: Capital disponible para la operación (afecta al sizing)
- `mode`: Nivel de detalle ('basic', 'medium', 'advanced')

### 2. Escaneo de Mercado

```typescript
// Ejemplo de creación de tarea para escaneo de mercado
const scanResults = await signalTasks.scanMarket(5, 5000000, 50);
```

Parámetros:
- `maxResults`: Número máximo de resultados a devolver
- `minVolume`: Volumen mínimo en USD para filtrar criptomonedas
- `minGalaxyScore`: Puntuación mínima de LunarCrush para incluir en resultados

## Creación de Workers Personalizados

Si necesitas implementar workers personalizados para tareas específicas, debes seguir estos pasos:

1. **Crear un archivo de worker** en la carpeta `src/workers/`:

```javascript
// src/workers/custom-signal-worker.js
const { parentPort, workerData } = require('worker_threads');

// Función principal del worker
async function processSignal(data) {
  const { symbol, capital, mode } = data;
  
  // Realizar análisis y cálculos intensivos aquí...
  
  // Simulación de procesamiento
  console.log(`Processing signal for ${symbol} with capital ${capital} in ${mode} mode`);
  
  // Retornar resultado
  return {
    action: 'BUY',
    confidence: 0.85,
    entry: 50000,
    stopLoss: 48000,
    takeProfit: 55000,
    reasoning: 'Analysis complete with custom logic'
  };
}

// Escuchar mensajes del thread principal
parentPort.on('message', async (data) => {
  try {
    // Procesar los datos
    const result = await processSignal(data);
    
    // Enviar resultado de vuelta al thread principal
    parentPort.postMessage({ success: true, result });
  } catch (error) {
    // Manejar errores
    parentPort.postMessage({ 
      success: false, 
      error: error.message || 'Unknown error'
    });
  }
});

// Notificar que el worker está listo
parentPort.postMessage({ status: 'ready' });
```

2. **Registrar el worker** en la configuración del sistema:

```typescript
// Añadir a la configuración en src/index.ts
const config = {
  workers: {
    thread: 4,
    cluster: 2,
    childProcess: 2
  },
  paths: {
    workerThread: path.resolve(__dirname, './workers/worker-thread.js'),
    customSignalWorker: path.resolve(__dirname, './workers/custom-signal-worker.js'),
    // ...otros workers
  }
};
```

3. **Usar el worker** desde el adaptador:

```typescript
// Desde TelegramSignalTasks
public async generateCustomSignal(symbol: string, capital: number, mode: string): Promise<any> {
  const payload = { symbol, capital, mode, workerType: 'customSignal' };
  
  // Crear tarea con tipo personalizado
  const task = await this.taskManager.submitTask(
    payload,
    'custom', // Tipo de tarea
    'high'    // Prioridad
  );
  
  return this.waitForTaskCompletion(task.id, 30000);
}
```

## Monitoreo

El sistema incluye capacidades de monitoreo para supervisar el rendimiento y estado de los workers:

```typescript
// Obtener estadísticas del sistema de multithreading
const status = await taskManager.getSystemStatus();

console.log(`Workers totales: ${status.workers.total}`);
console.log(`Workers disponibles: ${status.workers.available}`);
console.log(`Tasks pendientes: ${status.tasks.pending}`);
console.log(`Rendimiento (ops/s): ${status.performance.throughput}`);
```

## Solución de Problemas

### Workers bloqueados

Si los workers se bloquean o no responden:

1. Verifica los logs para errores en la consola
2. Revisa la memoria y CPU disponibles en el sistema
3. Considera reiniciar el bot con `npm run telegram-bot-adapter`

### Alta carga de CPU

Si el sistema consume demasiada CPU:

1. Reduce el número de workers en las variables de entorno
2. Limita el número de operaciones simultáneas
3. Implementa throttling para solicitudes frecuentes

### Timeout en generación de señales

Si las solicitudes de señal tardan demasiado:

1. Verifica la conexión a la API de DeepSeek
2. Aumenta el timeout en `waitForTaskCompletion` 
3. Considera usar el modo 'basic' para señales más rápidas

## Recomendaciones de Uso

- **Uso óptimo**: El sistema de multithreading es más efectivo para generar múltiples señales simultáneamente o para escaneos de mercado amplios.
- **Balanceo**: No configures demasiados workers, ya que esto puede saturar la CPU y memoria del sistema.
- **Monitoring**: Implementa un sistema de monitoreo para supervisar el rendimiento y la salud de los workers.
- **Gestión de errores**: Asegúrate de manejar correctamente los errores y los timeouts en los workers.

## Ejemplos

### Ejemplo 1: Generar múltiples señales en paralelo

```typescript
async function generateMultipleSignals(symbols: string[]) {
  const signalPromises = symbols.map(symbol => 
    signalTasks.generateSignal(symbol, 1000, 'basic')
  );
  
  return Promise.all(signalPromises);
}

// Uso
const results = await generateMultipleSignals(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
```

### Ejemplo 2: Escanear mercado con diferentes criterios

```typescript
async function scanWithDifferentCriteria() {
  // Ejecutar múltiples escaneos con diferentes criterios
  const [highVolumeScan, highScoreScan] = await Promise.all([
    signalTasks.scanMarket(5, 10000000, 50),  // Alto volumen
    signalTasks.scanMarket(5, 1000000, 80)    // Alta puntuación
  ]);
  
  return {
    highVolume: highVolumeScan,
    highScore: highScoreScan
  };
}
```