#!/usr/bin/env node
/// <reference types="node" />
// midasTS - Bot para trading de criptomonedas
// -----------------------------------------------------------------------------
// LunarCrush x DeepSeek Reasoner x Binance
// Versión actualizada con mejoras de robustez y modularidad
// -----------------------------------------------------------------------------

import { Command } from 'commander';
import { initializeSystem } from './utils/init';
import { logger, tradeLogger } from './utils/logging';
import { env, isDryRun } from './utils/env';
import { lunarCrushService } from './services/lunarcrush';
import { deepSeekService } from './services/deepseek';
import { binanceService } from './services/binance';
import { marketDataService } from './services/market-data';
import { microCapitalStrategy, microGrowthStrategy, MicroCapitalStrategy } from './strategies/micro-capital';
import { tradeHistoryService } from './services/trade-history';
import { db } from './services/database';
import PQueue from 'p-queue';

// -----------------------------------------------------------------------------
// Estrategia Factory 
// -----------------------------------------------------------------------------
class StrategyFactory {
  static createStrategy(
    type: string,
    capital: number,
    config?: {
      ignoreMarketConditions?: boolean;
      minConfidence?: number;
      allowBearishOperations?: boolean;
    }
  ) {
    // Si el tipo es 'auto', seleccionar estrategia basada en tamaño de capital
    if (type === 'auto') {
      if (capital < 100) {
        type = 'micro';
      } else if (capital < 10000) {
        type = 'medium';
      } else {
        type = 'large';
      }
      logger.info({ 
        strategy: type, 
        capital: `$${capital}` 
      }, 'Estrategia auto-seleccionada');
    }
    
    // Crear la estrategia específica
    switch (type) {
      case 'micro':
        // Si hay configuración personalizada, crear nueva instancia con esta configuración
        if (config) {
          return new MicroCapitalStrategy(config);
        }
        // De lo contrario, usar la instancia global
        return microCapitalStrategy;
      case 'growth':
        // Para estrategia de crecimiento
        if (config) {
          return new MicroCapitalStrategy(config, MicroCapitalStrategy.MODE_GROWTH);
        }
        // Usar instancia global de growth
        return microGrowthStrategy;
      // Podrías añadir más estrategias según sea necesario
      default:
        // Fallback a estrategia micro para iniciar
        logger.warn({ requestedStrategy: type }, 'Estrategia solicitada no disponible, usando micro');
        return config ? new MicroCapitalStrategy(config) : microCapitalStrategy;
    }
  }
}

// -----------------------------------------------------------------------------
// Funciones principales del Bot
// -----------------------------------------------------------------------------

/**
 * Ejecuta el bot de trading estándar
 */
async function runBot(opts: { 
  symbol: string; 
  quote: number; 
  interval: number; 
  dryRun: boolean 
}) {
  logger.info({
    symbol: opts.symbol,
    quote: opts.quote,
    interval: opts.interval,
    dryRun: opts.dryRun
  }, 'Starting standard trading bot');
  
  const throttle = new PQueue({ concurrency: 1, interval: 15000, intervalCap: 1 });
  
  console.log(`▶ Bot running: ${opts.symbol}, every ${opts.interval}s, dry=${opts.dryRun}`);

  // Establecer intervalo para ciclo de trading
  setInterval(
    async () => {
      // Usar PQueue para throttling como recomendado
      await throttle.add(async () => {
        try {
          // Obtener ticker 24h (con método correcto)
          const ticker = await binanceService.getTicker24H(opts.symbol);
          
          if (!ticker) {
            throw new Error(`No se pudieron obtener datos de ticker para ${opts.symbol}`);
          }
          
          // Obtener sentimiento de LunarCrush en paralelo
          const asset = opts.symbol.replace('USDT', '');
          const galaxyScore = await lunarCrushService.galaxyScore(asset);
          
          // Construir datos de mercado
          const md = {
            price: Number(ticker.lastPrice),
            volume24h: Number(ticker.quoteVolume),
            sentiment: galaxyScore
          };
          
          // Solicitar señal a DeepSeek
          const signal = await deepSeekService.decide(md);
          
          // Mostrar información de la señal
          const timestamp = new Date().toISOString();
          console.log(timestamp);
          console.log(`Signal: ${signal.action} (confidence: ${signal.confidence?.toFixed(2) || 0})`);
          
          // Ejecutar operación si hay suficiente confianza
          if (signal.confidence >= 0.5) {
            if (signal.action === 'BUY') {
              const buyOrder = await binanceService.buy(opts.symbol, opts.quote, opts.dryRun);
              
              // Registrar operación en el historial
              if (buyOrder) {
                await tradeHistoryService.registerBuyOperation(
                  buyOrder,
                  opts.symbol,
                  signal,
                  'standard'
                );
              }
            }
            if (signal.action === 'SELL') {
              const sellOrder = await binanceService.sell(opts.symbol, opts.dryRun);
              
              // Registrar venta en el historial
              if (sellOrder) {
                await tradeHistoryService.registerSellOperation(
                  sellOrder,
                  opts.symbol
                );
              }
            }
          }
        } catch (e: any) {
          logger.error({ error: e.message }, 'Error en ciclo de trading');
        }
      });
    },
    opts.interval * 1000
  );
}

