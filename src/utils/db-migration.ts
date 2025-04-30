import fs from 'fs';
import path from 'path';
import { logger } from './logging';
import { tradeRepository } from '../repositories/trade-repository';
import { marketDataRepository } from '../repositories/market-data-repository';
import { TradeOperation } from '../services/trade-history';
import { db, DatabaseService } from '../services/database';
import { env } from './env';

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
    if (env.BACKUP_JSON_FILES) {
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
    DatabaseService.getInstance({
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL,
      max: env.DATABASE_MAX_CONNECTIONS,
      idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT
    });
    
    // Probar la conexión
    const connected = await db.testConnection();
    if (!connected) {
      logger.error('No se pudo conectar a PostgreSQL');
      return false;
    }
    
    // Activar extensiones
    await db.enableExtensions(['pgcrypto']);
    
    // Si TimescaleDB está disponible y se solicita utilizarlo, activarlo
    if (env.USE_TIMESCALE) {
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
    if (env.MIGRATE_DATA) {
      await migrateDataToPostgres();
    }
    
    logger.info('Base de datos inicializada correctamente');
    return true;
  } catch (error) {
    logger.error({ error }, 'Error inicializando la base de datos');
    return false;
  }
}
