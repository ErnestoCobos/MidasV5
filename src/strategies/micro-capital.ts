import { logger, tradeLogger } from '../utils/logging';
import { lunarCrushService } from '../services/lunarcrush';
import { deepSeekService, TradeSignal } from '../services/deepseek';
import { binanceService } from '../services/binance';
import { marketDataService, MarketData } from '../services/market-data';
import { correlationService } from '../services/correlation';
import { env, isDryRun } from '../utils/env';
import { feedbackStore } from '../services/feedback-store';
import { AdaptiveParameters, TimeframeAnalysis } from './types';
import { RiskManagementUtils } from './risk-management';

// Interfaz para la estrategia
export interface Strategy {
  name: string;
  description: string;
  minCapital: number;
  maxCapital: number | null;
  execute(symbol: string, capital: number, options?: MicroStrategyConfig): Promise<TradeSignal>;
}

// Interfaz de configuración para la estrategia micro-capital
export interface MicroStrategyConfig {
  ignoreMarketConditions?: boolean;
  minConfidence?: number;
  allowBearishOperations?: boolean;
  // Nuevos parámetros para estrategia adaptativa
  useAdaptiveParameters?: boolean;
  useMultiTimeframe?: boolean;
}

// Estrategia especializada para micro-capital (<$100)
export class MicroCapitalStrategy implements Strategy {
  name = "Micro-Capital Growth Accelerator";
  description = "Estrategia optimizada para crecimiento de capital <$100. Enfoque balanceado entre rentabilidad y preservación.";
  minCapital = 10;
  maxCapital = 100;
  
  // Modos de operación
  static MODE_CONSERVATIVE = 'conservative';
  static MODE_GROWTH = 'growth';
  
  // Configuración de la estrategia
  private config: MicroStrategyConfig;
  private mode: string;
  
  // Caché de análisis multi-timeframe (evita recálculos excesivos)
  private timeframeAnalysisCache: Map<string, {
    analysis: TimeframeAnalysis[],
    timestamp: number
  }> = new Map();
  
  constructor(config: MicroStrategyConfig = {}, mode: string = MicroCapitalStrategy.MODE_CONSERVATIVE) {
    this.mode = mode;
    
    // Ajustar la configuración según el modo
    if (mode === MicroCapitalStrategy.MODE_GROWTH) {
      this.name = "Micro-Growth Accelerator";
      this.description = "Estrategia adaptativa para maximizar crecimiento de capital. Prioriza retornos sobre preservación.";
      
      this.config = {
        ignoreMarketConditions: config.ignoreMarketConditions || true,  // Más permisivo con condiciones de mercado
        minConfidence: config.minConfidence || 0.80,  // Umbral de confianza más bajo
        allowBearishOperations: config.allowBearishOperations || true,  // Permitir operaciones en mercado bajista
        useAdaptiveParameters: config.useAdaptiveParameters !== undefined ? config.useAdaptiveParameters : true,
        useMultiTimeframe: config.useMultiTimeframe !== undefined ? config.useMultiTimeframe : true
      };
    } else {
      // Configuración conservadora por defecto
      this.config = {
        ignoreMarketConditions: config.ignoreMarketConditions || false,
        minConfidence: config.minConfidence || 0.85,
        allowBearishOperations: config.allowBearishOperations || false,
        useAdaptiveParameters: config.useAdaptiveParameters !== undefined ? config.useAdaptiveParameters : true,
        useMultiTimeframe: config.useMultiTimeframe !== undefined ? config.useMultiTimeframe : false
      };
    }
    
    logger.info({
      mode: this.mode,
      ...this.config
    }, 'MicroCapitalStrategy initialized with adaptive config');
  }
  
