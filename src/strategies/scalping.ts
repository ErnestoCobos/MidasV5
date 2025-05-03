/**
 * Implementación de la estrategia de scalping automatizado
 * 
 * Mejoras v2:
 * - Ajuste dinámico de parámetros basado en volatilidad (ATR)
 * - Seguimiento mejorado de rendimiento
 * - Capacidades de simulación y backtesting
 */
import { binanceService } from '../services/binance';
import { deepSeekService, TradeSignal, MarketData } from '../services/deepseek';
import { logger } from '../utils/logging';
import { Candle } from '../utils/indicators';
import { Strategy } from './micro-capital';
import { tradeHistoryService } from '../services/trade-history';

// Configuración para scalping
export interface ScalpingConfig {
  // Parámetros básicos
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent: number;
  positionSizePercent: number;
  maxPositions: number;
  minVolume: number;
  maxSpread: number;
  maxDailyDrawdown: number;
  
  // Parámetros de ajuste dinámico
  dynamicStopLoss: boolean;       // Activa ajuste dinámico de SL basado en ATR
  dynamicTakeProfit: boolean;     // Activa ajuste dinámico de TP basado en ATR
  atrMultiplierSL: number;        // Multiplicador de ATR para stop loss
  atrMultiplierTP: number;        // Multiplicador de ATR para take profit
  atrPeriod: number;              // Período para cálculo de ATR
  
  // Parámetros de testeo
  simulationMode: boolean;        // Ejecuta en modo simulación (sin órdenes reales)
  trackPerformance: boolean;      // Registra métricas detalladas de rendimiento
}

// Interfaz para seguimiento de rendimiento
interface PerformanceMetrics {
  totalSignals: number;
  buySignals: number;
  sellSignals: number;
  holdSignals: number;
  avgConfidence: number;
  avgSpread: number;
  timestampLastRun: number;
  timeFrameDistribution: Record<string, number>;
  lastExecutionTime: number;
}

/**
 * Estrategia de scalping para operaciones automatizadas
 */
export class ScalpingStrategy implements Strategy {
  name = "Scalping Automatizado";
  description = "Estrategia de scalping para operaciones de muy corto plazo con ajustes dinámicos";
  minCapital = 50;
  maxCapital = 10000;

  private config: ScalpingConfig;
  private performanceData: PerformanceMetrics;
  
  constructor(config?: Partial<ScalpingConfig>) {
    // Configuración por defecto
    this.config = {
      // Parámetros básicos
      stopLossPercent: 0.8,
      takeProfitPercent: 1.5,
      trailingStopPercent: 0.4,
      positionSizePercent: 10,
      maxPositions: 3,
      minVolume: 1000000,
      maxSpread: 0.2,
      maxDailyDrawdown: 5,
      
      // Ajustes dinámicos
      dynamicStopLoss: true,
      dynamicTakeProfit: true,
      atrMultiplierSL: 1.5,
      atrMultiplierTP: 3.0,
      atrPeriod: 14,
      
      // Testeo y simulación
      simulationMode: true,
      trackPerformance: true,
      
      // Aplicar configuraciones personalizadas
      ...config
    };
    
    // Inicializar métricas de rendimiento
    this.performanceData = {
      totalSignals: 0,
      buySignals: 0,
      sellSignals: 0,
      holdSignals: 0,
      avgConfidence: 0,
      avgSpread: 0,
      timestampLastRun: 0,
      timeFrameDistribution: {},
      lastExecutionTime: 0
    };
  }
  
