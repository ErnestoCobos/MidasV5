import { deepSeekService, TradeSignal } from './deepseek';
import { marketScannerService, MarketOpportunity } from './market-scanner';
import { TechnicalIndicators } from '../utils/indicators';
import { binanceService } from './binance';
import { correlationService } from './correlation';
import { logger } from '../utils/logging';
import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

// Interfaz para representar un activo en el portafolio
export interface PortfolioAsset {
  symbol: string;          // Symbol del activo (ej: BTCUSDT)
  allocation: number;      // Cantidad asignada en USD
  percentage: number;      // Porcentaje del capital total
  entryPrice: number;      // Precio de entrada
  currentPrice: number;    // Precio actual
  performance: number;     // Rendimiento como porcentaje
  potentialReturn: number; // Retorno estimado futuro
  galaxyScore: number;     // Sentimiento social
  volatility: number;      // Volatilidad como porcentaje
  momentum: number;        // Indicador de momentum
  lastUpdated: number;     // Timestamp de última actualización
}

// Interfaz para el portafolio completo
export interface Portfolio {
  totalCapital: number;          // Capital total en USD
  assets: PortfolioAsset[];      // Lista de activos
  cashReserve: number;           // Efectivo disponible
  lastScanned: number;           // Timestamp del último scan
  totalPerformance: number;      // Rendimiento total como porcentaje
  createdAt: number;             // Timestamp de creación
  lastUpdatedAt: number;         // Timestamp de última actualización
  rotations: PortfolioRotation[]; // Historial de rotaciones
}

// Interfaz para rotaciones de portafolio
export interface PortfolioRotation {
  timestamp: number;          // Cuándo ocurrió
  exitedAsset?: PortfolioAsset; // Activo que salió (opcional)
  enteredAsset: PortfolioAsset; // Nuevo activo que entró
  reason: string;             // Razón para la rotación
  deepSeekConfidence: number; // Nivel de confianza de DeepSeek
}

// Opciones para el gestor de portafolio
export interface PortfolioManagerOptions {
  dataDir?: string;             // Directorio para almacenar datos
  scanIntervalMinutes?: number; // Intervalo entre escaneos de mercado
  rotationThreshold?: number;   // Umbral para decidir rotación (0.0-1.0)
  forceDiversification?: boolean; // Forzar diversificación
  cashReservePercent?: number;  // Porcentaje de efectivo a mantener
  maxPositions?: number;        // Número máximo de posiciones
  saveToFile?: boolean;         // Guardar estado en archivo
}

// Eventos emitidos por el gestor de portafolio
export enum PortfolioEvents {
  INITIALIZED = 'portfolio:initialized',
  UPDATED = 'portfolio:updated',
  OPPORTUNITY_FOUND = 'portfolio:opportunity_found',
  ROTATION_EXECUTED = 'portfolio:rotation_executed',
  SCAN_COMPLETED = 'portfolio:scan_completed',
  ERROR = 'portfolio:error'
}

/**
 * Gestor de portafolio que utiliza DeepSeek para tomar decisiones
 * de rotación y optimización continua
 */
export class PortfolioManager extends EventEmitter {
  private portfolio: Portfolio;
  private running: boolean = false;
  private scanTimer: NodeJS.Timeout | null = null;
  private options: Required<PortfolioManagerOptions>;
  private dataFile: string;
  private readonly defaultOptions: Required<PortfolioManagerOptions> = {
    dataDir: path.join(process.cwd(), 'data'),
    scanIntervalMinutes: 15,
    rotationThreshold: 0.85,
    forceDiversification: true,
    cashReservePercent: 15,
    maxPositions: 2,
    saveToFile: true
  };

  constructor(initialCapital: number, options: PortfolioManagerOptions = {}) {
    super();
    
    // Combinar opciones con valores predeterminados
    this.options = { ...this.defaultOptions, ...options };
    
    // Inicializar portafolio vacío
    this.portfolio = {
      totalCapital: initialCapital,
      assets: [],
      cashReserve: initialCapital,
      lastScanned: 0,
      totalPerformance: 0,
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
      rotations: []
    };
    
    // Definir ruta al archivo de datos
    this.dataFile = path.join(
      this.options.dataDir,
      `portfolio-${initialCapital}-${Date.now()}.json`
    );
    
    logger.info({
      totalCapital: initialCapital,
      options: this.options
    }, 'Portfolio manager initialized');
  }
  
