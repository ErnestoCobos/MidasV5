import { logger } from '../utils/logging';
import { TradeSignal } from './deepseek';
import { tradeRepository } from '../repositories/trade-repository';

/**
 * Estructura para almacenar información de operaciones realizadas
 */
export interface TradeOperation {
  id: string;                       // Identificador único de la operación
  symbol: string;                   // Par de trading (ej. BTCUSDT)
  action: 'BUY' | 'SELL';           // Tipo de operación
  entry: number;                    // Precio de entrada
  quantity: number | string;        // Cantidad comprada/vendida
  positionSize: number;             // Tamaño de la posición en USD
  timestamp: number;                // Timestamp de cuando se ejecutó
  signal?: {                        // Información de la señal que generó la operación
    confidence: number;
    stopLoss?: number;
    takeProfit?: number;
    reasoning?: string;
    useTrailingStop?: boolean;
    trailingStopPercent?: number;
  };
  exitPrice?: number;               // Precio de salida (si completada)
  exitTimestamp?: number;           // Timestamp de salida
  pnl?: number;                     // Ganancia/pérdida en USD
  pnlPercent?: number;              // Ganancia/pérdida en porcentaje
  status: 'OPEN' | 'CLOSED' | 'CANCELLED'; // Estado de la operación
  orderIds: {                       // IDs de órdenes relacionadas
    entry?: string | number;
    exit?: string | number;
    trailingStop?: string | number;
  };
  notes?: string;                   // Notas adicionales
  strategyType: string;             // Tipo de estrategia utilizada
  executionType: 'MANUAL' | 'BOT';  // Tipo de ejecución
  tags?: string[];                  // Etiquetas para categorización
}

/**
 * Servicio para manejar la persistencia y análisis del historial de operaciones
 * Utiliza una base de datos PostgreSQL para el almacenamiento persistente
 */
export class TradeHistoryService {
  constructor() {
    logger.info('Trade history service initialized with PostgreSQL database');
  }
  
