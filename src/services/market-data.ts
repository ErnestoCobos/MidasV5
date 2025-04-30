import { logger } from '../utils/logging';
import { binanceService } from './binance';
import { TechnicalIndicators, Candle } from '../utils/indicators';

// Interfaz para datos de mercado mejorados
export interface MarketData {
  price: number;
  volume24h: number;
  sentiment: number;
  technicals?: {
    rsi?: number;
    ema_cross?: string;
    volume_ratio?: number;
    bband_percent?: number;
    supports?: number[];
    resistances?: number[];
  };
}

// Servicio para obtener y procesar datos de mercado
export class MarketDataService {
  private candles: Map<string, Candle[]> = new Map(); // Caché de velas por par
  
  constructor() {
    logger.info('Market data service initialized');
  }
  
  /**
   * Obtiene datos de mercado mejorados, incluyendo análisis técnico
   * @param symbol El par de trading (e.g. 'BTCUSDT')
   * @param interval El intervalo para datos históricos (e.g. '5m')
   * @returns Datos de mercado completos
   */
  async getEnhancedMarketData(symbol: string, interval = '5m'): Promise<MarketData> {
    try {
      // 1. Obtener datos de precio actual (ticker)
      const ticker = await binanceService.getTicker24H(symbol);
      
      if (!ticker) {
        throw new Error(`No se pudieron obtener datos del ticker para ${symbol}`);
      }
      
      // 2. Establecer valores por defecto para indicadores técnicos
      let rsi = 50;
      let emaCross = "neutral";
      let volumeRatio = 1.0;
      let bbandPercent = 0.5;
      let supports: number[] = [];
      let resistances: number[] = [];
      
      // 3. Obtener datos históricos para cálculo de indicadores
      try {
        const candles = await binanceService.getHistoricalCandles(symbol, interval, 100);
        
        if (candles.length > 0) {
          // Guardar para futuras referencias
          this.candles.set(symbol, candles);
          
          // Calcular indicadores técnicos
          rsi = TechnicalIndicators.calculateRSI(candles);
          emaCross = TechnicalIndicators.calculateEMACross(candles);
          volumeRatio = TechnicalIndicators.calculateVolumeRatio(candles);
          
          const bbands = TechnicalIndicators.calculateBollingerBands(candles);
          bbandPercent = bbands.percent;
          
          supports = TechnicalIndicators.findSupportLevels(candles, 3);
          resistances = TechnicalIndicators.findResistanceLevels(candles, 3);
        }
      } catch (innerError: any) {
        logger.warn({
          symbol,
          interval,
          error: innerError.message
        }, 'Error obteniendo datos históricos para indicadores técnicos');
        logger.info('Usando valores técnicos por defecto');
      }
      
      // 4. Construir objeto de datos de mercado
      return {
        price: Number(ticker.lastPrice),
        volume24h: Number(ticker.quoteVolume),
        sentiment: 0, // Se llenará después con LunarCrush
        technicals: {
          rsi,
          ema_cross: emaCross,
          volume_ratio: volumeRatio,
          bband_percent: bbandPercent,
          supports,
          resistances
        }
      };
    } catch (error: any) {
      logger.error({ 
        symbol, 
        interval, 
        error: error.message 
      }, 'Error obteniendo datos de mercado mejorados');
      
      // Devolver estructura mínima en caso de error
      return {
        price: 0,
        volume24h: 0,
        sentiment: 0
      };
    }
  }
  
  /**
   * Filtra una señal de trading basada en criterios técnicos
   * @param symbol Par de trading
   * @param action Acción propuesta ('BUY', 'SELL', 'HOLD')
   * @returns true si pasa todos los filtros técnicos
   */
  async passesTechnicalFilters(symbol: string, action: 'BUY' | 'SELL' | 'HOLD'): Promise<boolean> {
    try {
      // Obtener datos de mercado actualizados si no hay candles en caché
      if (!this.candles.has(symbol)) {
        await this.getEnhancedMarketData(symbol);
      }
      
      const candles = this.candles.get(symbol);
      if (!candles || candles.length === 0) {
        logger.warn(`No hay datos históricos para ${symbol}, no se pueden aplicar filtros técnicos`);
        return false;
      }
      
      // Calcular indicadores técnicos
      const rsi = TechnicalIndicators.calculateRSI(candles);
      const volumeRatio = TechnicalIndicators.calculateVolumeRatio(candles);
      const bbands = TechnicalIndicators.calculateBollingerBands(candles);
      
      // Aplicar filtros según tipo de orden
      if (action === 'BUY') {
        // Para compras verificamos
        // - RSI no debe estar en sobrecompra (>70)
        // - Volumen debe ser suficiente
        // - No debe estar en techo de Bollinger
        if (rsi > 80) {
          logger.info({ symbol, rsi }, 'Orden de compra descartada por RSI en sobrecompra');
          return false;
        }
        
        if (volumeRatio < 0.7) {
          logger.info({ symbol, volumeRatio }, 'Orden de compra descartada por volumen insuficiente');
          return false;
        }
        
        if (bbands.percent > 0.9) {
          logger.info({ symbol, bbPercent: bbands.percent }, 'Orden de compra descartada por estar en techo de BB');
          return false;
        }
        
      } else if (action === 'SELL') {
        // Para ventas verificamos
        // - RSI no debe estar en sobreventa (<30)
        // - No debe estar en suelo de Bollinger
        if (rsi < 20) {
          logger.info({ symbol, rsi }, 'Orden de venta descartada por RSI en sobreventa');
          return false;
        }
        
        if (bbands.percent < 0.1) {
          logger.info({ symbol, bbPercent: bbands.percent }, 'Orden de venta descartada por estar en suelo de BB');
          return false;
        }
      }
      
      // Si llega aquí, pasa todos los filtros
      return true;
      
    } catch (error: any) {
      logger.error({ symbol, action, error: error.message }, 'Error aplicando filtros técnicos');
      // En caso de error, mejor no permitir la operación
      return false;
    }
  }
  
  /**
   * Obtiene datos de candles más recientes y actualiza el caché interno
   * @param symbol Par de trading
   * @param interval Intervalo temporal
   * @param limit Número de velas a obtener
   */
  async refreshCandles(symbol: string, interval = '5m', limit = 100): Promise<void> {
    try {
      const freshCandles = await binanceService.getHistoricalCandles(symbol, interval, limit);
      if (freshCandles.length > 0) {
        this.candles.set(symbol, freshCandles);
        logger.debug({ symbol, count: freshCandles.length }, 'Candles actualizados correctamente');
      }
    } catch (error: any) {
      logger.error({ symbol, interval, error: error.message }, 'Error actualizando candles');
    }
  }
}

// Instancia global del servicio de datos de mercado
export const marketDataService = new MarketDataService();
