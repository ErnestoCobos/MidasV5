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
  execute(symbol: string, capital: number): Promise<TradeSignal>;
}

// Estrategia especializada para micro-capital (<$100)
export class MicroCapitalStrategy implements Strategy {
  name = "Micro-Scalping Conservador";
  description = "Estrategia ultra-conservadora para capital <$100. Prioriza preservación y oportunidades de alta probabilidad.";
  minCapital = 10;
  maxCapital = 100;
  
  constructor() {
    logger.info('MicroCapitalStrategy initialized');
  }
  
  /**
   * Ejecuta la estrategia micro-capital
   * @param symbol Par de trading (ej. BTCUSDT)
   * @param capital Capital total disponible
   * @returns Señal de trading recomendada
   */
  async execute(symbol: string, capital: number): Promise<TradeSignal> {
    try {
      // 1. Verificar sentimiento primero (ahorra llamadas API a DeepSeek si no es favorable)
      const asset = symbol.replace('USDT', '');
      const sentiment = await lunarCrushService.getMicroTradingSignal(asset);
      
      // Solo procesar si hay sentimiento positivo o neutral
      if (sentiment.signal === 'SELL' || sentiment.signal === 'STRONG_SELL') {
        logger.info({ 
          asset, 
          galaxyScore: sentiment.score, 
          threshold: sentiment.threshold 
        }, 'Skipping due to negative sentiment');
        
        return { action: 'HOLD', confidence: 0.0 };
      }
      
      // 2. Obtener datos de mercado mejorados
      const md = await marketDataService.getEnhancedMarketData(symbol);
      md.sentiment = sentiment.score;
      
    // 3. Verificar condiciones generales del mercado
    if (!await this.checkMarketConditions(symbol)) {
      logger.info({ symbol }, 'Skipping due to unfavorable market conditions');
      return { action: 'HOLD', confidence: 0.0 };
    }
    
    // 4. Realizar verificación técnica básica
    if (await this.shouldSkipBasedOnTechnicals(symbol, md)) {
      return { action: 'HOLD', confidence: 0.0 };
    }
    
    // 5. Consultar a DeepSeek con el prompt optimizado para micro-capital
      const signal = await deepSeekService.decide(md, capital, 'micro');
      
      // 5. Validación adicional de la señal
      if (signal.action !== 'HOLD' && (!signal.confidence || signal.confidence < 0.85)) {
        logger.info({ 
          symbol, 
          confidence: signal.confidence 
        }, 'Insufficient confidence for micro-capital');
        
        return { action: 'HOLD', confidence: 0.0 };
      }
      
      // 6. Verificar que el tamaño de posición sea adecuado
      if (signal.action !== 'HOLD' && signal.position_size) {
        // Si la posición es < $5 USD, no es viable en la mayoría de exchanges
        if (signal.position_size < 5) {
          logger.info({ 
            positionSize: signal.position_size 
          }, 'Position size too small for viable trading');
          
          return { action: 'HOLD', confidence: 0.0 };
        }
        
        // Limitar el tamaño máximo de posición a 20% del capital
        const maxPosition = capital * 0.2;
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
   * @returns true si las condiciones son favorables
   */
  private async checkMarketConditions(symbol: string): Promise<boolean> {
    try {
      // Verificar correlaciones y tendencias del mercado
      const isFavorable = await correlationService.isFavorableMarketCondition(symbol, 'BUY');
      
      if (!isFavorable) {
        logger.info({ 
          symbol 
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
    
    // Criterios de filtrado técnico para micro-capital
    
    // Si RSI está en extremos, saltar (excepto si es muy sobreventa)
    if (tech.rsi && tech.rsi > 80) {
      logger.info({ 
        symbol, 
        rsi: tech.rsi?.toFixed(2) 
      }, 'Skipping due to overbought RSI');
      
      return true;
    }
    
    // Si el volumen es muy bajo comparado con el promedio
    if (tech.volume_ratio && tech.volume_ratio < 0.7) {
      logger.info({ 
        symbol, 
        volumeRatio: tech.volume_ratio?.toFixed(2) 
      }, 'Skipping due to low volume ratio');
      
      return true;
    }
    
    // Si no hay soportes identificables (indica poca estructura de mercado)
    if (!tech.supports || tech.supports.length === 0) {
      logger.info({ symbol }, 'Skipping due to no identifiable support levels');
      return true;
    }
    
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
      // Stop loss máximo: 1.2% para compras
      signal.stopLoss = signal.entry * 0.988; // 1.2% por debajo
      logger.info({
        stopLoss: signal.stopLoss
      }, 'Stop loss added automatically');
    } else if (!signal.stopLoss && signal.action === 'SELL') {
      // Stop loss para ventas: 1.2% por encima
      signal.stopLoss = signal.entry * 1.012;
      logger.info({
        stopLoss: signal.stopLoss
      }, 'Stop loss added automatically');
    }
    
    // Asegurarse de que hay take profit
    if (!signal.takeProfit && signal.action === 'BUY') {
      // Take profit mínimo: 1.5% para compras
      signal.takeProfit = signal.entry * 1.015;
      logger.info({
        takeProfit: signal.takeProfit
      }, 'Take profit added automatically');
    } else if (!signal.takeProfit && signal.action === 'SELL') {
      // Take profit para ventas: 1.5% por debajo
      signal.takeProfit = signal.entry * 0.985;
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
      // y el riesgo aceptable
      if (signal.useTrailingStop && !signal.trailingStopPercent) {
        // Distancia más pequeña para micro-capital (más conservador)
        // Mínimo 0.8%, máximo 2.5%
        const trailingDistance = Math.max(0.8, Math.min(2.5, 
          // Fórmula: a mayor confianza, mayor distancia (permite más espacio para beneficios)
          1.0 + (signal.confidence - 0.85) * 5
        ));
        
        signal.trailingStopPercent = trailingDistance;
        
        logger.info({
          price: currentPrice,
          confidence: signal.confidence,
          trailingDistance: trailingDistance.toFixed(2) + '%'
        }, 'Trailing stop calculated automatically');
      }
    }
  }
}

// Instancia global de la estrategia de micro-capital
export const microCapitalStrategy = new MicroCapitalStrategy();
