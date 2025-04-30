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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketDataService = exports.MarketDataService = void 0;
const binance_1 = require("./binance");
const indicators_1 = require("../utils/indicators");
const lunarcrush_1 = require("./lunarcrush");
const logging_1 = require("../utils/logging");
const node_cache_1 = __importDefault(require("node-cache"));
/**
 * Servicio para obtener y combinar datos de mercado de diferentes fuentes
 * Proporciona información técnica y de sentimiento enriquecida
 */
class MarketDataService {
    constructor() {
        // Caché para datos de mercado (30 minutos TTL)
        this.cache = new node_cache_1.default({ stdTTL: 30 * 60 });
        logging_1.logger.info('Market data service initialized');
    }
    /**
     * Obtiene datos de mercado enriquecidos con indicadores técnicos y sentimiento
     * @param symbol Par de trading (e.g. 'BTCUSDT')
     * @returns Datos mejorados con indicadores y valores técnicos
     */
    getEnhancedMarketData(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            // Clave única para este símbolo
            const cacheKey = `emd_${symbol}`;
            // Verificar caché
            const cached = this.cache.get(cacheKey);
            if (cached) {
                logging_1.logger.debug({ symbol }, 'Using cached market data');
                return cached;
            }
            try {
                logging_1.logger.info({ symbol }, 'Getting enhanced market data');
                // 1. Obtener datos básicos de precio
                const ticker = yield binance_1.binanceService.getTicker24H(symbol);
                const price = parseFloat(ticker.lastPrice);
                const volume24h = parseFloat(ticker.volume);
                // 2. Obtener velas para cálculos técnicos
                const candles = yield binance_1.binanceService.getHistoricalCandles(symbol, '15m', 96);
                // 3. Calcular indicadores técnicos
                const technicals = {};
                // Solo calcular si hay suficientes datos
                if (candles.length >= 14) {
                    technicals.rsi = indicators_1.TechnicalIndicators.calculateRSI(candles);
                    technicals.ema_cross = indicators_1.TechnicalIndicators.calculateEMACross(candles);
                    technicals.volume_ratio = indicators_1.TechnicalIndicators.calculateVolumeRatio(candles);
                    // Bollinger Bands
                    const bbands = indicators_1.TechnicalIndicators.calculateBollingerBands(candles);
                    technicals.bband_percent = bbands.percent;
                    // Niveles de soporte y resistencia
                    technicals.supports = indicators_1.TechnicalIndicators.findSupportLevels(candles, 3);
                    technicals.resistances = indicators_1.TechnicalIndicators.findResistanceLevels(candles, 3);
                }
                // 4. Obtener sentimiento social
                let sentiment = 50; // Valor neutral por defecto
                try {
                    const baseAsset = symbol.replace('USDT', '');
                    sentiment = (yield lunarcrush_1.lunarCrushService.galaxyScore(baseAsset)) || 50;
                }
                catch (error) {
                    logging_1.logger.debug({ symbol, error }, 'Error getting Galaxy Score');
                }
                // 5. Combinar datos
                const result = {
                    price,
                    volume24h,
                    sentiment,
                    technicals
                };
                // Guardar en caché
                this.cache.set(cacheKey, result);
                return result;
            }
            catch (error) {
                logging_1.logger.error({ symbol, error }, 'Error getting enhanced market data');
                // Devolver datos mínimos en caso de error
                return {
                    price: 0,
                    volume24h: 0,
                    sentiment: 50
                };
            }
        });
    }
    /**
     * Obtiene un resumen del mercado global
     * @returns Estado general del mercado (bearish, neutral, bullish)
     */
    getMarketSummary() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Clave de caché
            const cacheKey = 'market_summary';
            // Verificar caché
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
            try {
                // Lista de principales criptos para analizar
                const mainCoins = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];
                const performances = [];
                let totalSentiment = 0;
                let totalCoins = 0;
                // Obtener rendimiento de las principales
                for (const symbol of mainCoins) {
                    try {
                        const candles = yield binance_1.binanceService.getHistoricalCandles(symbol, '1d', 2);
                        if (candles.length >= 2) {
                            const yesterdayClose = candles[0].close;
                            const todayClose = candles[candles.length - 1].close;
                            const percentChange = (todayClose / yesterdayClose - 1) * 100;
                            performances.push({
                                symbol: symbol.replace('USDT', ''),
                                change: percentChange
                            });
                            // Obtener sentimiento
                            try {
                                const baseAsset = symbol.replace('USDT', '');
                                const sentiment = yield lunarcrush_1.lunarCrushService.galaxyScore(baseAsset);
                                if (sentiment) {
                                    totalSentiment += sentiment;
                                    totalCoins++;
                                }
                            }
                            catch (error) {
                                // Ignorar errores individuales
                            }
                        }
                    }
                    catch (error) {
                        // Ignorar errores individuales
                    }
                }
                // Calcular promedio de sentimiento
                const averageSentiment = totalCoins > 0 ? totalSentiment / totalCoins : 50;
                // Ordenar por rendimiento
                performances.sort((a, b) => b.change - a.change);
                // Calcular dominancia de BTC
                let btcDominance = 50; // Valor por defecto
                try {
                    // Intentar obtener dominancia de BTC (en un entorno real esto vendría de una API)
                    const btcInfo = yield this.getEnhancedMarketData('BTCUSDT');
                    // Esta es una aproximación simplificada
                    btcDominance = ((_a = btcInfo.technicals) === null || _a === void 0 ? void 0 : _a.rsi) || 50;
                }
                catch (error) {
                    // Usar valor por defecto
                }
                // Determinar estado del mercado
                let status = 'neutral';
                // Contar positivos vs negativos
                const positiveChanges = performances.filter(p => p.change > 0).length;
                const negativeChanges = performances.filter(p => p.change < 0).length;
                if (positiveChanges >= 4) {
                    status = 'bullish';
                }
                else if (negativeChanges >= 4) {
                    status = 'bearish';
                }
                else if (averageSentiment > 70) {
                    status = 'bullish';
                }
                else if (averageSentiment < 30) {
                    status = 'bearish';
                }
                // Resultado
                const result = {
                    status,
                    btcDominance,
                    top5Performance: performances,
                    averageSentiment
                };
                // Guardar en caché (caducidad de 30 minutos)
                this.cache.set(cacheKey, result, 30 * 60);
                return result;
            }
            catch (error) {
                logging_1.logger.error({ error }, 'Error getting market summary');
                // Valores por defecto en caso de error
                return {
                    status: 'neutral',
                    btcDominance: 50,
                    top5Performance: [],
                    averageSentiment: 50
                };
            }
        });
    }
}
exports.MarketDataService = MarketDataService;
// Crear instancia singleton para uso en toda la aplicación
exports.marketDataService = new MarketDataService();
