import { binanceService } from './binance';
import { TechnicalIndicators } from '../utils/indicators';
import { lunarCrushService } from './lunarcrush';
import { logger } from '../utils/logging';
import NodeCache from 'node-cache';

/**
 * Interfaz para datos de mercado
 */
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

/**
 * Servicio para obtener y combinar datos de mercado de diferentes fuentes
 * Proporciona información técnica y de sentimiento enriquecida
 */
export class MarketDataService {
  private readonly cache: NodeCache;
  
  constructor() {
    // Caché para datos de mercado (30 minutos TTL)
    this.cache = new NodeCache({ stdTTL: 30 * 60 });
    logger.info('Market data service initialized');
  }
  
  /**
   * Obtiene datos de mercado enriquecidos con indicadores técnicos y sentimiento
   * @param symbol Par de trading (e.g. 'BTCUSDT')
   * @returns Datos mejorados con indicadores y valores técnicos
   */
  async getEnhancedMarketData(symbol: string): Promise<MarketData> {
    // Clave única para este símbolo
    const cacheKey = `emd_${symbol}`;
    
    // Verificar caché
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug({ symbol }, 'Using cached market data');
      return cached as any;
    }
    
    try {
      logger.info({ symbol }, 'Getting enhanced market data');
      
      // 1. Obtener datos básicos de precio
      const ticker = await binanceService.getTicker24H(symbol);
      const price = parseFloat(ticker.lastPrice);
      const volume24h = parseFloat(ticker.volume);
      
      // 2. Obtener velas para cálculos técnicos
      const candles = await binanceService.getHistoricalCandles(symbol, '15m', 96);
      
      // 3. Calcular indicadores técnicos
      const technicals: any = {};
      
      // Solo calcular si hay suficientes datos
      if (candles.length >= 14) {
        technicals.rsi = TechnicalIndicators.calculateRSI(candles);
        technicals.ema_cross = TechnicalIndicators.calculateEMACross(candles);
        technicals.volume_ratio = TechnicalIndicators.calculateVolumeRatio(candles);
        
        // Bollinger Bands
        const bbands = TechnicalIndicators.calculateBollingerBands(candles);
        technicals.bband_percent = bbands.percent;
        
        // Niveles de soporte y resistencia
        technicals.supports = TechnicalIndicators.findSupportLevels(candles, 3);
        technicals.resistances = TechnicalIndicators.findResistanceLevels(candles, 3);
      }
      
      // 4. Obtener sentimiento social
      let sentiment = 50; // Valor neutral por defecto
      
      try {
        const baseAsset = symbol.replace('USDT', '');
        sentiment = await lunarCrushService.galaxyScore(baseAsset) || 50;
      } catch (error) {
        logger.debug({ symbol, error }, 'Error getting Galaxy Score');
      }
      
      // 5. Combinar datos
      const result = {
        price,
        volume24h,
        sentiment,
        technicals
      };
      
      // Guardar en caché
      this.cache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      logger.error({ symbol, error }, 'Error getting enhanced market data');
      
      // Devolver datos mínimos en caso de error
      return {
        price: 0,
        volume24h: 0,
        sentiment: 50
      };
    }
  }
  
  /**
   * Obtiene un resumen del mercado global
   * @returns Estado general del mercado (bearish, neutral, bullish)
   */
  async getMarketSummary(): Promise<{
    status: 'bearish' | 'neutral' | 'bullish';
    btcDominance: number;
    top5Performance: {symbol: string, change: number}[];
    averageSentiment: number;
  }> {
    // Clave de caché
    const cacheKey = 'market_summary';
    
    // Verificar caché
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached as any;
    }
    
    try {
      // Lista de principales criptos para analizar
      const mainCoins = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];
      const performances: {symbol: string, change: number}[] = [];
      let totalSentiment = 0;
      let totalCoins = 0;
      
      // Obtener rendimiento de las principales
      for (const symbol of mainCoins) {
        try {
          const candles = await binanceService.getHistoricalCandles(symbol, '1d', 2);
          if (candles.length >= 2) {
            const yesterdayClose = candles[0].close;
            const todayClose = candles[candles.length - 1].close;
            const percentChange = (todayClose / yesterdayClose - 1) * 100;
            
            performances.push({
              symbol: symbol.replace('USDT', ''),
              change: percentChange
            });
            
            // Obtener sentimiento
            try {
              const baseAsset = symbol.replace('USDT', '');
              const sentiment = await lunarCrushService.galaxyScore(baseAsset);
              if (sentiment) {
                totalSentiment += sentiment;
                totalCoins++;
              }
            } catch (error) {
              // Ignorar errores individuales
            }
          }
        } catch (error) {
          // Ignorar errores individuales
        }
      }
      
      // Calcular promedio de sentimiento
      const averageSentiment = totalCoins > 0 ? totalSentiment / totalCoins : 50;
      
      // Ordenar por rendimiento
      performances.sort((a, b) => b.change - a.change);
      
      // Calcular dominancia de BTC
      let btcDominance = 50; // Valor por defecto
      try {
        // Intentar obtener dominancia de BTC (en un entorno real esto vendría de una API)
        const btcInfo = await this.getEnhancedMarketData('BTCUSDT');
        // Esta es una aproximación simplificada
        btcDominance = btcInfo.technicals?.rsi || 50;
      } catch (error) {
        // Usar valor por defecto
      }
      
      // Determinar estado del mercado
      let status: 'bearish' | 'neutral' | 'bullish' = 'neutral';
      
      // Contar positivos vs negativos
      const positiveChanges = performances.filter(p => p.change > 0).length;
      const negativeChanges = performances.filter(p => p.change < 0).length;
      
      if (positiveChanges >= 4) {
        status = 'bullish';
      } else if (negativeChanges >= 4) {
        status = 'bearish';
      } else if (averageSentiment > 70) {
        status = 'bullish';
      } else if (averageSentiment < 30) {
        status = 'bearish';
      }
      
      // Resultado
      const result = {
        status,
        btcDominance,
        top5Performance: performances,
        averageSentiment
      };
      
      // Guardar en caché (caducidad de 30 minutos)
      this.cache.set(cacheKey, result, 30 * 60);
      
      return result;
    } catch (error) {
      logger.error({ error }, 'Error getting market summary');
      
      // Valores por defecto en caso de error
      return {
        status: 'neutral',
        btcDominance: 50,
        top5Performance: [],
        averageSentiment: 50
      };
    }
  }
}

// Crear instancia singleton para uso en toda la aplicación
export const marketDataService = new MarketDataService();
