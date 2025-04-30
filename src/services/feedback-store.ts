import { z } from 'zod';
import NodeCache from 'node-cache';
import { logger } from '../utils/logging';
import { TradeSignal } from './deepseek';
import { MarketData } from './market-data';

// Esquema para validar resultados de operaciones
const tradeResultSchema = z.object({
  symbol: z.string(),
  timestamp: z.number(),
  action: z.enum(['BUY', 'SELL']),
  entryPrice: z.number(),
  exitPrice: z.number().optional(),
  stopLossHit: z.boolean().optional(),
  takeProfitHit: z.boolean().optional(),
  profitPercentage: z.number().optional(),
  profitAmount: z.number().optional(),
  positionSize: z.number(),
  holdDuration: z.number().optional(), // en minutos
  marketCondition: z.string().optional(),
  confidenceScore: z.number(),
  reasoning: z.string().optional()
});

export type TradeResult = z.infer<typeof tradeResultSchema>;

export interface FeedbackEntry {
  originalSignal: TradeSignal;
  marketData: MarketData; // Los datos de mercado originales
  result: TradeResult;
  successful: boolean;
}

/**
 * Almacén para resultados de operaciones de trading para crear un sistema de
 * retroalimentación que mejore las decisiones futuras basadas en resultados anteriores
 */
export class FeedbackStore {
  private cache: NodeCache;
  private results: FeedbackEntry[] = [];
  private readonly MAX_ENTRIES = 1000; // Limitar para evitar problemas de memoria
  
  constructor() {
    // Caché para consultas rápidas
    this.cache = new NodeCache({ stdTTL: 24 * 60 * 60 }); // 24 horas TTL
    logger.info('FeedbackStore initialized for AI trading decision improvement');
  }
  
  /**
   * Registra un nuevo resultado de trading
   * @param entry Entrada completa con señal original, datos de mercado y resultado
   */
  recordFeedback(entry: FeedbackEntry): void {
    try {
      // Validar el resultado
      tradeResultSchema.parse(entry.result);
      
      // Añadir a la colección
      this.results.push(entry);
      
      // Limitar tamaño máximo
      if (this.results.length > this.MAX_ENTRIES) {
        this.results.shift(); // Eliminar el más antiguo
      }
      
      // Calcular y cachear métricas para este símbolo
      this.updateMetricsForSymbol(entry.result.symbol);
      
      logger.info({
        symbol: entry.result.symbol,
        action: entry.result.action,
        profit: entry.result.profitPercentage,
        successful: entry.successful
      }, 'Trade feedback recorded for AI improvement');
    } catch (error) {
      logger.error({ error }, 'Error recording trade feedback');
    }
  }
  
  /**
   * Obtiene feedback relevante para un símbolo y acción específicos
   * @param symbol Par de trading (ej. BTCUSDT)
   * @param action Tipo de acción (BUY/SELL)
   * @returns Lista de entradas de feedback relevantes
   */
  getRelevantFeedback(symbol: string, action: 'BUY' | 'SELL'): FeedbackEntry[] {
    return this.results
      .filter(entry => 
        entry.result.symbol === symbol && 
        entry.result.action === action)
      .slice(-5); // Últimas 5 entradas
  }
  
  /**
   * Obtiene estadísticas de éxito para un símbolo específico
   * @param symbol Par de trading (ej. BTCUSDT)
   */
  getSuccessRateForSymbol(symbol: string): {
    successRate: number;
    totalTrades: number;
    avgProfit: number;
    winRate: number;
    avgHoldDuration?: number;
  } {
    const cacheKey = `stats_${symbol}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached as any;
    }
    
    // Calcular métricas
    return this.updateMetricsForSymbol(symbol);
  }
  
  /**
   * Actualiza y devuelve métricas para un símbolo
   * @param symbol Par de trading
   */
  private updateMetricsForSymbol(symbol: string): {
    successRate: number;
    totalTrades: number;
    avgProfit: number;
    winRate: number;
    avgHoldDuration?: number;
  } {
    const trades = this.results.filter(entry => entry.result.symbol === symbol);
    const totalTrades = trades.length;
    
    if (totalTrades === 0) {
      return { successRate: 0, totalTrades: 0, avgProfit: 0, winRate: 0 };
    }
    
    const successfulTrades = trades.filter(entry => entry.successful);
    const profitableTrades = trades.filter(entry => 
      entry.result.profitPercentage !== undefined && 
      entry.result.profitPercentage > 0
    );
    
    const successRate = successfulTrades.length / totalTrades;
    const winRate = profitableTrades.length / totalTrades;
    
    // Calcular ganancia promedio
    const profits = trades
      .map(entry => entry.result.profitPercentage || 0)
      .filter(profit => !isNaN(profit));
      
    const avgProfit = profits.length > 0 
      ? profits.reduce((a, b) => a + b, 0) / profits.length 
      : 0;
    
    // Calcular duración promedio de hold
    const holdDurations = trades
      .map(entry => entry.result.holdDuration || 0)
      .filter(duration => duration > 0);
      
    const avgHoldDuration = holdDurations.length > 0
      ? holdDurations.reduce((a, b) => a + b, 0) / holdDurations.length
      : undefined;
    
    const result = {
      successRate,
      totalTrades,
      avgProfit,
      winRate,
      avgHoldDuration
    };
    
    // Guardar en caché
    this.cache.set(`stats_${symbol}`, result);
    
    return result;
  }
  
  /**
   * Obtiene el ratio de ganancia/pérdida para cálculos de Kelly
   * @param symbol Par de trading
   */
  getPayoffRatioForSymbol(symbol: string): number {
    const trades = this.results.filter(entry => 
      entry.result.symbol === symbol && 
      entry.result.profitPercentage !== undefined
    );
    
    if (trades.length === 0) return 1; // Valor neutral
    
    const profits = trades
      .filter(entry => (entry.result.profitPercentage || 0) > 0)
      .map(entry => entry.result.profitPercentage || 0);
      
    const losses = trades
      .filter(entry => (entry.result.profitPercentage || 0) < 0)
      .map(entry => Math.abs(entry.result.profitPercentage || 0));
    
    if (profits.length === 0 || losses.length === 0) return 1;
    
    const avgProfit = profits.reduce((a, b) => a + b, 0) / profits.length;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
    
    return avgLoss > 0 ? avgProfit / avgLoss : 1;
  }
  
  /**
   * Exporta los datos para entrenamiento o análisis
   */
  exportData(): FeedbackEntry[] {
    return [...this.results];
  }
}

// Singleton
export const feedbackStore = new FeedbackStore();
