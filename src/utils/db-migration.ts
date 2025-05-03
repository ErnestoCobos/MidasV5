import fs from 'fs';
import path from 'path';
import { logger } from './logging';
import { tradeRepository } from '../repositories/trade-repository';
import { marketDataRepository } from '../repositories/market-data-repository';
import { TradeOperation } from '../services/trade-history';
import { db, DatabaseService } from '../services/database';
import { env, getEnv } from './env';

/**
 * Migra datos existentes desde archivos JSON a la base de datos PostgreSQL
 */
export async function migrateDataToPostgres(): Promise<void> {
  try {
    logger.info('Iniciando migración de datos a PostgreSQL');
    
    // Verificar la conexión a la base de datos
    const connected = await db.testConnection();
    if (!connected) {
      logger.error('No se pudo conectar a PostgreSQL. Abortando migración');
      return;
    }
    
    // Activar extensiones de PostgreSQL necesarias
    await db.enableExtensions([
      'pgcrypto',     // Para gen_random_uuid() y funciones criptográficas
      'timescaledb'   // Para series temporales (si está disponible)
    ]);
    
    // Crear tablas si no existen
    await tradeRepository.createTables();
    await marketDataRepository.createTables();
    
    // Migrar historial de operaciones
    await migrateTradeHistory();
    
    logger.info('Migración de datos a PostgreSQL completada con éxito');
  } catch (error) {
    logger.error({ error }, 'Error durante la migración de datos a PostgreSQL');
    throw error;
  }
}

/**
 * Migra el historial de operaciones desde JSON a PostgreSQL
 */
async function migrateTradeHistory(): Promise<void> {
  try {
    const tradeHistoryPath = path.join(process.cwd(), 'trade_history.json');
    
    if (!fs.existsSync(tradeHistoryPath)) {
      logger.info('No existe archivo de historial de operaciones para migrar');
      return;
    }
    
    // Leer archivo JSON
    const tradeData = JSON.parse(fs.readFileSync(tradeHistoryPath, 'utf8')) as TradeOperation[];
    
    if (!tradeData || !Array.isArray(tradeData) || tradeData.length === 0) {
      logger.info('No hay operaciones para migrar');
      return;
    }
    
    logger.info({ count: tradeData.length }, 'Migrando operaciones a PostgreSQL');
    
    // Guardar cada operación en la base de datos
    for (const trade of tradeData) {
      try {
        await tradeRepository.saveTrade(trade);
        logger.debug({ tradeId: trade.id }, 'Operación migrada correctamente');
      } catch (error) {
        logger.warn({ error, tradeId: trade.id }, 'Error migrando operación. Continuando con la siguiente...');
      }
    }
    
    logger.info(`Migración de historial de operaciones completada: ${tradeData.length} operaciones migradas`);
    
    // Opcionalmente, hacer backup del archivo original
    if (getEnv().BACKUP_JSON_FILES) {
      const backupPath = `${tradeHistoryPath}.bak.${Date.now()}`;
      fs.copyFileSync(tradeHistoryPath, backupPath);
      logger.info({ backupPath }, 'Archivo de historial de operaciones respaldado');
    }
  } catch (error) {
    logger.error({ error }, 'Error migrando historial de operaciones');
    throw error;
  }
}

/**
 * Inicializa la base de datos: crea tablas y realiza la migración inicial si es necesario
 */
export async function initializeDatabase(): Promise<boolean> {
  try {
    // Configurar la conexión a la base de datos
    const config = getEnv();
    DatabaseService.getInstance({
      connectionString: config.DATABASE_URL,
      ssl: config.DATABASE_SSL,
      max: config.DATABASE_MAX_CONNECTIONS,
      idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT
    });
    
    // Probar la conexión
    // Intentar conexión a base de datos
    let connected = false;
    try {
      connected = await db.testConnection();
    } catch (err) {
      logger.warn('Error al intentar conectar a PostgreSQL, continuando en modo sin base de datos');
    }

    if (!connected) {
      logger.warn('No se pudo conectar a PostgreSQL - usando modo sin base de datos');
      return true; // Permitir continuar sin base de datos
    }
    
    // Activar extensiones
    await db.enableExtensions(['pgcrypto']);
    
    // Si TimescaleDB está disponible y se solicita utilizarlo, activarlo
    if (getEnv().USE_TIMESCALE) {
      try {
        await db.enableExtensions(['timescaledb']);
      } catch (error) {
        logger.warn({ error }, 'No se pudo activar TimescaleDB. Se utilizará PostgreSQL estándar');
      }
    }
    
    // Crear tablas
    await tradeRepository.createTables();
    await marketDataRepository.createTables();
    
    // Ejecutar migración si está habilitada
    if (getEnv().MIGRATE_DATA) {
      await migrateDataToPostgres();
    }
    
    logger.info('Base de datos inicializada correctamente');
    return true;
  } catch (error: any) {
    // Capturar detalles completos del error para mejorar el diagnóstico
    const errorObj = {
      message: error?.message || 'Error desconocido',
      code: error?.code || 'NO_CODE',
      stack: (error?.stack || '').split('\n').slice(0, 3).join('\n') || 'No stack trace',
      cause: error?.cause || 'Unknown cause'
    };
    
    logger.error({ error: errorObj }, 'Error inicializando la base de datos');
    
    // Mensajes más descriptivos según el tipo de error
    if (errorObj.code === 'ECONNREFUSED') {
      logger.warn('PostgreSQL no está ejecutándose o no es accesible. El bot usará datos en memoria.');
    } else if (errorObj.code === 'ENOTFOUND') {
      logger.warn('Nombre de host de PostgreSQL no encontrado. Verifica la URL de conexión.');
    } else if (errorObj.message.includes('authentication')) {
      logger.warn('Error de autenticación en PostgreSQL. Revisa credenciales en variables de entorno.');
    }
    
    return false;
  }
}
