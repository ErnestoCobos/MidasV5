#!/usr/bin/env node
"use strict";
/// <reference types="node" />
// midasTS - Bot para trading de criptomonedas
// -----------------------------------------------------------------------------
// LunarCrush x DeepSeek Reasoner x Binance
// Versión actualizada con mejoras de robustez y modularidad
// -----------------------------------------------------------------------------
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
const commander_1 = require("commander");
const logging_1 = require("./utils/logging");
const lunarcrush_1 = require("./services/lunarcrush");
const deepseek_1 = require("./services/deepseek");
const binance_1 = require("./services/binance");
const market_data_1 = require("./services/market-data");
const micro_capital_1 = require("./strategies/micro-capital");
const trade_history_1 = require("./services/trade-history");
const p_queue_1 = __importDefault(require("p-queue"));
// -----------------------------------------------------------------------------
// Estrategia Factory 
// -----------------------------------------------------------------------------
class StrategyFactory {
    static createStrategy(type, capital, config) {
        // Si el tipo es 'auto', seleccionar estrategia basada en tamaño de capital
        if (type === 'auto') {
            if (capital < 100) {
                type = 'micro';
            }
            else if (capital < 10000) {
                type = 'medium';
            }
            else {
                type = 'large';
            }
            logging_1.logger.info({
                strategy: type,
                capital: `$${capital}`
            }, 'Estrategia auto-seleccionada');
        }
        // Crear la estrategia específica
        switch (type) {
            case 'micro':
                // Si hay configuración personalizada, crear nueva instancia con esta configuración
                if (config) {
                    return new micro_capital_1.MicroCapitalStrategy(config);
                }
                // De lo contrario, usar la instancia global
                return micro_capital_1.microCapitalStrategy;
            case 'growth':
                // Para estrategia de crecimiento
                if (config) {
                    return new micro_capital_1.MicroCapitalStrategy(config, micro_capital_1.MicroCapitalStrategy.MODE_GROWTH);
                }
                // Usar instancia global de growth
                return micro_capital_1.microGrowthStrategy;
            // Podrías añadir más estrategias según sea necesario
            default:
                // Fallback a estrategia micro para iniciar
                logging_1.logger.warn({ requestedStrategy: type }, 'Estrategia solicitada no disponible, usando micro');
                return config ? new micro_capital_1.MicroCapitalStrategy(config) : micro_capital_1.microCapitalStrategy;
        }
    }
}
// -----------------------------------------------------------------------------
// Funciones principales del Bot
// -----------------------------------------------------------------------------
/**
 * Ejecuta el bot de trading estándar
 */
function runBot(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        logging_1.logger.info({
            symbol: opts.symbol,
            quote: opts.quote,
            interval: opts.interval,
            dryRun: opts.dryRun
        }, 'Starting standard trading bot');
        const throttle = new p_queue_1.default({ concurrency: 1, interval: 15000, intervalCap: 1 });
        console.log(`▶ Bot running: ${opts.symbol}, every ${opts.interval}s, dry=${opts.dryRun}`);
        // Establecer intervalo para ciclo de trading
        setInterval(() => __awaiter(this, void 0, void 0, function* () {
            // Usar PQueue para throttling como recomendado
            yield throttle.add(() => __awaiter(this, void 0, void 0, function* () {
                var _a;
                try {
                    // Obtener ticker 24h (con método correcto)
                    const ticker = yield binance_1.binanceService.getTicker24H(opts.symbol);
                    if (!ticker) {
                        throw new Error(`No se pudieron obtener datos de ticker para ${opts.symbol}`);
                    }
                    // Obtener sentimiento de LunarCrush en paralelo
                    const asset = opts.symbol.replace('USDT', '');
                    const galaxyScore = yield lunarcrush_1.lunarCrushService.galaxyScore(asset);
                    // Construir datos de mercado
                    const md = {
                        price: Number(ticker.lastPrice),
                        volume24h: Number(ticker.quoteVolume),
                        sentiment: galaxyScore
                    };
                    // Solicitar señal a DeepSeek
                    const signal = yield deepseek_1.deepSeekService.decide(md);
                    // Mostrar información de la señal
                    const timestamp = new Date().toISOString();
                    console.log(timestamp);
                    console.log(`Signal: ${signal.action} (confidence: ${((_a = signal.confidence) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || 0})`);
                    // Ejecutar operación si hay suficiente confianza
                    if (signal.confidence >= 0.5) {
                        if (signal.action === 'BUY') {
                            const buyOrder = yield binance_1.binanceService.buy(opts.symbol, opts.quote, opts.dryRun);
                            // Registrar operación en el historial
                            if (buyOrder) {
                                trade_history_1.tradeHistoryService.registerBuyOperation(buyOrder, opts.symbol, signal, 'standard');
                            }
                        }
                        if (signal.action === 'SELL') {
                            const sellOrder = yield binance_1.binanceService.sell(opts.symbol, opts.dryRun);
                            // Registrar venta en el historial
                            if (sellOrder) {
                                trade_history_1.tradeHistoryService.registerSellOperation(sellOrder, opts.symbol);
                            }
                        }
                    }
                }
                catch (e) {
                    logging_1.logger.error({ error: e.message }, 'Error en ciclo de trading');
                }
            }));
        }), opts.interval * 1000);
    });
}
/**
 * Ejecuta el bot optimizado para micro-trading
 */
