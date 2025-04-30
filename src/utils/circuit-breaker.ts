import { logger } from './logging';
import { EventEmitter } from 'events';

/**
 * Estados posibles del Circuit Breaker
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Opciones para configurar el Circuit Breaker
 */
export interface CircuitBreakerOptions {
  failureThreshold: number;        // Número de fallos para abrir el circuito
  resetTimeout: number;            // Tiempo en ms para pasar a half-open
  halfOpenSuccessThreshold: number;// Éxitos necesarios en half-open
  monitorInterval?: number;        // Intervalo para limpiar fallos antiguos
  maxFailureAge?: number;          // Antigüedad máxima de fallos a considerar
  timeout?: number;                // Timeout para las operaciones
  onStateChange?: (state: CircuitBreakerState, service: string) => void;
}

/**
 * Datos de un fallo registrado
 */
interface Failure {
  timestamp: number;
  error: Error;
}

/**
 * Implementa el patrón Circuit Breaker para proteger contra
 * servicios o APIs inestables o no disponibles
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState = 'CLOSED';
  private failures: Failure[] = [];
  private resetTimer: NodeJS.Timeout | null = null;
  private successCount: number = 0;
  private readonly options: Required<CircuitBreakerOptions>;
  private readonly serviceName: string;
  private monitorTimer: NodeJS.Timeout | null = null;
  
  /**
   * Crea una nueva instancia de CircuitBreaker
   * @param serviceName Nombre del servicio protegido por este breaker
   * @param options Opciones de configuración
   */
  constructor(serviceName: string, options: CircuitBreakerOptions) {
    super();
    this.serviceName = serviceName;
    
    // Establecer opciones por defecto
    this.options = {
      failureThreshold: options.failureThreshold,
      resetTimeout: options.resetTimeout,
      halfOpenSuccessThreshold: options.halfOpenSuccessThreshold,
      monitorInterval: options.monitorInterval || 60000, // 1 minuto por defecto
      maxFailureAge: options.maxFailureAge || 300000,    // 5 minutos por defecto
      timeout: options.timeout || 10000,                 // 10 segundos por defecto
      onStateChange: options.onStateChange || (() => {})
    };
    
    // Iniciar monitor de limpieza
    this.startMonitor();
    
    logger.info({
      service: this.serviceName,
      options: this.options
    }, 'Circuit breaker initialized');
  }
  
  /**
   * Ejecuta una función protegida por el circuit breaker
   * @param fn Función a ejecutar
   * @param operationName Nombre de la operación (para logs)
   * @returns Resultado de la función
   * @throws Error si el circuito está abierto o la función falla
   */
  async execute<T>(fn: () => Promise<T>, operationName: string = 'unknown'): Promise<T> {
    // Si el circuito está abierto, rechazar inmediatamente
    if (this.state === 'OPEN') {
      logger.warn({
        service: this.serviceName,
        operation: operationName,
        state: this.state
      }, 'Circuit is OPEN, rejecting request');
      
      const error = new Error(`Service ${this.serviceName} circuit is open`);
      error.name = 'CircuitOpenError';
      this.emit('rejected', { service: this.serviceName, operation: operationName });
      throw error;
    }
    
    try {
      // Ejecutar con timeout
      const result = await this.withTimeout(fn);
      
      // En half-open, incrementar contador de éxitos
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        this.emit('success', { 
          service: this.serviceName, 
          operation: operationName, 
          successCount: this.successCount,
          threshold: this.options.halfOpenSuccessThreshold
        });
        
        // Si alcanza el umbral, cerrar el circuito
        if (this.successCount >= this.options.halfOpenSuccessThreshold) {
          this.transitionTo('CLOSED');
        }
      }
      
      return result;
    } catch (error) {
      // Registrar el fallo
      this.recordFailure(error instanceof Error ? error : new Error(String(error)));
      
      // En half-open, volver a abrir ante cualquier fallo
      if (this.state === 'HALF_OPEN') {
        this.transitionTo('OPEN');
        this.emit('halfOpenFailure', {
          service: this.serviceName,
          operation: operationName,
          error: error instanceof Error ? error.message : String(error)
        });
      } 
      // En closed, verificar si debe abrirse
      else if (this.state === 'CLOSED') {
        const recentFailures = this.getRecentFailures();
        
        if (recentFailures.length >= this.options.failureThreshold) {
          this.transitionTo('OPEN');
          this.emit('openCircuit', {
            service: this.serviceName,
            operation: operationName,
            failures: recentFailures.length,
            threshold: this.options.failureThreshold
          });
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Ejecuta una función con timeout
   * @param fn Función a ejecutar
   * @returns Resultado de la función
   * @throws Error si la función falla o excede el timeout
   */
  private async withTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);
      
      fn().then(
        result => {
          clearTimeout(timeoutId);
          resolve(result);
        },
        error => {
          clearTimeout(timeoutId);
          reject(error);
        }
      );
    });
  }
  
  /**
   * Registra un fallo
   * @param error Error que causó el fallo
   */
  private recordFailure(error: Error): void {
    this.failures.push({
      timestamp: Date.now(),
      error
    });
    
    logger.debug({
      service: this.serviceName,
      state: this.state,
      error: error.message,
      failureCount: this.failures.length
    }, 'Circuit breaker recorded failure');
    
    this.emit('failure', {
      service: this.serviceName,
      error: error.message,
      failureCount: this.failures.length,
      threshold: this.options.failureThreshold
    });
  }
  
  /**
   * Obtiene fallos recientes
   * @returns Lista de fallos recientes
   */
  private getRecentFailures(): Failure[] {
    const cutoff = Date.now() - this.options.maxFailureAge;
    return this.failures.filter(f => f.timestamp >= cutoff);
  }
  
  /**
   * Transiciona a un nuevo estado
   * @param newState Nuevo estado
   */
  private transitionTo(newState: CircuitBreakerState): void {
    if (this.state === newState) return;
    
    const oldState = this.state;
    this.state = newState;
    
    logger.info({
      service: this.serviceName,
      oldState,
      newState
    }, 'Circuit breaker state changed');
    
    // Notificar cambio de estado
    this.options.onStateChange(newState, this.serviceName);
    this.emit('stateChange', { 
      service: this.serviceName, 
      oldState, 
      newState 
    });
    
    // Configurar timer para half-open si está abierto
    if (newState === 'OPEN') {
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
      }
      
      this.resetTimer = setTimeout(() => {
        this.transitionTo('HALF_OPEN');
        this.successCount = 0;
      }, this.options.resetTimeout);
    }
    
    // Limpiar timer si no está en open
    if (newState !== 'OPEN' && this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
  
  /**
   * Inicia el monitor de limpieza
   */
  private startMonitor(): void {
    this.monitorTimer = setInterval(() => {
      const oldCount = this.failures.length;
      const cutoff = Date.now() - this.options.maxFailureAge;
      
      this.failures = this.failures.filter(f => f.timestamp >= cutoff);
      
      const newCount = this.failures.length;
      if (oldCount !== newCount) {
        logger.debug({
          service: this.serviceName,
          removed: oldCount - newCount,
          current: newCount
        }, 'Circuit breaker cleaned old failures');
      }
    }, this.options.monitorInterval);
  }
  
  /**
   * Detiene el circuit breaker
   */
  stop(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }
  
  /**
   * Obtiene el estado actual
   */
  getState(): CircuitBreakerState {
    return this.state;
  }
  
  /**
   * Reinicia el circuit breaker
   */
  reset(): void {
    this.failures = [];
    this.successCount = 0;
    this.transitionTo('CLOSED');
  }
}

/**
 * Registro centralizado de circuit breakers
 * Permite acceder a breakers existentes o crear nuevos
 */
export class CircuitBreakerRegistry {
  private static breakers: Map<string, CircuitBreaker> = new Map();
  
  /**
   * Obtiene un breaker existente o crea uno nuevo
   * @param serviceName Nombre del servicio
   * @param options Opciones si se crea uno nuevo
   * @returns Circuit breaker
   */
  static getOrCreate(serviceName: string, options: CircuitBreakerOptions): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, new CircuitBreaker(serviceName, options));
    }
    
    return this.breakers.get(serviceName)!;
  }
  
  /**
   * Obtiene todos los breakers registrados
   * @returns Mapa de breakers
   */
  static getAll(): Map<string, CircuitBreaker> {
    return this.breakers;
  }
  
  /**
   * Reinicia uno o todos los breakers
   * @param serviceName Opcional, si se proporciona reinicia solo ese
   */
  static reset(serviceName?: string): void {
    if (serviceName) {
      this.breakers.get(serviceName)?.reset();
    } else {
      this.breakers.forEach(breaker => breaker.reset());
    }
  }
}
