/**
 * Inicializa todos los componentes del sistema
 * 
 * Este archivo centraliza la inicialización de todos los componentes
 * para garantizar que se haga en el orden correcto.
 */

import { initSentry } from './error-tracking';
import { logger } from './logging';
import { workerPool } from './worker-pool';
import '../utils/worker-tasks'; // Cargar task handlers
import { CircuitBreakerRegistry } from './circuit-breaker';
import { initializeDatabase } from './db-migration';

/**
 * Inicializa todos los componentes del sistema
 */
export async function initializeSystem(): Promise<void> {
  logger.info('Inicializando sistema...');
  
  // Inicializar tracking de errores
  initSentry();
  
  // Inicializar base de datos PostgreSQL
  try {
    const dbInitialized = await initializeDatabase();
    if (dbInitialized) {
      logger.info('Base de datos inicializada correctamente');
    } else {
      logger.warn('No se pudo inicializar la base de datos correctamente');
    }
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? error.message : String(error)
    }, 'Error al inicializar la base de datos');
  }
  
  // Inicializar worker pool
  try {
    workerPool.initialize();
    logger.info('Worker Pool inicializado correctamente');
  } catch (error) {
    logger.warn({ 
      error: error instanceof Error ? error.message : String(error)
    }, 'No se pudo inicializar Worker Pool');
  }
  
  // Configurar circuit breakers principales
  setupCircuitBreakers();
  
  logger.info('Sistema inicializado correctamente');
}

/**
 * Configura los circuit breakers para los servicios principales
 */
function setupCircuitBreakers(): void {
  // Circuit Breaker para Binance API
  CircuitBreakerRegistry.getOrCreate('binance', {
    failureThreshold: 3,           // 3 fallos para abrir el circuito
    resetTimeout: 30000,           // 30 segundos en estado abierto
    halfOpenSuccessThreshold: 2,   // 2 éxitos para restaurar
    monitorInterval: 60000,        // Limpiar fallos cada minuto
    maxFailureAge: 300000,         // Considerar fallos de los últimos 5 minutos
    timeout: 15000,                // 15 segundos de timeout
    onStateChange: (state, service) => {
      logger.info({ service, state }, `Circuit breaker state changed to ${state}`);
    }
  });
  
  // Circuit Breaker para LunarCrush API
  CircuitBreakerRegistry.getOrCreate('lunarcrush', {
    failureThreshold: 3,
    resetTimeout: 60000,           // 1 minuto para datos de sentimiento
    halfOpenSuccessThreshold: 2,
    timeout: 10000
  });
  
  // Circuit Breaker para DeepSeek API
  CircuitBreakerRegistry.getOrCreate('deepseek', {
    failureThreshold: 2,           // Más sensible a fallos por ser crítico
    resetTimeout: 45000,
    halfOpenSuccessThreshold: 1,   // Solo un éxito para restaurar
    timeout: 30000                 // Más tiempo para LLM
  });
  
  logger.info('Circuit Breakers configurados para APIs externas');
}
