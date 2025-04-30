#!/usr/bin/env node
/// <reference types="node" />
// midasTS - Bot para trading de criptomonedas
// -----------------------------------------------------------------------------
// LunarCrush x DeepSeek Reasoner x Binance
// Versión actualizada con mejoras de robustez y modularidad
// -----------------------------------------------------------------------------

import { Command } from 'commander';
import { logger, tradeLogger } from './utils/logging';
import { env, isDryRun } from './utils/env';
import { lunarCrushService } from './services/lunarcrush';
import { deepSeekService } from './services/deepseek';
import { binanceService } from './services/binance';
import { marketDataService } from './services/market-data';
import { microCapitalStrategy } from './strategies/micro-capital';
import { tradeHistoryService } from './services/trade-history';
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
          const { MicroCapitalStrategy } = require('./strategies/micro-capital');
          return new MicroCapitalStrategy(config);
        }
        // De lo contrario, usar la instancia global
        return microCapitalStrategy;
      // Podrías añadir más estrategias según sea necesario
      default:
        // Fallback a estrategia micro para iniciar
        logger.warn({ requestedStrategy: type }, 'Estrategia solicitada no disponible, usando micro');
        return config ? new (require('./strategies/micro-capital').MicroCapitalStrategy)(config) : microCapitalStrategy;
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
                tradeHistoryService.registerBuyOperation(
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
                tradeHistoryService.registerSellOperation(
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
                tradeHistoryService.registerBuyOperation(
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
                tradeHistoryService.registerSellOperation(
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
  .option('-g, --strategy <type>', 'Estrategia (auto|micro)', 'micro')
  .option('-i, --interval <seconds>', 'Intervalo en segundos', (v) => Number(v), 180)
  .option('-l, --max-stop-loss <percent>', 'Máximo stop loss permitido', (v) => Number(v), 1.5)
  .option('-t, --take-profit <percent>', 'Objetivo de beneficio', (v) => Number(v), 1.2)
  .option('-f, --min-confidence <num>', 'Confianza mínima para operar (0-1)', (v) => Number(v), 0.85)
  .option('--ignore-market-conditions', 'Ignorar condiciones de mercado desfavorables')
  .option('--allow-bearish', 'Permitir operaciones en mercado bajista')
  .option('--dry-run', 'Simulación sin ejecución real')
  .action((o) => runMicroTrading({ 
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
  }));

// Comando para diagnosticar conexiones API
cli
  .command('diagnose')
  .description('Diagnosticar conexiones a APIs')
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
      const stats = tradeHistoryService.getPerformanceStats(o.symbol, o.days);
      
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
      const trades = tradeHistoryService.getTradeHistory(filters);
      
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

// Analizar argumentos de línea de comandos
cli.parse(process.argv);