  /**
   * Ejecuta la estrategia micro-capital con parámetros adaptativos
   * @param symbol Par de trading (ej. BTCUSDT)
   * @param capital Capital total disponible
   * @param options Opciones adicionales para esta ejecución
   * @returns Señal de trading recomendada
   */
  async execute(symbol: string, capital: number, options?: MicroStrategyConfig): Promise<TradeSignal> {
    // Combinar configuración del constructor con opciones en tiempo de ejecución
    const config = {
      ...this.config,
      ...(options || {})
    };
    
    // Determinar el tipo de estrategia a usar con DeepSeek
    const strategyType = this.mode === MicroCapitalStrategy.MODE_GROWTH ? 'growth' : 'micro';
    try {
      // 1. Verificar sentimiento primero (ahorra llamadas API a DeepSeek si no es favorable)
      const asset = symbol.replace('USDT', '');
      const sentiment = await lunarCrushService.getMicroTradingSignal(asset);
      
      // En modo crecimiento, ser más permisivo con sentimiento negativo
      // Solo saltar en caso de sentimiento extremadamente negativo
      if (this.mode === MicroCapitalStrategy.MODE_GROWTH) {
        if (sentiment.signal === 'STRONG_SELL' && sentiment.score < 40) {
          logger.info({ 
            asset, 
            galaxyScore: sentiment.score, 
            threshold: sentiment.threshold 
          }, 'Skipping due to extremely negative sentiment');
          
          return { action: 'HOLD', confidence: 0.0 };
        }
      } else {
        // Modo conservador: saltar con cualquier sentimiento negativo
        if (sentiment.signal === 'SELL' || sentiment.signal === 'STRONG_SELL') {
          logger.info({ 
            asset, 
            galaxyScore: sentiment.score, 
            threshold: sentiment.threshold 
          }, 'Skipping due to negative sentiment');
          
          return { action: 'HOLD', confidence: 0.0 };
        }
      }
      
      // 2. Obtener datos de mercado mejorados
      const md = await marketDataService.getEnhancedMarketData(symbol);
      // Asignar el sentimiento obtenido de LunarCrush
      md.sentiment = sentiment.score;
      
      // 3. Análisis multi-timeframe si está habilitado
      let timeframeAligned = true;
      if (config.useMultiTimeframe) {
        const timeframeAnalysis = await this.getMultiTimeframeAnalysis(symbol);
        timeframeAligned = this.areTimeframesAligned(timeframeAnalysis);
        
        if (!timeframeAligned) {
          logger.info({ 
            symbol,
            timeframes: timeframeAnalysis.map(t => t.timeframe)
          }, 'Timeframes not aligned, skipping trade');
          return { action: 'HOLD', confidence: 0.0 };
        }
      }
      
      // 4. Verificar condiciones generales del mercado (si no estamos ignorándolas)
      if (!config.ignoreMarketConditions && !await this.checkMarketConditions(symbol, config)) {
        logger.info({ 
          symbol,
          ignoreMarketConditions: config.ignoreMarketConditions 
        }, 'Skipping due to unfavorable market conditions');
        return { action: 'HOLD', confidence: 0.0 };
      }
      
      // 5. Realizar verificación técnica básica
      if (await this.shouldSkipBasedOnTechnicals(symbol, md)) {
        return { action: 'HOLD', confidence: 0.0 };
      }
      
      // 6. Consultar a DeepSeek con el prompt optimizado y el nuevo método multi-etapa
      const signal = await deepSeekService.decideMultiStage(md, capital, strategyType);
      
      // 7. Calcular parámetros adaptativos según condiciones de mercado actuales
      let adaptiveParams = config.useAdaptiveParameters 
        ? this.calculateAdaptiveParameters(symbol, md, capital)
        : null;
      
      if (adaptiveParams) {
        logger.debug({
          adaptiveParams,
          symbol,
          mode: this.mode,
          capital
        }, 'Using adaptive parameters');
      }
      
      // 8. Validación adicional de la señal con el umbral configurable adaptativo
      const minConfidence = adaptiveParams 
        ? adaptiveParams.minConfidence 
        : config.minConfidence || 0.70;
        
      if (signal.action !== 'HOLD' && (!signal.confidence || signal.confidence < minConfidence)) {
        logger.info({ 
          symbol, 
          confidence: signal.confidence,
          requiredConfidence: minConfidence,
          adaptive: !!adaptiveParams
        }, 'Insufficient confidence for micro-capital trading');
        
        return { action: 'HOLD', confidence: 0.0 };
      }
      
      // 9. Verificar que el tamaño de posición sea adecuado
      if (signal.action !== 'HOLD' && signal.position_size) {
        // Si la posición es < $3 USD, no es viable en la mayoría de exchanges
        if (signal.position_size < 3) {
          logger.info({ 
            positionSize: signal.position_size 
          }, 'Position size too small for viable trading');
          
          return { action: 'HOLD', confidence: 0.0 };
        }
        
        // Limitar el tamaño máximo de posición según el modo y parámetros adaptativos
        const maxPositionPercent = adaptiveParams 
          ? adaptiveParams.maxPositionSizePercent 
          : (this.mode === MicroCapitalStrategy.MODE_GROWTH ? 0.4 : 0.3);
          
        const maxPosition = capital * maxPositionPercent;
        
        if (signal.position_size > maxPosition) {
          signal.position_size = maxPosition;
          logger.info({ 
            adjustedPositionSize: maxPosition.toFixed(2),
            originalSize: signal.position_size,
            adaptivePercent: maxPositionPercent,
            capital
          }, 'Position size adjusted to maximum allowed');
        }
      }
      
      // 10. Aplicar reglas adicionales de gestión de riesgo con parámetros adaptativos
      // Utilizamos la clase de utilidades de gestión de riesgo
      const isGrowthMode = this.mode === MicroCapitalStrategy.MODE_GROWTH;
      RiskManagementUtils.applyRiskManagementRules(signal, md.price, isGrowthMode, adaptiveParams || undefined);
      
      // 11. Log completo de la señal
      tradeLogger.info({ 
        symbol,
        action: signal.action,
        confidence: signal.confidence,
        position_size: signal.position_size,
        entry: signal.entry,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        useTrailingStop: signal.useTrailingStop,
        trailingStopPercent: signal.trailingStopPercent,
        reasoning: signal.reasoning,
        multiStage: signal.multiStage,
        adaptiveParams: !!adaptiveParams
      }, 'MicroCapital strategy signal generated with enhanced parameters');
      
      return signal;
    } catch (error: any) {
      logger.error({ 
        symbol, 
        capital, 
        error: error.message 
      }, 'Error executing micro-capital strategy');
      
      return { action: 'HOLD', confidence: 0.0 };
    }
  }
  
