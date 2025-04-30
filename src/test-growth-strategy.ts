#!/usr/bin/env node
/**
 * Test script para estrategia de crecimiento optimizada
 * Demuestra las capacidades del sistema para maximizar el crecimiento de capital pequeño
 */
import { marketScannerService } from './services/market-scanner';
import { microGrowthStrategy } from './strategies/micro-capital';
import { binanceService } from './services/binance';
import { TechnicalIndicators } from './utils/indicators';
import { env } from './utils/env';

/**
 * Valida todas las mejoras implementadas para maximizar el crecimiento de capital
 */
async function testGrowthStrategy(capital: number = 54): Promise<void> {
  console.log(`
╔════════════════════════════════════════════════════╗
║                                                    ║
║   TEST DE ESTRATEGIA DE CRECIMIENTO ACELERADO     ║
║              Capital inicial: $${capital.toFixed(2)}              ║
║                                                    ║
╚════════════════════════════════════════════════════╝
`);

  console.log('\n=== FASE 1: ESCANEAR MERCADO PARA MEJORES OPORTUNIDADES ===');
  
  try {
    // 1. Encontrar mejores oportunidades de crecimiento
    console.log('Buscando las mejores oportunidades para crecimiento rápido...');
    
    const opportunities = await marketScannerService.scanMarket(
      true,  // enfoque en crecimiento
      capital, 
      5      // top 5 oportunidades
    );
    
    if (opportunities.length === 0) {
      console.error('No se encontraron oportunidades adecuadas.');
      return;
    }
    
    console.log(`\n¡Encontradas ${opportunities.length} oportunidades de trading!`);
    console.log('-----------------------------------------------------------------');
    console.log('   SÍMBOLO   |  SCORE  |  PRECIO  | GALAXY SCORE | POTENCIAL (%) ');
    console.log('-----------------------------------------------------------------');
    
    for (const opp of opportunities) {
      console.log(
        `   ${opp.symbol.padEnd(9)} | ` +
        `${opp.score.toFixed(2).padStart(6)} | ` +
        `${opp.price.toFixed(4).padStart(8)} | ` +
        `${opp.galaxyScore.toFixed(0).padStart(12)} | ` +
        `${(opp.potentialReturn || 0).toFixed(2).padStart(8)}%`
      );
    }
    
    // 2. Analizar la mejor oportunidad en detalle
    const bestOpportunity = opportunities[0];
    console.log(`\n=== FASE 2: ANÁLISIS DETALLADO DE ${bestOpportunity.symbol} ===`);
    
    // Obtener candles históricos para análisis
    console.log(`Analizando datos históricos de ${bestOpportunity.symbol}...`);
    const candles = await binanceService.getHistoricalCandles(bestOpportunity.symbol, '15m', 96);
    
    // Calcular indicadores específicos para crecimiento
    const momentum = TechnicalIndicators.calculateMomentumScore(candles);
    const growthPotential = TechnicalIndicators.calculateGrowthPotential(candles);
    const atr = TechnicalIndicators.calculateATR(candles);
    const roc = TechnicalIndicators.calculateROC(candles);
    
    console.log('\nIndicadores de crecimiento:');
    console.log(`- Momentum Score: ${momentum.toFixed(2)}/100`);
    console.log(`- Growth Potential: ${growthPotential.toFixed(2)}/100`);
    console.log(`- ATR (Volatilidad): ${atr.toFixed(2)}%`);
    console.log(`- Rate of Change (9): ${roc.toFixed(2)}%`);
    
    // 3. Simular una operación óptima de crecimiento
    console.log('\n=== FASE 3: SIMULACIÓN DE OPERACIÓN DE CRECIMIENTO ===');
    
    // Determinar nivel de entrada
    const entryPrice = bestOpportunity.price;
    
    // Calcular niveles de take profit óptimos basados en ATR y momentum
    const takeProfitLevels = TechnicalIndicators.calculateTakeProfitLevels(
      candles,
      entryPrice
    );
    
    // Calcular tamaño de posición óptimo usando Kelly fraccionario
    // Asumimos un win rate del 60% basado en backtest
    const winRate = 0.60; 
    const reward = ((takeProfitLevels.tp2 / entryPrice) - 1) * 100; // TP promedio
    const risk = 1.5; // Stop loss aproximado de 1.5%
    
    const kellyFraction = TechnicalIndicators.calculateKellyFraction(
      winRate, 
      reward, 
      risk,
      0.3 // Kelly fraccionario conservador
    );
    
    const positionSize = Math.min(capital * kellyFraction, capital * 0.4);
    
    console.log('\nParámetros óptimos calculados:');
    console.log(`- Precio de entrada: $${entryPrice.toFixed(4)}`);
    console.log(`- Take Profit 1: $${takeProfitLevels.tp1.toFixed(4)} (+${((takeProfitLevels.tp1/entryPrice-1)*100).toFixed(2)}%)`);
    console.log(`- Take Profit 2: $${takeProfitLevels.tp2.toFixed(4)} (+${((takeProfitLevels.tp2/entryPrice-1)*100).toFixed(2)}%)`);
    console.log(`- Take Profit 3: $${takeProfitLevels.tp3.toFixed(4)} (+${((takeProfitLevels.tp3/entryPrice-1)*100).toFixed(2)}%)`);
    console.log(`- Fracción Kelly: ${(kellyFraction*100).toFixed(2)}% del capital`);
    console.log(`- Tamaño de posición recomendado: $${positionSize.toFixed(2)}`);
    
    // 4. Ejecutar la estrategia
    console.log('\n=== FASE 4: EJECUCIÓN DE LA ESTRATEGIA DE CRECIMIENTO ===');
    
    console.log('Ejecutando estrategia de micro-capital en modo crecimiento...');
    const signal = await microGrowthStrategy.execute(bestOpportunity.symbol, capital);
    
    console.log('\nSeñal generada por la estrategia:');
    console.log(`- Acción: ${signal.action}`);
    console.log(`- Confianza: ${(signal.confidence || 0).toFixed(2)}`);
    console.log(`- Precio de entrada: $${signal.entry?.toFixed(4) || 'N/A'}`);
    console.log(`- Stop Loss: $${signal.stopLoss?.toFixed(4) || 'N/A'}`);
    console.log(`- Take Profit: $${signal.takeProfit?.toFixed(4) || 'N/A'}`);
    console.log(`- Usar Trailing Stop: ${signal.useTrailingStop ? 'Sí' : 'No'}`);
    if (signal.useTrailingStop) {
      console.log(`- Porcentaje de Trailing Stop: ${signal.trailingStopPercent?.toFixed(2) || 'N/A'}%`);
    }
    console.log(`- Tamaño de posición: $${signal.position_size?.toFixed(2) || 'N/A'}`);
    if (signal.reasoning) {
      console.log(`\nRazonamiento: ${signal.reasoning}`);
    }
    
    // 5. Proyección de crecimiento de capital
    console.log('\n=== FASE 5: ANÁLISIS DE CRECIMIENTO PROYECTADO ===');
    
    // Simular crecimiento con compounding
    simulateCapitalGrowth(capital);
    
    console.log('\n=== FASE 6: PORTFOLIO DIVERSIFICADO ÓPTIMO ===');
    
    // Determinar portfolio diversificado para $54
    const portfolio = await marketScannerService.getDiversifiedPortfolio(capital, 2);
    
    console.log('\nPortfolio óptimo para maximizar crecimiento con diversificación:');
    console.log('-------------------------------------------------');
    console.log('   SÍMBOLO   |  ASIGNACIÓN ($)  | PORCENTAJE (%)');
    console.log('-------------------------------------------------');
    
    let totalAllocated = 0;
    for (const allocation of portfolio) {
      const percentage = (allocation.allocation / capital) * 100;
      console.log(
        `   ${allocation.symbol.padEnd(9)} | ` +
        `$${allocation.allocation.toFixed(2).padStart(14)} | ` +
        `${percentage.toFixed(2).padStart(11)}%`
      );
      totalAllocated += allocation.allocation;
    }
    
    console.log('-------------------------------------------------');
    console.log(`   TOTAL      | $${totalAllocated.toFixed(2).padStart(14)} | ${((totalAllocated/capital)*100).toFixed(2).padStart(11)}%`);
    
    console.log(`\nPara ejecutar esta estrategia de forma automática:`);
    console.log(`node src/index.js growth-trade -s ${bestOpportunity.symbol} -c ${capital}`);
    
  } catch (error: any) {
    console.error(`Error durante el test: ${error.message}`);
  }
}

