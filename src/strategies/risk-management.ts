import { logger } from '../utils/logging';
import { TradeSignal } from '../services/deepseek';
import { AdaptiveParameters } from './types';

/**
 * Clase utilitaria para gestión de riesgo en operaciones de trading
 * Implementa diversas estrategias adaptativas para stop loss, take profit,
 * y trailing stops basados en condiciones de mercado
 */
export class RiskManagementUtils {
  /**
   * Aplica reglas de gestión de riesgo adaptativas a la señal de trading
   * @param signal Señal de trading a ajustar
   * @param currentPrice Precio actual del mercado
   * @param isGrowthMode Si estamos en modo crecimiento (más agresivo)
   * @param adaptiveParams Parámetros adaptativos opcionales
   */
  static applyRiskManagementRules(
    signal: TradeSignal, 
    currentPrice: number, 
    isGrowthMode: boolean,
    adaptiveParams?: AdaptiveParameters
  ): void {
    if (signal.action === 'HOLD' || !currentPrice) return;
    
    // Si no hay entrada, usar precio actual
    if (!signal.entry) {
      signal.entry = currentPrice;
    }
    
    // Configurar stop loss adaptativo
    if (!signal.stopLoss && signal.action === 'BUY') {
      // Calcular stop loss basado en parámetros adaptativos o valores predeterminados
      const stopLossPercent = adaptiveParams 
        ? adaptiveParams.stopLossPercent 
        : (isGrowthMode ? 0.015 : 0.012);
        
      signal.stopLoss = signal.entry * (1 - stopLossPercent);
      
      logger.info({
        stopLoss: signal.stopLoss,
        stopLossPercent: stopLossPercent * 100 + '%',
        adaptive: !!adaptiveParams
      }, 'Stop loss added adaptively');
    } else if (!signal.stopLoss && signal.action === 'SELL') {
      // Para ventas, el stop loss está por encima
      const stopLossPercent = adaptiveParams 
        ? adaptiveParams.stopLossPercent 
        : (isGrowthMode ? 0.015 : 0.012);
        
      signal.stopLoss = signal.entry * (1 + stopLossPercent);
      
      logger.info({
        stopLoss: signal.stopLoss,
        stopLossPercent: stopLossPercent * 100 + '%',
        adaptive: !!adaptiveParams
      }, 'Stop loss added adaptively for short position');
    }
    
    // Configurar take profit adaptativo
    if (!signal.takeProfit && signal.action === 'BUY') {
      const takeProfitPercent = adaptiveParams 
        ? adaptiveParams.takeProfitPercent 
        : (isGrowthMode ? 0.025 : 0.020);
      
      signal.takeProfit = signal.entry * (1 + takeProfitPercent);
      
      // Agregar información sobre escalonamiento en el reasoning para modo crecimiento
      if (isGrowthMode && signal.reasoning) {
        signal.reasoning += ` Recomendación: considerar toma de beneficios escalonada a ${(takeProfitPercent * 0.6 * 100).toFixed(1)}%, ${(takeProfitPercent * 100).toFixed(1)}% y ${(takeProfitPercent * 1.4 * 100).toFixed(1)}%.`;
      }
      
      logger.info({
        takeProfit: signal.takeProfit,
        takeProfitPercent: takeProfitPercent * 100 + '%',
        mode: isGrowthMode ? 'growth' : 'conservative',
        adaptive: !!adaptiveParams
      }, 'Take profit added adaptively');
    } else if (!signal.takeProfit && signal.action === 'SELL') {
      // Para ventas, take profit por debajo
      const takeProfitPercent = adaptiveParams 
        ? adaptiveParams.takeProfitPercent 
        : (isGrowthMode ? 0.025 : 0.020);
        
      signal.takeProfit = signal.entry * (1 - takeProfitPercent);
      
      logger.info({
        takeProfit: signal.takeProfit,
        takeProfitPercent: takeProfitPercent * 100 + '%',
        adaptive: !!adaptiveParams
      }, 'Take profit added adaptively for short position');
    }
    
    // Configurar trailing stop adaptativo
    if (signal.action === 'BUY') {
      // Determinar si usar trailing stop
      const useTrailingStop = adaptiveParams 
        ? adaptiveParams.useTrailingStop 
        : (signal.useTrailingStop === undefined && signal.confidence >= 0.9);
      
      signal.useTrailingStop = useTrailingStop;
      
      // Si se usa trailing stop, configurar porcentaje
      if (signal.useTrailingStop && !signal.trailingStopPercent) {
        let trailingStopPercent;
        
        if (adaptiveParams) {
          trailingStopPercent = adaptiveParams.trailingStopPercent;
        } else if (isGrowthMode) {
          // Modo crecimiento: trailing stop más ajustado
          trailingStopPercent = Math.max(0.7, Math.min(2.5, 
            0.9 + (signal.confidence - 0.8) * 5.5
          )) / 100;
        } else {
          // Modo conservador: trailing stop más amplio
          trailingStopPercent = Math.max(0.8, Math.min(2.5, 
            1.0 + (signal.confidence - 0.85) * 5
          )) / 100;
        }
        
        signal.trailingStopPercent = trailingStopPercent;
        
        logger.info({
          price: currentPrice,
          confidence: signal.confidence,
          mode: isGrowthMode ? 'growth' : 'conservative',
          trailingStop: (trailingStopPercent * 100).toFixed(2) + '%',
          adaptive: !!adaptiveParams
        }, 'Trailing stop calculated adaptively');
      }
    }
  }
}
