import * as Sentry from '@sentry/node';
import { logger } from './logging';
import { env } from './env';

/**
 * Inicializa Sentry para el seguimiento de errores
 * Esta función debe llamarse al inicio de la aplicación
 */
export function initSentry() {
  if (!env.SENTRY_DSN) {
    logger.warn('Sentry DSN no está configurado, el seguimiento de errores está desactivado');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV || 'development'
  });
  
  // Establecer tags globales
  Sentry.setTags({
    app: 'midasTS'
  });

  // Capturar errores no manejados
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled Promise Rejection');
    Sentry.captureException(reason);
  });

  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught Exception');
    Sentry.captureException(error);
  });
  
  logger.info('Sentry initialized successfully');
}

/**
 * Wrapper para funciones con reintentos y monitoreo de errores
 * @param operation Función asíncrona a ejecutar
 * @param context Contexto de la operación para monitoreo
 * @param options Opciones de reintento
 * @returns Resultado de la operación
 */
export async function withErrorTracking<T>(
  operation: () => Promise<T>,
  context: { 
    name: string; 
    tags?: Record<string, string>; 
    data?: Record<string, any>;
  },
  options?: { 
    maxRetries?: number; 
    baseDelayMs?: number; 
    shouldRetry?: (error: Error) => boolean;
  }
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, shouldRetry = () => true } = options || {};
  let retries = 0;
  
  // Iniciar monitoreo de la operación
  const transactionContext = {
    name: `Operation: ${context.name}`,
    op: context.name,
    tags: context.tags || {}
  };
  
  // Crear ámbito para la operación
  const customScope = new Sentry.Scope();
  if (context.data) {
    Object.entries(context.data).forEach(([key, value]) => {
      customScope.setContext(key, value);
    });
  }

  try {
    while (true) {
      try {
        // Intentar operación
        const result = await operation();
        // Operación exitosa
        return result;
      } catch (error) {
        retries++;
        const isRetryable = error instanceof Error && shouldRetry(error);
        
        if (retries <= maxRetries && isRetryable) {
          // Registrar el intento fallido
          Sentry.addBreadcrumb({
            category: 'retry',
            message: `Retry ${retries}/${maxRetries} for ${context.name}`,
            level: 'warning',
            data: {
              error: error instanceof Error ? error.message : String(error),
              retryCount: retries
            }
          });
          
          // Log del reintento
          logger.warn({ 
            operation: context.name, 
            retry: retries, 
            maxRetries,
            error: error instanceof Error ? error.message : String(error)
          }, 'Operation failed, retrying');
          
          // Espera exponencial
          const delay = baseDelayMs * Math.pow(2, retries - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Capturar el error si se agotaron los intentos
          if (error instanceof Error) {
            Sentry.captureException(error);
          } else {
            Sentry.captureMessage(`Non-Error thrown: ${String(error)}`, 'error');
          }
          // Operación fallida
          throw error;
        }
      }
    }
  } finally {
    // Finalización del tracking
  }
}