/**
 * Ejecuta el bot optimizado para micro-trading
 */
async function runMicroTrading(opts: { 
  symbol: string; 
  capital: number;
  strategy: string;
  position: number;
  interval: number; 
  maxStopLoss: number;
  takeProfit: number;
  minConfidence?: number;
  ignoreMarketConditions?: boolean;
  allowBearish?: boolean;
  dryRun: boolean 
}) {
  // Validar parámetros
  if (opts.capital < 10) {
    logger.error('Capital mínimo requerido es $10');
    process.exit(1);
  }
  
  if (opts.position > opts.capital * 0.5) {
    logger.warn({ 
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
  const strategy = StrategyFactory.createStrategy(
    opts.strategy,
    opts.capital,
    strategyConfig
  );
  
  logger.info({
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
  const throttle = new PQueue({ 
    concurrency: 1, 
    interval: 30000, 
    intervalCap: 1 
  });
  
  // Configurar intervalo de ejecución
  setInterval(
    async () => {
      await throttle.add(async () => {
        try {
          // Ejecutar la estrategia
          const signal = await strategy.execute(opts.symbol, opts.capital);
          
          // Mostrar información detallada de la señal
          console.log(`\n${new Date().toISOString()}`);
          console.log(`Signal: ${signal.action} (confidence: ${signal.confidence?.toFixed(2) || 0})`);
          
          if (signal.action !== 'HOLD') {
            console.log(`Entry: ${signal.entry}, SL: ${signal.stopLoss}, TP: ${signal.takeProfit}`);
            console.log(`Position Size: $${signal.position_size?.toFixed(2) || opts.position}`);
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
                logger.info({
                  symbol: opts.symbol,
                  positionSize: signal.position_size || opts.position,
                  trailingPercent: signal.trailingStopPercent
                }, 'Executing buy with trailing stop');
                
                buyOrder = await binanceService.buyWithTrailingStop(
                  opts.symbol, 
                  signal.position_size || opts.position, 
                  signal.trailingStopPercent,
                  opts.dryRun
                );
              } else {
                // Usar compra normal sin trailing stop
                buyOrder = await binanceService.buy(
                  opts.symbol, 
                  signal.position_size || opts.position, 
                  opts.dryRun
                );
              }
              
              // Registrar operación en el historial
              if (buyOrder) {
                await tradeHistoryService.registerBuyOperation(
                  buyOrder,
                  opts.symbol,
                  signal,
                  opts.strategy
                );
              }
            }
            if (signal.action === 'SELL') {
              const sellOrder = await binanceService.sell(opts.symbol, opts.dryRun);
              
              // Registrar venta en el historial
              if (sellOrder) {
                await tradeHistoryService.registerSellOperation(
                  sellOrder,
                  opts.symbol
                );
              }
            }
          }
        } catch (e: any) {
          logger.error({ error: e.message }, 'Error executing strategy');
        }
      });
    },
    opts.interval * 1000
  );
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------
const cli = new Command();

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
      if (o.minConfidence === 0.85) o.minConfidence = 0.80; // Usar umbral más permisivo si no se especificó
      if (!o.ignoreMarketConditions) o.ignoreMarketConditions = true; // Ignorar condiciones de mercado por defecto
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
      strategy: 'growth',  // Usar siempre estrategia de crecimiento
      position: o.autoSize ? (o.capital * 0.4 / o.pairs) : 10, // 40% del capital dividido entre pares
      interval: o.interval,
      maxStopLoss: 1.8,    // Stop loss óptimo para crecimiento
      takeProfit: 2.5,     // Take profit más agresivo
      minConfidence: 0.8,  // Umbral de confianza más permisivo
      ignoreMarketConditions: true,  // Ignorar condiciones generales de mercado
      allowBearish: true,  // Permitir operar en mercados bajistas
      dryRun: !!o.dryRun
    });
  });

