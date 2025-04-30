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
exports.microGrowthStrategy = exports.microCapitalStrategy = exports.MicroCapitalStrategy = void 0;
const logging_1 = require("../utils/logging");
const lunarcrush_1 = require("../services/lunarcrush");
const deepseek_1 = require("../services/deepseek");
const market_data_1 = require("../services/market-data");
const correlation_1 = require("../services/correlation");
// Estrategia especializada para micro-capital (<$100)
class MicroCapitalStrategy {
    constructor(config = {}, mode = MicroCapitalStrategy.MODE_CONSERVATIVE) {
        this.name = "Micro-Capital Growth Accelerator";
        this.description = "Estrategia optimizada para crecimiento de capital <$100. Enfoque balanceado entre rentabilidad y preservación.";
        this.minCapital = 10;
        this.maxCapital = 100;
        this.mode = mode;
        // Ajustar la configuración según el modo
        if (mode === MicroCapitalStrategy.MODE_GROWTH) {
            this.name = "Micro-Growth Accelerator";
            this.description = "Estrategia agresiva para maximizar crecimiento de capital. Prioriza retornos sobre preservación.";
            this.config = {
                ignoreMarketConditions: config.ignoreMarketConditions || true, // Más permisivo con condiciones de mercado
                minConfidence: config.minConfidence || 0.80, // Umbral de confianza más bajo
                allowBearishOperations: config.allowBearishOperations || true // Permitir operaciones en mercado bajista
            };
        }
        else {
            // Configuración conservadora por defecto
            this.config = {
                ignoreMarketConditions: config.ignoreMarketConditions || false,
                minConfidence: config.minConfidence || 0.85,
                allowBearishOperations: config.allowBearishOperations || false
            };
        }
        logging_1.logger.info(Object.assign({ mode: this.mode }, this.config), 'MicroCapitalStrategy initialized with config');
    }
    /**
     * Ejecuta la estrategia micro-capital
     * @param symbol Par de trading (ej. BTCUSDT)
     * @param capital Capital total disponible
     * @param options Opciones adicionales para esta ejecución
     * @returns Señal de trading recomendada
     */
    execute(symbol, capital, options) {
        return __awaiter(this, void 0, void 0, function* () {
            // Combinar configuración del constructor con opciones en tiempo de ejecución
            const config = Object.assign(Object.assign({}, this.config), (options || {}));
            // Determinar el tipo de estrategia a usar con DeepSeek
            const strategyType = this.mode === MicroCapitalStrategy.MODE_GROWTH ? 'growth' : 'micro';
            try {
                // 1. Verificar sentimiento primero (ahorra llamadas API a DeepSeek si no es favorable)
                const asset = symbol.replace('USDT', '');
                const sentiment = yield lunarcrush_1.lunarCrushService.getMicroTradingSignal(asset);
                // En modo crecimiento, ser más permisivo con sentimiento negativo
                // Solo saltar en caso de sentimiento extremadamente negativo
                if (this.mode === MicroCapitalStrategy.MODE_GROWTH) {
                    if (sentiment.signal === 'STRONG_SELL' && sentiment.score < 40) {
                        logging_1.logger.info({
                            asset,
                            galaxyScore: sentiment.score,
                            threshold: sentiment.threshold
                        }, 'Skipping due to extremely negative sentiment');
                        return { action: 'HOLD', confidence: 0.0 };
                    }
                }
                else {
                    // Modo conservador: saltar con cualquier sentimiento negativo
                    if (sentiment.signal === 'SELL' || sentiment.signal === 'STRONG_SELL') {
                        logging_1.logger.info({
                            asset,
                            galaxyScore: sentiment.score,
                            threshold: sentiment.threshold
                        }, 'Skipping due to negative sentiment');
                        return { action: 'HOLD', confidence: 0.0 };
                    }
                }
                // 2. Obtener datos de mercado mejorados
                const md = yield market_data_1.marketDataService.getEnhancedMarketData(symbol);
                md.sentiment = sentiment.score;
                // 3. Verificar condiciones generales del mercado (si no estamos ignorándolas)
                if (!config.ignoreMarketConditions && !(yield this.checkMarketConditions(symbol, config))) {
                    logging_1.logger.info({
                        symbol,
                        ignoreMarketConditions: config.ignoreMarketConditions
                    }, 'Skipping due to unfavorable market conditions');
                    return { action: 'HOLD', confidence: 0.0 };
                }
                // 4. Realizar verificación técnica básica
                if (yield this.shouldSkipBasedOnTechnicals(symbol, md)) {
                    return { action: 'HOLD', confidence: 0.0 };
                }
                // 5. Consultar a DeepSeek con el prompt optimizado para la estrategia seleccionada
                const signal = yield deepseek_1.deepSeekService.decide(md, capital, strategyType);
                // 5. Validación adicional de la señal con el umbral configurable
                const minConfidence = config.minConfidence || 0.70;
                if (signal.action !== 'HOLD' && (!signal.confidence || signal.confidence < minConfidence)) {
                    logging_1.logger.info({
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
                        logging_1.logger.info({
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
     * @param config Configuración de la estrategia
     * @returns true si las condiciones son favorables
     */
    checkMarketConditions(symbol, config) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Si se permite operar en mercado bajista, adaptamos la acción según la estrategia
                const action = (config === null || config === void 0 ? void 0 : config.allowBearishOperations) ? 'SELL' : 'BUY';
                // Verificar correlaciones y tendencias del mercado
                const isFavorable = yield correlation_1.correlationService.isFavorableMarketCondition(symbol, action);
                if (!isFavorable) {
                    logging_1.logger.info({
                        symbol,
                        action,
                        allowBearishOperations: config === null || config === void 0 ? void 0 : config.allowBearishOperations
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
            var _a, _b, _c, _d;
            const tech = md.technicals;
            if (!tech)
                return false;
            // Criterios de filtrado técnico según el modo
            if (this.mode === MicroCapitalStrategy.MODE_GROWTH) {
                // Modo crecimiento: criterios más permisivos
                // Incluso en modo crecimiento, evitar extremos de RSI
                if (tech.rsi && tech.rsi > 85) {
                    logging_1.logger.info({
                        symbol,
                        rsi: (_a = tech.rsi) === null || _a === void 0 ? void 0 : _a.toFixed(2)
                    }, 'Skipping due to extremely overbought RSI');
                    return true;
                }
                // Ser más permisivo con el volumen en modo crecimiento
                if (tech.volume_ratio && tech.volume_ratio < 0.4) {
                    logging_1.logger.info({
                        symbol,
                        volumeRatio: (_b = tech.volume_ratio) === null || _b === void 0 ? void 0 : _b.toFixed(2)
                    }, 'Skipping due to extremely low volume ratio');
                    return true;
                }
            }
            else {
                // Modo conservador: criterios más estrictos
                // Si RSI está en extremos, saltar
                if (tech.rsi && tech.rsi > 80) {
                    logging_1.logger.info({
                        symbol,
                        rsi: (_c = tech.rsi) === null || _c === void 0 ? void 0 : _c.toFixed(2)
                    }, 'Skipping due to overbought RSI');
                    return true;
                }
                // Si el volumen es bajo comparado con el promedio
                if (tech.volume_ratio && tech.volume_ratio < 0.5) {
                    logging_1.logger.info({
                        symbol,
                        volumeRatio: (_d = tech.volume_ratio) === null || _d === void 0 ? void 0 : _d.toFixed(2)
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
            // Stop loss máximo: 1.5% para compras (ajustado desde 1.2%)
            signal.stopLoss = signal.entry * 0.985; // 1.5% por debajo
            logging_1.logger.info({
                stopLoss: signal.stopLoss
            }, 'Stop loss added automatically');
        }
        else if (!signal.stopLoss && signal.action === 'SELL') {
            // Stop loss para ventas: 1.5% por encima (ajustado desde 1.2%)
            signal.stopLoss = signal.entry * 1.015;
            logging_1.logger.info({
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
                logging_1.logger.info({
                    takeProfit: signal.takeProfit,
                    mode: 'growth'
                }, 'Aggressive take profit added automatically');
            }
            else {
                // Modo conservador: take profit estándar (2.0%)
                signal.takeProfit = signal.entry * 1.020;
                logging_1.logger.info({
                    takeProfit: signal.takeProfit
                }, 'Take profit added automatically');
            }
        }
        else if (!signal.takeProfit && signal.action === 'SELL') {
            // Similar para ventas
            if (this.mode === MicroCapitalStrategy.MODE_GROWTH) {
                signal.takeProfit = signal.entry * 0.975; // -2.5% para ventas
            }
            else {
                signal.takeProfit = signal.entry * 0.980; // -2.0% para ventas
            }
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
            // y el riesgo aceptable, ajustando según el modo
            if (signal.useTrailingStop && !signal.trailingStopPercent) {
                let trailingDistance;
                if (this.mode === MicroCapitalStrategy.MODE_GROWTH) {
                    // Modo crecimiento: trailing stop más ajustado para capturar más movimiento
                    // Mínimo 0.7%, máximo 2.5%
                    trailingDistance = Math.max(0.7, Math.min(2.5, 
                    // Fórmula optimizada para crecimiento
                    0.9 + (signal.confidence - 0.8) * 5.5));
                }
                else {
                    // Modo conservador: trailing stop más amplio para reducir falsas salidas
                    // Mínimo 0.8%, máximo 2.5%
                    trailingDistance = Math.max(0.8, Math.min(2.5, 
                    // Fórmula original
                    1.0 + (signal.confidence - 0.85) * 5));
                }
                signal.trailingStopPercent = trailingDistance;
                logging_1.logger.info({
                    price: currentPrice,
                    confidence: signal.confidence,
                    mode: this.mode,
                    trailingDistance: trailingDistance.toFixed(2) + '%'
                }, 'Trailing stop calculated automatically');
            }
        }
    }
}
exports.MicroCapitalStrategy = MicroCapitalStrategy;
// Modos de operación
MicroCapitalStrategy.MODE_CONSERVATIVE = 'conservative';
MicroCapitalStrategy.MODE_GROWTH = 'growth';
// Instancias globales de la estrategia
exports.microCapitalStrategy = new MicroCapitalStrategy();
exports.microGrowthStrategy = new MicroCapitalStrategy({}, MicroCapitalStrategy.MODE_GROWTH);
