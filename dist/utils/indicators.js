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
}
exports.TechnicalIndicators = TechnicalIndicators;
