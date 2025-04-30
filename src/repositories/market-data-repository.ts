import { db } from '../services/database';
import { logger } from '../utils/logging';
import { env } from '../utils/env';
import { QueryResult } from 'pg';

/**
 * Interfaz para velas OHLCV
 */
export interface Candle {
  symbol: string;
  time: Date;
  timeframe: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades?: number;
}

/**
 * Interfaz para datos de sentimiento
 */
export interface SentimentData {
  symbol: string;
  time: Date;
  galaxyScore: number;
  altRank?: number;
  socialVolume?: number;
  metrics?: Record<string, any>;
}

/**
 * Interfaz para indicadores técnicos
 */
export interface TechnicalIndicators {
  symbol: string;
  time: Date;
  timeframe: string;
  indicators: Record<string, any>;
}

/**
 * Repositorio para persistencia y consulta de datos de mercado
 */
export class MarketDataRepository {
  
  /**
   * Crea las tablas necesarias para datos de mercado si no existen
   */
  async createTables(): Promise<void> {
    try {
      logger.info('Creando tablas para datos de mercado...');
      
      // Verificar si TimescaleDB está disponible
      const hasTimescaleDB = await db.hasTimescaleDB();
      
      // Crear tabla para velas (datos OHLCV)
      await db.query(`
        CREATE TABLE IF NOT EXISTS market_data_candles (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          symbol VARCHAR(20) NOT NULL,
          time TIMESTAMPTZ NOT NULL,
          timeframe VARCHAR(5) NOT NULL,
          open DECIMAL(18, 8) NOT NULL,
          high DECIMAL(18, 8) NOT NULL,
          low DECIMAL(18, 8) NOT NULL,
          close DECIMAL(18, 8) NOT NULL,
          volume DECIMAL(24, 8) NOT NULL,
          trades_count INTEGER,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(symbol, time, timeframe)
        );
        
        -- Crear índices para búsquedas comunes
        CREATE INDEX IF NOT EXISTS idx_market_data_symbol ON market_data_candles(symbol);
        CREATE INDEX IF NOT EXISTS idx_market_data_time ON market_data_candles(time);
        CREATE INDEX IF NOT EXISTS idx_market_data_timeframe ON market_data_candles(timeframe);
        CREATE INDEX IF NOT EXISTS idx_market_data_symbol_time ON market_data_candles(symbol, time);
      `);
      
      // Crear tabla para sentimiento de mercado
      await db.query(`
        CREATE TABLE IF NOT EXISTS market_sentiment (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          symbol VARCHAR(20) NOT NULL,
          time TIMESTAMPTZ NOT NULL,
          galaxy_score DECIMAL(10, 2),
          alt_rank INTEGER,
          social_volume DECIMAL(20, 2),
          metrics JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(symbol, time)
        );
        
        CREATE INDEX IF NOT EXISTS idx_sentiment_symbol ON market_sentiment(symbol);
        CREATE INDEX IF NOT EXISTS idx_sentiment_time ON market_sentiment(time);
        CREATE INDEX IF NOT EXISTS idx_sentiment_symbol_time ON market_sentiment(symbol, time);
      `);
      
      // Crear tabla para indicadores calculados
      await db.query(`
        CREATE TABLE IF NOT EXISTS calculated_indicators (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          symbol VARCHAR(20) NOT NULL,
          time TIMESTAMPTZ NOT NULL,
          timeframe VARCHAR(5) NOT NULL,
          indicators JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(symbol, time, timeframe)
        );
        
        CREATE INDEX IF NOT EXISTS idx_indicators_symbol_time ON calculated_indicators(symbol, time);
        CREATE INDEX IF NOT EXISTS idx_indicators_timeframe ON calculated_indicators(timeframe);
      `);
      
      // Configurar TimescaleDB si está disponible
      if (hasTimescaleDB && env.USE_TIMESCALE) {
        try {
          // Configurar hypertables para TimescaleDB
          await db.query(`
            -- Convertir tabla de velas a hypertable
            SELECT create_hypertable('market_data_candles', 'time', 
              if_not_exists => TRUE, 
              chunk_time_interval => INTERVAL '${env.TIMESCALE_CHUNK_INTERVAL_DAYS} day'
            );
          `);
          
          // Hypertable para sentimiento
          await db.query(`
            SELECT create_hypertable('market_sentiment', 'time', 
              if_not_exists => TRUE, 
              chunk_time_interval => INTERVAL '${env.TIMESCALE_CHUNK_INTERVAL_DAYS} day'
            );
          `);
          
          // Hypertable para indicadores
          await db.query(`
            SELECT create_hypertable('calculated_indicators', 'time', 
              if_not_exists => TRUE, 
              chunk_time_interval => INTERVAL '${env.TIMESCALE_CHUNK_INTERVAL_DAYS} day'
            );
          `);
          
          // Configurar políticas de compresión para datos antiguos
          await db.query(`
            -- Política de compresión para datos antiguos
            SELECT add_compression_policy('market_data_candles', 
              INTERVAL '${env.TIMESCALE_COMPRESSION_AFTER_DAYS} days', 
              if_not_exists => TRUE
            );
            
            SELECT add_compression_policy('market_sentiment', 
              INTERVAL '${env.TIMESCALE_COMPRESSION_AFTER_DAYS} days', 
              if_not_exists => TRUE
            );
            
            SELECT add_compression_policy('calculated_indicators', 
              INTERVAL '${env.TIMESCALE_COMPRESSION_AFTER_DAYS} days', 
              if_not_exists => TRUE
            );
          `);
          
          logger.info('TimescaleDB configurado correctamente para datos de mercado');
        } catch (error) {
          logger.warn({ error }, 'Error configurando TimescaleDB. Las tablas se usarán como PostgreSQL estándar');
        }
      } else if (env.USE_TIMESCALE) {
        logger.warn('TimescaleDB solicitado pero no disponible. Las tablas se usarán como PostgreSQL estándar');
      }
      
      logger.info('Tablas para datos de mercado creadas correctamente');
    } catch (error) {
      logger.error({ error }, 'Error creando tablas para datos de mercado');
      throw error;
    }
  }
  