// Comando para diagnosticar conexiones API y base de datos
cli
  .command('diagnose')
  .description('Diagnosticar conexiones a APIs y base de datos')
  .action(async () => {
    console.log('=== DIAGNÓSTICO DE APIs ===');
    
    // Probar LunarCrush
    console.log('\nProbando LunarCrush...');
    try {
      const score = await lunarCrushService.galaxyScore('BTC');
      console.log(`✅ LunarCrush OK: Galaxy Score BTC = ${score}`);
    } catch (error: any) {
      console.log(`❌ LunarCrush Error: ${error.message}`);
    }
    
    // Probar Binance
    console.log('\nProbando Binance...');
    try {
      const ticker = await binanceService.getTicker24H('BTCUSDT');
      
      if (ticker && ticker.lastPrice) {
        console.log(`✅ Binance OK: BTC Price = ${ticker.lastPrice}`);
      } else {
        console.log('Datos del ticker recibidos (o nulos/undefined):');
        if (ticker !== undefined && ticker !== null) {
          try {
            const tickerJSON = JSON.stringify(ticker, null, 2);
            if (tickerJSON !== undefined) {
              console.log(tickerJSON.substring(0, 200) + '...');
            } else {
              console.log(`Ticker no serializable a JSON: ${typeof ticker}`);
            }
            console.log('❌ Binance Advertencia: Datos recibidos pero formato inesperado (falta lastPrice?)');
          } catch (jsonError: any) {
            console.log(`Error al convertir ticker a JSON: ${jsonError.message}`);
          }
        } else {
          console.log(`Ticker recibido como: ${ticker}`);
          console.log('❌ Binance Error: No se recibieron datos válidos del ticker.');
        }
      }
    } catch (error: any) {
      console.log(`❌ Binance Error: ${error.message}`);
    }
    
    // Probar la base de datos PostgreSQL
    console.log('\nProbando conexión a PostgreSQL...');
    try {
      const isConnected = await db.testConnection();
      if (isConnected) {
        console.log('✅ PostgreSQL OK: Conexión establecida correctamente');
        
        // Verificar si TimescaleDB está disponible
        const hasTimescaleDB = await db.hasTimescaleDB();
        if (hasTimescaleDB) {
          console.log('✅ TimescaleDB OK: Extensión activa y disponible');
        } else {
          console.log('ℹ️ TimescaleDB no está disponible (opcional, pero recomendado para datos temporales)');
        }
      } else {
        console.log('❌ PostgreSQL Error: No se pudo establecer conexión');
      }
    } catch (error: any) {
      console.log(`❌ PostgreSQL Error: ${error.message}`);
    }
    
    console.log('\n=== DIAGNÓSTICO COMPLETADO ===');
  });

