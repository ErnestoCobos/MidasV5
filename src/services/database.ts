import { Pool, PoolClient, QueryResult } from 'pg';
import { logger } from '../utils/logging';
import { env } from '../utils/env';

/**
 * Configuración de la conexión a la base de datos PostgreSQL
 */
export interface DbConfig {
  connectionString: string;
  ssl?: boolean;
  max?: number; // Máximo de conexiones en pool
  idleTimeoutMillis?: number;
}

/**
 * Servicio para gestionar la conexión y operaciones con PostgreSQL
 */
export class DatabaseService {
  private pool: Pool;
  private static instance: DatabaseService;

  private constructor(config: DbConfig) {
    // Configurar SSL para aceptar certificados autofirmados si ssl=true
    const sslConfig = config.ssl === true ? {
      rejectUnauthorized: false // Permitir certificados autofirmados
    } : config.ssl;
    
    this.pool = new Pool({
      connectionString: config.connectionString,
      ssl: sslConfig,
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000
    });

    // Eventos para monitoreo del pool de conexiones
    this.pool.on('connect', () => {
      logger.debug('Nueva conexión establecida con PostgreSQL');
    });

    this.pool.on('error', (err) => {
      logger.error({ error: err }, 'Error inesperado en el pool de PostgreSQL');
    });

    logger.info('Servicio de base de datos PostgreSQL inicializado');
  }

  /**
   * Obtiene la instancia singleton del servicio de base de datos
   */
  public static getInstance(config?: DbConfig): DatabaseService {
    if (!DatabaseService.instance && config) {
      DatabaseService.instance = new DatabaseService(config);
    }
    return DatabaseService.instance;
  }

  /**
   * Verifica la conexión a la base de datos
   */
  public async testConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW()');
      logger.info(`Conexión a PostgreSQL establecida correctamente: ${result.rows[0].now}`);
      return true;
    } catch (error: any) {
      // Formateamos el error para obtener información más útil para diagnóstico
      const errorDetails = {
        message: error?.message || 'Error desconocido en conexión',
        code: error?.code || 'NO_CODE',
        errno: error?.errno,
        syscall: error?.syscall,
        address: error?.address,
        port: error?.port,
        stack: (error?.stack || '').split('\n').slice(0, 3).join('\n')
      };
      
      // Decidir nivel de log según el tipo de error
      if (errorDetails.code === 'ECONNREFUSED') {
        logger.warn({ error: errorDetails }, 'Error conectando a PostgreSQL: servidor no disponible');
      } else if (errorDetails.code === 'ETIMEDOUT') {
        logger.warn({ error: errorDetails }, 'Error conectando a PostgreSQL: tiempo de espera agotado');
      } else if (errorDetails.message.includes('no pg_hba.conf entry')) {
        logger.warn({ error: errorDetails }, 'Error conectando a PostgreSQL: falta entrada en pg_hba.conf');
      } else {
        logger.error({ error: errorDetails }, 'Error conectando a PostgreSQL');
      }
      
      return false;
    }
  }

  /**
   * Ejecuta una consulta SQL
   */
  public async query(text: string, params?: any[]): Promise<QueryResult> {
    try {
      const start = Date.now();
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug({
        query: text,
        params,
        rowCount: result.rowCount,
        duration
      }, 'Consulta SQL ejecutada');
      
      return result;
    } catch (error) {
      logger.error({
        error,
        query: text,
        params
      }, 'Error en consulta SQL');
      
      throw error;
    }
  }

  /**
   * Ejecuta una serie de operaciones dentro de una transacción
   */
  public async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({ error }, 'Transacción revertida debido a error');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cierra todas las conexiones del pool
   */
  public async close(): Promise<void> {
    await this.pool.end();
    logger.info('Conexión a PostgreSQL cerrada');
  }

  /**
   * Activa extensiones de PostgreSQL necesarias
   */
  public async enableExtensions(extensions: string[]): Promise<void> {
    for (const extension of extensions) {
      try {
        await this.query(`CREATE EXTENSION IF NOT EXISTS ${extension};`);
        logger.info(`Extensión ${extension} activada correctamente`);
      } catch (error) {
        logger.warn({ extension, error }, `No se pudo activar la extensión ${extension}`);
      }
    }
  }

  /**
   * Verifica si TimescaleDB está disponible y activo
   */
  public async hasTimescaleDB(): Promise<boolean> {
    try {
      const result = await this.query(
        "SELECT extname FROM pg_extension WHERE extname = 'timescaledb'"
      );
      return result.rowCount > 0;
    } catch (error) {
      logger.warn({ error }, 'Error verificando extensión TimescaleDB');
      return false;
    }
  }
}

// Instancia global para uso en toda la aplicación
// La configuración real se realiza durante la inicialización del sistema
// Inicializamos con un mock si no hay configuración
export const db = DatabaseService.getInstance({
  connectionString: process.env.DATABASE_URL || '',
  ssl: process.env.DATABASE_SSL === 'true'
});
