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
exports.tradeHistoryService = exports.TradeHistoryService = void 0;
const logging_1 = require("../utils/logging");
const trade_repository_1 = require("../repositories/trade-repository");
/**
 * Servicio para manejar la persistencia y análisis del historial de operaciones
 * Utiliza una base de datos PostgreSQL para el almacenamiento persistente
 */
class TradeHistoryService {
    constructor() {
        logging_1.logger.info('Trade history service initialized with PostgreSQL database');
    }
    /**
     * Registra una nueva operación de compra
     * @param buyOrder La orden de compra ejecutada
     * @param symbol El par de trading
     * @param signal La señal que generó la operación
     * @param strategyType Tipo de estrategia utilizada
     * @returns El ID de la operación registrada
     */
    registerBuyOperation(buyOrder_1, symbol_1, signal_1) {
        return __awaiter(this, arguments, void 0, function* (buyOrder, symbol, signal, strategyType = 'micro') {
            var _a;
            try {
                // Si no tiene un ID de operación correcta (p.ej. en modo de simulación)
                // o si hay algún error, generar un ID temporal
                const orderId = (buyOrder === null || buyOrder === void 0 ? void 0 : buyOrder.orderId) || `sim-${Date.now()}`;
                const price = Number(buyOrder === null || buyOrder === void 0 ? void 0 : buyOrder.price) || signal.entry || 0;
                const quantity = (buyOrder === null || buyOrder === void 0 ? void 0 : buyOrder.executedQty) || (buyOrder === null || buyOrder === void 0 ? void 0 : buyOrder.quantity) || '0';
                const positionSize = (buyOrder === null || buyOrder === void 0 ? void 0 : buyOrder.cummulativeQuoteQty) ||
                    (Number(quantity) * price) ||
                    signal.position_size || 0;
                // Crear la operación
                const trade = {
                    id: `trade-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                    symbol,
                    action: 'BUY',
                    entry: price,
                    quantity,
                    positionSize,
                    timestamp: Date.now(),
                    signal: {
                        confidence: signal.confidence,
                        stopLoss: signal.stopLoss,
                        takeProfit: signal.takeProfit,
                        reasoning: signal.reasoning,
                        useTrailingStop: signal.useTrailingStop,
                        trailingStopPercent: signal.trailingStopPercent
                    },
                    status: 'OPEN',
                    orderIds: {
                        entry: orderId,
                        trailingStop: (_a = buyOrder === null || buyOrder === void 0 ? void 0 : buyOrder.trailingStopOrder) === null || _a === void 0 ? void 0 : _a.orderId
                    },
                    strategyType,
                    executionType: 'BOT'
                };
                // Guardar en la base de datos
                yield trade_repository_1.tradeRepository.saveTrade(trade);
                logging_1.logger.info({
                    tradeId: trade.id,
                    symbol,
                    action: 'BUY',
                    entry: price,
                    positionSize
                }, 'New buy operation registered in database');
                return trade.id;
            }
            catch (error) {
                logging_1.logger.error({
                    error: error.message,
                    symbol,
                    orderId: buyOrder === null || buyOrder === void 0 ? void 0 : buyOrder.orderId
                }, 'Error registering buy operation');
                return '';
            }
        });
    }
    /**
     * Registra una operación de venta y cierra la posición correspondiente
     * @param sellOrder La orden de venta ejecutada
     * @param symbol El par de trading
     * @returns True si se encontró y actualizó correctamente la operación
     */
    registerSellOperation(sellOrder, symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Encontrar la operación abierta más reciente para este par
                const openTrade = yield trade_repository_1.tradeRepository.findOpenTradeBySymbol(symbol);
                if (!openTrade) {
                    logging_1.logger.warn({
                        symbol,
                        sellOrderId: sellOrder === null || sellOrder === void 0 ? void 0 : sellOrder.orderId
                    }, 'No open trade found to register sell operation');
                    return false;
                }
                // Calcular P&L
                const exitPrice = Number(sellOrder === null || sellOrder === void 0 ? void 0 : sellOrder.price) || 0;
                const pnl = (exitPrice - openTrade.entry) * Number(openTrade.quantity);
                const pnlPercent = ((exitPrice / openTrade.entry) - 1) * 100;
                // Actualizar la operación
                const updatedTrade = Object.assign(Object.assign({}, openTrade), { exitPrice, exitTimestamp: Date.now(), pnl,
                    pnlPercent, status: 'CLOSED', orderIds: Object.assign(Object.assign({}, openTrade.orderIds), { exit: (sellOrder === null || sellOrder === void 0 ? void 0 : sellOrder.orderId) || `sim-sell-${Date.now()}` }) });
                // Guardar cambios en la base de datos
                yield trade_repository_1.tradeRepository.saveTrade(updatedTrade);
                logging_1.logger.info({
                    tradeId: openTrade.id,
                    symbol,
                    action: 'SELL',
                    entry: openTrade.entry,
                    exit: exitPrice,
                    pnl: pnl.toFixed(2),
                    pnlPercent: pnlPercent.toFixed(2) + '%'
                }, 'Trade closed with sell operation');
                return true;
            }
            catch (error) {
                logging_1.logger.error({
                    error: error.message,
                    symbol,
                    sellOrderId: sellOrder === null || sellOrder === void 0 ? void 0 : sellOrder.orderId
                }, 'Error registering sell operation');
                return false;
            }
        });
    }
    /**
     * Obtiene el historial de operaciones
     * @param filters Filtros opcionales
     * @returns Array de operaciones filtradas
     */
    getTradeHistory(filters) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Convertir los filtros al formato esperado por el repositorio
                const repoFilters = {
                    symbol: filters === null || filters === void 0 ? void 0 : filters.symbol,
                    status: filters === null || filters === void 0 ? void 0 : filters.status,
                    strategyType: filters === null || filters === void 0 ? void 0 : filters.strategyType,
                    dateFrom: filters === null || filters === void 0 ? void 0 : filters.dateFrom,
                    dateTo: filters === null || filters === void 0 ? void 0 : filters.dateTo,
                    limit: filters === null || filters === void 0 ? void 0 : filters.limit
                };
                // Obtener las operaciones de la base de datos
                return yield trade_repository_1.tradeRepository.findTrades(repoFilters);
            }
            catch (error) {
                logging_1.logger.error({ error: error.message }, 'Error getting trade history');
                return [];
            }
        });
    }
    /**
     * Obtener estadísticas de rendimiento
     * @param symbol Filtrar por par específico (opcional)
     * @param days Número de días a analizar (por defecto: 30)
     * @returns Estadísticas de rendimiento
     */
    getPerformanceStats(symbol_1) {
        return __awaiter(this, arguments, void 0, function* (symbol, days = 30) {
            try {
                // Usar el repositorio para obtener las estadísticas
                return yield trade_repository_1.tradeRepository.getPerformanceStats(symbol, days);
            }
            catch (error) {
                logging_1.logger.error({ error: error.message, symbol, days }, 'Error getting performance stats');
                // Devolver valores por defecto en caso de error
                return {
                    totalTrades: 0,
                    winningTrades: 0,
                    losingTrades: 0,
                    winRate: 0,
                    averagePnl: 0,
                    averagePnlPercent: 0,
                    totalPnl: 0,
                    bestTrade: 0,
                    worstTrade: 0,
                    openPositions: 0
                };
            }
        });
    }
    /**
     * Obtiene la operación abierta más reciente para un par
     * @param symbol Par de trading
     * @returns La operación abierta o undefined si no existe
     */
    getOpenTrade(symbol) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield trade_repository_1.tradeRepository.findOpenTradeBySymbol(symbol);
            }
            catch (error) {
                logging_1.logger.error({ error: error.message, symbol }, 'Error getting open trade');
                return null;
            }
        });
    }
    /**
     * Agrega una nota a una operación
     * @param tradeId ID de la operación
     * @param note Nota a añadir
     * @returns true si se actualizó correctamente
     */
    addNoteToTrade(tradeId, note) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield trade_repository_1.tradeRepository.addNoteToTrade(tradeId, note);
            }
            catch (error) {
                logging_1.logger.error({ error: error.message, tradeId }, 'Error adding note to trade');
                return false;
            }
        });
    }
    /**
     * Añade etiquetas a una operación
     * @param tradeId ID de la operación
     * @param tags Etiquetas a añadir
     * @returns true si se actualizó correctamente
     */
    addTagsToTrade(tradeId, tags) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                return yield trade_repository_1.tradeRepository.addTagsToTrade(tradeId, tags);
            }
            catch (error) {
                logging_1.logger.error({ error: error.message, tradeId }, 'Error adding tags to trade');
                return false;
            }
        });
    }
}
exports.TradeHistoryService = TradeHistoryService;
// Crear instancia singleton
exports.tradeHistoryService = new TradeHistoryService();