function runMicroTrading(opts) {
    return __awaiter(this, void 0, void 0, function* () {
        // Validar parámetros
        if (opts.capital < 10) {
            logging_1.logger.error('Capital mínimo requerido es $10');
            process.exit(1);
        }
        if (opts.position > opts.capital * 0.5) {
            logging_1.logger.warn({
                position: opts.position,
                capital: opts.capital,
                maxAllowed: opts.capital * 0.5
            }, 'Tamaño de posición ajustado automáticamente a 50% del capital');
            opts.position = opts.capital * 0.5;
        }
        // Configurar la estrategia con los nuevos parámetros
        const strategyConfig = {
            minConfidence: opts.minConfidence,
            ignoreMarketConditions: opts.ignoreMarketConditions,
            allowBearishOperations: opts.allowBearish
        };
        // Crear la estrategia
        const strategy = StrategyFactory.createStrategy(opts.strategy, opts.capital, strategyConfig);
        logging_1.logger.info({
            symbol: opts.symbol,
            capital: opts.capital,
            position: opts.position,
            interval: opts.interval,
            strategy: strategy.name,
            stopLoss: opts.maxStopLoss,
            takeProfit: opts.takeProfit,
            dryRun: opts.dryRun
        }, 'Starting micro-trading bot');
        console.log(`▶ Bot running with ${strategy.name}:`);
        console.log(`   ${strategy.description}`);
        console.log(`   Symbol: ${opts.symbol}, Capital: $${opts.capital}, Interval: ${opts.interval}s, Dry Run: ${opts.dryRun}`);
        console.log(`   Risk parameters: Stop Loss: ${opts.maxStopLoss}%, Take Profit: ${opts.takeProfit}%`);
        // Establecer una cola de throttling más restrictiva para micro-capital
        // Evitando throttle global para mejor rendimiento 
        const throttle = new p_queue_1.default({
            concurrency: 1,
            interval: 30000,
            intervalCap: 1
        });
        // Configurar intervalo de ejecución
        setInterval(() => __awaiter(this, void 0, void 0, function* () {
            yield throttle.add(() => __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                try {
                    // Ejecutar la estrategia
                    const signal = yield strategy.execute(opts.symbol, opts.capital);
                    // Mostrar información detallada de la señal
                    console.log(`\n${new Date().toISOString()}`);
                    console.log(`Signal: ${signal.action} (confidence: ${((_a = signal.confidence) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || 0})`);
                    if (signal.action !== 'HOLD') {
                        console.log(`Entry: ${signal.entry}, SL: ${signal.stopLoss}, TP: ${signal.takeProfit}`);
                        console.log(`Position Size: $${((_b = signal.position_size) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || opts.position}`);
                        if (signal.reasoning) {
                            console.log(`Reasoning: ${signal.reasoning}`);
                        }
                    }
                    // Ejecutar operación si hay suficiente confianza
                    if (signal.confidence >= 0.85) {
                        if (signal.action === 'BUY') {
                            let buyOrder;
                            // Usar trailing stop si está configurado
                            if (signal.useTrailingStop && signal.trailingStopPercent) {
                                logging_1.logger.info({
                                    symbol: opts.symbol,
                                    positionSize: signal.position_size || opts.position,
                                    trailingPercent: signal.trailingStopPercent
                                }, 'Executing buy with trailing stop');
                                buyOrder = yield binance_1.binanceService.buyWithTrailingStop(opts.symbol, signal.position_size || opts.position, signal.trailingStopPercent, opts.dryRun);
                            }
                            else {
                                // Usar compra normal sin trailing stop
                                buyOrder = yield binance_1.binanceService.buy(opts.symbol, signal.position_size || opts.position, opts.dryRun);
                            }
                            // Registrar operación en el historial
                            if (buyOrder) {
                                trade_history_1.tradeHistoryService.registerBuyOperation(buyOrder, opts.symbol, signal, opts.strategy);
                            }
                        }
                        if (signal.action === 'SELL') {
                            const sellOrder = yield binance_1.binanceService.sell(opts.symbol, opts.dryRun);
                            // Registrar venta en el historial
                            if (sellOrder) {
                                trade_history_1.tradeHistoryService.registerSellOperation(sellOrder, opts.symbol);
                            }
                        }
                    }
                }
                catch (e) {
                    logging_1.logger.error({ error: e.message }, 'Error executing strategy');
                }
            }));
        }), opts.interval * 1000);
    });
}
// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------
const cli = new commander_1.Command();
// Versión actual
cli.version('1.0.0');
// Comando para trading estándar
cli
    .command('trade')
    .description('Modo de trading estándar')
    .option('-s, --symbol <pair>', 'symbol (default BTCUSDT)', 'BTCUSDT')
    .option('-q, --quote <usd>', 'USDT notional per trade', (v) => Number(v), 20)
    .option('-i, --interval <sec>', 'loop interval', (v) => Number(v), 30)
    .option('--dry-run', 'no real orders')
    .action((o) => runBot({
    symbol: o.symbol,
    quote: o.quote,
    interval: o.interval,
    dryRun: !!o.dryRun
}));
// Comando para micro-trading
cli
    .command('micro-trade')
    .description('Trading optimizado para capital muy pequeño')
    .option('-s, --symbol <pair>', 'Par de trading', 'BTCUSDT')
    .option('-c, --capital <amount>', 'Capital total disponible', (v) => Number(v), 54)
    .option('-p, --position <amount>', 'Tamaño de posición (USD)', (v) => Number(v), 10)
    .option('-g, --strategy <type>', 'Estrategia (auto|micro|growth)', 'micro')
    .option('-i, --interval <seconds>', 'Intervalo en segundos', (v) => Number(v), 180)
    .option('-l, --max-stop-loss <percent>', 'Máximo stop loss permitido', (v) => Number(v), 1.5)
    .option('-t, --take-profit <percent>', 'Objetivo de beneficio', (v) => Number(v), 1.2)
    .option('-f, --min-confidence <num>', 'Confianza mínima para operar (0-1)', (v) => Number(v), 0.85)
    .option('--ignore-market-conditions', 'Ignorar condiciones de mercado desfavorables')
    .option('--allow-bearish', 'Permitir operaciones en mercado bajista')
    .option('--growth-mode', 'Activar modo de crecimiento acelerado (equivalente a --strategy growth)')
    .option('--dry-run', 'Simulación sin ejecución real')
    .action((o) => {
    // Si se activó el modo de crecimiento, sobreescribir la estrategia
    if (o.growthMode) {
        o.strategy = 'growth';
        // Ajustar parámetros óptimos para crecimiento
        if (o.minConfidence === 0.85)
            o.minConfidence = 0.80; // Usar umbral más permisivo si no se especificó
        if (!o.ignoreMarketConditions)
            o.ignoreMarketConditions = true; // Ignorar condiciones de mercado por defecto
    }
    runMicroTrading({
        symbol: o.symbol,
        capital: o.capital,
        strategy: o.strategy,
        position: o.position,
        interval: o.interval,
        maxStopLoss: o.maxStopLoss,
        takeProfit: o.takeProfit,
        minConfidence: o.minConfidence,
        ignoreMarketConditions: o.ignoreMarketConditions,
        allowBearish: o.allowBearish,
        dryRun: !!o.dryRun
    });
});
// Comando específico para crecimiento de capital pequeño
cli
    .command('growth-trade')
    .description('Trading optimizado para maximizar crecimiento de capital pequeño')
    .option('-s, --symbol <pair>', 'Par de trading', 'BTCUSDT')
    .option('-c, --capital <amount>', 'Capital total disponible', (v) => Number(v), 54)
    .option('-i, --interval <seconds>', 'Intervalo en segundos', (v) => Number(v), 180)
    .option('-p, --pairs <number>', 'Número máximo de pares simultáneos', (v) => Number(v), 2)
    .option('--auto-size', 'Determinar tamaño de posición automáticamente', true)
    .option('--dry-run', 'Simulación sin ejecución real')
    .action((o) => {
    runMicroTrading({
        symbol: o.symbol,
        capital: o.capital,
        strategy: 'growth', // Usar siempre estrategia de crecimiento
        position: o.autoSize ? (o.capital * 0.4 / o.pairs) : 10, // 40% del capital dividido entre pares
        interval: o.interval,
        maxStopLoss: 1.8, // Stop loss óptimo para crecimiento
        takeProfit: 2.5, // Take profit más agresivo
        minConfidence: 0.8, // Umbral de confianza más permisivo
        ignoreMarketConditions: true, // Ignorar condiciones generales de mercado
        allowBearish: true, // Permitir operar en mercados bajistas
        dryRun: !!o.dryRun
    });
});
// Comando para diagnosticar conexiones API
cli
    .command('diagnose')
    .description('Diagnosticar conexiones a APIs')
    .action(() => __awaiter(void 0, void 0, void 0, function* () {
    console.log('=== DIAGNÓSTICO DE APIs ===');
    // Probar LunarCrush
    console.log('\nProbando LunarCrush...');
    try {
        const score = yield lunarcrush_1.lunarCrushService.galaxyScore('BTC');
        console.log(`✅ LunarCrush OK: Galaxy Score BTC = ${score}`);
    }
    catch (error) {
        console.log(`❌ LunarCrush Error: ${error.message}`);
    }
    // Probar Binance
    console.log('\nProbando Binance...');
    try {
        const ticker = yield binance_1.binanceService.getTicker24H('BTCUSDT');
        if (ticker && ticker.lastPrice) {
            console.log(`✅ Binance OK: BTC Price = ${ticker.lastPrice}`);
        }
        else {
            console.log('Datos del ticker recibidos (o nulos/undefined):');
            if (ticker !== undefined && ticker !== null) {
                try {
                    const tickerJSON = JSON.stringify(ticker, null, 2);
                    if (tickerJSON !== undefined) {
                        console.log(tickerJSON.substring(0, 200) + '...');
                    }
                    else {
                        console.log(`Ticker no serializable a JSON: ${typeof ticker}`);
                    }
                    console.log('❌ Binance Advertencia: Datos recibidos pero formato inesperado (falta lastPrice?)');
                }
                catch (jsonError) {
                    console.log(`Error al convertir ticker a JSON: ${jsonError.message}`);
                }
            }
            else {
                console.log(`Ticker recibido como: ${ticker}`);
                console.log('❌ Binance Error: No se recibieron datos válidos del ticker.');
            }
        }
    }
    catch (error) {
        console.log(`❌ Binance Error: ${error.message}`);
    }
    console.log('\n=== DIAGNÓSTICO COMPLETADO ===');
}));
// Comando para mostrar ejemplo de datos mejorados
cli
    .command('show-market-data')
    .description('Mostrar datos de mercado mejorados con indicadores')
    .option('-s, --symbol <pair>', 'Par a analizar', 'BTCUSDT')
    .action((o) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    console.log(`Obteniendo datos mejorados para ${o.symbol}...`);
    try {
        // Obtener sentiment
        const asset = o.symbol.replace('USDT', '');
        const sentiment = yield lunarcrush_1.lunarCrushService.galaxyScore(asset);
        // Obtener datos de mercado enriquecidos
        const md = yield market_data_1.marketDataService.getEnhancedMarketData(o.symbol);
        md.sentiment = sentiment;
        // Mostrar en formato amigable
        console.log('\n=== DATOS DE MERCADO MEJORADOS ===');
        console.log(`Símbolo: ${o.symbol}`);
        console.log(`Precio actual: ${md.price}`);
        console.log(`Volumen 24h: ${md.volume24h}`);
        console.log(`Sentimiento (Galaxy Score): ${md.sentiment}`);
        console.log('\n=== INDICADORES TÉCNICOS ===');
        if (md.technicals) {
            console.log(`RSI: ${((_a = md.technicals.rsi) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || 'N/A'}`);
            console.log(`Tendencia EMA: ${md.technicals.ema_cross || 'N/A'}`);
            console.log(`Ratio de volumen: ${((_b = md.technicals.volume_ratio) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || 'N/A'}`);
            console.log(`Posición en Bollinger Bands: ${((_c = md.technicals.bband_percent) === null || _c === void 0 ? void 0 : _c.toFixed(2)) || 'N/A'}`);
            console.log(`Soportes cercanos: ${((_d = md.technicals.supports) === null || _d === void 0 ? void 0 : _d.join(', ')) || 'N/A'}`);
            console.log(`Resistencias cercanas: ${((_e = md.technicals.resistances) === null || _e === void 0 ? void 0 : _e.join(', ')) || 'N/A'}`);
        }
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
    }
}));
// Comando para mostrar estadísticas e historial de operaciones
cli
    .command('stats')
    .description('Mostrar estadísticas de rendimiento e historial de operaciones')
    .option('-s, --symbol <pair>', 'Filtrar por par específico')
    .option('-d, --days <days>', 'Número de días a analizar', (v) => Number(v), 30)
    .option('-l, --limit <num>', 'Limitar número de operaciones a mostrar', (v) => Number(v), 10)
    .option('--status <status>', 'Filtrar por estado (OPEN, CLOSED)', 'ALL')
    .action((o) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // Comprobar si el archivo de historial existe
    console.log('\n=== ESTADÍSTICAS DE TRADING ===');
    try {
        // Obtener estadísticas
        const stats = trade_history_1.tradeHistoryService.getPerformanceStats(o.symbol, o.days);
        // Mostrar estadísticas globales
        console.log(`\nEstadísticas (últimos ${o.days} días):`);
        console.log(`Total operaciones: ${stats.totalTrades}`);
        if (stats.totalTrades > 0) {
            console.log(`Ratio de éxito: ${stats.winRate.toFixed(2)}% (${stats.winningTrades} win / ${stats.losingTrades} loss)`);
            console.log(`Beneficio/Pérdida total: ${stats.totalPnl.toFixed(2)} USDT`);
            console.log(`Beneficio/Pérdida promedio: ${stats.averagePnl.toFixed(2)} USDT (${stats.averagePnlPercent.toFixed(2)}%)`);
            console.log(`Mejor operación: ${stats.bestTrade.toFixed(2)} USDT`);
            console.log(`Peor operación: ${stats.worstTrade.toFixed(2)} USDT`);
        }
        console.log(`Posiciones abiertas: ${stats.openPositions}`);
        // Filtros para el historial
        const filters = {
            limit: o.limit
        };
        if (o.symbol) {
            filters.symbol = o.symbol;
        }
        if (o.status && o.status !== 'ALL') {
            filters.status = o.status;
        }
        // Obtener historial de operaciones
        const trades = trade_history_1.tradeHistoryService.getTradeHistory(filters);
        if (trades.length > 0) {
            console.log(`\nHistorial de Operaciones (últimas ${Math.min(o.limit, trades.length)}):`);
            console.log('--------------------------------------------------------------------------------');
            console.log('ID | Fecha | Símbolo | Acción | Entrada | Salida | P/L (%) | Estado');
            console.log('--------------------------------------------------------------------------------');
            // Imprimir en orden inverso (más recientes primero)
            for (let i = trades.length - 1; i >= Math.max(0, trades.length - o.limit); i--) {
                const t = trades[i];
                const date = new Date(t.timestamp).toLocaleString();
                const pnl = t.pnl || 0;
                const pnlPercent = t.pnlPercent || 0;
                console.log(`${t.id.slice(-8)} | ${date} | ${t.symbol} | ${t.action} | ${t.entry.toFixed(4)} | ` +
                    `${((_a = t.exitPrice) === null || _a === void 0 ? void 0 : _a.toFixed(4)) || '-'} | ${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%) | ${t.status}`);
            }
        }
        else {
            console.log('\nNo hay operaciones registradas que coincidan con los filtros.');
        }
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
    }
}));
// Comando para escanear múltiples pares y encontrar mejores oportunidades
cli
    .command('scan-market')
    .description('Escanear mercado para encontrar mejores oportunidades de trading')
    .option('-c, --capital <amount>', 'Capital total disponible', (v) => Number(v), 54)
    .option('-n, --top <number>', 'Mostrar top N oportunidades', (v) => Number(v), 5)
    .option('-v, --volume <min>', 'Volumen mínimo en millones USD', (v) => Number(v), 5)
    .option('-g, --growth-focus', 'Priorizar activos con alto potencial de crecimiento')
    .action((o) => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`\n=== ESCÁNER DE MERCADO (ENFOQUE: ${o.growthFocus ? 'CRECIMIENTO' : 'BALANCEADO'}) ===`);
    console.log(`Buscando mejores oportunidades para capital de $${o.capital}...`);
    try {
        // 1. Obtener pares disponibles con volumen adecuado
        console.log('\nObteniendo pares con liquidez adecuada...');
        // Primero obtener información del exchange
        const exchangeInfo = yield binance_1.binanceService.getRest().exchangeInfo();
        // Filtrar solo pares USDT activos
        const usdtPairs = exchangeInfo.data.symbols
            .filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .map((s) => s.symbol);
        console.log(`Encontrados ${usdtPairs.length} pares USDT activos.`);
        // 2. Analizar cada par (hasta 20 para no sobrecargar)
        const pairsToAnalyze = usdtPairs.slice(0, 20);
        console.log(`\nAnalizando ${pairsToAnalyze.length} pares principales...`);
        // Array para almacenar resultados
        const opportunities = [];
        // Procesar en grupos de 5 para no saturar las APIs
        for (let i = 0; i < pairsToAnalyze.length; i += 5) {
            const batch = pairsToAnalyze.slice(i, i + 5);
            yield Promise.all(batch.map((symbol) => __awaiter(void 0, void 0, void 0, function* () {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                try {
                    // Obtener datos de ticker
                    const ticker = yield binance_1.binanceService.getTicker24H(symbol);
                    // Filtrar por volumen mínimo (en millones USD)
                    if (Number(ticker.quoteVolume) < o.volume * 1000000) {
                        return;
                    }
                    // Obtener galaxy score
                    const asset = symbol.replace('USDT', '');
                    const galaxyScore = yield lunarcrush_1.lunarCrushService.galaxyScore(asset);
                    // Obtener datos de mercado con indicadores
                    const md = yield market_data_1.marketDataService.getEnhancedMarketData(symbol);
                    // Calcular score según enfoque
                    let score = 0;
                    if (o.growthFocus) {
                        // Fórmula para crecimiento
                        // Priorizar: alto Galaxy Score, RSI entre 45-65, volumen creciente
                        score = ((galaxyScore / 100) * 0.4 + // 40% peso del sentimiento
                            (((_a = md.technicals) === null || _a === void 0 ? void 0 : _a.rsi) && md.technicals.rsi > 45 && md.technicals.rsi < 65 ? 0.3 : 0) + // RSI óptimo
                            (((_b = md.technicals) === null || _b === void 0 ? void 0 : _b.volume_ratio) && md.technicals.volume_ratio > 1.2 ? 0.2 : 0) + // Volumen creciente
                            (((_c = md.technicals) === null || _c === void 0 ? void 0 : _c.ema_cross) === 'bullish' ? 0.1 : 0) // Tendencia alcista
                        );
                    }
                    else {
                        // Fórmula balanceada
                        // Priorizar: RSI extremo (sobreventa), soporte técnico
                        score = ((galaxyScore / 100) * 0.3 + // 30% peso del sentimiento
                            (((_d = md.technicals) === null || _d === void 0 ? void 0 : _d.rsi) && md.technicals.rsi < 30 ? 0.4 : 0) + // RSI sobreventa
                            (((_e = md.technicals) === null || _e === void 0 ? void 0 : _e.bband_percent) && md.technicals.bband_percent < 0.2 ? 0.3 : 0) // Cerca de soporte BBand
                        );
                    }
                    // Añadir a oportunidades
                    if (score > 0.3) { // Umbral mínimo
                        opportunities.push({
                            symbol,
                            score,
                            price: Number(ticker.lastPrice),
                            galaxyScore,
                            rsi: (_f = md.technicals) === null || _f === void 0 ? void 0 : _f.rsi,
                            trend: (_g = md.technicals) === null || _g === void 0 ? void 0 : _g.ema_cross,
                            volumeRatio: (_h = md.technicals) === null || _h === void 0 ? void 0 : _h.volume_ratio
                        });
                    }
                }
                catch (error) {
                    console.error(`Error analizando ${symbol}: ${error.message}`);
                }
            })));
            // Pausa para evitar rate limits
            yield new Promise(resolve => setTimeout(resolve, 1000));
        }
        // 3. Ordenar y mostrar resultados
        opportunities.sort((a, b) => b.score - a.score);
        const topOpportunities = opportunities.slice(0, o.top);
        if (topOpportunities.length > 0) {
            console.log('\n--- MEJORES OPORTUNIDADES DE TRADING ---');
            console.log('--------------------------------------------------------------------------------------------------------');
            console.log('   SÍMBOLO    |  SCORE  |  PRECIO  | GALAXY SCORE |   RSI   |  TENDENCIA  | VOLUMEN RATIO | RECOMENDACIÓN');
            console.log('--------------------------------------------------------------------------------------------------------');
            topOpportunities.forEach((opp, index) => {
                var _a, _b;
                // Determinar recomendación
                let recom = '';
                if (opp.score > 0.7)
                    recom = 'EXCELENTE';
                else if (opp.score > 0.5)
                    recom = 'MUY BUENA';
                else
                    recom = 'BUENA';
                console.log(`${(index + 1).toString().padStart(2, ' ')}. ${opp.symbol.padEnd(10, ' ')} | ` +
                    `${opp.score.toFixed(2).padStart(6, ' ')} | ` +
                    `${opp.price.toFixed(4).padStart(8, ' ')} | ` +
                    `${opp.galaxyScore.toFixed(0).padStart(12, ' ')} | ` +
                    `${(((_a = opp.rsi) === null || _a === void 0 ? void 0 : _a.toFixed(0)) || 'N/A').padStart(7, ' ')} | ` +
                    `${(opp.trend || 'N/A').padEnd(11, ' ')} | ` +
                    `${(((_b = opp.volumeRatio) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || 'N/A').padStart(12, ' ')} | ` +
                    `${recom}`);
            });
            console.log('\nComando para operar en mejor oportunidad:');
            console.log(`node src/index.js growth-trade -s ${topOpportunities[0].symbol} -c ${o.capital}`);
        }
        else {
            console.log('\nNo se encontraron oportunidades que cumplan los criterios.');
        }
    }
    catch (error) {
        console.error(`Error escaneando mercado: ${error.message}`);
    }
}));
// Analizar argumentos de línea de comandos
cli.parse(process.argv);
