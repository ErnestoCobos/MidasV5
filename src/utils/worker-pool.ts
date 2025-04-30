import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import path from 'path';
import { logger } from './logging';
import os from 'os';

/**
 * Interfaz para las tareas enviadas a los workers
 */
interface Task<T> {
  id: string;
  type: string;
  data: any;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
}

/**
 * Interfaz para los mensajes entre el thread principal y los workers
 */
interface WorkerMessage {
  type: 'task' | 'result' | 'error' | 'ready';
  taskId?: string;
  taskType?: string;
  data?: any;
  result?: any;
  error?: string;
}

/**
 * Función para manejar tareas en el worker
 */
type TaskHandler = (data: any) => Promise<any>;

/**
 * Registro global de manejadores de tareas
 */
const taskHandlers: Record<string, TaskHandler> = {};

/**
 * Registra un manejador de tareas para un tipo específico
 * @param type Tipo de tarea
 * @param handler Función que maneja la tarea
 */
export function registerTaskHandler(type: string, handler: TaskHandler): void {
  taskHandlers[type] = handler;
  logger.debug({ taskType: type }, 'Task handler registered');
}

/**
 * Pool de workers para procesamiento paralelo
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: Task<any>[] = [];
  private workerStatus: Map<Worker, 'busy' | 'idle'> = new Map();
  private readonly maxWorkers: number;
  private isInitialized: boolean = false;
  
  /**
   * Crea un nuevo pool de workers
   * @param workerCount Número de workers (por defecto: núcleos CPU - 1)
   */
  constructor(workerCount?: number) {
    // Usar número de núcleos lógicos - 1 (dejar uno para el thread principal)
    this.maxWorkers = workerCount || Math.max(1, os.cpus().length - 1);
    logger.info({ maxWorkers: this.maxWorkers }, 'Worker pool initialized');
  }
  
  /**
   * Inicializa el pool creando los workers
   */
  initialize(): void {
    if (this.isInitialized) return;
    
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createWorker();
    }
    
    this.isInitialized = true;
  }
  
  /**
   * Crea un nuevo worker
   */
  private createWorker(): Worker {
    // Crear worker usando un archivo separado
    const worker = new Worker(path.join(__dirname, 'worker-runner.js'));
    
    this.workers.push(worker);
    this.workerStatus.set(worker, 'idle');
    
    // Manejar mensajes del worker
    worker.on('message', (message: WorkerMessage) => {
      if (message.type === 'ready') {
        logger.debug('Worker reported ready');
        return;
      }
      
      if (message.type === 'result' || message.type === 'error') {
        const { taskId, result, error } = message;
        if (!taskId) {
          logger.error({ message }, 'Received message without taskId');
          return;
        }
        
        const task = this.taskQueue.find(t => t.id === taskId);
        
        if (task) {
          // Eliminar tarea de la cola
          this.taskQueue = this.taskQueue.filter(t => t.id !== taskId);
          
          // Manejar resultado o error
          if (message.type === 'error' && error) {
            task.reject(new Error(error));
          } else {
            task.resolve(result);
          }
        } else {
          logger.warn({ taskId }, 'Received result for unknown task');
        }
        
        // Marcar worker como libre
        this.workerStatus.set(worker, 'idle');
        
        // Procesar siguiente tarea si hay
        this.processQueue();
      }
    });
    
    // Manejar errores
    worker.on('error', error => {
      logger.error({ error: error.message }, 'Worker error');
      
      // Reemplazar worker
      this.workerStatus.delete(worker);
      this.workers = this.workers.filter(w => w !== worker);
      this.createWorker();
    });
    
    return worker;
  }
  
  /**
   * Ejecuta una tarea en un worker
   * @param type Tipo de tarea
   * @param data Datos para la tarea
   * @returns Resultado de la tarea
   */
  async runTask<T>(type: string, data: any): Promise<T> {
    // Inicializar si no se ha hecho
    if (!this.isInitialized) {
      this.initialize();
    }
    
    return new Promise<T>((resolve, reject) => {
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Crear tarea
      const task: Task<T> = {
        id: taskId,
        type,
        data,
        resolve,
        reject
      };
      
      // Añadir a la cola
      this.taskQueue.push(task);
      
      // Procesar cola
      this.processQueue();
    });
  }
  
  /**
   * Procesa la cola de tareas
   */
  private processQueue(): void {
    // Si no hay tareas, no hacer nada
    if (this.taskQueue.length === 0) return;
    
    // Buscar worker libre
    const availableWorker = this.workers.find(
      worker => this.workerStatus.get(worker) === 'idle'
    );
    
    if (availableWorker) {
      const task = this.taskQueue[0]; // Tomar la primera tarea
      
      // Marcar worker como ocupado
      this.workerStatus.set(availableWorker, 'busy');
      
      // Enviar tarea al worker
      availableWorker.postMessage({
        type: 'task',
        taskId: task.id,
        taskType: task.type,
        data: task.data
      });
      
      logger.debug({ 
        taskId: task.id, 
        taskType: task.type 
      }, 'Task sent to worker');
    }
  }
  
  /**
   * Detiene todos los workers
   */
  async terminate(): Promise<void> {
    logger.info('Terminating worker pool');
    const promises = this.workers.map(worker => worker.terminate());
    await Promise.all(promises);
    this.workers = [];
    this.workerStatus.clear();
    this.isInitialized = false;
  }
  
  /**
   * Obtiene el número de tareas pendientes
   */
  get pendingTasks(): number {
    return this.taskQueue.length;
  }
  
  /**
   * Obtiene el número de workers ocupados
   */
  get busyWorkers(): number {
    let count = 0;
    this.workerStatus.forEach(status => {
      if (status === 'busy') count++;
    });
    return count;
  }
}

// Si es worker, configurar para recibir mensajes
if (!isMainThread && parentPort) {
  parentPort.on('message', async (message: WorkerMessage) => {
    if (message.type !== 'task' || !message.taskId || !message.taskType) {
      parentPort!.postMessage({ 
        type: 'error', 
        error: 'Invalid message format' 
      });
      return;
    }
    
    const { taskId, taskType, data } = message;
    
    try {
      // Verificar si hay un manejador para este tipo
      const handler = taskHandlers[taskType];
      
      if (!handler) {
        throw new Error(`No handler registered for task type: ${taskType}`);
      }
      
      // Ejecutar tarea
      const result = await handler(data);
      
      // Enviar resultado
      parentPort!.postMessage({
        type: 'result',
        taskId,
        result
      });
    } catch (error) {
      // Enviar error
      parentPort!.postMessage({
        type: 'error',
        taskId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // Notificar que está listo
  parentPort.postMessage({ type: 'ready' });
}

// Singleton para uso en toda la aplicación
export const workerPool = new WorkerPool();