  /**
   * Registra una nueva operación de compra
   * @param buyOrder La orden de compra ejecutada
   * @param symbol El par de trading
   * @param signal La señal que generó la operación
   * @param strategyType Tipo de estrategia utilizada
   * @returns El ID de la operación registrada
   */
  async registerBuyOperation(
    buyOrder: any,
    symbol: string,
    signal: TradeSignal,
    strategyType: string = 'micro'
  ): Promise<string> {
    try {
      // Si no tiene un ID de operación correcta (p.ej. en modo de simulación)
      // o si hay algún error, generar un ID temporal
      const orderId = buyOrder?.orderId || `sim-${Date.now()}`;
      const price = Number(buyOrder?.price) || signal.entry || 0;
      const quantity = buyOrder?.executedQty || buyOrder?.quantity || '0';
      const positionSize = buyOrder?.cummulativeQuoteQty || 
                          (Number(quantity) * price) || 
                          signal.position_size || 0;
      
      // Crear la operación
      const trade: TradeOperation = {
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
          trailingStop: buyOrder?.trailingStopOrder?.orderId
        },
        strategyType,
        executionType: 'BOT'
      };
      
      // Guardar en la base de datos
      await tradeRepository.saveTrade(trade);
      
      logger.info({ 
        tradeId: trade.id,
        symbol,
        action: 'BUY',
        entry: price,
        positionSize
      }, 'New buy operation registered in database');
      
      return trade.id;
    } catch (error: any) {
      logger.error({ 
        error: error.message,
        symbol,
        orderId: buyOrder?.orderId
      }, 'Error registering buy operation');
      
      return '';
    }
  }
  
  /**
   * Registra una operación de venta y cierra la posición correspondiente
   * @param sellOrder La orden de venta ejecutada
   * @param symbol El par de trading
   * @returns True si se encontró y actualizó correctamente la operación
   */
  async registerSellOperation(
    sellOrder: any,
    symbol: string
  ): Promise<boolean> {
    try {
      // Encontrar la operación abierta más reciente para este par
      const openTrade = await tradeRepository.findOpenTradeBySymbol(symbol);
      
      if (!openTrade) {
        logger.warn({ 
          symbol,
          sellOrderId: sellOrder?.orderId
        }, 'No open trade found to register sell operation');
        
        return false;
      }
      
      // Calcular P&L
      const exitPrice = Number(sellOrder?.price) || 0;
      const pnl = (exitPrice - openTrade.entry) * Number(openTrade.quantity);
      const pnlPercent = ((exitPrice / openTrade.entry) - 1) * 100;
      
      // Actualizar la operación
      const updatedTrade: TradeOperation = {
        ...openTrade,
        exitPrice,
        exitTimestamp: Date.now(),
        pnl,
        pnlPercent,
        status: 'CLOSED',
        orderIds: {
          ...openTrade.orderIds,
          exit: sellOrder?.orderId || `sim-sell-${Date.now()}`
        }
      };
      
      // Guardar cambios en la base de datos
      await tradeRepository.saveTrade(updatedTrade);
      
      logger.info({ 
        tradeId: openTrade.id,
        symbol,
        action: 'SELL',
        entry: openTrade.entry,
        exit: exitPrice,
        pnl: pnl.toFixed(2),
        pnlPercent: pnlPercent.toFixed(2) + '%'
      }, 'Trade closed with sell operation');
      
      return true;
    } catch (error: any) {
      logger.error({ 
        error: error.message,
        symbol,
        sellOrderId: sellOrder?.orderId
      }, 'Error registering sell operation');
      
      return false;
    }
  }
  
  /**
   * Obtiene el historial de operaciones
   * @param filters Filtros opcionales
   * @returns Array de operaciones filtradas
   */
  async getTradeHistory(filters?: {
    symbol?: string;
    status?: 'OPEN' | 'CLOSED' | 'CANCELLED';
    strategyType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
  }): Promise<TradeOperation[]> {
    try {
      // Convertir los filtros al formato esperado por el repositorio
      const repoFilters = {
        symbol: filters?.symbol,
        status: filters?.status,
        strategyType: filters?.strategyType,
        dateFrom: filters?.dateFrom,
        dateTo: filters?.dateTo,
        limit: filters?.limit
      };
      
      // Obtener las operaciones de la base de datos
      return await tradeRepository.findTrades(repoFilters);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error getting trade history');
      return [];
    }
  }
  
  /**
   * Obtener estadísticas de rendimiento
   * @param symbol Filtrar por par específico (opcional)
   * @param days Número de días a analizar (por defecto: 30)
   * @returns Estadísticas de rendimiento
   */
  async getPerformanceStats(symbol?: string, days: number = 30): Promise<{
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    averagePnl: number;
    averagePnlPercent: number;
    totalPnl: number;
    bestTrade: number;
    worstTrade: number;
    openPositions: number;
  }> {
    try {
      // Usar el repositorio para obtener las estadísticas
      return await tradeRepository.getPerformanceStats(symbol, days);
    } catch (error: any) {
      logger.error({ error: error.message, symbol, days }, 'Error getting performance stats');
      
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
  }
  
  /**
   * Obtiene la operación abierta más reciente para un par
   * @param symbol Par de trading
   * @returns La operación abierta o undefined si no existe
   */
  async getOpenTrade(symbol: string): Promise<TradeOperation | null> {
    try {
      return await tradeRepository.findOpenTradeBySymbol(symbol);
    } catch (error: any) {
      logger.error({ error: error.message, symbol }, 'Error getting open trade');
      return null;
    }
  }
  
  /**
   * Agrega una nota a una operación
   * @param tradeId ID de la operación
   * @param note Nota a añadir
   * @returns true si se actualizó correctamente
   */
  async addNoteToTrade(tradeId: string, note: string): Promise<boolean> {
    try {
      return await tradeRepository.addNoteToTrade(tradeId, note);
    } catch (error: any) {
      logger.error({ error: error.message, tradeId }, 'Error adding note to trade');
      return false;
    }
  }
  
  /**
   * Añade etiquetas a una operación
   * @param tradeId ID de la operación
   * @param tags Etiquetas a añadir
   * @returns true si se actualizó correctamente
   */
  async addTagsToTrade(tradeId: string, tags: string[]): Promise<boolean> {
    try {
      return await tradeRepository.addTagsToTrade(tradeId, tags);
    } catch (error: any) {
      logger.error({ error: error.message, tradeId }, 'Error adding tags to trade');
      return false;
    }
  }
}

// Crear instancia singleton
export const tradeHistoryService = new TradeHistoryService();
