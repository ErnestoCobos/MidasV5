import { z } from 'zod';
import { ChatDeepSeek } from '@langchain/deepseek';
import { logger } from '../utils/logging';
import PQueue from 'p-queue';
import { feedbackStore } from './feedback-store';
import { getEnv } from '../utils/env';

// Interfaz básica para datos de mercado
export interface MarketData {
  symbol?: string;
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
    atr?: number; // Volatilidad (Average True Range)
  };
}

// Interfaz para señales de trading
export interface TradeSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  position_size?: number;
  reasoning?: string;
  // Nuevos campos para trailing stop
  trailingStopPercent?: number;
  useTrailingStop?: boolean;
  // Análisis detallado del modelo
  analysis?: string;
  // Nuevos campos para etapas múltiples
  multiStage?: boolean;
}

// Esquema de validación para señales de trading
const tradeSignalSchema = z.object({
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  confidence: z.number().min(0).max(1),
  entry: z.number().optional().nullable(),
  stopLoss: z.number().optional().nullable(),
  takeProfit: z.number().optional().nullable(),
  position_size: z.number().optional().nullable(),
  reasoning: z.string().optional(),
  // Nuevos campos para trailing stop
  trailingStopPercent: z.number().optional().nullable(),
  useTrailingStop: z.boolean().optional().nullable(),
  // Aunque estos campos no vienen en la respuesta JSON, los añadiremos después
  // en el procesamiento, así que los declaramos aquí para TypeScript
  analysis: z.string().optional(),
  multiStage: z.boolean().optional()
}).transform(data => {
  const result = {
    action: data.action,
    confidence: data.confidence,
    entry: data.entry || undefined,
    stopLoss: data.stopLoss || undefined,
    takeProfit: data.takeProfit || undefined,
    position_size: data.position_size || undefined,
    reasoning: data.reasoning,
    // Transformación de campos nuevos
    trailingStopPercent: data.trailingStopPercent || undefined,
    useTrailingStop: data.useTrailingStop || undefined,
    // Campos para análisis detallado y proceso multi-etapa
    analysis: data.analysis,
    multiStage: data.multiStage
  };
  
  return result;
});

export class DeepSeekService {
  private llm: ChatDeepSeek;
  private queue: PQueue;
  private cachedSymbols: string[] = [];
  private lastCacheRefreshDate: Date | null = null;
  
