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
  SENTRY_ENVIRONMENT: z.string().optional().default('development'),
  
  // Variables para PostgreSQL
  DATABASE_URL: z.string().optional().default('postgres://vultradmin:AVNS_zBGNTQuTGII6zzEqP8i@vultr-prod-c887c024-0af5-4d3e-811c-063368f8c475-vultr-prod-09bb.vultrdb.com:16751/defaultdb'),
  DATABASE_SSL: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  DATABASE_MAX_CONNECTIONS: z.string().default('20').transform(val => parseInt(val, 10)),
  DATABASE_IDLE_TIMEOUT: z.string().default('30000').transform(val => parseInt(val, 10)),
  
  // Variables para migración de datos
  MIGRATE_DATA: z.enum(['true', 'false']).default('false').transform(val => val === 'true'),
  BACKUP_JSON_FILES: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  
  // Variables para TimescaleDB
  USE_TIMESCALE: z.enum(['true', 'false']).default('true').transform(val => val === 'true'),
  TIMESCALE_CHUNK_INTERVAL_DAYS: z.string().default('1').transform(val => parseInt(val, 10)),
  TIMESCALE_COMPRESSION_AFTER_DAYS: z.string().default('7').transform(val => parseInt(val, 10))
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
    return undefined; // Nunca se ejecutará, pero ayuda con el tipado
  }
}

// Inicializa env solo si no estamos en un entorno de prueba
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.npm_lifecycle_event === 'test';

// Exportar las variables validadas para uso en la aplicación, de forma segura para pruebas
let envVars: ReturnType<typeof envSchema.parse> | undefined;

try {
  // Solo validamos automáticamente si no estamos en pruebas
  if (!isTestEnv) {
    envVars = validateEnv();
  }
} catch (e) {
  // Capturar errores silenciosamente en modo prueba
  if (!isTestEnv) {
    throw e;
  }
}

export const env = envVars;

// Exportar getters que son seguros para testing
export const isDryRun = () => env?.DRY_RUN ?? true;
export const isProduction = () => env?.NODE_ENV === 'production';
