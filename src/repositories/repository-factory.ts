/**
 * Factory para proveer las implementaciones adecuadas de repositorios
 * según la disponibilidad de la base de datos.
 */
import { logger } from '../utils/logging';
import { tradeRepository } from './trade-repository';
import { mockTradeRepository } from './mock-trade-repository';
import { db } from '../services/database';

// Variable para rastrear el estado de la conexión
let isDatabaseAvailable = false;

/**
 * Verificar si la base de datos está disponible
 */
async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const isConnected = await db.testConnection();
    
    if (isConnected !== isDatabaseAvailable) {
      // Solo registrar cuando cambia el estado para no llenar logs
      if (isConnected) {
        logger.info('Base de datos PostgreSQL disponible. Usando repositorios de producción.');
      } else {
        logger.warn('Base de datos PostgreSQL no disponible. Usando repositorios mock.');
      }
    }
    
    isDatabaseAvailable = isConnected;
    return isConnected;
  } catch (error) {
    logger.error({ error }, 'Error verificando conexión a base de datos');
    isDatabaseAvailable = false;
    return false;
  }
}

/**
 * Obtener el repositorio de operaciones adecuado
 */
export async function getTradeRepository() {
  const isAvailable = await checkDatabaseConnection();
  
  if (!isAvailable) {
    logger.debug('⚠️ Usando repositorio mock para operaciones de trading (base de datos no disponible)');
  }
  
  return isAvailable ? tradeRepository : mockTradeRepository;
}

/**
 * Inicializa repositorios y verifica disponibilidad
 */
export async function initializeRepositories(): Promise<boolean> {
  const dbAvailable = await checkDatabaseConnection();
  
  if (dbAvailable) {
    try {
      // Crear tablas si no existen
      await tradeRepository.createTables();
      logger.info('Tablas de trade repository creadas/verificadas correctamente');
    } catch (error) {
      logger.error({ error }, 'Error inicializando tablas de repositorio');
      return false;
    }
  } else {
    logger.warn('Base de datos no disponible, se usarán repositorios mock');
  }
  
  return true;
}
