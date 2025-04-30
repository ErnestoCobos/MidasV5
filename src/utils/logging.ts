import pino from 'pino';
import pretty from 'pino-pretty';

// Configuración de logs con formato legible en desarrollo
export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

// Función para crear un logger con contexto
export function createContextLogger(context: string, data: Record<string, any> = {}) {
  return logger.child({ context, ...data });
}

// Logger especializado para métricas de trading
export const tradeLogger = createContextLogger('trade');

// Logger para eventos de API
export const apiLogger = createContextLogger('api');
