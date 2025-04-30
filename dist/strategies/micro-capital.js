"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.microCapitalStrategy = exports.MicroCapitalStrategy = void 0;
const logging_1 = require("../utils/logging");
const lunarcrush_1 = require("../services/lunarcrush");
const deepseek_1 = require("../services/deepseek");
const market_data_1 = require("../services/market-data");
const correlation_1 = require("../services/correlation");
// Estrategia especializada para micro-capital (<$100)
class MicroCapitalStrategy {
    constructor() {
        this.name = "Micro-Scalping Conservador";
        this.description = "Estrategia ultra-conservadora para capital <$100. Prioriza preservación y oportunidades de alta probabilidad.";
        this.minCapital = 10;
        this.maxCapital = 100;
        logging_1.logger.info('MicroCapitalStrategy initialized');
    }
    /**
     * Ejecuta la estrategia micro-capital
     * @param symbol Par de trading (ej. BTCUSDT)
     * @param capital Capital total disponible
     * @returns Señal de trading recomendada
     */
    execute(symbol, capital) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // 1. Verificar sentimiento primero (ahorra llamadas API a DeepSeek si no es favorable)
                const asset = symbol.replace('USDT', '');
                const sentiment = yield lunarcrush_1.lunarCrushService.getMicroTradingSignal(asset);
                // Solo procesar si hay sentimiento positivo o neutral
                if (sentiment.signal === 'SELL' || sentiment.signal === 'STRONG_SELL') {
                    logging_1.logger.info({
                        asset,
                        galaxyScore: sentiment.score,
                        threshold: sentiment.threshold
                    }, 'Skipping due to negative sentiment');
                    return { action: 'HOLD', confidence: 0.0 };
                }
                // 2. Obtener datos de mercado mejorados
                const md = yield market_data_1.marketDataService.getEnhancedMarketData(symbol);
                md.sentiment = sentiment.score;
                // 3. Verificar condiciones generales del mercado
                if (!(yield this.checkMarketConditions(symbol))) {
                    logging_1.logger.info({ symbol }, 'Skipping due to unfavorable market conditions');
                    return { action: 'HOLD', confidence: 0.0 };
                }
                // 4. Realizar verificación técnica básica
                if (yield this.shouldSkipBasedOnTechnicals(symbol, md)) {
                    return { action: 'HOLD', confidence: 0.0 };
                }
                // 5. Consultar a DeepSeek con el prompt optimizado para micro-capital
                const signal = yield deepseek_1.deepSeekService.decide(md, capital, 'micro');
                // 5. Validación adicional de la señal
                if (signal.action !== 'HOLD' && (!signal.confidence || signal.confidence < 0.85)) {
                    logging_1.logger.info({
                        symbol,
                        confidence: signal.confidence
                    }, 'Insufficient confidence for micro-capital');
                    return { action: 'HOLD', confidence: 0.0 };
                }
                // 6. Verificar que el tamaño de posición sea adecuado
                if (signal.action !== 'HOLD' && signal.position_size) {
                    // Si la posición es < $5 USD, no es viable en la mayoría de exchanges
                    if (signal.position_size < 5) {
                        logging_1.logger.info({
                            positionSize: signal.position_size
                        }, 'Position size too small for viable trading');
                        return { action: 'HOLD', confidence: 0.0 };
                    }
                    // Limitar el tamaño máximo de posición a 20% del capital
                    const maxPosition = capital * 0.2;
                    if (signal.position_size > maxPosition) {
                        signal.position_size = maxPosition;
                        logging_1.logger.info({
                            adjustedPositionSize: maxPosition.toFixed(2)
                        }, 'Position size adjusted to maximum allowed');
                    }
                }
                // 7. Aplicar reglas adicionales de riesgo
                this.applyRiskManagementRules(signal, md.price);
                // 8. Log completo de la señal
                logging_1.tradeLogger.info({
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
            }
            catch (error) {
                logging_1.logger.error({
                    symbol,
                    capital,
                    error: error.message
                }, 'Error executing micro-capital strategy');
                return { action: 'HOLD', confidence: 0.0 };
            }
        });
    }
    /**
     * Verifica si las condiciones generales del mercado son favorables
     * @param symbol Par de trading
     * @returns true si las condiciones son favorables
     */
    checkMarketConditions(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Verificar correlaciones y tendencias del mercado
                const isFavorable = yield correlation_1.correlationService.isFavorableMarketCondition(symbol, 'BUY');
                if (!isFavorable) {
                    logging_1.logger.info({
                        symbol
                    }, 'Market conditions not favorable for trading');
                }
                return isFavorable;
            }
            catch (error) {
                logging_1.logger.error({
                    symbol,
                    error: error.message
                }, 'Error checking market conditions');
                // En caso de error, permitir la operación
                return true;
            }
        });
    }
    /**
     * Determina si debe omitir una operación basada en criterios técnicos
     */
    shouldSkipBasedOnTechnicals(symbol, md) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const tech = md.technicals;
            if (!tech)
                return false;
            // Criterios de filtrado técnico para micro-capital
            // Si RSI está en extremos, saltar (excepto si es muy sobreventa)
            if (tech.rsi && tech.rsi > 80) {
                logging_1.logger.info({
                    symbol,
                    rsi: (_a = tech.rsi) === null || _a === void 0 ? void 0 : _a.toFixed(2)
                }, 'Skipping due to overbought RSI');
                return true;
            }
            // Si el volumen es muy bajo comparado con el promedio
            if (tech.volume_ratio && tech.volume_ratio < 0.7) {
                logging_1.logger.info({
                    symbol,
                    volumeRatio: (_b = tech.volume_ratio) === null || _b === void 0 ? void 0 : _b.toFixed(2)
                }, 'Skipping due to low volume ratio');
                return true;
            }
            // Si no hay soportes identificables (indica poca estructura de mercado)
            if (!tech.supports || tech.supports.length === 0) {
                logging_1.logger.info({ symbol }, 'Skipping due to no identifiable support levels');
                return true;
            }
            // No hay razones técnicas para saltar
            return false;
        });
    }
    /**
     * Aplica reglas de gestión de riesgo a la señal
     */
    applyRiskManagementRules(signal, currentPrice) {
        if (signal.action === 'HOLD' || !currentPrice)
            return;
        // Si no hay entrada, usar precio actual
        if (!signal.entry) {
            signal.entry = currentPrice;
        }
        // Asegurarse de que hay stop loss
        if (!signal.stopLoss && signal.action === 'BUY') {
            // Stop loss máximo: 1.2% para compras
            signal.stopLoss = signal.entry * 0.988; // 1.2% por debajo
            logging_1.logger.info({
                stopLoss: signal.stopLoss
            }, 'Stop loss added automatically');
        }
        else if (!signal.stopLoss && signal.action === 'SELL') {
            // Stop loss para ventas: 1.2% por encima
            signal.stopLoss = signal.entry * 1.012;
            logging_1.logger.info({
                stopLoss: signal.stopLoss
            }, 'Stop loss added automatically');
        }
        // Asegurarse de que hay take profit
        if (!signal.takeProfit && signal.action === 'BUY') {
            // Take profit mínimo: 1.5% para compras
            signal.takeProfit = signal.entry * 1.015;
            logging_1.logger.info({
                takeProfit: signal.takeProfit
            }, 'Take profit added automatically');
        }
        else if (!signal.takeProfit && signal.action === 'SELL') {
            // Take profit para ventas: 1.5% por debajo
            signal.takeProfit = signal.entry * 0.985;
            logging_1.logger.info({
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
                1.0 + (signal.confidence - 0.85) * 5));
                signal.trailingStopPercent = trailingDistance;
                logging_1.logger.info({
                    price: currentPrice,
                    confidence: signal.confidence,
                    trailingDistance: trailingDistance.toFixed(2) + '%'
                }, 'Trailing stop calculated automatically');
            }
        }
    }
}
exports.MicroCapitalStrategy = MicroCapitalStrategy;
// Instancia global de la estrategia de micro-capital
exports.microCapitalStrategy = new MicroCapitalStrategy();
