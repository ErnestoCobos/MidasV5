import 'dotenv/config';
import { z } from 'zod';
import { logger } from './logging';

// Esquema para validación de variables de entorno
const envSchema = z.object({
  BINANCE_KEY: z.string().min(1, 'BINANCE_KEY es requerida'),
  BINANCE_SECRET: z.string().min(1, 'BINANCE_SECRET es requerida'),
  LUNAR_KEY: z.string().min(1, 'LUNAR_KEY es requerida'),
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY es requerida'),
  
  // Variables opcionales con valores por defecto
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DRY_RUN: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  
  // Variables para monitoreo y seguimiento de errores
  SENTRY_DSN: z.string().optional().default(''),
  SENTRY_ENVIRONMENT: z.string().optional().default('development')
});

// Función para validar y extraer variables de entorno
export function validateEnv() {
  try {
    // Validar variables de entorno
    const env = envSchema.parse(process.env);
    
    logger.info('Variables de entorno validadas correctamente');
    
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Formatear los errores para mostrarlos claramente
      logger.error('Error validando variables de entorno:');
      
      for (const issue of error.issues) {
        logger.error(`- ${issue.path.join('.')}: ${issue.message}`);
      }
      
      process.exit(1); // Salir con error
    }
    
    logger.error('Error inesperado validando variables de entorno', error);
    process.exit(1);
  }
}

// Exportar las variables validadas para uso en la aplicación
export const env = validateEnv();

// Exportar flag de modo simulación (DRY_RUN)
export const isDryRun = env.DRY_RUN;

// Exportar función de utilidad para determinar si estamos en modo producción
export const isProduction = env.NODE_ENV === 'production';