  /**
   * Inicia el gestor de portafolio
   * - Carga estado previo si existe
   * - Inicia el ciclo de monitoreo
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Portfolio manager already running');
      return;
    }
    
    try {
      // Crear directorio de datos si no existe
      if (this.options.saveToFile) {
        await fs.mkdir(this.options.dataDir, { recursive: true });
      }
      
      // Intentar cargar portafolio existente
      await this.loadPortfolio();
      
      // Si el portafolio está vacío, hacer escaneo inicial
      if (this.portfolio.assets.length === 0) {
        await this.initialScan();
      }
      
      // Iniciar ciclo de monitoreo
      this.startMonitoring();
      
      // Emitir evento de inicialización
      this.emit(PortfolioEvents.INITIALIZED, this.getPortfolioSnapshot());
      
      logger.info({
        assets: this.portfolio.assets.length,
        cashReserve: this.portfolio.cashReserve
      }, 'Portfolio manager started');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error starting portfolio manager');
      this.emit(PortfolioEvents.ERROR, error);
      throw error;
    }
  }
  
  /**
   * Detiene el gestor de portafolio
   */
  stop(): void {
    if (!this.running) {
      return;
    }
    
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    
    this.running = false;
    logger.info('Portfolio manager stopped');
  }
  
  /**
   * Devuelve una instantánea del portafolio actual
   */
  getPortfolioSnapshot(): Portfolio {
    return JSON.parse(JSON.stringify(this.portfolio));
  }
  
  /**
   * Escaneo inicial para llenar el portafolio
   * con las mejores oportunidades disponibles
   */
  async initialScan(): Promise<void> {
    logger.info('Performing initial portfolio scan');
    
    try {
      // Reservar efectivo según configuración
      const reserveAmount = this.portfolio.totalCapital * (this.options.cashReservePercent / 100);
      const investableAmount = this.portfolio.totalCapital - reserveAmount;
      
      // Si se habilita diversificación, usar el servicio dedicado
      if (this.options.forceDiversification) {
        const allocations = await marketScannerService.getDiversifiedPortfolio(
          investableAmount,
          this.options.maxPositions
        );
        
        // Convertir asignaciones a activos de portafolio
        for (const allocation of allocations) {
          // Obtener precio actual y datos de mercado mejorados
          const ticker = await binanceService.getTicker24H(allocation.symbol);
          const price = parseFloat(ticker.lastPrice);
          const asset = allocation.symbol.replace('USDT', '');
          const galaxyScore = await this.getGalaxyScore(asset);
          
          // Crear activo de portafolio
          this.portfolio.assets.push({
            symbol: allocation.symbol,
            allocation: allocation.allocation,
            percentage: (allocation.allocation / this.portfolio.totalCapital) * 100,
            entryPrice: price,
            currentPrice: price,
            performance: 0,
            potentialReturn: 3.0, // Valor estimado por defecto
            galaxyScore,
            volatility: 0, // Se actualizará más tarde
            momentum: 0,   // Se actualizará más tarde
            lastUpdated: Date.now()
          });
          
          // Actualizar efectivo reservado
          this.portfolio.cashReserve -= allocation.allocation;
        }
      } else {
        // Sin diversificación, elegir la mejor oportunidad
        const opportunities = await marketScannerService.scanMarket(
          true, // enfoque en crecimiento
          investableAmount,
          1  // solo la mejor oportunidad
        );
        
        if (opportunities.length > 0) {
          const opportunity = opportunities[0];
          
          this.portfolio.assets.push({
            symbol: opportunity.symbol,
            allocation: investableAmount,
            percentage: (investableAmount / this.portfolio.totalCapital) * 100,
            entryPrice: opportunity.price,
            currentPrice: opportunity.price,
            performance: 0,
            potentialReturn: opportunity.potentialReturn || 3.0,
            galaxyScore: opportunity.galaxyScore,
            volatility: opportunity.volatility || 0,
            momentum: 0, // Se actualizará después
            lastUpdated: Date.now()
          });
          
          this.portfolio.cashReserve = reserveAmount;
        }
      }
      
      // Actualizar timestamp de último escaneo
      this.portfolio.lastScanned = Date.now();
      this.portfolio.lastUpdatedAt = Date.now();
      
      // Guardar portafolio actualizado
      await this.savePortfolio();
      
      // Emitir evento de actualización
      this.emit(PortfolioEvents.UPDATED, this.getPortfolioSnapshot());
      
      logger.info({
        assetsCount: this.portfolio.assets.length,
        cashReserve: this.portfolio.cashReserve
      }, 'Initial portfolio created');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error during initial scan');
      this.emit(PortfolioEvents.ERROR, error);
    }
  }
  
