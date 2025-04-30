import { db } from '../services/database';
import { logger } from '../utils/logging';
import { TradeSignal } from '../services/deepseek';
import { TradeOperation } from '../services/trade-history';

/**
 * Repositorio para gestionar las operaciones de trading en la base de datos
 */
export class TradeRepository {
  
  /**
   * Crea las tablas necesarias para almacenar operaciones si no existen
   */
  async createTables(): Promise<void> {
    try {
      logger.info('Creando tablas para operaciones de trading...');
      
      // Crear tabla principal de operaciones
      await db.query(`
        CREATE TABLE IF NOT EXISTS trades (
          id VARCHAR(50) PRIMARY KEY,
          symbol VARCHAR(20) NOT NULL,
          action VARCHAR(10) NOT NULL,
          entry_price DECIMAL(18, 8) NOT NULL,
          quantity VARCHAR(30) NOT NULL,
          position_size DECIMAL(18, 8) NOT NULL,
          timestamp BIGINT NOT NULL,
          exit_price DECIMAL(18, 8),
          exit_timestamp BIGINT,
          pnl DECIMAL(18, 8),
          pnl_percent DECIMAL(18, 8),
          status VARCHAR(15) NOT NULL,
          strategy_type VARCHAR(30) NOT NULL,
          execution_type VARCHAR(10) NOT NULL,
          order_ids JSONB NOT NULL DEFAULT '{}',
          signal_data JSONB,
          notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        -- Crear índices para búsquedas comunes
        CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
        CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
        CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
        CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy_type);
        
        -- Tabla para etiquetas de operaciones
        CREATE TABLE IF NOT EXISTS trade_tags (
          id SERIAL PRIMARY KEY,
          trade_id VARCHAR(50) REFERENCES trades(id) ON DELETE CASCADE,
          tag VARCHAR(50) NOT NULL,
          UNIQUE(trade_id, tag)
        );
        
        CREATE INDEX IF NOT EXISTS idx_trade_tags_trade_id ON trade_tags(trade_id);
      `);
      
      logger.info('Tablas para operaciones de trading creadas correctamente');
    } catch (error) {
      logger.error({ error }, 'Error creando tablas para operaciones de trading');
      throw error;
    }
  }
  
  /**
   * Guarda una operación en la base de datos
   */
  async saveTrade(trade: TradeOperation): Promise<void> {
    try {
      // Usar transacción para asegurar la integridad de los datos
      await db.transaction(async (client) => {
        // Insertar o actualizar la operación principal
        await client.query(`
          INSERT INTO trades (
            id, symbol, action, entry_price, quantity, position_size,
            timestamp, exit_price, exit_timestamp, pnl, pnl_percent,
            status, strategy_type, execution_type, order_ids, signal_data, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO UPDATE SET
            exit_price = $8,
            exit_timestamp = $9,
            pnl = $10,
            pnl_percent = $11,
            status = $12,
            order_ids = $15,
            notes = $17
        `, [
          trade.id,
          trade.symbol,
          trade.action,
          trade.entry,
          trade.quantity,
          trade.positionSize,
          trade.timestamp,
          trade.exitPrice,
          trade.exitTimestamp,
          trade.pnl,
          trade.pnlPercent,
          trade.status,
          trade.strategyType,
          trade.executionType,
          JSON.stringify(trade.orderIds),
          trade.signal ? JSON.stringify(trade.signal) : null,
          trade.notes
        ]);
        
        // Manejar etiquetas si existen
        if (trade.tags && trade.tags.length > 0) {
          // Primero eliminar etiquetas existentes para esta operación
          await client.query('DELETE FROM trade_tags WHERE trade_id = $1', [trade.id]);
          
          // Insertar las nuevas etiquetas
          for (const tag of trade.tags) {
            await client.query(`
              INSERT INTO trade_tags (trade_id, tag)
              VALUES ($1, $2)
            `, [trade.id, tag]);
          }
        }
      });
      
      logger.debug({ tradeId: trade.id }, 'Operación guardada correctamente');
    } catch (error) {
      logger.error({ error, tradeId: trade.id }, 'Error guardando operación en base de datos');
      throw error;
    }
  }
  