  /**
   * Guarda velas en la base de datos
   */
  async saveCandles(candles: Candle[]): Promise<void> {
    if (!candles.length) return;
    
    try {
      logger.debug({ count: candles.length, symbol: candles[0].symbol }, 'Guardando velas en base de datos');
      
      // Usar transacción para inserciones en lote
      await db.transaction(async (client) => {
        for (const candle of candles) {
          await client.query(`
            INSERT INTO market_data_candles 
              (symbol, time, timeframe, open, high, low, close, volume, trades_count)
            VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (symbol, time, timeframe) 
            DO UPDATE SET
              open = $4,
              high = $5,
              low = $6,
              close = $7,
              volume = $8,
              trades_count = $9
          `, [
            candle.symbol,
            candle.time,
            candle.timeframe,
            candle.open,
            candle.high,
            candle.low,
            candle.close,
            candle.volume,
            candle.trades || null
          ]);
        }
      });
      
      logger.info({ count: candles.length, symbol: candles[0].symbol }, 'Velas guardadas correctamente');
    } catch (error) {
      logger.error({ error, count: candles.length }, 'Error guardando velas en la base de datos');
      throw error;
    }
  }
  
  /**
   * Obtiene velas históricas
   */
  async getCandles(
    symbol: string, 
    timeframe: string, 
    limit: number = 100, 
    endTime?: Date
  ): Promise<Candle[]> {
    try {
      const params: any[] = [symbol, timeframe, limit];
      let timeCondition = '';
      
      if (endTime) {
        timeCondition = 'AND time <= $4';
        params.push(endTime);
      }
      
      const result = await db.query(`
        SELECT 
          symbol, 
          time, 
          timeframe, 
          open, 
          high, 
          low, 
          close, 
          volume,
          trades_count
        FROM market_data_candles
        WHERE symbol = $1 AND timeframe = $2 ${timeCondition}
        ORDER BY time DESC
        LIMIT $3
      `, params);
      
      // Mapear resultados a objetos Candle y devolver en orden cronológico
      return result.rows.map(row => ({
        symbol: row.symbol,
        time: row.time,
        timeframe: row.timeframe,
        open: parseFloat(row.open),
        high: parseFloat(row.high),
        low: parseFloat(row.low),
        close: parseFloat(row.close),
        volume: parseFloat(row.volume),
        trades: row.trades_count
      })).reverse();
    } catch (error) {
      logger.error({ error, symbol, timeframe }, 'Error obteniendo velas de la base de datos');
      return [];
    }
  }
  