  /**
   * Calcula parámetros adaptativos basados en las condiciones de mercado actuales
   * y el historial de rendimiento para este símbolo
   */
  private calculateAdaptiveParameters(
    symbol: string, 
    marketData: MarketData, 
    capital: number
  ): AdaptiveParameters {
    const tech = marketData.technicals || {};
    
    // 1. Calcular la volatilidad reciente
    const volatility = this.estimateVolatility(marketData);
    
    // 2. Obtener estadísticas de rendimiento histórico
    const symbolStats = feedbackStore.getSuccessRateForSymbol(symbol);
    const historicalPerformance = symbolStats.totalTrades > 0 
      ? Math.min(1, Math.max(0, symbolStats.successRate))
      : 0.5; // Valor neutral si no hay historial
      
    // 3. Calcular el ratio riesgo/recompensa basado en historial
    const payoffRatio = feedbackStore.getPayoffRatioForSymbol(symbol);
    
    // 4. Ajustar la confianza mínima según volatilidad y rendimiento histórico
    let minConfidence = this.mode === MicroCapitalStrategy.MODE_GROWTH 
      ? 0.80 // Base para modo crecimiento
      : 0.85; // Base para modo conservador
    
    // Mayor volatilidad = mayor confianza requerida
    minConfidence += volatility * 0.10;
    
    // Mejor desempeño histórico = menor confianza requerida
    if (symbolStats.totalTrades >= 3) {
      minConfidence -= historicalPerformance * 0.05;
    }
    
    // Limitar entre 0.75-0.95
    minConfidence = Math.min(0.95, Math.max(0.75, minConfidence));
    
    // 5. Ajustar tamaño máximo de posición basado en volatilidad y rendimiento
    let maxPositionSizePercent = this.mode === MicroCapitalStrategy.MODE_GROWTH
      ? 0.40 // Base para modo crecimiento (40%)
      : 0.30; // Base para modo conservador (30%)
    
    // Reducir exposición en alta volatilidad
    maxPositionSizePercent *= (1 - (volatility * 0.5));
    
    // Aumentar exposición con historial positivo
    if (symbolStats.totalTrades >= 3 && historicalPerformance > 0.7) {
      maxPositionSizePercent *= (1 + ((historicalPerformance - 0.7) * 0.5));
    }
    
    // Limitar entre 15%-45%
    maxPositionSizePercent = Math.min(0.45, Math.max(0.15, maxPositionSizePercent));
    
    // 6. Configurar stop loss adaptativo según volatilidad
    const baseStopLoss = this.mode === MicroCapitalStrategy.MODE_GROWTH
      ? 0.015 // 1.5% para modo crecimiento
      : 0.012; // 1.2% para modo conservador
    
    // Ampliar stop loss en alta volatilidad
    const stopLossPercent = baseStopLoss + (volatility * 0.01);
    
    // 7. Configurar take profit adaptativo según volatilidad y ratio riesgo/recompensa
    const baseTakeProfit = this.mode === MicroCapitalStrategy.MODE_GROWTH
      ? 0.025 // 2.5% para modo crecimiento
      : 0.020; // 2.0% para modo conservador
    
    // Ajustar take profit basado en volatilidad y ratio de ganancia/pérdida
    const takeProfitPercent = baseTakeProfit + (volatility * 0.015) + ((payoffRatio - 1) * 0.005);
    
    // 8. Configurar trailing stop y su uso
    const useTrailingStop = (
      (this.mode === MicroCapitalStrategy.MODE_GROWTH) || // Siempre en modo crecimiento
      (tech.ema_cross === 'bullish' && symbolStats.winRate > 0.5) // O tendencia alcista con buen historial
    );
    
    const baseTrailingStop = this.mode === MicroCapitalStrategy.MODE_GROWTH
      ? 0.010 // 1.0% para modo crecimiento
      : 0.012; // 1.2% para modo conservador
    
    // Ajustar trailing stop según volatilidad
    const trailingStopPercent = baseTrailingStop + (volatility * 0.015);
    
    return {
      minConfidence,
      maxPositionSizePercent,
      stopLossPercent,
      takeProfitPercent,
      useTrailingStop,
      trailingStopPercent
    };
  }
  