  /**
   * Inicia el ciclo de monitoreo para actualizar
   * el portafolio y detectar nuevas oportunidades
   */
  private startMonitoring(): void {
    if (this.running) {
      return;
    }
    
    this.running = true;
    
    // Configurar temporizador para escaneos periódicos
    const intervalMs = this.options.scanIntervalMinutes * 60 * 1000;
    this.scanTimer = setInterval(() => this.performScan(), intervalMs);
    
    logger.info({
      intervalMinutes: this.options.scanIntervalMinutes
    }, 'Portfolio monitoring started');
  }
  
  /**
   * Realiza un escaneo completo del mercado y evalúa
   * si es necesario realizar rotaciones en el portafolio
   */
  async performScan(): Promise<void> {
    if (!this.running) {
      return;
    }
    
    logger.info('Performing portfolio scan and evaluation');
    
    try {
      // 1. Actualizar precios y métricas de activos actuales
      await this.updatePortfolioMetrics();
      
      // 2. Escanear mercado para nuevas oportunidades
      const investableAmount = this.portfolio.cashReserve;
      const opportunities = await marketScannerService.scanMarket(
        true, // enfoque en crecimiento
        investableAmount > 5 ? investableAmount : this.portfolio.totalCapital,
        5    // top 5 oportunidades
      );
      
      // 3. Si no hay oportunidades, finalizar aquí
      if (opportunities.length === 0) {
        logger.info('No new opportunities found');
        this.emit(PortfolioEvents.SCAN_COMPLETED, { opportunities: [] });
        return;
      }
      
      // 4. Evaluar si hay oportunidades que merezcan rotación
      const rotationCandidate = await this.evaluateRotationOpportunities(opportunities);
      
      if (rotationCandidate) {
        // Hay una oportunidad que merece rotación
        this.emit(PortfolioEvents.OPPORTUNITY_FOUND, rotationCandidate);
        
        // Ejecutar rotación
        await this.executeRotation(rotationCandidate);
        
        // Guardar estado actualizado
        await this.savePortfolio();
      }
      
      // 5. Actualizar timestamp de último escaneo
      this.portfolio.lastScanned = Date.now();
      this.portfolio.lastUpdatedAt = Date.now();
      
      // 6. Guardar portafolio y emitir evento
      await this.savePortfolio();
      this.emit(PortfolioEvents.SCAN_COMPLETED, { 
        opportunities,
        rotationExecuted: !!rotationCandidate
      });
      
      logger.info({
        opportunitiesCount: opportunities.length,
        rotationExecuted: !!rotationCandidate
      }, 'Portfolio scan completed');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error during portfolio scan');
      this.emit(PortfolioEvents.ERROR, error);
    }
  }
  