  /**
   * Busca una operación por su ID
   */
  async findTradeById(id: string): Promise<TradeOperation | null> {
    try {
      const result = await db.query(`
        SELECT t.*, array_agg(tt.tag) as tags
        FROM trades t
        LEFT JOIN trade_tags tt ON t.id = tt.trade_id
        WHERE t.id = $1
        GROUP BY t.id
      `, [id]);
      
      if (result.rowCount === 0) {
        return null;
      }
      
      return this.mapDbTradeToTradeOperation(result.rows[0]);
    } catch (error) {
      logger.error({ error, tradeId: id }, 'Error buscando operación por ID');
      return null;
    }
  }
  
  /**
   * Encuentra la operación abierta más reciente para un símbolo
   */
  async findOpenTradeBySymbol(symbol: string): Promise<TradeOperation | null> {
    try {
      const result = await db.query(`
        SELECT t.*, array_agg(tt.tag) as tags
        FROM trades t
        LEFT JOIN trade_tags tt ON t.id = tt.trade_id
        WHERE t.symbol = $1 AND t.status = 'OPEN'
        GROUP BY t.id
        ORDER BY t.timestamp DESC
        LIMIT 1
      `, [symbol]);
      
      if (result.rowCount === 0) {
        return null;
      }
      
      return this.mapDbTradeToTradeOperation(result.rows[0]);
    } catch (error) {
      logger.error({ error, symbol }, 'Error buscando operación abierta por símbolo');
      return null;
    }
  }
  
