/**
 * Implementación de tareas para worker threads
 * 
 * Este archivo registra manejadores para diferentes tipos de tareas que
 * pueden ejecutarse en paralelo mediante la WorkerPool.
 */

import { registerTaskHandler } from './worker-pool';
import { Candle } from './indicators';

// Ayudante para calcular media
function average(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calcula el RSI (Relative Strength Index)
 * @param candles Array de velas para el cálculo
 * @param periods Períodos para el cálculo (típicamente 14)
 * @returns Valor RSI entre 0-100
 */
function calculateRSI(candles: Candle[], periods: number = 14): number {
  if (candles.length < periods + 1) {
    return 50; // Valor neutro por defecto
  }
  
  // Calcular diferencias de precio
  const changes: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    changes.push(candles[i].close - candles[i - 1].close);
  }
  
  // Separar ganancias y pérdidas
  const gains = changes.filter(c => c > 0);
  const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
  
  // Si no hay ganancias o pérdidas, devolver valores extremos
  if (gains.length === 0) return 0;
  if (losses.length === 0) return 100;
  
  // Calcular promedios
  const avgGain = average(gains);
  const avgLoss = average(losses);
  
  // Calcular RS y RSI
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return rsi;
}

/**
 * Calcula bandas de Bollinger
 * @param candles Array de velas
 * @param periods Períodos (típicamente 20)
 * @param stdDev Desviaciones estándar (típicamente 2)
 * @returns Objeto con las bandas superior, media e inferior
 */
function calculateBollingerBands(candles: Candle[], periods: number = 20, stdDev: number = 2): {
  upper: number;
  middle: number;
  lower: number;
  width: number;
  percentB: number;
} {
  if (candles.length < periods) {
    const price = candles.length > 0 ? candles[candles.length - 1].close : 0;
    return {
      upper: price * 1.01,
      middle: price,
      lower: price * 0.99,
      width: 0.02,
      percentB: 0.5
    };
  }
  
  // Obtener precios de cierre de los últimos n períodos
  const closes = candles.slice(-periods).map(c => c.close);
  
  // Calcular media móvil simple (SMA)
  const sma = average(closes);
  
  // Calcular desviación estándar
  const squaredDifferences = closes.map(price => Math.pow(price - sma, 2));
  const variance = average(squaredDifferences);
  const standardDeviation = Math.sqrt(variance);
  
  // Calcular bandas
  const upper = sma + (standardDeviation * stdDev);
  const lower = sma - (standardDeviation * stdDev);
  
  // Calcular ancho de banda
  const width = (upper - lower) / sma;
  
  // Calcular percentB (posición actual del precio en la banda)
  const currentPrice = candles[candles.length - 1].close;
  const percentB = (currentPrice - lower) / (upper - lower);
  
  return {
    upper,
    middle: sma,
    lower,
    width,
    percentB
  };
}

/**
 * Detecta niveles de soporte y resistencia
 * @param candles Array de velas
 * @param sensitivity Sensibilidad para la detección (1-10, menor es más sensible)
 * @returns Objeto con niveles de soporte y resistencia ordenados por relevancia
 */
