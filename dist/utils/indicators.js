"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TechnicalIndicators = void 0;
const technicalindicators_1 = require("technicalindicators");
const logging_1 = require("./logging");
// Clase para manejar cálculos de indicadores técnicos
class TechnicalIndicators {
    // Calcular RSI (Relative Strength Index)
    static calculateRSI(candles, period = 14) {
        var _a;
        try {
            const closes = candles.map(candle => candle.close);
            const rsiValues = technicalindicators_1.RSI.calculate({
                values: closes,
                period: period
            });
            // Devolver el valor más reciente
            return (_a = rsiValues.pop()) !== null && _a !== void 0 ? _a : 50; // Valor por defecto 50 (neutral) si no hay suficientes datos
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error calculando RSI');
            return 50; // Valor neutral en caso de error
        }
    }
    // Calcular EMA (Exponential Moving Average)
    static calculateEMA(candles, period = 20) {
        var _a;
        try {
            const closes = candles.map(candle => candle.close);
            const emaValues = technicalindicators_1.EMA.calculate({
                values: closes,
                period: period
            });
            return (_a = emaValues.pop()) !== null && _a !== void 0 ? _a : closes[closes.length - 1];
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error calculando EMA');
            return candles[candles.length - 1].close; // Último precio en caso de error
        }
    }
    // Calcular EMA Cross (comparación de EMAs de diferente período)
    static calculateEMACross(candles) {
        try {
            const closes = candles.map(candle => candle.close);
            // Calcular EMA de período corto (20)
            const shortEMA = technicalindicators_1.EMA.calculate({
                values: closes,
                period: 20
            });
            // Calcular EMA de período largo (50)
            const longEMA = technicalindicators_1.EMA.calculate({
                values: closes,
                period: 50
            });
            // Obtener los valores más recientes
            const lastShortEMA = shortEMA.pop();
            const lastLongEMA = longEMA.pop();
            if (!lastShortEMA || !lastLongEMA) {
                return 'neutral';
            }
            // Determinar tendencia
            if (lastShortEMA > lastLongEMA) {
                return 'bullish';
            }
            else if (lastShortEMA < lastLongEMA) {
                return 'bearish';
            }
            else {
                return 'neutral';
            }
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error calculando EMA Cross');
            return 'neutral';
        }
    }
    // Calcular Bollinger Bands
    static calculateBollingerBands(candles, period = 20, stdDev = 2) {
        try {
            const closes = candles.map(candle => candle.close);
            const currentPrice = closes[closes.length - 1];
            const bbResults = technicalindicators_1.BollingerBands.calculate({
                values: closes,
                period: period,
                stdDev: stdDev
            });
            const lastBB = bbResults.pop();
            if (!lastBB) {
                return {
                    upper: currentPrice * 1.02,
                    middle: currentPrice,
                    lower: currentPrice * 0.98,
                    percent: 0.5
                };
            }
            // Calcular %B (posición en la banda)
            // %B = (price - lower) / (upper - lower)
            const percentB = (currentPrice - lastBB.lower) / (lastBB.upper - lastBB.lower);
            return {
                upper: lastBB.upper,
                middle: lastBB.middle,
                lower: lastBB.lower,
                percent: percentB
            };
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error calculando Bollinger Bands');
            const currentPrice = candles[candles.length - 1].close;
            return {
                upper: currentPrice * 1.02,
                middle: currentPrice,
                lower: currentPrice * 0.98,
                percent: 0.5
            };
        }
    }
    // Calcular relación de volumen (volumen actual vs promedio)
    static calculateVolumeRatio(candles, lookbackPeriod = 20) {
        try {
            const volumes = candles.map(candle => candle.volume);
            // Volumen actual
            const currentVolume = volumes[volumes.length - 1];
            // Volumen promedio (excluyendo el más reciente)
            const historicalVolumes = volumes.slice(-lookbackPeriod - 1, -1);
            const avgVolume = historicalVolumes.reduce((sum, vol) => sum + vol, 0) / historicalVolumes.length;
            return currentVolume / avgVolume;
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error calculando ratio de volumen');
            return 1.0; // Valor neutral
        }
    }
    // Encontrar niveles de soporte
    static findSupportLevels(candles, count = 3) {
        try {
            const lows = candles.map(candle => candle.low);
            const supports = [];
            // Buscar mínimos locales
            for (let i = 5; i < lows.length - 5; i++) {
                const window = lows.slice(i - 5, i + 6);
                if (Math.min(...window) === lows[i]) {
                    supports.push(lows[i]);
                }
            }
            // Ordenar y devolver los soportes más cercanos al precio actual
            const currentPrice = candles[candles.length - 1].close;
            return supports
                .filter(support => support < currentPrice) // Solo soportes por debajo del precio actual
                .sort((a, b) => b - a) // Ordenar de mayor a menor (más cercano primero)
                .slice(0, count);
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error encontrando niveles de soporte');
            return [];
        }
    }
    // Encontrar niveles de resistencia
    static findResistanceLevels(candles, count = 3) {
        try {
            const highs = candles.map(candle => candle.high);
            const resistances = [];
            // Buscar máximos locales
            for (let i = 5; i < highs.length - 5; i++) {
                const window = highs.slice(i - 5, i + 6);
                if (Math.max(...window) === highs[i]) {
                    resistances.push(highs[i]);
                }
            }
            // Ordenar y devolver las resistencias más cercanas al precio actual
            const currentPrice = candles[candles.length - 1].close;
            return resistances
                .filter(resistance => resistance > currentPrice) // Solo resistencias por encima del precio actual
                .sort((a, b) => a - b) // Ordenar de menor a mayor (más cercano primero)
                .slice(0, count);
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error encontrando niveles de resistencia');
            return [];
        }
    }
    // === INDICADORES OPTIMIZADOS PARA CRECIMIENTO DE CAPITAL ===
    /**
     * Calcula el Rate of Change (ROC), un indicador de momentum
     * Útil para identificar activos con fuerte impulso de precio
     * @param candles Datos de velas
     * @param period Período para el cálculo
     * @returns Valor del ROC (en porcentaje)
     */
    static calculateROC(candles, period = 9) {
        var _a;
        try {
            const closes = candles.map(candle => candle.close);
            const rocValues = technicalindicators_1.ROC.calculate({
                values: closes,
                period: period
            });
            return (_a = rocValues.pop()) !== null && _a !== void 0 ? _a : 0;
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error calculando ROC');
            return 0;
        }
    }
    /**
     * Calcula el Average True Range (ATR), indicador de volatilidad
     * Importante para establecer stops y tamaños de posición
     * @param candles Datos de velas
     * @param period Período para el cálculo
     * @returns Valor del ATR
     */
    static calculateATR(candles, period = 14) {
        var _a;
        try {
            const input = candles.map(candle => ({
                high: candle.high,
                low: candle.low,
                close: candle.close
            }));
            const atrValues = technicalindicators_1.ATR.calculate({
                high: input.map(i => i.high),
                low: input.map(i => i.low),
                close: input.map(i => i.close),
                period: period
            });
            const atr = (_a = atrValues.pop()) !== null && _a !== void 0 ? _a : 0;
            // Devolver ATR como porcentaje del precio para facilitar comparaciones
            const lastPrice = candles[candles.length - 1].close;
            return (atr / lastPrice) * 100;
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error calculando ATR');
            return 1.0; // 1% por defecto
        }
    }
    /**
     * Calcula un indicador de Momentum compuesto
     * Combina RSI, ROC y volumen para detectar oportunidades de crecimiento
     * @param candles Datos de velas
     * @returns Valor entre 0-100, >70 indica fuerte impulso alcista
     */
    static calculateMomentumScore(candles) {
        try {
            // Calcular componentes
            const rsi = this.calculateRSI(candles);
            const roc = this.calculateROC(candles);
            const volumeRatio = this.calculateVolumeRatio(candles);
            // Normalizar ROC (típicamente entre -10 y +10)
            const normROC = Math.min(100, Math.max(0, (roc + 10) * 5));
            // Normalizar ratio de volumen (0-100)
            const normVolume = Math.min(100, volumeRatio * 50);
            // Pesos para cada componente
            const rsiWeight = 0.4;
            const rocWeight = 0.4;
            const volumeWeight = 0.2;
            // Calcular score compuesto
            const momentumScore = (rsi * rsiWeight) +
                (normROC * rocWeight) +
                (normVolume * volumeWeight);
            return momentumScore;
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error calculando Momentum Score');
            return 50; // Valor neutral
        }
    }
    /**
     * Calcula la proporción óptima de capital a invertir según el criterio de Kelly
     * Optimizado para trading de crypto con capital pequeño
     * @param winRate Tasa histórica de operaciones ganadoras (0-1)
     * @param reward Retorno esperado si la operación es ganadora (porcentaje)
     * @param risk Pérdida esperada si la operación es perdedora (porcentaje)
     * @param fractionMultiplier Multiplicador para ajustar el resultado (typically 0.25-0.5)
     * @returns Fracción óptima del capital a invertir (0-1)
     */
    static calculateKellyFraction(winRate, reward, risk, fractionMultiplier = 0.3 // Fractional Kelly para reducir riesgo
    ) {
        try {
            // Validar entradas
            if (winRate <= 0 || winRate > 1) {
                throw new Error('Win rate debe estar entre 0 y 1');
            }
            if (reward <= 0) {
                throw new Error('Reward debe ser mayor que 0');
            }
            if (risk <= 0) {
                throw new Error('Risk debe ser mayor que 0');
            }
            // Convertir porcentajes a decimales si es necesario
            const r = reward > 1 ? reward / 100 : reward;
            const l = risk > 1 ? risk / 100 : risk;
            // Fórmula de Kelly: f* = (p*r - q)/r = (p*(b) - (1-p))/b
            // donde b = r/l (ratio retorno/riesgo)
            const b = r / l;
            const kellyFraction = (winRate * b - (1 - winRate)) / b;
            // Aplicar multiplicador para Kelly fraccional
            const adjustedFraction = kellyFraction * fractionMultiplier;
            // Limitar resultado entre 0 y 1
            return Math.max(0, Math.min(1, adjustedFraction));
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error calculando Kelly Fraction');
            return 0.1; // Valor conservador por defecto
        }
    }
    /**
     * Calcula el potencial de crecimiento ajustado por riesgo
     * Combina volatilidad, momentum y tendencia técnica
     * @param candles Datos de velas
     * @returns Score de potencial de crecimiento (0-100)
     */
    static calculateGrowthPotential(candles) {
        try {
            // Calcular componentes
            const momentumScore = this.calculateMomentumScore(candles) / 100;
            const atrPercent = this.calculateATR(candles) / 100;
            const emaCross = this.calculateEMACross(candles);
            const bbands = this.calculateBollingerBands(candles);
            // Factores de tendencia
            let trendFactor = 0.5; // Neutral por defecto
            if (emaCross === 'bullish') {
                trendFactor = 0.8;
            }
            else if (emaCross === 'bearish') {
                trendFactor = 0.2;
            }
            // Factor de Bollinger Bands (mejor si está en la parte inferior)
            let bbFactor = 0.5;
            if (bbands.percent < 0.3) {
                bbFactor = 0.8; // Potencial alcista si está cerca del soporte
            }
            else if (bbands.percent > 0.7) {
                bbFactor = 0.2; // Menos potencial si está cerca de resistencia
            }
            // Calcular score final
            // Alta volatilidad (ATR) + alto momentum + tendencia positiva = mayor potencial
            const growthScore = ((momentumScore * 0.4) +
                (atrPercent * 10 * 0.3) + // Factor 10 para normalizar (típicamente 1-3%)
                (trendFactor * 0.2) +
                (bbFactor * 0.1)) * 100;
            return Math.min(100, Math.max(0, growthScore));
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error calculando Growth Potential');
            return 50; // Valor neutral
        }
    }
    /**
     * Calcula puntos óptimos de take profit escalonado basados en ATR y momentum
     * @param candles Datos de velas
     * @param entryPrice Precio de entrada
     * @param atrMultiplier Multiplicador del ATR para definir distancias
     * @returns Tres niveles de take profit
     */
    static calculateTakeProfitLevels(candles, entryPrice, atrMultiplier = 2.0) {
        try {
            // Calcular ATR
            const atr = this.calculateATR(candles);
            const atrValue = (atr / 100) * entryPrice; // Convertir de porcentaje a valor absoluto
            // Calcular momentum para ajustar el multiplicador
            const momentum = this.calculateMomentumScore(candles) / 100;
            const momentumMultiplier = 0.5 + momentum; // 0.5-1.5 según momentum
            // Calcular niveles escalonados
            // - TP1: conservador, para asegurar algo de beneficio
            // - TP2: objetivo principal, buena relación riesgo/beneficio
            // - TP3: ambicioso, para capturar movimientos fuertes
            const tp1 = entryPrice * (1 + (atrMultiplier * 0.8 * atrValue / entryPrice));
            const tp2 = entryPrice * (1 + (atrMultiplier * 1.5 * atrValue / entryPrice));
            const tp3 = entryPrice * (1 + (atrMultiplier * 2.5 * momentumMultiplier * atrValue / entryPrice));
            return { tp1, tp2, tp3 };
        }
        catch (error) {
            logging_1.logger.error({ error }, 'Error calculando Take Profit Levels');
            // Valores por defecto basados en porcentajes simples
            return {
                tp1: entryPrice * 1.02, // +2%
                tp2: entryPrice * 1.035, // +3.5%
                tp3: entryPrice * 1.06 // +6%
            };
        }
    }
}
exports.TechnicalIndicators = TechnicalIndicators;