  /**
   * Actualiza métricas de todos los activos en el portafolio
   */
  private async updatePortfolioMetrics(): Promise<void> {
    if (this.portfolio.assets.length === 0) {
      return;
    }
    
    let totalPerformance = 0;
    let totalValue = this.portfolio.cashReserve;
    
    // Actualizar métricas para cada activo
    for (const asset of this.portfolio.assets) {
      try {
        // Obtener precio actual
        const ticker = await binanceService.getTicker24H(asset.symbol);
        const currentPrice = parseFloat(ticker.lastPrice);
        
        // Calcular rendimiento
        const performance = (currentPrice / asset.entryPrice - 1) * 100;
        
        // Obtener datos de mercado mejorados
        const md = await this.getEnhancedMarketData(asset.symbol);
        
        // Obtener candles para calcular indicadores
        const candles = await binanceService.getHistoricalCandles(asset.symbol, '15m', 96);
        
        // Actualizar métricas
        asset.currentPrice = currentPrice;
        asset.performance = performance;
        asset.galaxyScore = md.sentiment || asset.galaxyScore;
        asset.potentialReturn = md.technicals?.bband_percent 
          ? this.estimatePotentialReturn(md)
          : asset.potentialReturn;
        
        // Calcular volatilidad y momentum
        if (candles.length > 0) {
          asset.volatility = TechnicalIndicators.calculateATR(candles);
          asset.momentum = TechnicalIndicators.calculateMomentumScore(candles);
        }
        
        // Actualizar timestamp
        asset.lastUpdated = Date.now();
        
        // Acumular valor y rendimiento
        const currentValue = asset.allocation * (1 + performance / 100);
        totalValue += currentValue;
        totalPerformance += performance * (asset.allocation / this.portfolio.totalCapital);
      } catch (error) {
        logger.error({ 
          symbol: asset.symbol, 
          error: error instanceof Error ? error.message : String(error)
        }, 'Error updating asset metrics');
      }
    }
    
    // Actualizar rendimiento total del portafolio
    this.portfolio.totalPerformance = totalPerformance;
    
    logger.debug({
      assetsUpdated: this.portfolio.assets.length,
      totalPerformance: this.portfolio.totalPerformance.toFixed(2) + '%'
    }, 'Portfolio metrics updated');
  }
  
  /**
   * Evalúa si hay oportunidades que merezcan una rotación
   * en el portafolio usando DeepSeek para la decisión
   */
  private async evaluateRotationOpportunities(
    opportunities: MarketOpportunity[]
  ): Promise<{opportunity: MarketOpportunity, exitAsset?: PortfolioAsset, confidence: number, reason: string} | null> {
    if (opportunities.length === 0) {
      return null;
    }
    
    logger.info({
      assetsCount: this.portfolio.assets.length,
      opportunitiesCount: opportunities.length
    }, 'Evaluating rotation opportunities');
    
    try {
      // Estrategia 1: Si hay efectivo suficiente para una nueva posición,
      // comprar la mejor oportunidad sin necesidad de salir de otra posición
      if (this.portfolio.assets.length < this.options.maxPositions) {
        const opportunity = opportunities[0];
        
        // Comprobar si hay suficiente efectivo (mínimo $5)
        if (this.portfolio.cashReserve >= 5) {
          const positionSize = Math.min(
            this.portfolio.cashReserve, 
            this.portfolio.totalCapital * 0.4
          );
          
          // Si la puntuación es alta, simplemente añadir
          if (opportunity.score > 0.7) {
            return {
              opportunity,
              confidence: opportunity.score,
              reason: 'Nueva posición con alta puntuación y efectivo disponible'
            };
          }
          
          // De lo contrario, consultar DeepSeek para decisión
          const enhancedData = await this.getEnhancedMarketData(opportunity.symbol);
          
          const tradeSignal = await deepSeekService.decide(
            enhancedData,
            positionSize,
            'growth'
          );
          
          if (tradeSignal.action === 'BUY' && tradeSignal.confidence >= this.options.rotationThreshold) {
            return {
              opportunity,
              confidence: tradeSignal.confidence,
              reason: tradeSignal.reasoning || 'DeepSeek recomienda nueva posición'
            };
          }
        }
      }
      
      // Estrategia 2: Evaluar reemplazo de activo con peor rendimiento
      // Solo si hay activos en el portafolio
      if (this.portfolio.assets.length > 0) {
        // Encontrar el activo con peor desempeño o potencial
        const sortedAssets = [...this.portfolio.assets].sort((a, b) => {
          // Combinar rendimiento actual y potencial futuro
          const aScore = a.performance * 0.3 + a.potentialReturn * 0.7;
          const bScore = b.performance * 0.3 + b.potentialReturn * 0.7;
          return aScore - bScore; // Ascendente para encontrar el peor primero
        });
        
        const worstAsset = sortedAssets[0];
        const bestOpportunity = opportunities[0];
        
        // Verificar si la mejor oportunidad es significativamente mejor
        const improvementFactor = bestOpportunity.score / (worstAsset.potentialReturn / 10);
        
        // Si la mejora es notable, consultar DeepSeek para la decisión final
        if (improvementFactor > 1.5) {
          // Preparar datos para DeepSeek
          const portfolioData = {
            totalCapital: this.portfolio.totalCapital,
            currentAssets: this.portfolio.assets.map(a => ({
              symbol: a.symbol,
              allocation: a.allocation,
              performance: a.performance,
              potentialReturn: a.potentialReturn,
              galaxyScore: a.galaxyScore
            })),
            newOpportunity: {
              symbol: bestOpportunity.symbol,
              score: bestOpportunity.score,
              price: bestOpportunity.price,
              galaxyScore: bestOpportunity.galaxyScore,
              potentialReturn: bestOpportunity.potentialReturn
            }
          };
          
          // Solicitar a DeepSeek evaluación de rotación
          const rotationDecision = await this.requestPortfolioRotationDecision(
            worstAsset,
            bestOpportunity
          );
          
          if (rotationDecision.shouldRotate && 
              rotationDecision.confidence >= this.options.rotationThreshold) {
            return {
              opportunity: bestOpportunity,
              exitAsset: worstAsset,
              confidence: rotationDecision.confidence,
              reason: rotationDecision.reasoning
            };
          }
        }
      }
      
      // No se encontró ninguna oportunidad que merezca rotación
      return null;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error evaluating rotation opportunities');
      return null;
    }
  }
  