function detectSupportResistance(candles: Candle[], sensitivity: number = 3): {
  supports: number[];
  resistances: number[];
} {
  if (candles.length < 30) {
    return { supports: [], resistances: [] };
  }
  
  // Simplificado para ejemplo
  // En un caso real, usaríamos análisis de fractales, swing highs/lows, etc.
  
  // Encuentra posibles pivotes
  const potentialPivots: { price: number; strength: number; type: 'support' | 'resistance' }[] = [];
  
  // Mínimo de velas a cada lado para considerar un pivote
  const minBars = sensitivity;
  
  // Buscar picos y valles potenciales
  for (let i = minBars; i < candles.length - minBars; i++) {
    // Pivote bajo (soporte potencial)
    let isLow = true;
    for (let j = i - minBars; j <= i + minBars; j++) {
      if (j === i) continue;
      if (candles[j].low <= candles[i].low) {
        isLow = false;
        break;
      }
    }
    
    if (isLow) {
      // Calcular "fuerza" basada en el volumen
      const strength = candles[i].volume / average(candles.map(c => c.volume));
      potentialPivots.push({
        price: candles[i].low,
        strength,
        type: 'support'
      });
    }
    
    // Pivote alto (resistencia potencial)
    let isHigh = true;
    for (let j = i - minBars; j <= i + minBars; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) {
        isHigh = false;
        break;
      }
    }
    
    if (isHigh) {
      // Calcular "fuerza" basada en el volumen
      const strength = candles[i].volume / average(candles.map(c => c.volume));
      potentialPivots.push({
        price: candles[i].high,
        strength,
        type: 'resistance'
      });
    }
  }
  
  // Agrupar niveles cercanos
  const groupedPivots: typeof potentialPivots = [];
  const currentPrice = candles[candles.length - 1].close;
  const groupingThreshold = currentPrice * 0.005; // 0.5% del precio actual
  
  for (const pivot of potentialPivots) {
    // Buscar grupo existente
    let grouped = false;
    for (const group of groupedPivots) {
      if (Math.abs(group.price - pivot.price) < groupingThreshold && group.type === pivot.type) {
        // Promediar precio y sumar fuerza
        group.price = (group.price + pivot.price) / 2;
        group.strength += pivot.strength;
        grouped = true;
        break;
      }
    }
    
    if (!grouped) {
      groupedPivots.push(pivot);
    }
  }
  
  // Separar y ordenar por fuerza
  const supports = groupedPivots
    .filter(p => p.type === 'support')
    .sort((a, b) => b.strength - a.strength)
    .map(p => p.price);
    
  const resistances = groupedPivots
    .filter(p => p.type === 'resistance')
    .sort((a, b) => b.strength - a.strength)
    .map(p => p.price);
  
  return { supports, resistances };
}

/**
 * Registrar manejadores de tareas
 */

// Calculadora de indicadores técnicos
registerTaskHandler('calculate-indicators', async (data: {
  candles: Candle[];
  indicators: string[];
}) => {
  const { candles, indicators } = data;
  const results: Record<string, any> = {};
  
  for (const indicator of indicators) {
    switch (indicator) {
      case 'rsi':
        results.rsi = calculateRSI(candles);
        break;
      case 'bollingerBands':
        results.bollingerBands = calculateBollingerBands(candles);
        break;
      case 'supportResistance':
        results.supportResistance = detectSupportResistance(candles);
        break;
    }
  }
  
  return results;
});

// Analizador de patrones
registerTaskHandler('analyze-patterns', async (data: {
  candles: Candle[];
  patterns: string[];
}) => {
  const { candles, patterns } = data;
  const results: Record<string, any> = {};
  
  // En una implementación real, aquí iría el código para detectar patrones
  // Este es un ejemplo simplificado 
  
  // Simular análisis
  return {
    patternsFound: patterns.map(p => ({
      name: p,
      detected: Math.random() > 0.7,
      confidence: Math.random() * 0.5 + 0.5,
      priceTarget: candles[candles.length - 1].close * (1 + (Math.random() * 0.1 - 0.05))
    }))
  };
});

// Procesador de backtesting
registerTaskHandler('backtest-strategy', async (data: {
  candles: Candle[];
  strategy: string;
  params: Record<string, any>;
}) => {
  const { candles, strategy, params } = data;
  
  // En una implementación real, ejecutaríamos la estrategia sobre datos históricos
  // Para este ejemplo, retornamos resultados de prueba
  
  return {
    trades: 10,
    winRate: 0.6,
    profitFactor: 1.5,
    expectedReturn: 2.3,
    maxDrawdown: -5.2,
    sharpeRatio: 1.2
  };
});
