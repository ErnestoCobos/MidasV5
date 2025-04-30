/**
 * Implementación del escáner de mercado para el bot de Telegram
 */
import { binanceService } from './binance';
import { marketDataService } from './market-data';
import { lunarCrushService } from './lunarcrush';
import { logger } from '../utils/logging';

// Interfaz para oportunidades de mercado
export interface MarketOpportunity {
  symbol: string;
  score: number;
  price: number;
  galaxyScore: number;
  recommendation: string;
}

/**
 * Escanea el mercado en busca de oportunidades de trading
 * @returns Array de oportunidades ordenadas por score
 */
export async function scanMarket(maxResults: number = 5): Promise<MarketOpportunity[]> {
  try {
    const opportunities: MarketOpportunity[] = [];
    
    // Obtener pares disponibles con volumen adecuado
    const exchangeInfo = await binanceService.getRest().exchangeInfo();
    
    // Filtrar solo pares USDT activos
    const usdtPairs = exchangeInfo.data.symbols
      .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
      .map((s: any) => s.symbol);
    
    // Seleccionar pares para analizar (limitar para no sobrecargar)
    // Primero los más conocidos y después algunos aleatorios
    const popularCoins = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT'];
    
    // Filtrar los populares que existan en la lista
    const popularPairs = popularCoins.filter(coin => usdtPairs.includes(coin));
    
    // Añadir algunos aleatorios para completar
    const remainingPairs = usdtPairs
      .filter(pair => !popularPairs.includes(pair))
      .sort(() => 0.5 - Math.random())
      .slice(0, 10 - popularPairs.length);
    
    const pairsToAnalyze = [...popularPairs, ...remainingPairs];
    
    logger.info({ count: pairsToAnalyze.length }, 'Escaneando pares para oportunidades');
    
    // Analizar cada par
    for (const symbol of pairsToAnalyze) {
      try {
        // Obtener datos de ticker
        const ticker = await binanceService.getTicker24H(symbol);
        
        // Filtrar por volumen mínimo (5 millones USD)
        if (Number(ticker.quoteVolume) < 5000000) {
          continue;
        }
        
        // Obtener galaxy score para sentimiento
        const asset = symbol.replace('USDT', '');
        const galaxyScore = await lunarCrushService.galaxyScore(asset);
        
        // Obtener datos técnicos
        const md = await marketDataService.getEnhancedMarketData(symbol);
        
        // Calcular score compuesto
        let score = 0;
        
        // Fórmula para score:
        // 40% sentimiento social + 30% indicadores técnicos + 20% momentum + 10% volumen
        score = (
          (galaxyScore / 100) * 0.4 +  // 40% peso del sentimiento
          (md.technicals?.rsi && md.technicals.rsi > 45 && md.technicals.rsi < 65 ? 0.3 : 0) + // RSI óptimo
          (md.technicals?.volume_ratio && md.technicals.volume_ratio > 1.2 ? 0.2 : 0) + // Volumen creciente
          (md.technicals?.ema_cross === 'bullish' ? 0.1 : 0) // Tendencia alcista
        );
        
        // Determinar recomendación basada en score
        let recommendation = '';
        if (score > 0.7) recommendation = '🟢 EXCELENTE OPORTUNIDAD';
        else if (score > 0.5) recommendation = '🟡 MUY BUENA OPORTUNIDAD';
        else if (score > 0.3) recommendation = '🔵 BUENA OPORTUNIDAD';
        else continue; // No incluir si score es bajo
        
        // Añadir a la lista de oportunidades
        opportunities.push({
          symbol,
          score,
          price: parseFloat(ticker.lastPrice),
          galaxyScore,
          recommendation
        });
      } catch (error) {
        logger.error({ error, symbol }, 'Error analizando par');
        // Continuar con el siguiente par
      }
    }
    
    // Ordenar oportunidades por score (de mayor a menor)
    const sortedOpportunities = opportunities
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
    
    logger.info({ 
      count: sortedOpportunities.length,
      topSymbol: sortedOpportunities[0]?.symbol
    }, 'Escaneo de mercado completado');
    
    return sortedOpportunities;
  } catch (error) {
    logger.error({ error }, 'Error en escaneo de mercado');
    return [];
  }
}
