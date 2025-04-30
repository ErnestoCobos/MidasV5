/**
 * Interfaces y tipos comunes para estrategias de trading
 */

/**
 * Interfaz para parámetros adaptativos basados en condiciones de mercado
 * Estos parámetros se ajustan automáticamente según volatilidad, 
 * sentimiento y rendimiento histórico
 */
export interface AdaptiveParameters {
  minConfidence: number;
  maxPositionSizePercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  trailingStopPercent: number;
  useTrailingStop: boolean;
}

/**
 * Objeto para análisis de múltiples timeframes
 * Permite una visión más completa del mercado desde diferentes perspectivas temporales
 */
export interface TimeframeAnalysis {
  timeframe: string;
  bullish: boolean;
  bearish: boolean;
  neutral: boolean;
  strength: number; // 0-10 escala de fuerza de la señal
  keyLevels: {
    supports: number[];
    resistances: number[];
  };
}