/**
 * Simula el crecimiento de capital mediante compounding
 */
function simulateCapitalGrowth(initialCapital: number): void {
  console.log('\nProyección de crecimiento de capital con compounding:');
  console.log('------------------------------------------------');
  console.log(' MES |   CAPITAL ($)  |  CRECIMIENTO (%)  |  ROI');
  console.log('------------------------------------------------');
  
  // Parámetros de simulación
  const monthlyWins = 8;     // Operaciones exitosas por mes
  const monthlyLosses = 5;   // Operaciones perdedoras por mes
  const avgWinPercent = 2.5; // % promedio de ganancia por operación
  const avgLossPercent = 1.5; // % promedio de pérdida por operación
  const months = 4;          // Simular 4 meses
  
  let capital = initialCapital;
  const monthlyReturns: number[] = [];
  
  for (let month = 1; month <= months; month++) {
    // Calcular retorno mensual
    const monthlyReturn = (monthlyWins * avgWinPercent) - (monthlyLosses * avgLossPercent);
    
    // Añadir variabilidad (±25% del retorno esperado)
    const variability = (Math.random() * 0.5 - 0.25) * monthlyReturn;
    const adjustedReturn = monthlyReturn + variability;
    
    // Calcular nuevo capital
    const newCapital = capital * (1 + adjustedReturn / 100);
    const growthPercent = (newCapital / capital - 1) * 100;
    const totalROI = (newCapital / initialCapital - 1) * 100;
    
    console.log(
      ` ${month.toString().padStart(2)} | ` +
      `$${newCapital.toFixed(2).padStart(13)} | ` +
      `${growthPercent.toFixed(2).padStart(16)}% | ` +
      `${totalROI.toFixed(2).padStart(5)}%`
    );
    
    // Acumular para siguiente mes
    capital = newCapital;
    monthlyReturns.push(adjustedReturn);
  }
  
  console.log('------------------------------------------------');
  
  // Mostrar proyección optimista y conservadora
  const conservativeCapital = initialCapital * Math.pow(1 + (Math.min(...monthlyReturns) / 100), months);
  const optimisticCapital = initialCapital * Math.pow(1 + (Math.max(...monthlyReturns) / 100), months);
  
  console.log(`\nProyección conservadora (4 meses): $${conservativeCapital.toFixed(2)}`);
  console.log(`Proyección promedio (4 meses): $${capital.toFixed(2)}`);
  console.log(`Proyección optimista (4 meses): $${optimisticCapital.toFixed(2)}`);
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  // Permitir pasar capital como parámetro
  const args = process.argv.slice(2);
  const capitalArg = args.find(arg => arg.startsWith('--capital='));
  const capital = capitalArg ? parseFloat(capitalArg.split('=')[1]) : 54;
  
  testGrowthStrategy(capital)
    .catch(err => console.error('Error:', err))
    .finally(() => {
      // Solo necesario para pruebas
      setTimeout(() => {
        process.exit(0);
      }, 1000);
    });
}