  /**
   * Ejecuta una rotación de portafolio
   */
  private async executeRotation(
    candidate: {opportunity: MarketOpportunity, exitAsset?: PortfolioAsset, confidence: number, reason: string}
  ): Promise<void> {
    const { opportunity, exitAsset, confidence, reason } = candidate;
    
    try {
      logger.info({
        newSymbol: opportunity.symbol,
        exitSymbol: exitAsset?.symbol,
        confidence
      }, 'Executing portfolio rotation');
      
      // Determinar cantidad a invertir
      let investAmount = 0;
      
      if (exitAsset) {
        // Si estamos reemplazando un activo, usar su asignación
        investAmount = exitAsset.allocation;
        
        // Eliminar el activo del portafolio
        this.portfolio.assets = this.portfolio.assets.filter(
          asset => asset.symbol !== exitAsset.symbol
        );
        
        // Temporalmente añadir el monto al efectivo disponible
        this.portfolio.cashReserve += investAmount;
      } else {
        // Si es una nueva posición, usar efectivo disponible
        investAmount = Math.min(
          this.portfolio.cashReserve,
          this.portfolio.totalCapital * 0.4
        );
      }
      
      // Crear nuevo activo para el portafolio
      const newAsset: PortfolioAsset = {
        symbol: opportunity.symbol,
        allocation: investAmount,
        percentage: (investAmount / this.portfolio.totalCapital) * 100,
        entryPrice: opportunity.price,
        currentPrice: opportunity.price,
        performance: 0,
        potentialReturn: opportunity.potentialReturn || 3.0,
        galaxyScore: opportunity.galaxyScore,
        volatility: opportunity.volatility || 0,
        momentum: 0, // Se actualizará con la siguiente actualización
        lastUpdated: Date.now()
      };
      
      // Añadir el nuevo activo al portafolio
      this.portfolio.assets.push(newAsset);
      
      // Reducir el efectivo disponible
      this.portfolio.cashReserve -= investAmount;
      
      // Añadir al historial de rotaciones
      this.portfolio.rotations.push({
        timestamp: Date.now(),
        exitedAsset: exitAsset,
        enteredAsset: newAsset,
        reason,
        deepSeekConfidence: confidence
      });
      
      // Actualizar timestamp
      this.portfolio.lastUpdatedAt = Date.now();
      
      // Guardar portafolio actualizado
      await this.savePortfolio();
      
      // Emitir evento de rotación
      this.emit(PortfolioEvents.ROTATION_EXECUTED, {
        exitAsset,
        enteredAsset: newAsset,
        reason,
        confidence
      });
      
      logger.info({
        symbol: opportunity.symbol,
        allocation: investAmount,
        oldSymbol: exitAsset?.symbol
      }, 'Portfolio rotation completed');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error executing portfolio rotation');
      this.emit(PortfolioEvents.ERROR, error);
    }
  }
  
