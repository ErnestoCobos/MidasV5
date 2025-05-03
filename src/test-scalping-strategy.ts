/**
 * Script para probar y evaluar la estrategia de scalping mejorada
 * Permite ejecutar la estrategia en modo simulación y analizar resultados
 */
import { scalpingStrategy } from './strategies/scalping';
import { logger } from './utils/logging';
import { binanceService } from './services/binance';
import { format } from 'date-fns';
import fs from 'fs';
import path from 'path';

// Función principal para ejecutar pruebas de la estrategia
async function testScalpingStrategy() {
  try {
    console.log('🔍 Iniciando prueba de estrategia de scalping mejorada');
    
    // Reiniciar métricas de rendimiento
    scalpingStrategy.resetPerformanceMetrics();
    
    // Lista de pares para probar
    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT'];
    const capital = 1000; // Capital por par
    
    console.log(`\n📊 Probando estrategia en ${symbols.length} pares con $${capital} por par`);
    console.log('==================================================================');
    
    // Resultados para cada par
    const results = [];
    
    // Probar cada par
    for (const symbol of symbols) {
      console.log(`\n🔄 Analizando ${symbol}...`);
      
      try {
        // Ejecutar la estrategia
        const signal = await scalpingStrategy.execute(symbol, capital);
        
        // Guardar resultados
        results.push({
          symbol,
          action: signal.action,
          confidence: signal.confidence,
          entry: signal.entry,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          reasoning: signal.reasoning,
          analysis: signal.analysis
        });
        
        // Mostrar resumen
        console.log(`  ▸ Acción: ${signal.action}`);
        console.log(`  ▸ Confianza: ${(signal.confidence * 100).toFixed(1)}%`);
        
        if (signal.action === 'BUY') {
          console.log(`  ▸ Entrada: $${signal.entry?.toFixed(4)}`);
          console.log(`  ▸ Stop Loss: $${signal.stopLoss?.toFixed(4)} (${signal.stopLoss && signal.entry ? ((signal.stopLoss / signal.entry - 1) * 100).toFixed(2) : '?'}%)`);
          console.log(`  ▸ Take Profit: $${signal.takeProfit?.toFixed(4)} (${signal.takeProfit && signal.entry ? ((signal.takeProfit / signal.entry - 1) * 100).toFixed(2) : '?'}%)`);
          
          if (signal.trailingStopPercent) {
            console.log(`  ▸ Trailing Stop: ${signal.trailingStopPercent}%`);
          }
        }
        
        if (signal.reasoning) {
          console.log(`  ▸ Razonamiento: ${signal.reasoning}`);
        }
        
        if (signal.analysis) {
          console.log(`  ▸ Análisis: ${signal.analysis}`);
        }
        
      } catch (error) {
        console.error(`❌ Error analizando ${symbol}:`, error);
      }
    }
    
    // Mostrar métricas de rendimiento
    const metrics = scalpingStrategy.getPerformanceMetrics();
    console.log('\n📈 Métricas de rendimiento:');
    console.log('==================================================================');
    console.log(`  ▸ Total de señales: ${metrics.totalSignals}`);
    console.log(`  ▸ Compras: ${metrics.buySignals} (${metrics.totalSignals > 0 ? (metrics.buySignals / metrics.totalSignals * 100).toFixed(1) : 0}%)`);
    console.log(`  ▸ Ventas: ${metrics.sellSignals} (${metrics.totalSignals > 0 ? (metrics.sellSignals / metrics.totalSignals * 100).toFixed(1) : 0}%)`);
    console.log(`  ▸ Hold: ${metrics.holdSignals} (${metrics.totalSignals > 0 ? (metrics.holdSignals / metrics.totalSignals * 100).toFixed(1) : 0}%)`);
    console.log(`  ▸ Confianza promedio: ${(metrics.avgConfidence * 100).toFixed(1)}%`);
    console.log(`  ▸ Spread promedio: ${metrics.avgSpread.toFixed(4)}%`);
    console.log(`  ▸ Tiempo de ejecución promedio: ${metrics.lastExecutionTime}ms`);
    
    console.log('\n🧪 Ejecutando backtest en BTCUSDT...');
    
    // Definir período para backtest (últimos 7 días)
    const endTime = Date.now();
    const startTime = endTime - (7 * 24 * 60 * 60 * 1000); // 7 días
    
    // Ejecutar backtest
    const backtestResults = await scalpingStrategy.runBacktest(
      'BTCUSDT',
      startTime,
      endTime,
      1000 // Capital inicial
    );
    
    // Mostrar resultados de backtest
    console.log('\n🔍 Resultados de backtest:');
    console.log('==================================================================');
    console.log(`  ▸ Capital inicial: $1,000.00`);
    console.log(`  ▸ Capital final: $${backtestResults.finalCapital.toFixed(2)}`);
    console.log(`  ▸ Ganancia/Pérdida: $${backtestResults.profitLoss.toFixed(2)} (${backtestResults.profitLossPercent.toFixed(2)}%)`);
    console.log(`  ▸ Drawdown máximo: ${backtestResults.maxDrawdown.toFixed(2)}%`);
    console.log(`  ▸ Win Rate: ${backtestResults.winRate.toFixed(1)}%`);
    console.log(`  ▸ Total de operaciones: ${backtestResults.tradesCount}`);
    
    // Guardar resultados en archivo
    saveResultsToFile(results, backtestResults);
    
    console.log('\n✅ Prueba finalizada');
    
  } catch (error) {
    console.error('❌ Error ejecutando prueba:', error);
  }
}

// Función para guardar resultados en archivo
function saveResultsToFile(signals: any[], backtestResults: any) {
  try {
    // Crear directorio de resultados si no existe
    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    // Generar nombre de archivo con timestamp
    const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
    const filePath = path.join(resultsDir, `scalping_test_${timestamp}.json`);
    
    // Preparar datos para guardar
    const dataToSave = {
      timestamp: new Date().toISOString(),
      signals,
      backtestResults
    };
    
    // Guardar en archivo
    fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
    
    console.log(`\n💾 Resultados guardados en: ${filePath}`);
  } catch (error) {
    console.error('❌ Error guardando resultados:', error);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  testScalpingStrategy()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error fatal:', err);
      process.exit(1);
    });
}