// Comando para mostrar ejemplo de datos mejorados
cli
  .command('show-market-data')
  .description('Mostrar datos de mercado mejorados con indicadores')
  .option('-s, --symbol <pair>', 'Par a analizar', 'BTCUSDT')
  .action(async (o) => {
    console.log(`Obteniendo datos mejorados para ${o.symbol}...`);
    
    try {
      // Obtener sentiment
      const asset = o.symbol.replace('USDT', '');
      const sentiment = await lunarCrushService.galaxyScore(asset);
      
      // Obtener datos de mercado enriquecidos
      const md = await marketDataService.getEnhancedMarketData(o.symbol);
      md.sentiment = sentiment;
      
      // Mostrar en formato amigable
      console.log('\n=== DATOS DE MERCADO MEJORADOS ===');
      console.log(`Símbolo: ${o.symbol}`);
      console.log(`Precio actual: ${md.price}`);
      console.log(`Volumen 24h: ${md.volume24h}`);
      console.log(`Sentimiento (Galaxy Score): ${md.sentiment}`);
      
      console.log('\n=== INDICADORES TÉCNICOS ===');
      if (md.technicals) {
        console.log(`RSI: ${md.technicals.rsi?.toFixed(2) || 'N/A'}`);
        console.log(`Tendencia EMA: ${md.technicals.ema_cross || 'N/A'}`);
        console.log(`Ratio de volumen: ${md.technicals.volume_ratio?.toFixed(2) || 'N/A'}`);
        console.log(`Posición en Bollinger Bands: ${md.technicals.bband_percent?.toFixed(2) || 'N/A'}`);
        console.log(`Soportes cercanos: ${md.technicals.supports?.join(', ') || 'N/A'}`);
        console.log(`Resistencias cercanas: ${md.technicals.resistances?.join(', ') || 'N/A'}`);
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  });

// Comando para mostrar estadísticas e historial de operaciones
cli
  .command('stats')
  .description('Mostrar estadísticas de rendimiento e historial de operaciones')
  .option('-s, --symbol <pair>', 'Filtrar por par específico')
  .option('-d, --days <days>', 'Número de días a analizar', (v) => Number(v), 30)
  .option('-l, --limit <num>', 'Limitar número de operaciones a mostrar', (v) => Number(v), 10)
  .option('--status <status>', 'Filtrar por estado (OPEN, CLOSED)', 'ALL')
  .action(async (o) => {
    // Comprobar si el archivo de historial existe
    console.log('\n=== ESTADÍSTICAS DE TRADING ===');
    
    try {
      // Obtener estadísticas
      const stats = await tradeHistoryService.getPerformanceStats(o.symbol, o.days);
      
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
      const filters: any = {
        limit: o.limit
      };
      
      if (o.symbol) {
        filters.symbol = o.symbol;
      }
      
      if (o.status && o.status !== 'ALL') {
        filters.status = o.status;
      }
      
      // Obtener historial de operaciones
      const trades = await tradeHistoryService.getTradeHistory(filters);
      
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
          
          console.log(
            `${t.id.slice(-8)} | ${date} | ${t.symbol} | ${t.action} | ${t.entry.toFixed(4)} | ` +
            `${t.exitPrice?.toFixed(4) || '-'} | ${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%) | ${t.status}`
          );
        }
      } else {
        console.log('\nNo hay operaciones registradas que coincidan con los filtros.');
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
    }
  });

// Comando para escanear múltiples pares y encontrar mejores oportunidades
cli
  .command('scan-market')
  .description('Escanear mercado para encontrar mejores oportunidades de trading')
  .option('-c, --capital <amount>', 'Capital total disponible', (v) => Number(v), 54)
  .option('-n, --top <number>', 'Mostrar top N oportunidades', (v) => Number(v), 5)
  .option('-v, --volume <min>', 'Volumen mínimo en millones USD', (v) => Number(v), 5)
  .option('-g, --growth-focus', 'Priorizar activos con alto potencial de crecimiento')
  .action(async (o) => {
    console.log(`\n=== ESCÁNER DE MERCADO (ENFOQUE: ${o.growthFocus ? 'CRECIMIENTO' : 'BALANCEADO'}) ===`);
    console.log(`Buscando mejores oportunidades para capital de $${o.capital}...`);
    
    try {
      // 1. Obtener pares disponibles con volumen adecuado
      console.log('\nObteniendo pares con liquidez adecuada...');
      
      // Primero obtener información del exchange
      const exchangeInfo = await binanceService.getRest().exchangeInfo();
      
      // Filtrar solo pares USDT activos
      const usdtPairs = exchangeInfo.data.symbols
        .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
        .map((s: any) => s.symbol);
      
      console.log(`Encontrados ${usdtPairs.length} pares USDT activos.`);
      
      // 2. Analizar cada par (hasta 20 para no sobrecargar)
      const pairsToAnalyze = usdtPairs.slice(0, 20);
      
      console.log(`\nAnalizando ${pairsToAnalyze.length} pares principales...`);
      
      // Array para almacenar resultados
      const opportunities: Array<{
        symbol: string;
        score: number;
        price: number;
        galaxyScore: number;
        rsi?: number;
        trend?: string;
        volumeRatio?: number;
      }> = [];
      
      // Procesar en grupos de 5 para no saturar las APIs
      for (let i = 0; i < pairsToAnalyze.length; i += 5) {
        const batch = pairsToAnalyze.slice(i, i + 5);
        
        await Promise.all(batch.map(async (symbol: string) => {
          try {
            // Obtener datos de ticker
            const ticker = await binanceService.getTicker24H(symbol);
            
            // Filtrar por volumen mínimo (en millones USD)
            if (Number(ticker.quoteVolume) < o.volume * 1000000) {
              return;
            }
            
            // Obtener galaxy score
            const asset = symbol.replace('USDT', '');
            const galaxyScore = await lunarCrushService.galaxyScore(asset);
            
            // Obtener datos de mercado con indicadores
            const md = await marketDataService.getEnhancedMarketData(symbol);
            
            // Calcular score según enfoque
            let score = 0;
            
            if (o.growthFocus) {
              // Fórmula para crecimiento
              // Priorizar: alto Galaxy Score, RSI entre 45-65, volumen creciente
              score = (
                (galaxyScore / 100) * 0.4 +  // 40% peso del sentimiento
                (md.technicals?.rsi && md.technicals.rsi > 45 && md.technicals.rsi < 65 ? 0.3 : 0) + // RSI óptimo
                (md.technicals?.volume_ratio && md.technicals.volume_ratio > 1.2 ? 0.2 : 0) + // Volumen creciente
                (md.technicals?.ema_cross === 'bullish' ? 0.1 : 0) // Tendencia alcista
              );
            } else {
              // Fórmula balanceada
              // Priorizar: RSI extremo (sobreventa), soporte técnico
              score = (
                (galaxyScore / 100) * 0.3 +  // 30% peso del sentimiento
                (md.technicals?.rsi && md.technicals.rsi < 30 ? 0.4 : 0) + // RSI sobreventa
                (md.technicals?.bband_percent && md.technicals.bband_percent < 0.2 ? 0.3 : 0) // Cerca de soporte BBand
              );
            }
            
            // Añadir a oportunidades
            if (score > 0.3) { // Umbral mínimo
              opportunities.push({
                symbol,
                score,
                price: Number(ticker.lastPrice),
                galaxyScore,
                rsi: md.technicals?.rsi,
                trend: md.technicals?.ema_cross,
                volumeRatio: md.technicals?.volume_ratio
              });
            }
          } catch (error: any) {
            console.error(`Error analizando ${symbol}: ${error.message}`);
          }
        }));
        
        // Pausa para evitar rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
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
          // Determinar recomendación
          let recom = '';
          if (opp.score > 0.7) recom = 'EXCELENTE';
          else if (opp.score > 0.5) recom = 'MUY BUENA';
          else recom = 'BUENA';
          
          console.log(
            `${(index + 1).toString().padStart(2, ' ')}. ${opp.symbol.padEnd(10, ' ')} | ` +
            `${opp.score.toFixed(2).padStart(6, ' ')} | ` +
            `${opp.price.toFixed(4).padStart(8, ' ')} | ` +
            `${opp.galaxyScore.toFixed(0).padStart(12, ' ')} | ` +
            `${(opp.rsi?.toFixed(0) || 'N/A').padStart(7, ' ')} | ` +
            `${(opp.trend || 'N/A').padEnd(11, ' ')} | ` +
            `${(opp.volumeRatio?.toFixed(2) || 'N/A').padStart(12, ' ')} | ` +
            `${recom}`
          );
        });
        
        console.log('\nComando para operar en mejor oportunidad:');
        console.log(`node src/index.js growth-trade -s ${topOpportunities[0].symbol} -c ${o.capital}`);
      } else {
        console.log('\nNo se encontraron oportunidades que cumplan los criterios.');
      }
    } catch (error: any) {
      console.error(`Error escaneando mercado: ${error.message}`);
    }
  });

// Inicializar el sistema asincrónicamente primero
(async () => {
  try {
    console.log('Inicializando midasTS...');
    await initializeSystem();
    console.log('Sistema inicializado correctamente. Ejecutando comando...');
    
    // Analizar argumentos de línea de comandos
    cli.parse(process.argv);
  } catch (error) {
    console.error('Error al inicializar el sistema:', error);
    process.exit(1);
  }
})();