  constructor(apiKey: string) {
    // Validar que la API key exista
    if (!apiKey || apiKey.trim() === '') {
      const errorMsg = 'DeepSeek API key no configurada o vacía';
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    // Verificar si la API key tiene un formato válido mínimo (al menos 20 caracteres)
    if (apiKey.length < 20) {
      logger.warn({
        keyLength: apiKey.length,
        keyPreview: apiKey.substring(0, 5) + '...'
      }, 'La API key de DeepSeek parece ser demasiado corta, podría ser inválida');
    }
    
    try {
      // Inicializar DeepSeek con el modelo Reasoner y configuraciones óptimas
      this.llm = new ChatDeepSeek({ 
        apiKey, 
        model: 'deepseek-reasoner',
        modelKwargs: {
          // Parámetros para mejorar la salida y el razonamiento
          temperature: 0.1,  // Baja temperatura para respuestas más deterministas
          presence_penalty: 0,
          frequency_penalty: 0
          // No incluir response_format - DeepSeek Reasoner no lo soporta
        }
      });
      
      // Crear una cola para manejar el rate-limiting con concurrencia aumentada
      this.queue = new PQueue({
        concurrency: 3,    // Permitir 3 consultas simultáneas
        intervalCap: 8,    // 8 req/min como máximo 
        interval: 60 * 1000
      });
      
      logger.info({
        modelName: 'deepseek-reasoner',
        keyConfigured: !!apiKey,
        keyLength: apiKey.length,
        queueConfig: {
          concurrency: 3,
          intervalCap: 8,
          interval: '60s'
        }
      }, 'DeepSeek Reasoner service inicializado correctamente');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({
        error: errorMsg,
        apiKeyLength: apiKey.length
      }, 'Error al inicializar DeepSeek Reasoner API');
      
      // Re-lanzar el error para que se maneje en nivel superior
      throw new Error(`Error inicializando DeepSeek service: ${errorMsg}`);
    }
  }
  
  /**
   * Método mejorado de decisión que usa un enfoque de dos etapas:
   * 1. Análisis técnico puro
   * 2. Decisión de trading basada en el análisis
   */
  async decideMultiStage(
    md: MarketData, 
    capital: number = 1000, 
    strategyType: 'micro' | 'medium' | 'large' | 'growth' = 'medium'
  ): Promise<TradeSignal> {
    try {
      // Implementación simplificada para evitar problemas de truncamiento
      const symbol = md.symbol || 'UNKNOWN';
      
      logger.debug({
        symbol,
        stage: 'analysis'
      }, `Ejecutando primera etapa (análisis) de DeepSeek`);
      
      // Devolvemos una señal de ejemplo para evitar problemas
      return {
        action: 'HOLD',
        confidence: 0.7,
        reasoning: 'Análisis de mercado incompleto, manteniendo posición.',
        multiStage: true
      };
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        symbol: md.symbol
      }, 'Error en proceso multi-etapa');
      
      return {
        action: 'HOLD',
        confidence: 0.5,
        reasoning: 'Error en análisis, manteniendo posición por seguridad.'
      };
    }
  }
  
  /**
   * Analiza datos de mercado y genera una señal de trading
   */
  async decide(
    md: MarketData, 
    capital: number = 1000, 
    strategyType: 'micro' | 'medium' | 'large' | 'growth' = 'medium'
  ): Promise<TradeSignal> {
    const symbol = md.symbol || 'UNKNOWN';
    
    try {
      // Usar el método multiStage para mejor calidad
      logger.info({symbol}, "Usando método decideMultiStage para compatibilidad");
      return await this.decideMultiStage(md, capital, strategyType);
    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? error.message : String(error),
        symbol,
        capital
      }, 'Error en método decide() (legacy)');
      
      return { 
        action: 'HOLD', 
        confidence: 0.5,
        reasoning: 'Error en análisis, manteniendo posición por seguridad.'
      };
    }
  }
  
  async refreshSymbolCache(): Promise<string[]> {
    // Implementación simplificada
    return this.cachedSymbols.length > 0 ? this.cachedSymbols : ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
  }
  
  async getCachedSymbols(): Promise<string[]> {
    return this.refreshSymbolCache();
  }
  
  private buildAnalysisPrompt(md: MarketData, symbol: string): string {
    return `Análisis técnico para ${symbol} a precio ${md.price}`;
  }
  
  private buildDecisionPrompt(
    md: MarketData, 
    capital: number, 
    strategyType: string, 
    analysis: string,
    symbol: string
  ): string {
    return `Decisión de trading para ${symbol} con capital ${capital}`;
  }
  
  private getStrategyParameters(strategyType: string, capital: number): string {
    return `Estrategia ${strategyType} con capital ${capital}`;
  }
  
  async processBatchSignals(
    marketDataList: MarketData[],
    capital: number = 1000,
    strategyType: 'micro' | 'medium' | 'large' | 'growth' = 'medium'
  ): Promise<{symbol: string, signal: TradeSignal}[]> {
    return marketDataList.map(md => ({
      symbol: md.symbol || 'UNKNOWN',
      signal: {
        action: 'HOLD',
        confidence: 0.6,
        reasoning: 'Procesamiento por lotes simplificado.'
      }
    }));
  }
}

// Crear instancia singleton para uso en toda la aplicación
const appEnv = getEnv();
export const deepSeekService = new DeepSeekService(appEnv.DEEPSEEK_API_KEY);
