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
exports.binanceService = exports.BinanceService = void 0;
const spot_1 = require("@binance/spot");
const logging_1 = require("../utils/logging");
const env_1 = require("../utils/env");
const p_queue_1 = __importDefault(require("p-queue"));
const node_cache_1 = __importDefault(require("node-cache"));
const circuit_breaker_1 = require("../utils/circuit-breaker");
const error_tracking_1 = require("../utils/error-tracking");
// Clase principal para interactuar con Binance (REST API)
class BinanceService {
    constructor(config) {
        const { apiKey, apiSecret, testnet = false, cacheTime = 60 } = config;
        // Inicializar REST client
        const spot = new spot_1.Spot({
            configurationRestAPI: {
                apiKey,
                apiSecret,
                basePath: testnet ? spot_1.SPOT_REST_API_TESTNET_URL : undefined
            }
        });
        this.rest = spot.restAPI;
        // Inicializar caché para datos que no cambian frecuentemente
        this.cache = new node_cache_1.default({ stdTTL: cacheTime });
        // Crear cola de peticiones para controlar rate-limiting
        this.queue = new p_queue_1.default({
            concurrency: 10, // Binance permite 1200/min para endpoints con peso 1
            intervalCap: 1000, // 1000 peticiones por intervalo
            interval: 60 * 1000, // 1 minuto
            carryoverConcurrencyCount: true
        });
        logging_1.logger.info({ testnet }, 'Binance service initialized');
    }
    /**
     * Obtener acceso al cliente REST de Binance
     * @returns Cliente REST de Binance
     */
    getRest() {
        return this.rest;
    }
    /**
     * Obtener datos históricos de klines/candlesticks
     * @param symbol Símbolo (e.g., 'BTCUSDT')
     * @param interval Intervalo (e.g., '1m', '5m', '1h')
     * @param limit Número de velas a obtener (máx. 1000)
     * @returns Array de velas
     */
    getHistoricalCandles(symbol_1, interval_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, interval, limit = 100) {
            // Verificar límites
            if (limit > 1000) {
                limit = 1000; // Máximo permitido por Binance
            }
            // Verificar caché
            const cacheKey = `klines_${symbol}_${interval}_${limit}`;
            const cachedData = this.cache.get(cacheKey);
            if (cachedData) {
                logging_1.logger.debug(`Usando datos en caché para ${symbol} ${interval}`);
                return cachedData;
            }
            try {
                // Usar fetch directamente para evitar problemas con el cliente Binance
                try {
                    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
                    const response = yield fetch(url, {
                        method: 'GET',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        }
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    const data = yield response.json();
                    // Verificar que data sea un array
                    if (!Array.isArray(data)) {
                        throw new Error('Binance klines response is not an array');
                    }
                    // Convertir la respuesta a formato Candle
                    const candles = data.map((kline) => {
                        // Verificar que cada elemento sea un array
                        if (!Array.isArray(kline)) {
                            logging_1.logger.warn('Kline item is not an array, skipping');
                            return null;
                        }
                        // Intentar extraer datos con manejo seguro
                        try {
                            return {
                                openTime: kline[0] || Date.now(),
                                open: parseFloat(kline[1] || '0'),
                                high: parseFloat(kline[2] || '0'),
                                low: parseFloat(kline[3] || '0'),
                                close: parseFloat(kline[4] || '0'),
                                volume: parseFloat(kline[5] || '0'),
                                closeTime: kline[6] || (Date.now() + 3600000)
                            };
                        }
                        catch (e) {
                            logging_1.logger.warn({ kline }, 'Error parsing kline item');
                            return null;
                        }
                    }).filter((candle) => candle !== null);
                    // Guardar en caché
                    this.cache.set(cacheKey, candles, 30); // 30 segundos TTL
                    return candles;
                }
                catch (fetchError) {
                    logging_1.logger.error({
                        symbol,
                        interval,
                        errorType: 'fetchError',
                        message: fetchError.message
                    }, 'Error fetching candles with fetch');
                    // Intentar con el método original como fallback
                    try {
                        // Encolar la petición con rate limiting
                        const response = yield this.queue.add(() => this.rest.klines({
                            symbol,
                            interval,
                            limit
                        }));
                        // Verificar la respuesta
                        if (!response || !response.data) {
                            logging_1.logger.warn({
                                symbol,
                                interval
                            }, 'Empty response from Binance klines API');
                            return this.generateMockCandles(limit);
                        }
                        // Verificar que response.data sea un array antes de usar map
                        if (!Array.isArray(response.data)) {
                            logging_1.logger.error({
                                symbol,
                                interval,
                                dataType: typeof response.data
                            }, 'Binance klines response is not an array');
                            return this.generateMockCandles(limit);
                        }
                        // Convertir la respuesta a formato Candle
                        const candles = response.data.map((kline) => {
                            if (!Array.isArray(kline))
                                return null;
                            try {
                                return {
                                    openTime: kline[0] || Date.now(),
                                    open: parseFloat(kline[1] || '0'),
                                    high: parseFloat(kline[2] || '0'),
                                    low: parseFloat(kline[3] || '0'),
                                    close: parseFloat(kline[4] || '0'),
                                    volume: parseFloat(kline[5] || '0'),
                                    closeTime: kline[6] || (Date.now() + 3600000)
                                };
                            }
                            catch (e) {
                                return null;
                            }
                        }).filter((candle) => candle !== null);
                        // Guardar en caché
                        this.cache.set(cacheKey, candles, 30);
                        return candles;
                    }
                    catch (originalError) {
                        logging_1.logger.error({
                            symbol,
                            interval,
                            errorType: 'originalMethodError',
                            message: originalError.message
                        }, 'Both fetch and original method failed for candles');
                        return this.generateMockCandles(limit);
                    }
                }
            }
            catch (error) {
                logging_1.logger.error({ symbol, interval, limit, error: error.message }, 'Error fetching historical candles');
                // En modo de desarrollo, simular candles para permitir desarrollo sin acceso a la API
                if (process.env.NODE_ENV === 'development') {
                    logging_1.logger.info('Generating mock candles for development');
                    return this.generateMockCandles(limit);
                }
                return [];
            }
        });
    }
    /**
     * Genera candles simulados para desarrollo y pruebas
     * @param count Número de candles a generar
     * @returns Array de candles simulados
     */
    generateMockCandles(count) {
        const now = Date.now();
        const candles = [];
        let basePrice = 30000 + Math.random() * 2000; // Precio base aleatorio entre 30000-32000
        for (let i = 0; i < count; i++) {
            // Generar variación aleatoria entre -1% y +1%
            const variation = (Math.random() * 2 - 1) * 0.01;
            basePrice = basePrice * (1 + variation);
            // Generar high y low alrededor del precio base
            const high = basePrice * (1 + Math.random() * 0.005);
            const low = basePrice * (1 - Math.random() * 0.005);
            // Crear candle simulado
            candles.push({
                openTime: now - (count - i) * 3600000, // Horas hacia atrás
                open: parseFloat(basePrice.toFixed(2)),
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                close: parseFloat((basePrice + (Math.random() * 0.01 - 0.005) * basePrice).toFixed(2)),
                volume: parseFloat((Math.random() * 100 + 10).toFixed(2)),
                closeTime: now - (count - i - 1) * 3600000
            });
        }
        return candles;
    }
    /**
     * Obtener ticker de 24h para un símbolo
     * @param symbol Símbolo (e.g., 'BTCUSDT')
     * @returns Datos del ticker de 24h, o null si hay error
     */
    getTicker24H(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            // Verificar caché primero para evitar llamadas innecesarias
            const cacheKey = `ticker24h_${symbol}`;
            const cachedData = this.cache.get(cacheKey);
            if (cachedData) {
                return cachedData;
            }
            // Obtener circuit breaker para Binance
            const breaker = circuit_breaker_1.CircuitBreakerRegistry.getOrCreate('binance', {
                failureThreshold: 3,
                resetTimeout: 30000,
                halfOpenSuccessThreshold: 2,
                timeout: 15000
            });
            try {
                // Usar el circuit breaker para la operación
                return yield breaker.execute(() => __awaiter(this, void 0, void 0, function* () {
                    // Usar tracking de errores con reintentos
                    return yield (0, error_tracking_1.withErrorTracking)(() => __awaiter(this, void 0, void 0, function* () {
                        // Si no está en caché, obtener datos frescos usando fetch
                        try {
                            // Construir URL para la API de Binance
                            const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
                            const response = yield fetch(url, {
                                method: 'GET',
                                headers: {
                                    'Accept': 'application/json',
                                    'Content-Type': 'application/json'
                                }
                            });
                            if (!response.ok) {
                                throw new Error(`HTTP error! Status: ${response.status}`);
                            }
                            const data = yield response.json();
                            // Guardar en caché (corta duración)
                            this.cache.set(cacheKey, data, 10); // 10 segundos TTL
                            return data;
                        }
                        catch (fetchError) {
                            logging_1.logger.error({
                                symbol,
                                errorType: 'fetchError',
                                message: fetchError.message
                            }, 'Error fetching 24h ticker with fetch');
                            // Intentar con el método original como fallback
                            const response = yield this.queue.add(() => this.rest.ticker24hr({ symbol }));
                            // Si la respuesta es una función, esto podría ser el problema
                            if (typeof response.data === 'function') {
                                throw new Error('Binance API returned function instead of data');
                            }
                            // Guardar en caché
                            this.cache.set(cacheKey, response.data, 10);
                            return response.data;
                        }
                    }), {
                        name: 'binance.getTicker24H',
                        tags: { symbol },
                        data: { service: 'binance' }
                    }, {
                        maxRetries: 2,
                        baseDelayMs: 1000,
                        shouldRetry: (error) => {
                            // Filtrar errores que deberían reintentarse
                            return error.message.includes('timeout') ||
                                error.message.includes('rate limit') ||
                                error.message.includes('network error') ||
                                error.message.includes('5') || // Errores 5xx
                                error.message.includes('429'); // Too Many Requests
                        }
                    });
                }), `getTicker24H(${symbol})`);
            }
            catch (error) {
                logging_1.logger.error({
                    symbol,
                    error: error.message,
                    circuitState: breaker.getState()
                }, 'Error fetching 24h ticker');
                // Si el circuito está abierto o hay cualquier otro error, usar datos simulados
                return this.simulateTickerData(symbol);
            }
        });
    }
    /**
     * Genera datos de ticker simulados para desarrollo y pruebas
     * @param symbol Símbolo para el ticker
     * @returns Objeto simulado de ticker
     */
    simulateTickerData(symbol) {
        const baseAsset = symbol.replace('USDT', '');
        const now = Date.now();
        const basePrice = baseAsset === 'BTC' ? 60000 :
            baseAsset === 'ETH' ? 3000 :
                baseAsset === 'BNB' ? 500 : 100;
        // Simular un precio con variación pequeña
        const randomFactor = 0.95 + (Math.random() * 0.1); // 0.95-1.05
        const price = basePrice * randomFactor;
        logging_1.logger.info({ symbol, simulatedPrice: price }, 'Using simulated ticker data');
        return {
            symbol: symbol,
            priceChange: (price * 0.01 * (Math.random() - 0.5)).toFixed(2),
            priceChangePercent: (Math.random() * 2 - 1).toFixed(2),
            weightedAvgPrice: price.toFixed(2),
            lastPrice: price.toFixed(2),
            lastQty: (Math.random() * 10).toFixed(4),
            bidPrice: (price * 0.999).toFixed(2),
            bidQty: (Math.random() * 5).toFixed(4),
            askPrice: (price * 1.001).toFixed(2),
            askQty: (Math.random() * 5).toFixed(4),
            openPrice: (price * 0.98).toFixed(2),
            highPrice: (price * 1.02).toFixed(2),
            lowPrice: (price * 0.97).toFixed(2),
            volume: (Math.random() * 1000 + 100).toFixed(2),
            quoteVolume: (Math.random() * 1000000 + 10000).toFixed(2),
            openTime: now - 86400000, // 24 horas atrás
            closeTime: now,
            firstId: 1000000,
            lastId: 1100000,
            count: 100000,
            isSimulated: true // campo para indicar que son datos simulados
        };
    }
    /**
     * Ejecutar una orden de compra
     * @param symbol Símbolo (e.g., 'BTCUSDT')
     * @param amount Cantidad a comprar en USD
     * @param dryRun Si es true, simula la orden sin ejecutarla
     * @returns Resultado de la orden o null si hay error
     */
    buy(symbol_1, amount_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, amount, dryRun = false) {
            try {
                // Obtener precio actual
                const ticker = yield this.getTicker24H(symbol);
                if (!ticker) {
                    throw new Error(`No se pudo obtener el precio actual para ${symbol}`);
                }
                const price = parseFloat(ticker.lastPrice);
                const quantity = (amount / price).toFixed(5);
                // Si es dry run, simular la orden
                if (dryRun) {
                    logging_1.logger.info({
                        action: 'BUY',
                        symbol,
                        amount: `$${amount}`,
                        quantity,
                        price
                    }, '[DRY RUN] Order would be executed');
                    return {
                        orderId: 'simulated-' + Date.now(),
                        status: 'SIMULATED',
                        price,
                        quantity,
                        side: 'BUY'
                    };
                }
                // Ejecutar la orden real
                const response = yield this.rest.newOrder({
                    symbol,
                    side: 'BUY',
                    type: 'MARKET',
                    quoteOrderQty: amount.toString()
                });
                logging_1.logger.info({
                    orderId: response.data.orderId,
                    symbol,
                    amount,
                    status: response.data.status
                }, 'Buy order executed');
                return response.data;
            }
            catch (error) {
                logging_1.logger.error({ symbol, amount, error: error.message }, 'Error executing buy order');
                return null;
            }
        });
    }
    /**
     * Ejecuta una orden de compra con trailing stop para maximizar ganancias
     * @param symbol Símbolo (e.g., 'BTCUSDT')
     * @param amount Cantidad a comprar en USD
     * @param trailingPercent Porcentaje de trailing stop (1.0 = 1%)
     * @param dryRun Si es true, simula la orden sin ejecutarla
     * @returns Resultado de las órdenes o null si hay error
     */
    buyWithTrailingStop(symbol_1, amount_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, amount, trailingPercent = 1.0, dryRun = false) {
            try {
                // Ejecutar compra inicial
                const buyOrder = yield this.buy(symbol, amount, dryRun);
                if (!buyOrder || dryRun)
                    return buyOrder;
                // Verificar que la orden se ejecutó correctamente
                const orderStatus = yield this.rest.getOrder({
                    symbol,
                    orderId: buyOrder.orderId
                });
                if (orderStatus.data.status !== 'FILLED') {
                    logging_1.logger.warn({
                        symbol,
                        orderId: buyOrder.orderId,
                        status: orderStatus.data.status
                    }, 'Buy order not filled, skipping trailing stop');
                    return buyOrder;
                }
                // Configurar trailing stop
                try {
                    // Obtener precio actual
                    const ticker = yield this.getTicker24H(symbol);
                    if (!ticker)
                        throw new Error(`No se pudo obtener precio para trailing stop de ${symbol}`);
                    const currentPrice = parseFloat(ticker.lastPrice);
                    // Calcular activation price (0.5% por encima del precio actual)
                    const activationPrice = currentPrice * 1.005;
                    // Crear orden de trailing stop
                    const response = yield this.rest.newOrder({
                        symbol,
                        side: 'SELL',
                        type: 'TRAILING_STOP_MARKET',
                        quantity: orderStatus.data.executedQty,
                        callbackRate: trailingPercent.toString(), // Distancia de trailing en porcentaje
                        activationPrice: activationPrice.toFixed(8)
                    });
                    logging_1.logger.info({
                        symbol,
                        buyOrderId: buyOrder.orderId,
                        trailingStopOrderId: response.data.orderId,
                        trailingPercent,
                        activationPrice: activationPrice.toFixed(8)
                    }, 'Trailing stop order placed');
                    // Devolver ambas órdenes
                    return {
                        buyOrder: buyOrder,
                        trailingStopOrder: response.data
                    };
                }
                catch (trailingError) {
                    logging_1.logger.error({
                        symbol,
                        buyOrderId: buyOrder.orderId,
                        error: trailingError.message
                    }, 'Error setting trailing stop, but buy order was successful');
                    // Devolver solo la orden de compra
                    return {
                        buyOrder: buyOrder,
                        trailingStopError: trailingError.message
                    };
                }
            }
            catch (error) {
                logging_1.logger.error({
                    symbol,
                    amount,
                    trailingPercent,
                    error: error.message
                }, 'Error in buyWithTrailingStop');
                return null;
            }
        });
    }
    /**
     * Ejecutar una orden de venta
     * @param symbol Símbolo (e.g., 'BTCUSDT')
     * @param dryRun Si es true, simula la orden sin ejecutarla
     * @returns Resultado de la orden o null si hay error
     */
    sell(symbol_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, dryRun = false) {
            try {
                // Obtener información de la cuenta para ver el balance disponible
                const accountInfo = yield this.rest.accountInformation();
                const assetSymbol = symbol.replace('USDT', '');
                const balance = accountInfo.data.balances.find((b) => b.asset === assetSymbol);
                if (!balance || parseFloat(balance.free) <= 0) {
                    logging_1.logger.warn({ symbol, assetSymbol }, 'No balance available to sell');
                    return null;
                }
                // Si es dry run, simular la orden
                if (dryRun) {
                    logging_1.logger.info({
                        action: 'SELL',
                        symbol,
                        quantity: balance.free
                    }, '[DRY RUN] Order would be executed');
                    return {
                        orderId: 'simulated-' + Date.now(),
                        status: 'SIMULATED',
                        quantity: balance.free,
                        side: 'SELL'
                    };
                }
                // Ejecutar la orden real
                const response = yield this.rest.newOrder({
                    symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quantity: balance.free
                });
                logging_1.logger.info({
                    orderId: response.data.orderId,
                    symbol,
                    quantity: balance.free,
                    status: response.data.status
                }, 'Sell order executed');
                return response.data;
            }
            catch (error) {
                logging_1.logger.error({ symbol, error: error.message }, 'Error executing sell order');
                return null;
            }
        });
    }
}
exports.BinanceService = BinanceService;
// Crear instancia singleton del servicio
exports.binanceService = new BinanceService({
    apiKey: env_1.env.BINANCE_KEY,
    apiSecret: env_1.env.BINANCE_SECRET,
    testnet: false, // Cambiar a true para usar testnet
    cacheTime: 60
});