  /**
   * Guarda datos de sentimiento
   */
  async saveSentiment(sentiment: SentimentData): Promise<void> {
    try {
      await db.query(`
        INSERT INTO market_sentiment
          (symbol, time, galaxy_score, alt_rank, social_volume, metrics)
        VALUES
          ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (symbol, time)
        DO UPDATE SET
          galaxy_score = $3,
          alt_rank = $4,
          social_volume = $5,
          metrics = $6
      `, [
        sentiment.symbol,
        sentiment.time,
        sentiment.galaxyScore,
        sentiment.altRank || null,
        sentiment.socialVolume || null,
        sentiment.metrics ? JSON.stringify(sentiment.metrics) : null
      ]);
      
      logger.debug({ symbol: sentiment.symbol }, 'Datos de sentimiento guardados');
    } catch (error) {
      logger.error({ error, symbol: sentiment.symbol }, 'Error guardando datos de sentimiento');
      throw error;
    }
  }
  
  /**
   * Obtiene el último sentimiento para un símbolo
   */
  async getLatestSentiment(symbol: string): Promise<SentimentData | null> {
    try {
      const result = await db.query(`
        SELECT 
          symbol, 
          time, 
          galaxy_score, 
          alt_rank, 
          social_volume, 
          metrics
        FROM market_sentiment
        WHERE symbol = $1
        ORDER BY time DESC
        LIMIT 1
      `, [symbol]);
      
      if (result.rowCount === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        symbol: row.symbol,
        time: row.time,
        galaxyScore: parseFloat(row.galaxy_score),
        altRank: row.alt_rank,
        socialVolume: parseFloat(row.social_volume),
        metrics: row.metrics
      };
    } catch (error) {
      logger.error({ error, symbol }, 'Error obteniendo sentimiento de la base de datos');
      return null;
    }
  }
  
  /**
   * Guarda indicadores técnicos calculados
   */
  async saveIndicators(data: TechnicalIndicators): Promise<void> {
    try {
      await db.query(`
        INSERT INTO calculated_indicators
          (symbol, time, timeframe, indicators)
        VALUES
          ($1, $2, $3, $4)
        ON CONFLICT (symbol, time, timeframe)
        DO UPDATE SET
          indicators = $4
      `, [
        data.symbol,
        data.time,
        data.timeframe,
        JSON.stringify(data.indicators)
      ]);
      
      logger.debug({ symbol: data.symbol, timeframe: data.timeframe }, 'Indicadores técnicos guardados');
    } catch (error) {
      logger.error({ error, symbol: data.symbol }, 'Error guardando indicadores técnicos');
      throw error;
    }
  }
  
  /**
   * Obtiene indicadores técnicos guardados
   */
  async getIndicators(
    symbol: string, 
    timeframe: string, 
    limit: number = 1
  ): Promise<TechnicalIndicators[]> {
    try {
      const result = await db.query(`
        SELECT symbol, time, timeframe, indicators
        FROM calculated_indicators
        WHERE symbol = $1 AND timeframe = $2
        ORDER BY time DESC
        LIMIT $3
      `, [symbol, timeframe, limit]);
      
      return result.rows.map(row => ({
        symbol: row.symbol,
        time: row.time,
        timeframe: row.timeframe,
        indicators: row.indicators
      }));
    } catch (error) {
      logger.error({ error, symbol, timeframe }, 'Error obteniendo indicadores técnicos');
      return [];
    }
  }
  