  /**
   * Busca operaciones que cumplan con los filtros especificados
   */
  async findTrades(filters: {
    symbol?: string;
    status?: 'OPEN' | 'CLOSED' | 'CANCELLED';
    strategyType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<TradeOperation[]> {
    try {
      let query = `
        SELECT t.*, array_agg(tt.tag) as tags
        FROM trades t
        LEFT JOIN trade_tags tt ON t.id = tt.trade_id
        WHERE 1=1
      `;
      
      const params: any[] = [];
      let paramIndex = 1;
      
      if (filters.symbol) {
        query += ` AND t.symbol = $${paramIndex++}`;
        params.push(filters.symbol);
      }
      
      if (filters.status) {
        query += ` AND t.status = $${paramIndex++}`;
        params.push(filters.status);
      }
      
      if (filters.strategyType) {
        query += ` AND t.strategy_type = $${paramIndex++}`;
        params.push(filters.strategyType);
      }
      
      if (filters.dateFrom) {
        query += ` AND t.timestamp >= $${paramIndex++}`;
        params.push(filters.dateFrom.getTime());
      }
      
      if (filters.dateTo) {
        query += ` AND t.timestamp <= $${paramIndex++}`;
        params.push(filters.dateTo.getTime());
      }
      
      query += ` GROUP BY t.id ORDER BY t.timestamp DESC`;
      
      if (filters.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(filters.limit);
      }
      
      if (filters.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(filters.offset);
      }
      
      const result = await db.query(query, params);
      return result.rows.map(row => this.mapDbTradeToTradeOperation(row));
    } catch (error) {
      logger.error({ error, filters }, 'Error buscando operaciones con filtros');
      return [];
    }
  }
  
  /**
   * Añade una nota a una operación existente
   */
  async addNoteToTrade(tradeId: string, note: string): Promise<boolean> {
    try {
      const result = await db.query(`
        UPDATE trades
        SET notes = $2
        WHERE id = $1
      `, [tradeId, note]);
      
      return result.rowCount > 0;
    } catch (error) {
      logger.error({ error, tradeId }, 'Error añadiendo nota a operación');
      return false;
    }
  }
  
  /**
   * Añade etiquetas a una operación existente
   */
  async addTagsToTrade(tradeId: string, tags: string[]): Promise<boolean> {
    try {
      if (!tags.length) return true;
      
      await db.transaction(async (client) => {
        for (const tag of tags) {
          await client.query(`
            INSERT INTO trade_tags (trade_id, tag)
            VALUES ($1, $2)
            ON CONFLICT (trade_id, tag) DO NOTHING
          `, [tradeId, tag]);
        }
      });
      
      return true;
    } catch (error) {
      logger.error({ error, tradeId }, 'Error añadiendo etiquetas a operación');
      return false;
    }
  }
  
  /**
   * Elimina etiquetas de una operación
   */
  async removeTagsFromTrade(tradeId: string, tags: string[]): Promise<boolean> {
    try {
      if (!tags.length) return true;
      
      const placeholders = tags.map((_, i) => `$${i + 2}`).join(', ');
      const params = [tradeId, ...tags];
      
      await db.query(`
        DELETE FROM trade_tags
        WHERE trade_id = $1 AND tag IN (${placeholders})
      `, params);
      
      return true;
    } catch (error) {
      logger.error({ error, tradeId }, 'Error eliminando etiquetas de operación');
      return false;
    }
  }
  
  /**
   * Calcula estadísticas de rendimiento
   */
  async getPerformanceStats(
    symbol?: string, 
    days: number = 30
  ): Promise<{
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    averagePnl: number;
    averagePnlPercent: number;
    totalPnl: number;
    bestTrade: number;
    worstTrade: number;
    openPositions: number;
  }> {
    try {
      // Calcular timestamp para el filtro de días
      const fromTimestamp = Date.now() - (days * 24 * 60 * 60 * 1000);
      
      // Construir consulta base para filtros
      let baseQuery = `FROM trades WHERE timestamp >= $1`;
      const params: any[] = [fromTimestamp];
      
      if (symbol) {
        baseQuery += ` AND symbol = $2`;
        params.push(symbol);
      }
      
      // Obtener estadísticas básicas
      const totalResult = await db.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'CLOSED') as total_trades,
          COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl > 0) as winning_trades,
          COUNT(*) FILTER (WHERE status = 'CLOSED' AND pnl < 0) as losing_trades,
          COUNT(*) FILTER (WHERE status = 'OPEN') as open_positions,
          COALESCE(SUM(pnl) FILTER (WHERE status = 'CLOSED'), 0) as total_pnl,
          COALESCE(AVG(pnl) FILTER (WHERE status = 'CLOSED'), 0) as avg_pnl,
          COALESCE(AVG(pnl_percent) FILTER (WHERE status = 'CLOSED'), 0) as avg_pnl_percent,
          COALESCE(MAX(pnl) FILTER (WHERE status = 'CLOSED'), 0) as best_trade,
          COALESCE(MIN(pnl) FILTER (WHERE status = 'CLOSED'), 0) as worst_trade
        ${baseQuery}
      `, params);
      
      const stats = totalResult.rows[0];
      
      const totalTrades = parseInt(stats.total_trades) || 0;
      const winningTrades = parseInt(stats.winning_trades) || 0;
      
      return {
        totalTrades,
        winningTrades,
        losingTrades: parseInt(stats.losing_trades) || 0,
        winRate: totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0,
        averagePnl: parseFloat(stats.avg_pnl) || 0,
        averagePnlPercent: parseFloat(stats.avg_pnl_percent) || 0,
        totalPnl: parseFloat(stats.total_pnl) || 0,
        bestTrade: parseFloat(stats.best_trade) || 0,
        worstTrade: parseFloat(stats.worst_trade) || 0,
        openPositions: parseInt(stats.open_positions) || 0
      };
    } catch (error) {
      logger.error({ error, symbol, days }, 'Error calculando estadísticas de rendimiento');
      
      // Devolver valores por defecto en caso de error
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        averagePnl: 0,
        averagePnlPercent: 0,
        totalPnl: 0,
        bestTrade: 0,
        worstTrade: 0,
        openPositions: 0
      };
    }
  }
  
  /**
   * Mapea una fila de la base de datos a un objeto TradeOperation
   */
  private mapDbTradeToTradeOperation(row: any): TradeOperation {
    return {
      id: row.id,
      symbol: row.symbol,
      action: row.action,
      entry: parseFloat(row.entry_price),
      quantity: row.quantity,
      positionSize: parseFloat(row.position_size),
      timestamp: parseInt(row.timestamp),
      exitPrice: row.exit_price ? parseFloat(row.exit_price) : undefined,
      exitTimestamp: row.exit_timestamp ? parseInt(row.exit_timestamp) : undefined,
      pnl: row.pnl ? parseFloat(row.pnl) : undefined,
      pnlPercent: row.pnl_percent ? parseFloat(row.pnl_percent) : undefined,
      status: row.status,
      orderIds: row.order_ids,
      signal: row.signal_data,
      notes: row.notes,
      strategyType: row.strategy_type,
      executionType: row.execution_type,
      tags: Array.isArray(row.tags) && row.tags[0] !== null ? row.tags : []
    };
  }
}

// Instancia para uso en toda la aplicación
export const tradeRepository = new TradeRepository();
