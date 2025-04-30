import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logging';
import { TradeSignal } from './deepseek';

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
 */
export class TradeHistoryService {
  private trades: TradeOperation[] = [];
  private storageFilePath: string;
  private isLoaded: boolean = false;
  
  constructor(storagePath?: string) {
    // Definir la ruta del archivo de almacenamiento
    this.storageFilePath = storagePath || path.join(process.cwd(), 'trade_history.json');
    
    // Intentar cargar historial existente
    this.loadTradeHistory();
    
    logger.info({ 
      storagePath: this.storageFilePath,
      tradesLoaded: this.trades.length
    }, 'Trade history service initialized');
  }
  
  /**
   * Carga el historial de operaciones desde el archivo
   */
  private loadTradeHistory(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const data = fs.readFileSync(this.storageFilePath, 'utf8');
        this.trades = JSON.parse(data);
        this.isLoaded = true;
        
        logger.info({ 
          tradesCount: this.trades.length 
        }, 'Trade history loaded from storage');
      } else {
        logger.info('No trade history file found, starting with empty history');
        this.trades = [];
        this.isLoaded = true;
      }
    } catch (error: any) {
      logger.error({ 
        error: error.message,
        path: this.storageFilePath
      }, 'Error loading trade history');
      
      // Inicializar con array vacío en caso de error
      this.trades = [];
      this.isLoaded = true;
    }
  }
  
  /**
   * Guarda el historial de operaciones en el archivo
   */
  private saveTradeHistory(): void {
    try {
      const dirPath = path.dirname(this.storageFilePath);
      
      // Asegurar que el directorio existe
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      fs.writeFileSync(
        this.storageFilePath, 
        JSON.stringify(this.trades, null, 2),
        'utf8'
      );
      
      logger.debug({
        tradesCount: this.trades.length
      }, 'Trade history saved to storage');
    } catch (error: any) {
      logger.error({ 
        error: error.message 
      }, 'Error saving trade history');
    }
  }
  
  /**
   * Registra una nueva operación de compra
   * @param buyOrder La orden de compra ejecutada
   * @param symbol El par de trading
   * @param signal La señal que generó la operación
   * @param strategyType Tipo de estrategia utilizada
   * @returns El ID de la operación registrada
   */
  registerBuyOperation(
    buyOrder: any,
    symbol: string,
    signal: TradeSignal,
    strategyType: string = 'micro'
  ): string {
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
      
      // Añadir al historial y guardar
      this.trades.push(trade);
      this.saveTradeHistory();
      
      logger.info({ 
        tradeId: trade.id,
        symbol,
        action: 'BUY',
        entry: price,
        positionSize
      }, 'New buy operation registered');
      
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
  registerSellOperation(
    sellOrder: any,
    symbol: string
  ): boolean {
    try {
      // Encontrar la operación abierta más reciente para este par
      const openTradeIndex = this.findOpenTradeIndex(symbol);
      
      if (openTradeIndex === -1) {
        logger.warn({ 
          symbol,
          sellOrderId: sellOrder?.orderId
        }, 'No open trade found to register sell operation');
        
        return false;
      }
      
      // Obtener la operación
      const trade = this.trades[openTradeIndex];
      
      // Calcular P&L
      const exitPrice = Number(sellOrder?.price) || 0;
      const pnl = (exitPrice - trade.entry) * Number(trade.quantity);
      const pnlPercent = ((exitPrice / trade.entry) - 1) * 100;
      
      // Actualizar la operación
      this.trades[openTradeIndex] = {
        ...trade,
        exitPrice,
        exitTimestamp: Date.now(),
        pnl,
        pnlPercent,
        status: 'CLOSED',
        orderIds: {
          ...trade.orderIds,
          exit: sellOrder?.orderId || `sim-sell-${Date.now()}`
        }
      };
      
      // Guardar cambios
      this.saveTradeHistory();
      
      logger.info({ 
        tradeId: trade.id,
        symbol,
        action: 'SELL',
        entry: trade.entry,
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
   * Busca el índice de la operación abierta más reciente para un par
   * @param symbol Par de trading
   * @returns Índice en el array o -1 si no se encuentra
   */
  private findOpenTradeIndex(symbol: string): number {
    // Buscar desde el final (más reciente) hacia atrás
    for (let i = this.trades.length - 1; i >= 0; i--) {
      if (this.trades[i].symbol === symbol && this.trades[i].status === 'OPEN') {
        return i;
      }
    }
    return -1;
  }
  
  /**
   * Obtiene el historial de operaciones
   * @param filters Filtros opcionales
   * @returns Array de operaciones filtradas
   */
  getTradeHistory(filters?: {
    symbol?: string;
    status?: 'OPEN' | 'CLOSED' | 'CANCELLED';
    strategyType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
  }): TradeOperation[] {
    // Asegurar que los datos están cargados
    if (!this.isLoaded) {
      this.loadTradeHistory();
    }
    
    // Si no hay filtros, devolver todo
    if (!filters) {
      return this.trades;
    }
    
    // Filtrar según los criterios
    let result = this.trades.filter(trade => {
      if (filters.symbol && trade.symbol !== filters.symbol) return false;
      if (filters.status && trade.status !== filters.status) return false;
      if (filters.strategyType && trade.strategyType !== filters.strategyType) return false;
      if (filters.dateFrom && trade.timestamp < filters.dateFrom.getTime()) return false;
      if (filters.dateTo && trade.timestamp > filters.dateTo.getTime()) return false;
      return true;
    });
    
    // Aplicar límite si está definido
    if (filters.limit && filters.limit > 0) {
      result = result.slice(-filters.limit);
    }
    
    return result;
  }
  
  /**
   * Obtener estadísticas de rendimiento
   * @param symbol Filtrar por par específico (opcional)
   * @param days Número de días a analizar (por defecto: 30)
   * @returns Estadísticas de rendimiento
   */
  getPerformanceStats(symbol?: string, days: number = 30): {
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
  } {
    // Calcular timestamp para el filtro de días
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    const fromTimestamp = fromDate.getTime();
    
    // Filtrar operaciones cerradas en el período especificado
    const filteredTrades = this.trades.filter(trade => {
      if (symbol && trade.symbol !== symbol) return false;
      if (trade.timestamp < fromTimestamp) return false;
      return true;
    });
    
    // Clasificar en abiertas y cerradas
    const closedTrades = filteredTrades.filter(t => t.status === 'CLOSED');
    const openTrades = filteredTrades.filter(t => t.status === 'OPEN');
    
    // Calcular estadísticas básicas
    const totalTrades = closedTrades.length;
    const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0).length;
    const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0).length;
    
    // Calcular métricas
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const averagePnl = totalTrades > 0 ? totalPnl / totalTrades : 0;
    const averagePnlPercent = totalTrades > 0 
      ? closedTrades.reduce((sum, t) => sum + (t.pnlPercent || 0), 0) / totalTrades 
      : 0;
    
    // Mejor y peor operación
    const pnls = closedTrades.map(t => t.pnl || 0);
    const bestTrade = pnls.length > 0 ? Math.max(...pnls) : 0;
    const worstTrade = pnls.length > 0 ? Math.min(...pnls) : 0;
    
    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      averagePnl,
      averagePnlPercent,
      totalPnl,
      bestTrade,
      worstTrade,
      openPositions: openTrades.length
    };
  }
  
  /**
   * Obtiene la operación abierta más reciente para un par
   * @param symbol Par de trading
   * @returns La operación abierta o undefined si no existe
   */
  getOpenTrade(symbol: string): TradeOperation | undefined {
    const index = this.findOpenTradeIndex(symbol);
    if (index === -1) return undefined;
    return this.trades[index];
  }
  
  /**
   * Agrega una nota a una operación
   * @param tradeId ID de la operación
   * @param note Nota a añadir
   * @returns true si se actualizó correctamente
   */
  addNoteToTrade(tradeId: string, note: string): boolean {
    try {
      const index = this.trades.findIndex(t => t.id === tradeId);
      if (index === -1) return false;
      
      this.trades[index].notes = note;
      this.saveTradeHistory();
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Añade etiquetas a una operación
   * @param tradeId ID de la operación
   * @param tags Etiquetas a añadir
   * @returns true si se actualizó correctamente
   */
  addTagsToTrade(tradeId: string, tags: string[]): boolean {
    try {
      const index = this.trades.findIndex(t => t.id === tradeId);
      if (index === -1) return false;
      
      if (!this.trades[index].tags) {
        this.trades[index].tags = [];
      }
      
      // Añadir etiquetas nuevas sin duplicar
      for (const tag of tags) {
        if (!this.trades[index].tags!.includes(tag)) {
          this.trades[index].tags!.push(tag);
        }
      }
      
      this.saveTradeHistory();
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Crear instancia singleton
export const tradeHistoryService = new TradeHistoryService();
