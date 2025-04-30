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
exports.correlationService = exports.CorrelationService = void 0;
const binance_1 = require("./binance");
const logging_1 = require("../utils/logging");
const node_cache_1 = __importDefault(require("node-cache"));
/**
 * Servicio para analizar correlaciones entre activos y con el mercado general
 * Ayuda a identificar activos que se mueven juntos o de manera independiente
 */
class CorrelationService {
    constructor() {
        // Activos de referencia (benchmarks) para el mercado general
        this.benchmarks = ['BTCUSDT', 'ETHUSDT'];
        // Cache para datos de correlación (6 horas TTL)
        this.cache = new node_cache_1.default({ stdTTL: 6 * 60 * 60 });
        logging_1.logger.info('Correlation service initialized');
    }
    /**
     * Calcula el coeficiente de correlación entre dos series de precios
     * @param prices1 Primera serie de precios
     * @param prices2 Segunda serie de precios
     * @returns Coeficiente de correlación (-1 a 1)
     */
    calculateCorrelation(prices1, prices2) {
        // Implementación del coeficiente de correlación de Pearson
        const n = Math.min(prices1.length, prices2.length);
        // Necesitamos al menos 5 puntos para un cálculo significativo
        if (n < 5)
            return 0;
        // Truncar a la misma longitud
        prices1 = prices1.slice(0, n);
        prices2 = prices2.slice(0, n);
        // Calcular medias
        const mean1 = prices1.reduce((sum, val) => sum + val, 0) / n;
        const mean2 = prices2.reduce((sum, val) => sum + val, 0) / n;
        // Calcular correlación
        let num = 0;
        let denom1 = 0;
        let denom2 = 0;
        for (let i = 0; i < n; i++) {
            const diff1 = prices1[i] - mean1;
            const diff2 = prices2[i] - mean2;
            num += diff1 * diff2;
            denom1 += diff1 * diff1;
            denom2 += diff2 * diff2;
        }
        // Evitar división por cero
        if (denom1 === 0 || denom2 === 0)
            return 0;
        return num / Math.sqrt(denom1 * denom2);
    }
    /**
     * Analiza cómo un activo se correlaciona con los benchmarks
     * @param symbol Par a analizar (e.g. 'ADAUSDT')
     * @param timeframe Intervalo de tiempo ('1d' por defecto)
     * @param days Número de días de datos a utilizar
     * @returns Objeto con correlaciones por benchmark
     */
    getMarketCorrelations(symbol_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, timeframe = '1d', days = 30) {
            const cacheKey = `corr_${symbol}_${timeframe}_${days}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
                logging_1.logger.debug(`Using cached correlations for ${symbol}`);
                return cached;
            }
            const result = {};
            try {
                // Obtener datos históricos del activo principal
                const candles = yield binance_1.binanceService.getHistoricalCandles(symbol, timeframe, Math.min(days, 1000) // Límite de la API es 1000
                );
                // Si no hay suficientes datos, retornar correlaciones neutras
                if (candles.length < 5) {
                    logging_1.logger.warn(`Insufficient historical data for ${symbol}`);
                    for (const benchmark of this.benchmarks) {
                        result[benchmark] = 0;
                    }
                    return result;
                }
                const targetPrices = candles.map(c => c.close);
                // Calcular correlaciones con cada benchmark
                for (const benchmark of this.benchmarks) {
                    // Si el símbolo es el benchmark, correlación es 1 (perfecta)
                    if (symbol === benchmark) {
                        result[benchmark] = 1;
                        continue;
                    }
                    const benchmarkCandles = yield binance_1.binanceService.getHistoricalCandles(benchmark, timeframe, Math.min(days, 1000));
                    if (benchmarkCandles.length < 5) {
                        result[benchmark] = 0;
                        continue;
                    }
                    const benchmarkPrices = benchmarkCandles.map(c => c.close);
                    result[benchmark] = this.calculateCorrelation(targetPrices, benchmarkPrices);
                }
                // Guardar en caché
                this.cache.set(cacheKey, result);
                logging_1.logger.info({ symbol, correlations: result }, 'Market correlations calculated');
                return result;
            }
            catch (error) {
                logging_1.logger.error({
                    symbol,
                    timeframe,
                    days,
                    error: error.message
                }, 'Error calculating correlations');
                // En caso de error, devolver objeto vacío
                return {};
            }
        });
    }
    /**
     * Determina si las condiciones del mercado son favorables para una operación
     * basado en el análisis de correlaciones y tendencias
     * @param symbol Par a analizar
     * @param action Acción propuesta ('BUY', 'SELL', 'HOLD')
     * @returns True si las condiciones son favorables
     */
    isFavorableMarketCondition(symbol_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, action = 'BUY') {
            try {
                // Obtener correlaciones
                const correlations = yield this.getMarketCorrelations(symbol);
                // No hay datos de correlación suficientes
                if (Object.keys(correlations).length === 0) {
                    return true; // Por defecto, permitir la operación
                }
                // Verificación para alta correlación con BTC (>0.7)
                if (correlations['BTCUSDT'] > 0.7) {
                    // Si hay alta correlación, verificar tendencia de BTC
                    const btcCandles = yield binance_1.binanceService.getHistoricalCandles('BTCUSDT', '4h', 6);
                    if (btcCandles.length < 2)
                        return true; // No hay suficientes datos
                    // Calcular tendencia (simple: último cierre vs primer cierre)
                    const btcTrend = btcCandles[btcCandles.length - 1].close > btcCandles[0].close;
                    // Si acción es comprar, queremos tendencia positiva en BTC
                    // Si acción es vender, queremos tendencia negativa en BTC
                    if ((action === 'BUY' && !btcTrend) || (action === 'SELL' && btcTrend)) {
                        logging_1.logger.info({
                            symbol,
                            action,
                            btcCorrelation: correlations['BTCUSDT'],
                            btcTrend: btcTrend ? 'up' : 'down'
                        }, 'Unfavorable market conditions due to BTC correlation');
                        return false;
                    }
                }
                // Verificación adicional para ETH si la correlación con BTC no es muy alta
                if (correlations['BTCUSDT'] < 0.5 && correlations['ETHUSDT'] > 0.6) {
                    const ethCandles = yield binance_1.binanceService.getHistoricalCandles('ETHUSDT', '4h', 6);
                    if (ethCandles.length < 2)
                        return true;
                    const ethTrend = ethCandles[ethCandles.length - 1].close > ethCandles[0].close;
                    if ((action === 'BUY' && !ethTrend) || (action === 'SELL' && ethTrend)) {
                        logging_1.logger.info({
                            symbol,
                            action,
                            ethCorrelation: correlations['ETHUSDT'],
                            ethTrend: ethTrend ? 'up' : 'down'
                        }, 'Unfavorable market conditions due to ETH correlation');
                        return false;
                    }
                }
                // Si no hay alta correlación o las tendencias son favorables
                return true;
            }
            catch (error) {
                logging_1.logger.error({
                    symbol,
                    action,
                    error: error.message
                }, 'Error checking market conditions');
                // En caso de error, no bloquear la operación
                return true;
            }
        });
    }
    /**
     * Encuentra los activos más descorrelacionados (diversificación)
     * @param symbols Lista de pares a analizar
     * @param threshold Umbral máximo de correlación para considerar baja correlación
     * @returns Grupos de activos con baja correlación mutua
     */
    findDiversifiedAssets(symbols_1) {
        return __awaiter(this, arguments, void 0, function* (symbols, threshold = 0.3) {
            // Matriz de correlaciones
            const correlationMatrix = {};
            // Calcular todas las correlaciones
            for (let i = 0; i < symbols.length; i++) {
                correlationMatrix[symbols[i]] = {};
                for (let j = 0; j < symbols.length; j++) {
                    if (i === j) {
                        correlationMatrix[symbols[i]][symbols[j]] = 1; // Auto-correlación
                        continue;
                    }
                    // Solo calcular la mitad de la matriz (es simétrica)
                    if (j > i) {
                        // Obtener precios de cierre
                        const candles1 = yield binance_1.binanceService.getHistoricalCandles(symbols[i], '1d', 30);
                        const candles2 = yield binance_1.binanceService.getHistoricalCandles(symbols[j], '1d', 30);
                        const prices1 = candles1.map(c => c.close);
                        const prices2 = candles2.map(c => c.close);
                        // Calcular correlación
                        const corr = this.calculateCorrelation(prices1, prices2);
                        // Guardar resultado (en ambas direcciones, ya que es simétrica)
                        correlationMatrix[symbols[i]][symbols[j]] = corr;
                        if (!correlationMatrix[symbols[j]]) {
                            correlationMatrix[symbols[j]] = {};
                        }
                        correlationMatrix[symbols[j]][symbols[i]] = corr;
                    }
                }
            }
            // Algoritmo greedy para formar grupos de activos poco correlacionados
            const groups = [];
            const remainingSymbols = [...symbols];
            while (remainingSymbols.length > 0) {
                const group = [remainingSymbols[0]];
                remainingSymbols.splice(0, 1);
                // Intentar añadir más activos al grupo actual
                for (let i = 0; i < remainingSymbols.length; i++) {
                    const candidate = remainingSymbols[i];
                    let canAdd = true;
                    // Verificar correlación con todos los activos ya en el grupo
                    for (const groupAsset of group) {
                        const corr = Math.abs(correlationMatrix[candidate][groupAsset]);
                        if (corr > threshold) {
                            canAdd = false;
                            break;
                        }
                    }
                    if (canAdd) {
                        group.push(candidate);
                        remainingSymbols.splice(i, 1);
                        i--; // Ajustar índice después de eliminar elemento
                    }
                }
                groups.push(group);
            }
            // Registrar resultado
            logging_1.logger.info({
                symbolCount: symbols.length,
                groupCount: groups.length,
                groups
            }, 'Diversified asset groups found');
            return groups;
        });
    }
}
exports.CorrelationService = CorrelationService;
// Crear instancia singleton
exports.correlationService = new CorrelationService();