  /**
   * Implementación de la estrategia de scalping con ajustes dinámicos
   */
  async execute(symbol: string, capital: number, options?: any): Promise<TradeSignal> {
    const startTime = Date.now();
    
    try {
      // Verificar si hay una operación abierta para este par
      if (this.config.trackPerformance && !options?.ignoreOpenTrades) {
        const openTrade = await tradeHistoryService.getOpenTrade(symbol);
        if (openTrade) {
          logger.info({
            symbol,
            tradeId: openTrade.id,
            entryPrice: openTrade.entry
          }, 'Ya existe una operación abierta para este par, omitiendo análisis');
          
          return {
            action: 'HOLD',
            confidence: 0.5,
            reasoning: `Ya existe una operación abierta para ${symbol} con ID ${openTrade.id}.`
          };
        }
      }
      
      // Obtener datos de mercado
      const ticker = await binanceService.getTicker24H(symbol);
      if (!ticker) {
        this.updatePerformanceMetrics('HOLD', 0, 0);
        return { 
          action: 'HOLD', 
          confidence: 0, 
          reasoning: `No se pudieron obtener datos de mercado para ${symbol}.`
        };
      }
      
      // Verificar spread
      const spread = (parseFloat(ticker.askPrice) - parseFloat(ticker.bidPrice)) / parseFloat(ticker.lastPrice) * 100;
      if (spread > this.config.maxSpread) {
        this.updatePerformanceMetrics('HOLD', 0, spread);
        return { 
          action: 'HOLD', 
          confidence: 0, 
          reasoning: `Spread demasiado alto para scalping (${spread.toFixed(3)}% > ${this.config.maxSpread}%).`
        };
      }
      
      // Obtener datos históricos en múltiples timeframes para análisis completo
      const candles1m = await binanceService.getHistoricalCandles(symbol, '1m', 100);
      const candles5m = await binanceService.getHistoricalCandles(symbol, '5m', 60);
      const candles15m = await binanceService.getHistoricalCandles(symbol, '15m', 30);
      
      if (!candles1m.length) {
        this.updatePerformanceMetrics('HOLD', 0, spread);
        return { 
          action: 'HOLD', 
          confidence: 0, 
          reasoning: `Datos de velas insuficientes para ${symbol}.`
        };
      }
      
      // Análisis básico
      const currentPrice = parseFloat(ticker.lastPrice);
      
      // Calcular ATR para ajustes dinámicos
      const atr = this.calculateATR(candles15m, this.config.atrPeriod);
      
      // Calcular soportes y resistencias
      const levels = this.identifySupportResistance(candles15m);
      
      // Usar deepSeek para análisis avanzado
      const marketData: MarketData = {
        symbol,
        price: currentPrice,
        volume24h: parseFloat(ticker.quoteVolume),
        sentiment: 50,
        technicals: {
          rsi: this.calculateRSI(candles1m),
          ema_cross: this.detectEmaCross(candles5m),
          volume_ratio: this.calculateVolumeRatio(candles5m),
          bband_percent: 0.5, // Valor por defecto
          atr: atr,
          supports: levels.supports,
          resistances: levels.resistances
        }
      };
      
      // Usar método normal de deepSeek
      const signal = await deepSeekService.decide(marketData, capital, 'micro');
      
      // Personalizar la señal para scalping
      if (signal.action === 'BUY') {
        // Si no hay entrada específica, usar precio actual
        if (!signal.entry) {
          signal.entry = currentPrice;
        }
        
        // Establecer stop loss adaptado a volatilidad si está activado el modo dinámico
        if (!signal.stopLoss) {
          if (this.config.dynamicStopLoss && atr > 0) {
            // Stop loss basado en ATR
            const stopLossAmount = atr * this.config.atrMultiplierSL;
            signal.stopLoss = signal.entry - stopLossAmount;
            
            // Limitar a un máximo basado en la configuración base
            const maxStopLoss = signal.entry * (1 - this.config.stopLossPercent / 100);
            signal.stopLoss = Math.max(signal.stopLoss, maxStopLoss);
          } else {
            // Usar stop loss fijo si no está en modo dinámico
            signal.stopLoss = signal.entry * (1 - this.config.stopLossPercent / 100);
          }
        }
        
        // Establecer take profit adaptado a volatilidad si está activado el modo dinámico
        if (!signal.takeProfit) {
          if (this.config.dynamicTakeProfit && atr > 0) {
            // Take profit basado en ATR
            const takeProfitAmount = atr * this.config.atrMultiplierTP;
            signal.takeProfit = signal.entry + takeProfitAmount;
            
            // Asegurar un mínimo basado en la configuración base
            const minTakeProfit = signal.entry * (1 + this.config.takeProfitPercent / 100);
            signal.takeProfit = Math.max(signal.takeProfit, minTakeProfit);
          } else {
            // Usar take profit fijo si no está en modo dinámico
            signal.takeProfit = signal.entry * (1 + this.config.takeProfitPercent / 100);
          }
        }
        
        // Añadir trailing stop
        signal.useTrailingStop = true;
        signal.trailingStopPercent = this.config.trailingStopPercent;
        
        // Ajustar tamaño de posición si no está especificado
        if (!signal.position_size) {
          signal.position_size = capital * (this.config.positionSizePercent / 100);
        }
        
        // Agregar análisis detallado con verificación segura de undefined
        signal.analysis = `Scalping - RSI: ${marketData.technicals?.rsi?.toFixed(2) || 'N/A'}, EMA: ${marketData.technicals?.ema_cross || 'N/A'}, ATR: ${atr?.toFixed(6) || 'N/A'}, SL: ${signal.stopLoss?.toFixed(6) || 'N/A'}, TP: ${signal.takeProfit?.toFixed(6) || 'N/A'}`;
        
        // Registrar para métricas
        this.updatePerformanceMetrics('BUY', signal.confidence, spread);
      } else if (signal.action === 'SELL') {
        this.updatePerformanceMetrics('SELL', signal.confidence, spread);
      } else {
        this.updatePerformanceMetrics('HOLD', signal.confidence, spread);
      }
      
      // Registrar tiempo de ejecución para métricas de rendimiento
      this.performanceData.lastExecutionTime = Date.now() - startTime;
      
      // Registrar en logs si está en modo simulación
      if (this.config.simulationMode && signal.action !== 'HOLD') {
        logger.info({
          symbol,
          action: signal.action,
          entry: signal.entry,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          confidence: signal.confidence,
          simulationMode: true
        }, '[SIMULACIÓN] Señal de scalping generada');
      }
      
      return signal;
    } catch (error) {
      logger.error({ symbol, capital, error }, 'Error ejecutando estrategia de scalping');
      return { 
        action: 'HOLD', 
        confidence: 0, 
        reasoning: 'Error en la ejecución de la estrategia de scalping.'
      };
    }
  }
  /**
   * Calcula el RSI (Relative Strength Index) para una serie de velas
   * @param candles Serie de velas para calcular el RSI
   * @param period Período para el cálculo (por defecto 14)
   * @returns Valor del RSI entre 0 y 100
   */
  private calculateRSI(candles: Candle[], period: number = 14): number {
    if (candles.length < period + 1) {
      return 50; // Valor neutral si no hay suficientes datos
    }
    
    // Calcular cambios de precio
    const changes = [];
    for (let i = 1; i < candles.length; i++) {
      changes.push(candles[i].close - candles[i - 1].close);
    }
    
    // Tomar solo los cambios más recientes
    const recentChanges = changes.slice(-period);
    
    // Calcular ganancias y pérdidas
    let gains = 0;
    let losses = 0;
    
    for (const change of recentChanges) {
      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }
    
    // Evitar división por cero
    if (losses === 0) {
      return 100; // Solo ganancias, sin pérdidas
    }
    
    // Calcular RSI
    const relativeStrength = gains / losses;
    const rsi = 100 - (100 / (1 + relativeStrength));
    
    return rsi;
  }
  
