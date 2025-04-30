import { binanceService } from './binance';
import { deepSeekService } from './deepseek';
import { TechnicalIndicators } from '../utils/indicators';
import { correlationService } from './correlation';
import { correlationMatrixService } from './correlation-matrix';
import { lunarCrushService } from './lunarcrush';
import { logger } from '../utils/logging';
import PQueue from 'p-queue';

/**
 * Representa una oportunidad de mercado detectada
 */
export interface MarketOpportunity {
  symbol: string;
  score: number;
  price: number;
  galaxyScore: number;
  rsi?: number;
  trend?: string;
  volatility?: number;
  potentialReturn?: number;
}

/**
 * Asignación de portafolio
 */
export interface PortfolioAllocation {
  symbol: string;
  allocation: number;
  percentage: number;
  correlation?: number;
}

/**
 * Servicio para escanear el mercado en busca de oportunidades
 */
export class MarketScannerService {
  private readonly DEFAULT_SYMBOLS = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 
    'AVAXUSDT', 'ADAUSDT', 'DOTUSDT', 'MATICUSDT',
    'LINKUSDT', 'ARBUSDT', 'NEARUSDT', 'OPUSDT'
  ];
  
  /**
   * Escanea el mercado en busca de oportunidades
   * @param growthFocus Si es true, prioriza crecimiento sobre seguridad
   * @param capital Capital disponible para invertir
   * @param topN Número de mejores oportunidades a devolver
   * @returns Lista de mejores oportunidades ordenadas por score
   */
  async scanMarket(
    growthFocus: boolean = true,
    capital: number = 100,
    topN: number = 5
  ): Promise<MarketOpportunity[]> {
    try {
      logger.info({
        growthFocus,
        capital,
        topN
      }, 'Escaneando mercado en busca de oportunidades');
      
      // Obtener lista de símbolos disponibles
      let symbols = this.DEFAULT_SYMBOLS;
      
      // Para un capital pequeño, nos centramos en activos con mayor volatilidad
      // ya que tienen mayor potencial de movimiento a corto plazo
      if (growthFocus && capital < 200) {
        // Si el enfoque es en crecimiento con capital pequeño, añadir algunos
        // tokens de mayor volatilidad que pueden ofrecer mayor retorno
        symbols = [
          'SOLUSDT', 'INJUSDT', 'APTUSDT', 'SUIUSDT', 'AVSUSDT',
          'ARBUSDT', 'OPUSDT', 'MATICUSDT', 'NEARUSDT', 'FTMUSDT',
          ...symbols
        ];
      }
      
      // Eliminar duplicados
      symbols = [...new Set(symbols)];
      
      // Crear una cola para procesar oportunidades en paralelo pero limitada
      const queue = new PQueue({ concurrency: 3 });
      
      // Procesar cada símbolo para calcular su puntuación
      const opportunitiesPromises = symbols.map(symbol => {
        return queue.add(async () => {
          try {
            // Obtener datos de precio
            const ticker = await binanceService.getTicker24H(symbol);
            const price = parseFloat(ticker.lastPrice);
            
            // Obtener candles para cálculos técnicos
            const candles = await binanceService.getHistoricalCandles(symbol, '15m', 96);
            
            if (candles.length === 0) {
              return null;
            }
            
            // Calcular RSI
            const rsi = TechnicalIndicators.calculateRSI(candles);
            
            // Calcular tendencia basada en cruce de EMAs
            const emaTrend = TechnicalIndicators.calculateEMACross(candles);
            
            // Calcular volatilidad (ATR)
            const volatility = TechnicalIndicators.calculateATR(candles);
            
            // Obtener Galaxy Score (sentimiento) si es posible
            const asset = symbol.replace('USDT', '');
            let galaxyScore = 50; // Default neutral
            
            try {
              galaxyScore = await lunarCrushService.galaxyScore(asset) || 50;
            } catch (error) {
              logger.debug({ asset, error }, 'Error obteniendo Galaxy Score');
            }
            
            // Calcular una puntuación combinada basada en técnicos y sentimiento
            let score = this.calculateOpportunityScore(
              rsi,
              emaTrend,
              volatility,
              galaxyScore,
              growthFocus
            );
            
            // Para enfoque en crecimiento, ajustar puntuación para favorecer volatilidad
            if (growthFocus) {
              // Bonus para activos con alta volatilidad y buen sentimiento
              const volatilityBonus = Math.min(volatility * 0.15, 0.2);
              score += volatilityBonus;
            }
            
            // Estimar retorno potencial basado en BBands o volatilidad
            const potentialReturn = this.estimatePotentialReturn(candles, volatility);
            
            return {
              symbol,
              score,
              price,
              galaxyScore,
              rsi,
              trend: emaTrend,
              volatility,
              potentialReturn
            };
          } catch (error) {
            logger.error({ symbol, error }, 'Error procesando símbolo');
            return null;
          }
        });
      });
      
      // Esperar a que todas las promesas se resuelvan
      const opportunities = (await Promise.all(opportunitiesPromises))
        .filter(Boolean) // Eliminar nulos
        .sort((a, b) => b!.score - a!.score) // Ordenar por puntuación descendente
        .slice(0, topN); // Tomar los top N
      
      logger.info({
        opportunitiesCount: opportunities.length,
        topOpportunity: opportunities[0]?.symbol || 'Ninguna'
      }, 'Escaneo de mercado completado');
      
      return opportunities as MarketOpportunity[];
    } catch (error) {
      logger.error({ error }, 'Error escaneando mercado');
      return [];
    }
  }
  
  /**
   * Calcula una puntuación para una oportunidad de mercado
   * basada en indicadores técnicos y sentimiento
   */
  private calculateOpportunityScore(
    rsi: number,
    trend: string,
    volatility: number,
    galaxyScore: number,
    growthFocus: boolean
  ): number {
    // Base mínima
    let score = 0.1;
    
    // 1. RSI: Sobreventa = buena oportunidad, sobrecompra = mala
    if (rsi <= 30) {
      score += 0.25; // Fuerte sobreventa
    } else if (rsi <= 40) {
      score += 0.15; // Moderada sobreventa
    } else if (rsi >= 70) {
      score -= 0.15; // Sobrecompra
    }
    
    // 2. Tendencia
    if (trend === 'bullish') {
      score += 0.2;
    } else if (trend === 'very_bullish') {
      score += 0.3;
    } else if (trend === 'bearish') {
      score -= 0.15;
    } else if (trend === 'very_bearish') {
      score -= 0.25;
    }
    
    // 3. Galaxy Score (sentimiento)
    // Normalizar de 0-100 a 0-0.3
    const sentimentScore = (galaxyScore / 100) * 0.3;
    score += sentimentScore;
    
    // 4. Ajustes según enfoque
    if (growthFocus) {
      // Para enfoque en crecimiento, ser más agresivo
      // Dar más peso al sentimiento positivo y tendencia alcista
      if (galaxyScore > 65) {
        score += 0.1;
      }
      if (trend.includes('bull')) {
        score += 0.1;
      }
    } else {
      // Para enfoque conservador, penalizar volatilidad excesiva
      if (volatility > 5) {
        score -= 0.1;
      }
    }
    
    // Limitar entre 0 y 1
    return Math.max(0, Math.min(1, score));
  }
  
  /**
   * Estima el retorno potencial basado en indicadores
   */
  private estimatePotentialReturn(candles: any[], volatility: number): number {
    // Cálculo basado en volatilidad
    // Volatilidad más alta generalmente implica mayor potencial de retorno
    const volatilityMultiplier = Math.min(volatility * 0.6, 5);
    
    // Valorar entre 1-5%
    return Math.max(1, Math.min(5, volatilityMultiplier));
  }
  
  /**
   * Genera un portafolio diversificado basado en correlaciones
   * @param capital Capital total a distribuir
   * @param maxPositions Número máximo de posiciones
   */
  async getDiversifiedPortfolio(
    capital: number,
    maxPositions: number = 2
  ): Promise<PortfolioAllocation[]> {
    try {
      // 1. Obtener mejores oportunidades
      const opportunities = await this.scanMarket(true, capital, maxPositions * 2);
      
      if (opportunities.length === 0) {
        return [];
      }
      
      // Si solo hay espacio para una posición o no hay suficientes oportunidades
      if (maxPositions === 1 || opportunities.length === 1) {
        return [{
          symbol: opportunities[0].symbol,
          allocation: capital,
          percentage: 100,
          correlation: 1
        }];
      }
      
      // 2. Calcular matriz de correlaciones entre los mejores activos
      const symbols = opportunities.map(o => o.symbol);
      let correlations: Map<string, Map<string, number>>;
      
      try {
        correlations = await correlationMatrixService.calculateCorrelationMatrix(symbols);
      } catch (error) {
        // Si falla el cálculo de correlaciones, asignar uniformemente
        logger.error({ error }, 'Error calculando correlaciones');
        
        // Determinar posiciones a usar (mínimo entre maxPositions y oportunidades disponibles)
        const positions = Math.min(maxPositions, opportunities.length);
        const allocationPerSymbol = capital / positions;
        
        return opportunities.slice(0, positions).map(o => ({
          symbol: o.symbol,
          allocation: allocationPerSymbol,
          percentage: 100 / positions
        }));
      }
      
      // 3. Seleccionar activos menos correlacionados con mayor score
      const selectedSymbols: string[] = [];
      selectedSymbols.push(opportunities[0].symbol); // Empezar con el mejor
      
      // Añadir activos con menor correlación promedio con los ya seleccionados
      while (selectedSymbols.length < maxPositions && selectedSymbols.length < opportunities.length) {
        let bestSymbol = null;
        let lowestAvgCorrelation = Infinity;
        
        for (const opportunity of opportunities) {
          // Saltar si ya está seleccionado
          if (selectedSymbols.includes(opportunity.symbol)) {
            continue;
          }
          
          // Calcular correlación promedio con activos ya seleccionados
          let totalCorrelation = 0;
          for (const selected of selectedSymbols) {
            const correlation = correlations.get(opportunity.symbol)?.get(selected) || 0.5;
            totalCorrelation += Math.abs(correlation); // Usar valor absoluto
          }
          
          const avgCorrelation = totalCorrelation / selectedSymbols.length;
          
          // Si tenemos menor correlación promedio, seleccionar este símbolo
          if (avgCorrelation < lowestAvgCorrelation) {
            lowestAvgCorrelation = avgCorrelation;
            bestSymbol = opportunity.symbol;
          }
        }
        
        if (bestSymbol) {
          selectedSymbols.push(bestSymbol);
        } else {
          break;
        }
      }
      
      // 4. Asignar capital proporcionalmente a los activos seleccionados
      // Usar la puntuación de oportunidad como peso
      const selectedOpportunities = opportunities.filter(o => 
        selectedSymbols.includes(o.symbol)
      );
      
      const totalScore = selectedOpportunities.reduce((sum, o) => sum + o.score, 0);
      
      return selectedOpportunities.map(o => {
        const weight = o.score / totalScore;
        return {
          symbol: o.symbol,
          allocation: capital * weight,
          percentage: weight * 100,
          correlation: 0 // Se actualizará a continuación
        };
      });
    } catch (error) {
      logger.error({ error }, 'Error generando portafolio diversificado');
      return [];
    }
  }
}

// Crear instancia singleton para uso en toda la aplicación
export const marketScannerService = new MarketScannerService();
