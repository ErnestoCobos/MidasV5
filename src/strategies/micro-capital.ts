import { logger, tradeLogger } from '../utils/logging';
import { lunarCrushService } from '../services/lunarcrush';
import { deepSeekService, TradeSignal } from '../services/deepseek';
import { binanceService } from '../services/binance';
import { marketDataService, MarketData } from '../services/market-data';
import { correlationService } from '../services/correlation';
import { env, isDryRun } from '../utils/env';

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
  
  constructor(config: MicroStrategyConfig = {}, mode: string = MicroCapitalStrategy.MODE_CONSERVATIVE) {
    this.mode = mode;
    
    // Ajustar la configuración según el modo
    if (mode === MicroCapitalStrategy.MODE_GROWTH) {
      this.name = "Micro-Growth Accelerator";
      this.description = "Estrategia agresiva para maximizar crecimiento de capital. Prioriza retornos sobre preservación.";
      
      this.config = {
        ignoreMarketConditions: config.ignoreMarketConditions || true,  // Más permisivo con condiciones de mercado
        minConfidence: config.minConfidence || 0.80,  // Umbral de confianza más bajo
        allowBearishOperations: config.allowBearishOperations || true   // Permitir operaciones en mercado bajista
      };
    } else {
      // Configuración conservadora por defecto
      this.config = {
        ignoreMarketConditions: config.ignoreMarketConditions || false,
        minConfidence: config.minConfidence || 0.85,
        allowBearishOperations: config.allowBearishOperations || false
      };
    }
    
    logger.info({
      mode: this.mode,
      ...this.config
    }, 'MicroCapitalStrategy initialized with config');
  }
  
  /**
   * Ejecuta la estrategia micro-capital
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
      md.sentiment = sentiment.score;
      
    // 3. Verificar condiciones generales del mercado (si no estamos ignorándolas)
    if (!config.ignoreMarketConditions && !await this.checkMarketConditions(symbol, config)) {
      logger.info({ 
        symbol,
        ignoreMarketConditions: config.ignoreMarketConditions 
      }, 'Skipping due to unfavorable market conditions');
      return { action: 'HOLD', confidence: 0.0 };
    }
    
    // 4. Realizar verificación técnica básica
    if (await this.shouldSkipBasedOnTechnicals(symbol, md)) {
      return { action: 'HOLD', confidence: 0.0 };
    }
    
    // 5. Consultar a DeepSeek con el prompt optimizado para la estrategia seleccionada
      const signal = await deepSeekService.decide(md, capital, strategyType);
      
      // 5. Validación adicional de la señal con el umbral configurable
      const minConfidence = config.minConfidence || 0.70;
      if (signal.action !== 'HOLD' && (!signal.confidence || signal.confidence < minConfidence)) {
        logger.info({ 
          symbol, 
          confidence: signal.confidence,
          requiredConfidence: minConfidence
        }, 'Insufficient confidence for micro-capital');
        
        return { action: 'HOLD', confidence: 0.0 };
      }
      
      // 6. Verificar que el tamaño de posición sea adecuado
      if (signal.action !== 'HOLD' && signal.position_size) {
        // Si la posición es < $3 USD, no es viable en la mayoría de exchanges
        if (signal.position_size < 3) {
          logger.info({ 
            positionSize: signal.position_size 
          }, 'Position size too small for viable trading');
          
          return { action: 'HOLD', confidence: 0.0 };
        }
        
        // Limitar el tamaño máximo de posición según el modo
        // Modo crecimiento: hasta 40% del capital para mayor exposición
        // Modo conservador: hasta 30% del capital para mayor diversificación
        const maxPosition = capital * (this.mode === MicroCapitalStrategy.MODE_GROWTH ? 0.4 : 0.3);
        if (signal.position_size > maxPosition) {
          signal.position_size = maxPosition;
          logger.info({ 
            adjustedPositionSize: maxPosition.toFixed(2) 
          }, 'Position size adjusted to maximum allowed');
        }
      }
      
      // 7. Aplicar reglas adicionales de riesgo
      this.applyRiskManagementRules(signal, md.price);
      
      // 8. Log completo de la señal
      tradeLogger.info({ 
        symbol,
        action: signal.action,
        confidence: signal.confidence,
        position_size: signal.position_size,
        entry: signal.entry,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        reasoning: signal.reasoning
      }, 'MicroCapital strategy signal generated');
      
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
    
    // Comentado para permitir más operaciones
    // Si no hay soportes identificables (indica poca estructura de mercado)
    // if (!tech.supports || tech.supports.length === 0) {
    //   logger.info({ symbol }, 'Skipping due to no identifiable support levels');
    //   return true;
    // }
    
    // No hay razones técnicas para saltar
    return false;
  }
  
  /**
   * Aplica reglas de gestión de riesgo a la señal
   */
  private applyRiskManagementRules(signal: TradeSignal, currentPrice: number): void {
    if (signal.action === 'HOLD' || !currentPrice) return;
    
    // Si no hay entrada, usar precio actual
    if (!signal.entry) {
      signal.entry = currentPrice;
    }
    
    // Asegurarse de que hay stop loss
    if (!signal.stopLoss && signal.action === 'BUY') {
      // Stop loss máximo: 1.5% para compras (ajustado desde 1.2%)
      signal.stopLoss = signal.entry * 0.985; // 1.5% por debajo
      logger.info({
        stopLoss: signal.stopLoss
      }, 'Stop loss added automatically');
    } else if (!signal.stopLoss && signal.action === 'SELL') {
      // Stop loss para ventas: 1.5% por encima (ajustado desde 1.2%)
      signal.stopLoss = signal.entry * 1.015;
      logger.info({
        stopLoss: signal.stopLoss
      }, 'Stop loss added automatically');
    }
    
    // Configurar take profit según el modo y escalonarlo para maximizar ganancias
    if (!signal.takeProfit && signal.action === 'BUY') {
      if (this.mode === MicroCapitalStrategy.MODE_GROWTH) {
        // Modo crecimiento: take profit más agresivo (2.5-3.0%)
        // Se implementará un sistema de take profit escalonado en front-end
        const takeProfit = signal.entry * 1.025; // 2.5% base para modo crecimiento
        signal.takeProfit = takeProfit;
        
        // Agregar información sobre escalonamiento en el reasoning
        if (signal.reasoning) {
          signal.reasoning += ` Recomendación: considerar toma de beneficios escalonada a 1.5%, 2.5% y 3.5%.`;
        }
        
        logger.info({
          takeProfit: signal.takeProfit,
          mode: 'growth'
        }, 'Aggressive take profit added automatically');
      } else {
        // Modo conservador: take profit estándar (2.0%)
        signal.takeProfit = signal.entry * 1.020;
        logger.info({
          takeProfit: signal.takeProfit
        }, 'Take profit added automatically');
      }
    } else if (!signal.takeProfit && signal.action === 'SELL') {
      // Similar para ventas
      if (this.mode === MicroCapitalStrategy.MODE_GROWTH) {
        signal.takeProfit = signal.entry * 0.975; // -2.5% para ventas
      } else {
        signal.takeProfit = signal.entry * 0.980; // -2.0% para ventas
      }
      logger.info({
        takeProfit: signal.takeProfit
      }, 'Take profit added automatically');
    }
    
    // Configurar trailing stop para posiciones largas (BUY)
    if (signal.action === 'BUY') {
      // Por defecto, activar trailing stop para señales con alta confianza
      // excepto si se ha desactivado explícitamente
      if (signal.useTrailingStop === undefined && signal.confidence >= 0.9) {
        signal.useTrailingStop = true;
      }
      
      // Si no hay un trailing stop definido, calcularlo basado en la volatilidad
      // y el riesgo aceptable, ajustando según el modo
      if (signal.useTrailingStop && !signal.trailingStopPercent) {
        let trailingDistance;
        
        if (this.mode === MicroCapitalStrategy.MODE_GROWTH) {
          // Modo crecimiento: trailing stop más ajustado para capturar más movimiento
          // Mínimo 0.7%, máximo 2.5%
          trailingDistance = Math.max(0.7, Math.min(2.5, 
            // Fórmula optimizada para crecimiento
            0.9 + (signal.confidence - 0.8) * 5.5
          ));
        } else {
          // Modo conservador: trailing stop más amplio para reducir falsas salidas
          // Mínimo 0.8%, máximo 2.5%
          trailingDistance = Math.max(0.8, Math.min(2.5, 
            // Fórmula original
            1.0 + (signal.confidence - 0.85) * 5
          ));
        }
        
        signal.trailingStopPercent = trailingDistance;
        
        logger.info({
          price: currentPrice,
          confidence: signal.confidence,
          mode: this.mode,
          trailingDistance: trailingDistance.toFixed(2) + '%'
        }, 'Trailing stop calculated automatically');
      }
    }
  }
}

// Instancias globales de la estrategia
export const microCapitalStrategy = new MicroCapitalStrategy();
export const microGrowthStrategy = new MicroCapitalStrategy({}, MicroCapitalStrategy.MODE_GROWTH);