  /**
   * Estima la volatilidad basada en los datos disponibles
   * Devuelve un valor entre 0 (baja) y 1 (extrema)
   */
  private estimateVolatility(marketData: MarketData): number {
    const tech = marketData.technicals || {};
    let volatilityScore = 0;
    
    // 1. Verificar si tenemos una aproximación de ATR calculada internamente
    const atr = (tech as any).atr;
    if (atr !== undefined) {
      // Normalizar ATR en relación al precio (volatilidad relativa)
      const normalizedAtr = atr / marketData.price;
      // Convertir a una escala 0-1 (asumiendo que >2% es muy volátil)
      return Math.min(1, normalizedAtr * 50);
    }
    
    // 2. Si tenemos ancho de bandas de Bollinger, usarlo como proxy
    if (tech.bband_percent !== undefined) {
      // Valores extremos de BB%B indican alta volatilidad
      const bbExtreme = Math.abs(tech.bband_percent - 0.5) * 2;
      volatilityScore += bbExtreme * 0.5; // Contribuye 50% al score
    }
    
    // 3. RSI extremo puede indicar volatilidad
    if (tech.rsi !== undefined) {
      // Cuán lejos está RSI de valor neutro (50)
      const rsiExtreme = Math.abs(tech.rsi - 50) / 50;
      volatilityScore += rsiExtreme * 0.3; // Contribuye 30% al score
    }
    
    // 4. Ratio de volumen elevado puede indicar volatilidad
    if (tech.volume_ratio !== undefined && tech.volume_ratio > 1) {
      // Normalizar volumen elevado (cualquier cosa >3x es considerado muy alto)
      const volumeScore = Math.min(1, (tech.volume_ratio - 1) / 2);
      volatilityScore += volumeScore * 0.2; // Contribuye 20% al score
    }
    
    // Si no tenemos suficiente información, asumir volatilidad media-baja (0.3)
    return volatilityScore > 0 ? Math.min(1, volatilityScore) : 0.3;
  }
  