  /**
   * Detecta cruces de medias móviles exponenciales
   * @param candles Serie de velas para calcular EMAs
   * @param fastPeriod Período para EMA rápida (por defecto 8)
   * @param slowPeriod Período para EMA lenta (por defecto 21)
   * @returns 'bullish', 'bearish', 'bullish_trend', 'bearish_trend' o 'neutral'
   */
  private detectEmaCross(candles: Candle[], fastPeriod: number = 8, slowPeriod: number = 21): string {
    if (candles.length < slowPeriod + 2) {
      return 'neutral'; // No hay suficientes datos
    }
    
    // Extraer precios de cierre
    const prices = candles.map(c => c.close);
    
    // Calcular EMAs
    const fastEMA = this.calculateEMA(prices, fastPeriod);
    const slowEMA = this.calculateEMA(prices, slowPeriod);
    
    if (fastEMA.length < 2 || slowEMA.length < 2) {
      return 'neutral';
    }
    
    // Obtener valores actuales y anteriores
    const currentFast = fastEMA[fastEMA.length - 1];
    const previousFast = fastEMA[fastEMA.length - 2];
    const currentSlow = slowEMA[slowEMA.length - 1];
    const previousSlow = slowEMA[slowEMA.length - 2];
    
    // Verificar cruce alcista (EMA rápida cruza por encima de la lenta)
    if (previousFast <= previousSlow && currentFast > currentSlow) {
      return 'bullish';
    }
    
    // Verificar cruce bajista (EMA rápida cruza por debajo de la lenta)
    if (previousFast >= previousSlow && currentFast < currentSlow) {
      return 'bearish';
    }
    
    // Verificar tendencia alcista (EMA rápida por encima de la lenta)
    if (currentFast > currentSlow) {
      return 'bullish_trend';
    }
    
    // Verificar tendencia bajista (EMA rápida por debajo de la lenta)
    if (currentFast < currentSlow) {
      return 'bearish_trend';
    }
    
    // Si no se detecta ningún patrón claro
    return 'neutral';
  }
  