  /**
   * Solicita a DeepSeek una decisión sobre rotación de portafolio
   */
  private async requestPortfolioRotationDecision(
    currentAsset: PortfolioAsset,
    newOpportunity: MarketOpportunity
  ): Promise<{
    shouldRotate: boolean;
    confidence: number;
    reasoning: string;
  }> {
    try {
      // Obtener datos mejorados para ambos activos
      const currentData = await this.getEnhancedMarketData(currentAsset.symbol);
      const newData = await this.getEnhancedMarketData(newOpportunity.symbol);
      
      // Construir prompt especializado para decisión de rotación
      const prompt = `
Eres un experto en rotación de capital para maximizar crecimiento en carteras de cripto.

CONTEXTO:
- Capital total: $${this.portfolio.totalCapital.toFixed(2)} USD
- Tipo de cartera: Crecimiento acelerado

ACTIVO ACTUAL EN CARTERA:
- Símbolo: ${currentAsset.symbol}
- Precio: ${currentAsset.currentPrice}
- Asignación: $${currentAsset.allocation.toFixed(2)} (${currentAsset.percentage.toFixed(1)}% del capital)
- Rendimiento actual: ${currentAsset.performance.toFixed(2)}%
- Galaxy Score: ${currentAsset.galaxyScore}/100
- Potencial de retorno estimado: ${currentAsset.potentialReturn.toFixed(2)}%
- Volatilidad: ${currentAsset.volatility.toFixed(2)}%
- Momentum: ${currentAsset.momentum.toFixed(2)}/100
- RSI: ${currentData.technicals?.rsi || 'N/A'}
- Tendencia EMA: ${currentData.technicals?.ema_cross || 'N/A'}
- Posición en Bollinger Bands: ${currentData.technicals?.bband_percent?.toFixed(2) || 'N/A'}

NUEVA OPORTUNIDAD DETECTADA:
- Símbolo: ${newOpportunity.symbol}
- Precio: ${newOpportunity.price}
- Galaxy Score: ${newOpportunity.galaxyScore}/100
- Potencial de retorno estimado: ${newOpportunity.potentialReturn?.toFixed(2) || 'N/A'}%
- Score algorítmico: ${newOpportunity.score.toFixed(2)}
- RSI: ${newData.technicals?.rsi || 'N/A'}
- Tendencia EMA: ${newData.technicals?.ema_cross || 'N/A'}
- Posición en Bollinger Bands: ${newData.technicals?.bband_percent?.toFixed(2) || 'N/A'}

INSTRUCCIONES:
1. Analiza si vale la pena rotar el capital desde el activo actual hacia la nueva oportunidad
2. Considera rendimiento pasado, potencial futuro, momentum y situación técnica
3. Para decisiones de crecimiento acelerado, prioriza potencial futuro y momentum

Responde con un objeto JSON con los siguientes campos:
- shouldRotate: true/false (si recomiendas hacer la rotación)
- confidence: número entre 0.0 y 1.0 que refleja tu confianza en la decisión
- reasoning: explicación breve de tu decisión

TIP: Si la nueva oportunidad parece tener significativamente mejor potencial y configuración técnica, sería recomendable rotar.`;
      
      // Solicitar decisión a DeepSeek
      const result = await deepSeekService.decide(
        {
          price: newOpportunity.price,
          volume24h: 0, // No relevante para esta decisión
          sentiment: newOpportunity.galaxyScore,
          technicals: newData.technicals
        },
        currentAsset.allocation,
        'growth'
      );
      
      // Interpretar la señal de DeepSeek como decisión de rotación
      const shouldRotate = result.action === 'BUY' && result.confidence >= this.options.rotationThreshold;
      
      return {
        shouldRotate,
        confidence: result.confidence,
        reasoning: result.reasoning || 'DeepSeek recomienda rotación basado en análisis técnico y potencial de crecimiento'
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error requesting portfolio rotation decision');
      return {
        shouldRotate: false,
        confidence: 0,
        reasoning: 'Error al solicitar decisión'
      };
    }
  }
  
  /**
   * Guarda el estado actual del portafolio en archivo
   */
  private async savePortfolio(): Promise<void> {
    if (!this.options.saveToFile) {
      return;
    }
    
    try {
      await fs.writeFile(
        this.dataFile,
        JSON.stringify(this.portfolio, null, 2),
        'utf-8'
      );
      
      logger.debug({ path: this.dataFile }, 'Portfolio saved to file');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error saving portfolio');
    }
  }
  
  /**
   * Carga el estado del portafolio desde archivo
   */
  private async loadPortfolio(): Promise<void> {
    if (!this.options.saveToFile) {
      return;
    }
    
    try {
      // Verificar si el archivo existe
      try {
        await fs.access(this.dataFile);
      } catch {
        logger.info({ path: this.dataFile }, 'Portfolio file not found, using default');
        return;
      }
      
      // Leer el archivo
      const data = await fs.readFile(this.dataFile, 'utf-8');
      const loadedPortfolio = JSON.parse(data);
      
      // Validar y aplicar datos cargados
      if (loadedPortfolio && 
          typeof loadedPortfolio === 'object' && 
          Array.isArray(loadedPortfolio.assets)) {
        // Restablecer solo campos seguros
        this.portfolio = {
          ...this.portfolio, // Mantener valores predeterminados
          ...loadedPortfolio, // Sobrescribir con valores cargados
          lastUpdatedAt: Date.now() // Actualizar timestamp
        };
        
        logger.info({ 
          assets: this.portfolio.assets.length,
          rotations: this.portfolio.rotations.length
        }, 'Portfolio loaded from file');
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error loading portfolio');
    }
  }
  
  /**
   * Obtener Galaxy Score para un activo
   * @param asset Símbolo del activo (sin USDT)
   */
  private async getGalaxyScore(asset: string): Promise<number> {
    try {
      // Intentar obtener de LunarCrush directamente
      const score = await lunarCrushService.galaxyScore(asset);
      return score || 50; // 50 como valor neutral por defecto
    } catch (error) {
      logger.error({ asset, error }, 'Error getting galaxy score');
      return 50; // Valor neutral por defecto
    }
  }
  
  /**
   * Obtener datos de mercado mejorados
   * @param symbol Símbolo completo (con USDT)
   */
  private async getEnhancedMarketData(symbol: string): Promise<{
    price: number;
    volume24h: number;
    sentiment: number;
    technicals?: any;
  }> {
    try {
      // Intentar obtener datos mejorados del servicio de datos de mercado
      const md = await marketDataService.getEnhancedMarketData(symbol);
      
      // Obtener sentimiento si no está presente
      if (!md.sentiment) {
        const asset = symbol.replace('USDT', '');
        md.sentiment = await this.getGalaxyScore(asset);
      }
      
      return md;
    } catch (error) {
      logger.error({ symbol, error }, 'Error getting enhanced market data');
      
      // Datos básicos de fallback
      const ticker = await binanceService.getTicker24H(symbol);
      return {
        price: parseFloat(ticker.lastPrice),
        volume24h: parseFloat(ticker.volume),
        sentiment: 50
      };
    }
  }
  
  /**
   * Estima el retorno potencial basado en indicadores técnicos
   * @param md Datos de mercado
   */
  private estimatePotentialReturn(md: any): number {
    const tech = md.technicals || {};
    const price = md.price;
    
    // Si hay resistencias, calcular distancia a la más cercana
    if (tech.resistances && tech.resistances.length > 0) {
      const nearestResistance = tech.resistances[0]; // Ya ordenado más cercano primero
      return (nearestResistance / price - 1) * 100; // Como porcentaje
    }
    
    // Si tenemos BBands, usar como proxy
    if (typeof tech.bband_percent === 'number') {
      // Estimar basado en la posición en BBands
      // Cuanto más bajo en la banda, mayor potencial teórico de subida
      const potentialMultiplier = 4.0; // Factor de escala
      return potentialMultiplier * (1 - tech.bband_percent) * 100;
    }
    
    // Valor conservador por defecto (2%)
    return 2.0;
  }
  
  /**
   * Fuerza una rotación manual del portafolio
   * @param symbol Símbolo al que rotar (debe ser detectado previamente)
   * @param amount Cantidad a asignar (opcional, por defecto usa la asignación disponible)
   * @param exitSymbol Símbolo a salir (opcional, si no se especifica usa la peor posición)
   */
  async forceRotation(symbol: string, amount?: number, exitSymbol?: string): Promise<boolean> {
    try {
      // Verificar que el símbolo existe
      const ticker = await binanceService.getTicker24H(symbol);
      const price = parseFloat(ticker.lastPrice);
      
      // Determinar activo a salir si se especifica
      let exitAsset: PortfolioAsset | undefined;
      
      if (exitSymbol) {
        exitAsset = this.portfolio.assets.find(a => a.symbol === exitSymbol);
        if (!exitAsset) {
          logger.error({ symbol: exitSymbol }, 'Exit asset not found in portfolio');
          return false;
        }
      } else if (this.portfolio.assets.length >= this.options.maxPositions) {
        // Si no se especifica pero el portfolio está lleno, usar el peor activo
        const sortedAssets = [...this.portfolio.assets].sort((a, b) => {
          // Combinar rendimiento y potencial
          const aScore = a.performance * 0.4 + a.potentialReturn * 0.6;
          const bScore = b.performance * 0.4 + b.potentialReturn * 0.6;
          return aScore - bScore; // Ascendente para encontrar el peor primero
        });
        
        exitAsset = sortedAssets[0];
      }
      
      // Determinar cantidad a invertir
      let investAmount = 0;
      
      if (amount) {
        investAmount = amount;
      } else if (exitAsset) {
        investAmount = exitAsset.allocation;
      } else {
        investAmount = Math.min(
          this.portfolio.cashReserve,
          this.portfolio.totalCapital * 0.4
        );
      }
      
      // Verificar que hay suficiente capital
      if (!exitAsset && investAmount > this.portfolio.cashReserve) {
        logger.error({ 
          requested: investAmount, 
          available: this.portfolio.cashReserve 
        }, 'Insufficient cash reserve for rotation');
        return false;
      }
      
      // Crear una oportunidad de mercado simulada
      const opportunity: MarketOpportunity = {
        symbol,
        score: 0.75, // Valor predeterminado alto
        price,
        galaxyScore: 60, // Valor neutral hasta obtener dato real
        rsi: 50, // Valores neutrales
        trend: 'neutral',
        potentialReturn: 3.0 // Valor predeterminado
      };
      
      // Obtener Galaxy Score y datos mejorados si es posible
      try {
        const asset = symbol.replace('USDT', '');
        opportunity.galaxyScore = await this.getGalaxyScore(asset);
        
        const md = await this.getEnhancedMarketData(symbol);
        if (md.technicals) {
          opportunity.rsi = md.technicals.rsi;
          opportunity.trend = md.technicals.ema_cross;
          opportunity.potentialReturn = this.estimatePotentialReturn(md);
        }
      } catch (error) {
        // Ignorar errores, usar valores predeterminados
        logger.debug({ symbol, error }, 'Error getting enhanced data for forced rotation');
      }
      
      // Ejecutar la rotación
      await this.executeRotation({
        opportunity,
        exitAsset,
        confidence: 0.9, // Alta confianza por ser manual
        reason: 'Rotación manual forzada por el usuario'
      });
      
      return true;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error forcing rotation');
      return false;
    }
  }
}

// Importaciones faltantes que deben ir al principio del archivo
import { marketDataService } from './market-data';
import { lunarCrushService } from './lunarcrush';