  /**
   * Obtiene análisis de múltiples timeframes para tener una visión más completa
   * 15m para entradas precisas, 1h para tendencia media y 4h para contexto mayor
   */
  private async getMultiTimeframeAnalysis(symbol: string): Promise<TimeframeAnalysis[]> {
    // Verificar caché primero (validez de 15 minutos)
    const cacheEntry = this.timeframeAnalysisCache.get(symbol);
    const now = Date.now();
    
    if (cacheEntry && (now - cacheEntry.timestamp < 15 * 60 * 1000)) {
      return cacheEntry.analysis;
    }
    
    const timeframes = ['15m', '1h', '4h'];
    const analysis: TimeframeAnalysis[] = [];
    
    for (const timeframe of timeframes) {
      try {
        // Obtener velas para este timeframe
        const candles = await binanceService.getHistoricalCandles(symbol, timeframe as any, 20);
        
        // Realizar análisis básico para este timeframe
        const lastClose = candles[candles.length - 1].close;
        const prevClose = candles[candles.length - 2].close;
        
        // Calcular EMA 10 y 20 para determinar tendencia
        const prices = candles.map(c => c.close);
        const ema10 = this.calculateEMA(prices, 10);
        const ema20 = this.calculateEMA(prices, 20);
        
        // Determinar soportes y resistencias
        const supports = this.findSupports(candles, 3);
        const resistances = this.findResistances(candles, 3);
        
        // Determinar tendencia
        const bullish = ema10 > ema20 && lastClose > prevClose;
        const bearish = ema10 < ema20 && lastClose < prevClose;
        
        // Calcular fuerza de señal (0-10)
        let strength = 5; // Neutral por defecto
        
        if (bullish) {
          strength += 2; // +2 por EMA bullish
          strength += lastClose > ema10 ? 1 : 0; // +1 por precio encima de EMA10
          strength += candles[candles.length - 1].volume > candles[candles.length - 2].volume ? 1 : 0; // +1 por aumento de volumen
        } else if (bearish) {
          strength -= 2; // -2 por EMA bearish
          strength -= lastClose < ema10 ? 1 : 0; // -1 por precio debajo de EMA10
          strength -= candles[candles.length - 1].volume > candles[candles.length - 2].volume ? 1 : 0; // -1 por aumento de volumen
        }
        
        // Limitar entre 0-10
        strength = Math.min(10, Math.max(0, strength));
        
        analysis.push({
          timeframe,
          bullish,
          bearish,
          neutral: !bullish && !bearish,
          strength,
          keyLevels: {
            supports,
            resistances
          }
        });
      } catch (error) {
        logger.warn({
          symbol,
          timeframe,
          error: error instanceof Error ? error.message : String(error)
        }, 'Error in multi-timeframe analysis');
        
        // Añadir análisis neutral en caso de error
        analysis.push({
          timeframe,
          bullish: false,
          bearish: false,
          neutral: true,
          strength: 5,
          keyLevels: {
            supports: [],
            resistances: []
          }
        });
      }
    }
    
    // Guardar en caché
    this.timeframeAnalysisCache.set(symbol, {
      analysis,
      timestamp: now
    });
    
    logger.debug({
      symbol,
      timeframes: analysis.map(a => ({
        timeframe: a.timeframe,
        trend: a.bullish ? 'bullish' : (a.bearish ? 'bearish' : 'neutral'),
        strength: a.strength
      }))
    }, 'Multi-timeframe analysis completed');
    
    return analysis;
  }
  
  /**
   * Verifica si los timeframes están suficientemente alineados para operar
   */
  private areTimeframesAligned(analysis: TimeframeAnalysis[]): boolean {
    if (analysis.length < 2) return true; // No suficientes datos para comparar
    
    if (this.mode === MicroCapitalStrategy.MODE_GROWTH) {
      // Modo crecimiento: necesitamos al menos que los dos más cortos estén alineados
      const shortTermAlignment = analysis[0].bullish === analysis[1].bullish;
      
      // No ambos deben ser bajistas
      const notBothBearish = !(analysis[0].bearish && analysis[1].bearish);
      
      return shortTermAlignment && notBothBearish;
    } else {
      // Modo conservador: todos los timeframes deben estar alineados o neutrales
      const bullishCount = analysis.filter(a => a.bullish).length;
      const bearishCount = analysis.filter(a => a.bearish).length;
      
      // Para compras, al menos dos marcos deben ser alcistas y ninguno bajista
      // Para ventas (si permitido), al menos dos marcos deben ser bajistas y ninguno alcista
      return (bullishCount >= 2 && bearishCount === 0) || 
             (bearishCount >= 2 && bullishCount === 0);
    }
  }
  