  /**
   * Calcula estadísticas de mercado utilizando funciones de TimescaleDB
   */
  async getMarketStats(
    symbol: string, 
    timeframe: string, 
    days: number = 30
  ): Promise<any> {
    try {
      // Comprobar si TimescaleDB está disponible
      const hasTimescaleDB = await db.hasTimescaleDB();
      
      if (hasTimescaleDB && env.USE_TIMESCALE) {
        // Consulta con funciones de TimescaleDB
        const result = await db.query(`
          SELECT 
            time_bucket('1 day', time) AS day,
            first(open, time) AS open,
            max(high) AS high,
            min(low) AS low,
            last(close, time) AS close,
            sum(volume) AS volume,
            (last(close, time) - first(open, time)) / first(open, time) * 100 AS daily_change
          FROM market_data_candles
          WHERE 
            symbol = $1 AND 
            timeframe = $2 AND 
            time > NOW() - INTERVAL '${days} days'
          GROUP BY day
          ORDER BY day DESC
        `, [symbol, timeframe]);
        
        return result.rows;
      } else {
        // Consulta estándar para PostgreSQL sin TimescaleDB
        const result = await db.query(`
          WITH daily_data AS (
            SELECT 
              DATE_TRUNC('day', time) AS day,
              FIRST_VALUE(open) OVER (PARTITION BY DATE_TRUNC('day', time) ORDER BY time) AS day_open,
              MAX(high) AS day_high,
              MIN(low) AS day_low,
              LAST_VALUE(close) OVER (PARTITION BY DATE_TRUNC('day', time) ORDER BY time) AS day_close,
              SUM(volume) AS day_volume
            FROM market_data_candles
            WHERE 
              symbol = $1 AND 
              timeframe = $2 AND 
              time > NOW() - INTERVAL '${days} days'
          )
          SELECT 
            day,
            day_open AS open,
            day_high AS high,
            day_low AS low,
            day_close AS close,
            day_volume AS volume,
            (day_close - day_open) / day_open * 100 AS daily_change
          FROM daily_data
          GROUP BY day, day_open, day_high, day_low, day_close, day_volume
          ORDER BY day DESC
        `, [symbol, timeframe]);
        
        return result.rows;
      }
    } catch (error) {
      logger.error({ error, symbol, timeframe }, 'Error obteniendo estadísticas de mercado');
      return [];
    }
  }
  
  /**
   * Calcula la volatilidad del mercado
   */
  async getVolatility(
    symbol: string, 
    timeframe: string, 
    days: number = 30
  ): Promise<any> {
    try {
      const result = await db.query(`
        WITH daily_ranges AS (
          SELECT 
            DATE_TRUNC('day', time) AS day,
            (MAX(high) - MIN(low)) / AVG(close) * 100 AS daily_range_percent
          FROM market_data_candles
          WHERE 
            symbol = $1 AND 
            timeframe = $2 AND 
            time > NOW() - INTERVAL '${days} days'
          GROUP BY day
        )
        SELECT 
          AVG(daily_range_percent) AS avg_volatility,
          STDDEV(daily_range_percent) AS stddev_volatility,
          MAX(daily_range_percent) AS max_volatility,
          MIN(daily_range_percent) AS min_volatility
        FROM daily_ranges
      `, [symbol, timeframe]);
      
      return result.rows[0] || {
        avg_volatility: 0,
        stddev_volatility: 0,
        max_volatility: 0,
        min_volatility: 0
      };
    } catch (error) {
      logger.error({ error, symbol, timeframe }, 'Error calculando volatilidad');
      return {
        avg_volatility: 0,
        stddev_volatility: 0,
        max_volatility: 0,
        min_volatility: 0
      };
    }
  }
  
  /**
   * Limpia datos antiguos para ahorrar espacio
   */
  async cleanupOldData(daysToKeep: number = 365): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      await db.transaction(async (client) => {
        // Eliminar datos antiguos
        await client.query(`
          DELETE FROM market_data_candles WHERE time < $1
        `, [cutoffDate]);
        
        await client.query(`
          DELETE FROM market_sentiment WHERE time < $1
        `, [cutoffDate]);
        
        await client.query(`
          DELETE FROM calculated_indicators WHERE time < $1
        `, [cutoffDate]);
      });
      
      logger.info({ daysToKeep }, 'Limpieza de datos antiguos completada');
    } catch (error) {
      logger.error({ error }, 'Error limpiando datos antiguos');
      throw error;
    }
  }
}

// Instancia para uso en toda la aplicación
export const marketDataRepository = new MarketDataRepository();
