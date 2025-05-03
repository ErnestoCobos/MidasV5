/**
 * Mock del repositorio de trading para entornos sin base de datos
 * Este archivo proporciona implementaciones simuladas para cuando la base de datos
 * no está disponible o configurada correctamente.
 */
import { logger } from '../utils/logging';
import { TradeSignal } from '../services/deepseek';
import { TradeOperation } from '../services/trade-history';
import { TradeRepository } from './trade-repository';

// Almacenamiento en memoria para simular la base de datos
const mockTrades: TradeOperation[] = [
  {
    id: 'mock-trade-1',
    symbol: 'BTCUSDT',
    action: 'BUY',
    entry: 45000,
    quantity: 0.1,
    positionSize: 4500,
    timestamp: Date.now() - 3600000, // 1 hora atrás
    status: 'OPEN',
    orderIds: { entry: 'mock-order-1' },
    strategyType: 'micro',
    executionType: 'BOT',
    tags: ['mock', 'demo']
  },
  {
    id: 'mock-trade-2',
    symbol: 'ETHUSDT',
    action: 'BUY',
    entry: 3000,
    quantity: 0.5,
    positionSize: 1500,
    timestamp: Date.now() - 86400000, // 1 día atrás
    exitPrice: 3100,
    exitTimestamp: Date.now() - 43200000, // 12 horas atrás
    pnl: 50,
    pnlPercent: 3.33,
    status: 'CLOSED',
    orderIds: { entry: 'mock-order-2', exit: 'mock-order-3' },
    strategyType: 'micro',
    executionType: 'BOT',
    tags: ['mock', 'demo']
  }
];

/**
 * Repositorio mock para simular operaciones de trading
 */
export class MockTradeRepository implements TradeRepository {
  async createTables(): Promise<void> {
    logger.info('[MOCK] Creando tablas para operaciones (simulado)');
    return Promise.resolve();
  }
  
  async saveTrade(trade: TradeOperation): Promise<void> {
    // Buscar si ya existe para actualizar o añadir
    const existingIndex = mockTrades.findIndex(t => t.id === trade.id);
    
    if (existingIndex >= 0) {
      mockTrades[existingIndex] = { ...trade };
    } else {
      mockTrades.push({ ...trade });
    }
    
    logger.debug({ tradeId: trade.id }, '[MOCK] Operación guardada en memoria');
    return Promise.resolve();
  }
  
  async findTradeById(id: string): Promise<TradeOperation | null> {
    const trade = mockTrades.find(t => t.id === id);
    return trade ? { ...trade } : null;
  }
  
  async findOpenTradeBySymbol(symbol: string): Promise<TradeOperation | null> {
    const trade = mockTrades.find(t => t.symbol === symbol && t.status === 'OPEN');
    return trade ? { ...trade } : null;
  }
  
  async findTrades(filters: {
    symbol?: string;
    status?: 'OPEN' | 'CLOSED' | 'CANCELLED';
    strategyType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
  }): Promise<TradeOperation[]> {
    // Filtrar operaciones basadas en los criterios
    let filtered = [...mockTrades];
    
    if (filters.symbol) {
      filtered = filtered.filter(t => t.symbol === filters.symbol);
    }
    
    if (filters.status) {
      filtered = filtered.filter(t => t.status === filters.status);
    }
    
    if (filters.strategyType) {
      filtered = filtered.filter(t => t.strategyType === filters.strategyType);
    }
    
    if (filters.dateFrom && filters.dateFrom instanceof Date) {
      filtered = filtered.filter(t => t.timestamp >= filters.dateFrom!.getTime());
    }
    
    if (filters.dateTo && filters.dateTo instanceof Date) {
      filtered = filtered.filter(t => t.timestamp <= filters.dateTo!.getTime());
    }
    
    // Ordenar por timestamp descendente
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    
    // Aplicar límite si existe
    if (filters.limit && filters.limit > 0) {
      filtered = filtered.slice(0, filters.limit);
    }
    
    // Retornar copias para evitar modificaciones no deseadas
    return filtered.map(trade => ({ ...trade }));
  }
  
  async addNoteToTrade(tradeId: string, note: string): Promise<boolean> {
    const tradeIndex = mockTrades.findIndex(t => t.id === tradeId);
    
    if (tradeIndex === -1) {
      return false;
    }
    
    mockTrades[tradeIndex].notes = note;
    return true;
  }
  
  async addTagsToTrade(tradeId: string, tags: string[]): Promise<boolean> {
    const tradeIndex = mockTrades.findIndex(t => t.id === tradeId);
    
    if (tradeIndex === -1) {
      return false;
    }
    
    const existingTags = mockTrades[tradeIndex].tags || [];
    const uniqueTags = [...new Set([...existingTags, ...tags])];
    mockTrades[tradeIndex].tags = uniqueTags;
    
    return true;
  }
  
  async removeTagsFromTrade(tradeId: string, tags: string[]): Promise<boolean> {
    const tradeIndex = mockTrades.findIndex(t => t.id === tradeId);
    
    if (tradeIndex === -1) {
      return false;
    }
    
    const existingTags = mockTrades[tradeIndex].tags || [];
    mockTrades[tradeIndex].tags = existingTags.filter(tag => !tags.includes(tag));
    
    return true;
  }
  
  async getPerformanceStats(
    symbol?: string,
    days: number = 30
  ): Promise<{
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
    // Filtrar por días y símbolo
    const fromTimestamp = Date.now() - (days * 24 * 60 * 60 * 1000);
    let filtered = mockTrades.filter(t => t.timestamp >= fromTimestamp);
    
    if (symbol) {
      filtered = filtered.filter(t => t.symbol === symbol);
    }
    
    // Operaciones cerradas
    const closedTrades = filtered.filter(t => t.status === 'CLOSED');
    
    // Operaciones con ganancia/pérdida
    const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0);
    
    // Calcular valores
    const totalTrades = closedTrades.length;
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const pnlValues = closedTrades.map(t => t.pnl || 0);
    const pnlPercentValues = closedTrades.map(t => t.pnlPercent || 0);
    
    return {
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0,
      averagePnl: totalTrades > 0 ? totalPnl / totalTrades : 0,
      averagePnlPercent: totalTrades > 0 
        ? pnlPercentValues.reduce((sum, val) => sum + val, 0) / totalTrades 
        : 0,
      totalPnl,
      bestTrade: pnlValues.length > 0 ? Math.max(...pnlValues) : 0,
      worstTrade: pnlValues.length > 0 ? Math.min(...pnlValues) : 0,
      openPositions: filtered.filter(t => t.status === 'OPEN').length
    };
  }
}

// Exportar una instancia mock para uso en la aplicación
export const mockTradeRepository = new MockTradeRepository();