  /**
   * Calcula EMA (Exponential Moving Average)
   */
  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] * k) + (ema * (1 - k));
    }
    
    return ema;
  }
  
  /**
   * Encuentra niveles de soporte
   */
  private findSupports(candles: any[], count: number): number[] {
    const lows = candles.map(c => c.low);
    return this.findKeyLevels(lows, count, true);
  }
  
  /**
   * Encuentra niveles de resistencia
   */
  private findResistances(candles: any[], count: number): number[] {
    const highs = candles.map(c => c.high);
    return this.findKeyLevels(highs, count, false);
  }
  
  /**
   * Encuentra niveles clave (soportes o resistencias)
   */
  private findKeyLevels(prices: number[], count: number, findMin: boolean): number[] {
    const levels: number[] = [];
    const threshold = 0.005; // 0.5% de diferencia para considerar un nivel diferente
    
    // Ordenar precios
    const sortedPrices = [...prices].sort((a, b) => findMin ? a - b : b - a);
    
    // Encontrar niveles
    for (const price of sortedPrices) {
      // Verificar si este precio ya está cerca de un nivel encontrado
      const isDuplicate = levels.some(level => 
        Math.abs(price - level) / level < threshold
      );
      
      if (!isDuplicate) {
        levels.push(price);
        
        // Si ya tenemos suficientes niveles, terminar
        if (levels.length >= count) break;
      }
    }
    
    return levels;
  }
  
  /**
   * Verifica si las condiciones generales del mercado son favorables
   * @param symbol Par de trading
   * @param config Configuración de la estrategia
   * @returns true si las condiciones son favorables
   */
  private async checkMarketConditions(symbol: string, config?: MicroStrategyConfig): Promise<boolean> {
    try {
      // Si se permite operar en mercado bajista, adaptamos la acción según la estrategia
      const action = config?.allowBearishOperations ? 'SELL' : 'BUY';
      
      // Verificar correlaciones y tendencias del mercado
      const isFavorable = await correlationService.isFavorableMarketCondition(symbol, action);
      
      if (!isFavorable) {
        logger.info({ 
          symbol,
          action,
          allowBearishOperations: config?.allowBearishOperations
        }, 'Market conditions not favorable for trading');
      }
      
      return isFavorable;
    } catch (error: any) {
      logger.error({
        symbol,
        error: error.message
      }, 'Error checking market conditions');
      
      // En caso de error, permitir la operación
      return true;
    }
  }
  
  /**
   * Determina si debe omitir una operación basada en criterios técnicos
   */
  private async shouldSkipBasedOnTechnicals(symbol: string, md: MarketData): Promise<boolean> {
    const tech = md.technicals;
    if (!tech) return false;
    
    // Criterios de filtrado técnico según el modo
    if (this.mode === MicroCapitalStrategy.MODE_GROWTH) {
      // Modo crecimiento: criterios más permisivos
      
      // Incluso en modo crecimiento, evitar extremos de RSI
      if (tech.rsi && tech.rsi > 85) {
        logger.info({ 
          symbol, 
          rsi: tech.rsi?.toFixed(2) 
        }, 'Skipping due to extremely overbought RSI');
        
        return true;
      }
      
      // Ser más permisivo con el volumen en modo crecimiento
      if (tech.volume_ratio && tech.volume_ratio < 0.4) {
        logger.info({ 
          symbol, 
          volumeRatio: tech.volume_ratio?.toFixed(2) 
        }, 'Skipping due to extremely low volume ratio');
        
        return true;
      }
    } else {
      // Modo conservador: criterios más estrictos
      
      // Si RSI está en extremos, saltar
      if (tech.rsi && tech.rsi > 80) {
        logger.info({ 
          symbol, 
          rsi: tech.rsi?.toFixed(2) 
        }, 'Skipping due to overbought RSI');
        
        return true;
      }
      
      // Si el volumen es bajo comparado con el promedio
      if (tech.volume_ratio && tech.volume_ratio < 0.5) {
        logger.info({ 
          symbol, 
          volumeRatio: tech.volume_ratio?.toFixed(2) 
        }, 'Skipping due to low volume ratio');
        
        return true;
      }
    }
    
    // No hay razones técnicas para saltar
    return false;
  }
}

// Instancias globales de la estrategia
export const microCapitalStrategy = new MicroCapitalStrategy();
export const microGrowthStrategy = new MicroCapitalStrategy({}, MicroCapitalStrategy.MODE_GROWTH);
