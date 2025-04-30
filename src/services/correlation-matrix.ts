import { binanceService } from './binance';
import { correlationService } from './correlation';
import { logger } from '../utils/logging';
import NodeCache from 'node-cache';

/**
 * Extensión de la clase CorrelationService para cálculo y almacenamiento
 * de matrices de correlación completas entre múltiples activos
 */
class CorrelationMatrixService {
  private readonly cache: NodeCache;

  constructor() {
    // Cache for correlation matrices (1 hour TTL)
    this.cache = new NodeCache({ stdTTL: 60 * 60 });
    logger.info('Correlation matrix service initialized');
  }

  /**
   * Calcula una matriz completa de correlaciones entre múltiples símbolos
   * @param symbols Lista de símbolos a analizar (e.g. ['BTCUSDT', 'ETHUSDT'])
   * @param timeframe Intervalo de tiempo ('1d' por defecto)
   * @param days Número de días a analizar (30 por defecto)
   * @returns Mapa bidimensional con todas las correlaciones
   */
  async calculateCorrelationMatrix(
    symbols: string[],
    timeframe: string = '1d',
    days: number = 30
  ): Promise<Map<string, Map<string, number>>> {
    // Crear clave única para este conjunto de parámetros
    const cacheKey = `corrMatrix_${symbols.sort().join('_')}_${timeframe}_${days}`;
    
    // Verificar caché
    const cached = this.cache.get<Map<string, Map<string, number>>>(cacheKey);
    if (cached) {
      logger.debug({ symbols: symbols.length }, 'Using cached correlation matrix');
      return cached;
    }
    
    // Crear matriz vacía
    const matrix = new Map<string, Map<string, number>>();
    
    try {
      logger.info({ symbols: symbols.length }, 'Calculating correlation matrix');
      
      // Inicializar mapa para cada símbolo
      for (const symbol of symbols) {
        matrix.set(symbol, new Map<string, number>());
      }
      
      // Obtener todos los precios históricos primero
      const priceData = new Map<string, number[]>();
      
      for (const symbol of symbols) {
        const candles = await binanceService.getHistoricalCandles(
          symbol, 
          timeframe, 
          Math.min(days, 1000)
        );
        
        if (candles.length >= 5) {
          priceData.set(symbol, candles.map(c => c.close));
        } else {
          logger.warn(`Insufficient data for ${symbol}, correlation may be inaccurate`);
          priceData.set(symbol, []);
        }
      }
      
      // Calcular correlaciones para cada par de símbolos
      for (let i = 0; i < symbols.length; i++) {
        const symbol1 = symbols[i];
        const prices1 = priceData.get(symbol1) || [];
        
        // Diagonal principal (autocorrelación = 1)
        matrix.get(symbol1)!.set(symbol1, 1);
        
        // Mitad inferior de la matriz (es simétrica)
        for (let j = i + 1; j < symbols.length; j++) {
          const symbol2 = symbols[j];
          const prices2 = priceData.get(symbol2) || [];
          
          let correlation = 0;
          
          if (prices1.length >= 5 && prices2.length >= 5) {
            // Usar el método de la clase principal para calcular la correlación
            // pero usando los datos ya obtenidos
            correlation = this.calculatePearsonCorrelation(prices1, prices2);
          }
          
          // Guardar en ambas direcciones (matriz simétrica)
          matrix.get(symbol1)!.set(symbol2, correlation);
          matrix.get(symbol2)!.set(symbol1, correlation);
        }
      }
      
      // Guardar en caché
      this.cache.set(cacheKey, matrix);
      
      logger.info({ 
        symbolCount: symbols.length,
        matrixSize: symbols.length * symbols.length
      }, 'Correlation matrix calculated');
      
      return matrix;
    } catch (error: any) {
      logger.error({ 
        error: error.message,
        symbolCount: symbols.length
      }, 'Error calculating correlation matrix');
      
      // Devolver matriz vacía en caso de error
      return new Map<string, Map<string, number>>();
    }
  }
  
  /**
   * Implementación del coeficiente de correlación de Pearson
   */
  private calculatePearsonCorrelation(prices1: number[], prices2: number[]): number {
    const n = Math.min(prices1.length, prices2.length);
    
    // Necesitamos al menos 5 puntos para un cálculo significativo
    if (n < 5) return 0;
    
    // Truncar a la misma longitud
    prices1 = prices1.slice(0, n);
    prices2 = prices2.slice(0, n);
    
    // Calcular medias
    const mean1 = prices1.reduce((sum, val) => sum + val, 0) / n;
    const mean2 = prices2.reduce((sum, val) => sum + val, 0) / n;
    
    // Calcular correlación
    let num = 0;
    let denom1 = 0;
    let denom2 = 0;
    
    for (let i = 0; i < n; i++) {
      const diff1 = prices1[i] - mean1;
      const diff2 = prices2[i] - mean2;
      
      num += diff1 * diff2;
      denom1 += diff1 * diff1;
      denom2 += diff2 * diff2;
    }
    
    // Evitar división por cero
    if (denom1 === 0 || denom2 === 0) return 0;
    
    return num / Math.sqrt(denom1 * denom2);
  }
}

// Crear instancia singleton
export const correlationMatrixService = new CorrelationMatrixService();
