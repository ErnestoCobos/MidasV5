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
exports.marketDataService = exports.MarketDataService = void 0;
const logging_1 = require("../utils/logging");
const binance_1 = require("./binance");
const indicators_1 = require("../utils/indicators");
// Servicio para obtener y procesar datos de mercado
class MarketDataService {
    constructor() {
        this.candles = new Map(); // Caché de velas por par
        logging_1.logger.info('Market data service initialized');
    }
    /**
     * Obtiene datos de mercado mejorados, incluyendo análisis técnico
     * @param symbol El par de trading (e.g. 'BTCUSDT')
     * @param interval El intervalo para datos históricos (e.g. '5m')
     * @returns Datos de mercado completos
     */
    getEnhancedMarketData(symbol_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, interval = '5m') {
            try {
                // 1. Obtener datos de precio actual (ticker)
                const ticker = yield binance_1.binanceService.getTicker24H(symbol);
                if (!ticker) {
                    throw new Error(`No se pudieron obtener datos del ticker para ${symbol}`);
                }
                // 2. Establecer valores por defecto para indicadores técnicos
                let rsi = 50;
                let emaCross = "neutral";
                let volumeRatio = 1.0;
                let bbandPercent = 0.5;
                let supports = [];
                let resistances = [];
                // 3. Obtener datos históricos para cálculo de indicadores
                try {
                    const candles = yield binance_1.binanceService.getHistoricalCandles(symbol, interval, 100);
                    if (candles.length > 0) {
                        // Guardar para futuras referencias
                        this.candles.set(symbol, candles);
                        // Calcular indicadores técnicos
                        rsi = indicators_1.TechnicalIndicators.calculateRSI(candles);
                        emaCross = indicators_1.TechnicalIndicators.calculateEMACross(candles);
                        volumeRatio = indicators_1.TechnicalIndicators.calculateVolumeRatio(candles);
                        const bbands = indicators_1.TechnicalIndicators.calculateBollingerBands(candles);
                        bbandPercent = bbands.percent;
                        supports = indicators_1.TechnicalIndicators.findSupportLevels(candles, 3);
                        resistances = indicators_1.TechnicalIndicators.findResistanceLevels(candles, 3);
                    }
                }
                catch (innerError) {
                    logging_1.logger.warn({
                        symbol,
                        interval,
                        error: innerError.message
                    }, 'Error obteniendo datos históricos para indicadores técnicos');
                    logging_1.logger.info('Usando valores técnicos por defecto');
                }
                // 4. Construir objeto de datos de mercado
                return {
                    price: Number(ticker.lastPrice),
                    volume24h: Number(ticker.quoteVolume),
                    sentiment: 0, // Se llenará después con LunarCrush
                    technicals: {
                        rsi,
                        ema_cross: emaCross,
                        volume_ratio: volumeRatio,
                        bband_percent: bbandPercent,
                        supports,
                        resistances
                    }
                };
            }
            catch (error) {
                logging_1.logger.error({
                    symbol,
                    interval,
                    error: error.message
                }, 'Error obteniendo datos de mercado mejorados');
                // Devolver estructura mínima en caso de error
                return {
                    price: 0,
                    volume24h: 0,
                    sentiment: 0
                };
            }
        });
    }
    /**
     * Filtra una señal de trading basada en criterios técnicos
     * @param symbol Par de trading
     * @param action Acción propuesta ('BUY', 'SELL', 'HOLD')
     * @returns true si pasa todos los filtros técnicos
     */
    passesTechnicalFilters(symbol, action) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Obtener datos de mercado actualizados si no hay candles en caché
                if (!this.candles.has(symbol)) {
                    yield this.getEnhancedMarketData(symbol);
                }
                const candles = this.candles.get(symbol);
                if (!candles || candles.length === 0) {
                    logging_1.logger.warn(`No hay datos históricos para ${symbol}, no se pueden aplicar filtros técnicos`);
                    return false;
                }
                // Calcular indicadores técnicos
                const rsi = indicators_1.TechnicalIndicators.calculateRSI(candles);
                const volumeRatio = indicators_1.TechnicalIndicators.calculateVolumeRatio(candles);
                const bbands = indicators_1.TechnicalIndicators.calculateBollingerBands(candles);
                // Aplicar filtros según tipo de orden
                if (action === 'BUY') {
                    // Para compras verificamos
                    // - RSI no debe estar en sobrecompra (>70)
                    // - Volumen debe ser suficiente
                    // - No debe estar en techo de Bollinger
                    if (rsi > 80) {
                        logging_1.logger.info({ symbol, rsi }, 'Orden de compra descartada por RSI en sobrecompra');
                        return false;
                    }
                    if (volumeRatio < 0.7) {
                        logging_1.logger.info({ symbol, volumeRatio }, 'Orden de compra descartada por volumen insuficiente');
                        return false;
                    }
                    if (bbands.percent > 0.9) {
                        logging_1.logger.info({ symbol, bbPercent: bbands.percent }, 'Orden de compra descartada por estar en techo de BB');
                        return false;
                    }
                }
                else if (action === 'SELL') {
                    // Para ventas verificamos
                    // - RSI no debe estar en sobreventa (<30)
                    // - No debe estar en suelo de Bollinger
                    if (rsi < 20) {
                        logging_1.logger.info({ symbol, rsi }, 'Orden de venta descartada por RSI en sobreventa');
                        return false;
                    }
                    if (bbands.percent < 0.1) {
                        logging_1.logger.info({ symbol, bbPercent: bbands.percent }, 'Orden de venta descartada por estar en suelo de BB');
                        return false;
                    }
                }
                // Si llega aquí, pasa todos los filtros
                return true;
            }
            catch (error) {
                logging_1.logger.error({ symbol, action, error: error.message }, 'Error aplicando filtros técnicos');
                // En caso de error, mejor no permitir la operación
                return false;
            }
        });
    }
    /**
     * Obtiene datos de candles más recientes y actualiza el caché interno
     * @param symbol Par de trading
     * @param interval Intervalo temporal
     * @param limit Número de velas a obtener
     */
    refreshCandles(symbol_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, interval = '5m', limit = 100) {
            try {
                const freshCandles = yield binance_1.binanceService.getHistoricalCandles(symbol, interval, limit);
                if (freshCandles.length > 0) {
                    this.candles.set(symbol, freshCandles);
                    logging_1.logger.debug({ symbol, count: freshCandles.length }, 'Candles actualizados correctamente');
                }
            }
            catch (error) {
                logging_1.logger.error({ symbol, interval, error: error.message }, 'Error actualizando candles');
            }
        });
    }
}
exports.MarketDataService = MarketDataService;
// Instancia global del servicio de datos de mercado
exports.marketDataService = new MarketDataService();
