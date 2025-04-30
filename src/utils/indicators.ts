import { RSI, EMA, BollingerBands, SMA } from 'technicalindicators';
import { logger } from './logging';

// Tipos para datos de candlestick
export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

// Clase para manejar cálculos de indicadores técnicos
export class TechnicalIndicators {
  // Calcular RSI (Relative Strength Index)
  static calculateRSI(candles: Candle[], period = 14): number {
    try {
      const closes = candles.map(candle => candle.close);
      
      const rsiValues = RSI.calculate({
        values: closes,
        period: period
      });
      
      // Devolver el valor más reciente
      return rsiValues.pop() ?? 50; // Valor por defecto 50 (neutral) si no hay suficientes datos
    } catch (error) {
      logger.error({ error }, 'Error calculando RSI');
      return 50; // Valor neutral en caso de error
    }
  }
  
  // Calcular EMA (Exponential Moving Average)
  static calculateEMA(candles: Candle[], period = 20): number {
    try {
      const closes = candles.map(candle => candle.close);
      
      const emaValues = EMA.calculate({
        values: closes,
        period: period
      });
      
      return emaValues.pop() ?? closes[closes.length - 1]; 
    } catch (error) {
      logger.error({ error }, 'Error calculando EMA');
      return candles[candles.length - 1].close; // Último precio en caso de error
    }
  }
  
  // Calcular EMA Cross (comparación de EMAs de diferente período)
  static calculateEMACross(candles: Candle[]): 'bullish' | 'bearish' | 'neutral' {
    try {
      const closes = candles.map(candle => candle.close);
      
      // Calcular EMA de período corto (20)
      const shortEMA = EMA.calculate({
        values: closes,
        period: 20
      });
      
      // Calcular EMA de período largo (50)
      const longEMA = EMA.calculate({
        values: closes,
        period: 50
      });
      
      // Obtener los valores más recientes
      const lastShortEMA = shortEMA.pop();
      const lastLongEMA = longEMA.pop();
      
      if (!lastShortEMA || !lastLongEMA) {
        return 'neutral';
      }
      
      // Determinar tendencia
      if (lastShortEMA > lastLongEMA) {
        return 'bullish';
      } else if (lastShortEMA < lastLongEMA) {
        return 'bearish';
      } else {
        return 'neutral';
      }
    } catch (error) {
      logger.error({ error }, 'Error calculando EMA Cross');
      return 'neutral';
    }
  }
  
  // Calcular Bollinger Bands
  static calculateBollingerBands(candles: Candle[], period = 20, stdDev = 2): {
    upper: number;
    middle: number;
    lower: number;
    percent: number;
  } {
    try {
      const closes = candles.map(candle => candle.close);
      const currentPrice = closes[closes.length - 1];
      
      const bbResults = BollingerBands.calculate({
        values: closes,
        period: period,
        stdDev: stdDev
      });
      
      const lastBB = bbResults.pop();
      
      if (!lastBB) {
        return {
          upper: currentPrice * 1.02,
          middle: currentPrice,
          lower: currentPrice * 0.98,
          percent: 0.5
        };
      }
      
      // Calcular %B (posición en la banda)
      // %B = (price - lower) / (upper - lower)
      const percentB = (currentPrice - lastBB.lower) / (lastBB.upper - lastBB.lower);
      
      return {
        upper: lastBB.upper,
        middle: lastBB.middle,
        lower: lastBB.lower,
        percent: percentB
      };
    } catch (error) {
      logger.error({ error }, 'Error calculando Bollinger Bands');
      const currentPrice = candles[candles.length - 1].close;
      
      return {
        upper: currentPrice * 1.02,
        middle: currentPrice,
        lower: currentPrice * 0.98,
        percent: 0.5
      };
    }
  }
  
  // Calcular relación de volumen (volumen actual vs promedio)
  static calculateVolumeRatio(candles: Candle[], lookbackPeriod = 20): number {
    try {
      const volumes = candles.map(candle => candle.volume);
      
      // Volumen actual
      const currentVolume = volumes[volumes.length - 1];
      
      // Volumen promedio (excluyendo el más reciente)
      const historicalVolumes = volumes.slice(-lookbackPeriod - 1, -1);
      const avgVolume = historicalVolumes.reduce((sum, vol) => sum + vol, 0) / historicalVolumes.length;
      
      return currentVolume / avgVolume;
    } catch (error) {
      logger.error({ error }, 'Error calculando ratio de volumen');
      return 1.0; // Valor neutral
    }
  }
  
  // Encontrar niveles de soporte
  static findSupportLevels(candles: Candle[], count = 3): number[] {
    try {
      const lows = candles.map(candle => candle.low);
      const supports: number[] = [];
      
      // Buscar mínimos locales
      for (let i = 5; i < lows.length - 5; i++) {
        const window = lows.slice(i - 5, i + 6);
        if (Math.min(...window) === lows[i]) {
          supports.push(lows[i]);
        }
      }
      
      // Ordenar y devolver los soportes más cercanos al precio actual
      const currentPrice = candles[candles.length - 1].close;
      return supports
        .filter(support => support < currentPrice) // Solo soportes por debajo del precio actual
        .sort((a, b) => b - a) // Ordenar de mayor a menor (más cercano primero)
        .slice(0, count);
    } catch (error) {
      logger.error({ error }, 'Error encontrando niveles de soporte');
      return [];
    }
  }
  
  // Encontrar niveles de resistencia
  static findResistanceLevels(candles: Candle[], count = 3): number[] {
    try {
      const highs = candles.map(candle => candle.high);
      const resistances: number[] = [];
      
      // Buscar máximos locales
      for (let i = 5; i < highs.length - 5; i++) {
        const window = highs.slice(i - 5, i + 6);
        if (Math.max(...window) === highs[i]) {
          resistances.push(highs[i]);
        }
      }
      
      // Ordenar y devolver las resistencias más cercanas al precio actual
      const currentPrice = candles[candles.length - 1].close;
      return resistances
        .filter(resistance => resistance > currentPrice) // Solo resistencias por encima del precio actual
        .sort((a, b) => a - b) // Ordenar de menor a mayor (más cercano primero)
        .slice(0, count);
    } catch (error) {
      logger.error({ error }, 'Error encontrando niveles de resistencia');
      return [];
    }
  }
}