  /**
   * Calcula la media móvil exponencial
   * @param prices Array de precios
   * @param period Período para el cálculo
   * @returns Array con los valores de EMA
   */
  private calculateEMA(prices: number[], period: number): number[] {
    if (prices.length < period) {
      return [];
    }
    
    // Calcular SMA inicial
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    const sma = sum / period;
    
    // Multiplicador para EMA
    const multiplier = 2 / (period + 1);
    
    // Array para resultados
    const emaValues: number[] = [sma];
    
    // Calcular EMA para el resto de precios
    for (let i = period; i < prices.length; i++) {
      const ema = (prices[i] - emaValues[emaValues.length - 1]) * multiplier + emaValues[emaValues.length - 1];
      emaValues.push(ema);
    }
    
    return emaValues;
  }
  
  /**
   * Calcula el ATR (Average True Range) para medir la volatilidad
   * @param candles Serie de velas
   * @param period Período para el cálculo (por defecto 14)
   * @returns Valor del ATR
   */
  private calculateATR(candles: Candle[], period: number = 14): number {
    if (candles.length < period + 1) {
      return 0; // No hay suficientes datos
    }
    
    // Calcular True Range para cada vela
    const trValues: number[] = [];
    
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      
      // True Range es el máximo de:
      // 1. (High - Low) actual
      // 2. |High - Close previo|
      // 3. |Low - Close previo|
      const tr1 = high - low;
      const tr2 = Math.abs(high - prevClose);
      const tr3 = Math.abs(low - prevClose);
      
      const trueRange = Math.max(tr1, tr2, tr3);
      trValues.push(trueRange);
    }
    
    // Para el primer valor de ATR, calculamos el promedio simple
    if (trValues.length <= period) {
      // Si no hay suficientes valores, calcular promedio de los disponibles
      return trValues.reduce((sum, val) => sum + val, 0) / trValues.length;
    }
    
    // Tomar solo los valores más recientes para el período
    const recentTrValues = trValues.slice(-period - 1);
    
    // Calcular ATR como promedio simple de TR para el primer valor
    let atr = recentTrValues.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    
    // Aplicar suavizado para el último valor (Wilder's smoothing method)
    atr = ((period - 1) * atr + recentTrValues[recentTrValues.length - 1]) / period;
    
    return atr;
  }
  
  /**
   * Calcula la relación de volumen actual vs promedio
   * @param candles Serie de velas
   * @param period Período para el promedio (por defecto 20)
   * @returns Relación de volumen (>1 significa volumen por encima del promedio)
   */
  private calculateVolumeRatio(candles: Candle[], period: number = 20): number {
    if (candles.length < period + 1) {
      return 1.0; // Valor neutral si no hay suficientes datos
    }
    
    // Extraer volúmenes
    const volumes = candles.map(c => c.volume);
    
    // Calcular promedio de volumen excluyendo la vela actual
    const avgVolume = volumes.slice(-period - 1, -1).reduce((sum, vol) => sum + vol, 0) / period;
    
    // Volumen actual (última vela)
    const currentVolume = volumes[volumes.length - 1];
    
    // Evitar división por cero
    if (avgVolume === 0) return 1.0;
    
    // Calcular ratio
    return currentVolume / avgVolume;
  }
  
  /**
   * Identifica niveles de soporte y resistencia
   * @param candles Serie de velas
   * @param sensitivity Sensibilidad para detectar pivots (por defecto 3)
   * @returns Objetos con arrays de niveles de soporte y resistencia
   */
  private identifySupportResistance(candles: Candle[], sensitivity: number = 3): { 
    supports: number[], 
    resistances: number[] 
  } {
    // Inicializar arrays
    const supports: number[] = [];
    const resistances: number[] = [];
    
    // Verificar que haya suficientes datos
    if (candles.length < sensitivity * 2 + 1) {
      return { supports, resistances };
    }
    
    // Buscar pivots (puntos de inflexión)
    for (let i = sensitivity; i < candles.length - sensitivity; i++) {
      // Verificar si es un pivot bajo (potencial soporte)
      let isLowPivot = true;
      for (let j = i - sensitivity; j <= i + sensitivity; j++) {
        if (j === i) continue; // Saltar la comparación con sí mismo
        if (candles[j].low < candles[i].low) {
          isLowPivot = false;
          break;
        }
      }
      
      // Verificar si es un pivot alto (potencial resistencia)
      let isHighPivot = true;
      for (let j = i - sensitivity; j <= i + sensitivity; j++) {
        if (j === i) continue;
        if (candles[j].high > candles[i].high) {
          isHighPivot = false;
          break;
        }
      }
      
      // Agregar a los arrays correspondientes
      if (isLowPivot) {
        supports.push(candles[i].low);
      }
      
      if (isHighPivot) {
        resistances.push(candles[i].high);
      }
    }
    
    // Limitar a los 5 niveles más cercanos al precio actual
    const currentPrice = candles[candles.length - 1].close;
    
    // Ordenar niveles por proximidad al precio actual
    supports.sort((a, b) => Math.abs(currentPrice - a) - Math.abs(currentPrice - b));
    resistances.sort((a, b) => Math.abs(currentPrice - a) - Math.abs(currentPrice - b));
    
    // Tomar solo los más cercanos
    return {
      supports: supports.slice(0, 5),
      resistances: resistances.slice(0, 5)
    };
  }
  
  /**
   * Actualiza las métricas de rendimiento
   * @param action Acción de trading (BUY, SELL, HOLD)
   * @param confidence Nivel de confianza de la señal
   * @param spread Spread actual
   */
  private updatePerformanceMetrics(action: 'BUY' | 'SELL' | 'HOLD', confidence: number, spread: number): void {
    // Actualizar contadores
    this.performanceData.totalSignals++;
    
    if (action === 'BUY') {
      this.performanceData.buySignals++;
    } else if (action === 'SELL') {
      this.performanceData.sellSignals++;
    } else {
      this.performanceData.holdSignals++;
    }
    
    // Actualizar promedio de confianza
    this.performanceData.avgConfidence = (
      (this.performanceData.avgConfidence * (this.performanceData.totalSignals - 1)) + confidence
    ) / this.performanceData.totalSignals;
    
    // Actualizar promedio de spread
    if (spread > 0) {
      this.performanceData.avgSpread = (
        (this.performanceData.avgSpread * (this.performanceData.totalSignals - 1)) + spread
      ) / this.performanceData.totalSignals;
    }
    
    // Registrar timestamp de última ejecución
    this.performanceData.timestampLastRun = Date.now();
  }
  
  /**
   * Obtiene las métricas de rendimiento actuales
   * @returns Objeto con métricas de rendimiento
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceData };
  }
  
  /**
   * Reinicia las métricas de rendimiento
   */
  resetPerformanceMetrics(): void {
    this.performanceData = {
      totalSignals: 0,
      buySignals: 0,
      sellSignals: 0,
      holdSignals: 0,
      avgConfidence: 0,
      avgSpread: 0,
      timestampLastRun: 0,
      timeFrameDistribution: {},
      lastExecutionTime: 0
    };
    logger.info('Métricas de rendimiento de estrategia de scalping reiniciadas');
  }
  
  /**
   * Ejecuta la estrategia en modo backtesting con datos históricos
   * @param symbol Par de trading
   * @param startTime Timestamp de inicio
   * @param endTime Timestamp de fin
   * @param capital Capital inicial
   * @returns Resultados del backtest
   */
  async runBacktest(
    symbol: string, 
    startTime: number, 
    endTime: number, 
    capital: number
  ): Promise<{
    trades: any[],
    finalCapital: number,
    profitLoss: number,
    profitLossPercent: number,
    maxDrawdown: number,
    winRate: number,
    tradesCount: number
  }> {
    try {
      // Obtener datos históricos
      const candles = await binanceService.getHistoricalCandles(symbol, '15m', 1000);
      
      if (candles.length < 30) {
        throw new Error('Datos históricos insuficientes para backtest');
      }
      
      // Filtrar por rango de tiempo si se proporcionó
      const filteredCandles = candles.filter(
        c => startTime <= c.openTime && c.closeTime <= endTime
      );
      
      logger.info({
        symbol,
        totalCandles: filteredCandles.length,
        startDate: new Date(startTime),
        endDate: new Date(endTime)
      }, 'Iniciando backtest de estrategia de scalping');
      
      // Guardar configuración original
      const originalConfig = { ...this.config };
      
      // Configurar para backtest
      this.config.simulationMode = true;
      this.config.trackPerformance = true;
      
      // Variables para backtest
      let currentCapital = capital;
      const trades: any[] = [];
      let maxDrawdown = 0;
      let peakCapital = capital;
      let inPosition = false;
      let entryPrice = 0;
      let positionSize = 0;
      
      // Ejecutar backtest con cada vela
      for (let i = 30; i < filteredCandles.length; i++) {
        // Crear un conjunto de datos históricos hasta este punto
        const historicalData = filteredCandles.slice(0, i + 1);
        
        // Obtener señal para este punto
        const signal = await this.execute(symbol, currentCapital, { 
          ignoreOpenTrades: true,
          historicalData
        });
        
        // Procesar señal
        if (signal.action === 'BUY' && !inPosition) {
          // Abrir posición
          entryPrice = filteredCandles[i].close;
          positionSize = currentCapital * (this.config.positionSizePercent / 100);
          inPosition = true;
          
          trades.push({
            type: 'BUY',
            price: entryPrice,
            time: filteredCandles[i].closeTime,
            amount: positionSize,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit
          });
          
        } else if (signal.action === 'SELL' && inPosition) {
          // Cerrar posición
          const exitPrice = filteredCandles[i].close;
          const pnl = positionSize * ((exitPrice / entryPrice) - 1);
          currentCapital += pnl;
          
          // Actualizar drawdown
          if (currentCapital > peakCapital) {
            peakCapital = currentCapital;
          } else {
            const drawdown = (peakCapital - currentCapital) / peakCapital * 100;
            if (drawdown > maxDrawdown) {
              maxDrawdown = drawdown;
            }
          }
          
          trades.push({
            type: 'SELL',
            price: exitPrice,
            time: filteredCandles[i].closeTime,
            amount: positionSize,
            pnl
          });
          
          inPosition = false;
        }
        
        // Verificar stop loss y take profit para operaciones abiertas
        if (inPosition) {
          const currentPrice = filteredCandles[i].close;
          
          // Buscar última operación de compra
          const lastBuy = [...trades].reverse().find(t => t.type === 'BUY');
          
          // Comprobar si alcanzó stop loss
          if (lastBuy && lastBuy.stopLoss && currentPrice <= lastBuy.stopLoss) {
            // Ejecutar stop loss
            const pnl = positionSize * ((lastBuy.stopLoss / entryPrice) - 1);
            currentCapital += pnl;
            
            trades.push({
              type: 'STOP_LOSS',
              price: lastBuy.stopLoss,
              time: filteredCandles[i].closeTime,
              amount: positionSize,
              pnl
            });
            
            inPosition = false;
            
            // Actualizar drawdown
            const drawdown = (peakCapital - currentCapital) / peakCapital * 100;
            if (drawdown > maxDrawdown) {
              maxDrawdown = drawdown;
            }
          }
          
          // Comprobar si alcanzó take profit
          if (lastBuy && lastBuy.takeProfit && currentPrice >= lastBuy.takeProfit) {
            // Ejecutar take profit
            const pnl = positionSize * ((lastBuy.takeProfit / entryPrice) - 1);
            currentCapital += pnl;
            
            trades.push({
              type: 'TAKE_PROFIT',
              price: lastBuy.takeProfit,
              time: filteredCandles[i].closeTime,
              amount: positionSize,
              pnl
            });
            
            inPosition = false;
            
            if (currentCapital > peakCapital) {
              peakCapital = currentCapital;
            }
          }
        }
      }
      
      // Calcular estadísticas finales
      const winningTrades = trades.filter(t => 
        (t.type === 'SELL' || t.type === 'TAKE_PROFIT' || t.type === 'STOP_LOSS') && t.pnl > 0
      ).length;
      
      const losingTrades = trades.filter(t => 
        (t.type === 'SELL' || t.type === 'TAKE_PROFIT' || t.type === 'STOP_LOSS') && t.pnl < 0
      ).length;
      
      const closedTradesCount = winningTrades + losingTrades;
      const winRate = closedTradesCount > 0 ? (winningTrades / closedTradesCount) * 100 : 0;
      
      // Restaurar configuración original
      this.config = originalConfig;
      
      // Devolver resultados
      return {
        trades,
        finalCapital: currentCapital,
        profitLoss: currentCapital - capital,
        profitLossPercent: ((currentCapital / capital) - 1) * 100,
        maxDrawdown,
        winRate,
        tradesCount: trades.length
      };
      
    } catch (error) {
      logger.error({ error }, 'Error ejecutando backtest de estrategia de scalping');
      throw error;
    }
  }
}

// Exportar instancia por defecto
export const scalpingStrategy = new ScalpingStrategy();
