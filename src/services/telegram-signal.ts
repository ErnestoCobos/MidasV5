/**
 * Implementación del comando /signal para el bot de Telegram
 * Integra el servicio DeepSeek para obtener señales de trading
 */
import { deepSeekService, TradeSignal, DeepSeekService } from './deepseek';
import { marketDataService } from './market-data';
import { binanceService } from './binance';
import { lunarCrushService } from './lunarcrush';
import { logger } from '../utils/logging';

/**
 * Genera una señal básica basada en indicadores técnicos y sentimiento
 * @param technicals Indicadores técnicos
 * @param sentimentScore Puntaje de sentimiento (0-100)
 * @returns Acción recomendada: BUY, SELL o HOLD
 */
function getBasicSignalFromTechnicals(technicals: any, sentimentScore: number): 'BUY' | 'SELL' | 'HOLD' {
  // Si no hay datos técnicos, usar solo sentimiento
  if (!technicals) {
    return sentimentScore > 65 ? 'BUY' : sentimentScore < 40 ? 'SELL' : 'HOLD';
  }

  // Contadores para cada tipo de señal
  let buySignals = 0;
  let sellSignals = 0;
  
  // 1. Análisis de RSI
  if (technicals.rsi !== undefined) {
    if (technicals.rsi < 30) buySignals += 2; // Sobreventa fuerte
    else if (technicals.rsi < 40) buySignals += 1; // Sobreventa moderada
    else if (technicals.rsi > 70) sellSignals += 2; // Sobrecompra fuerte
    else if (technicals.rsi > 60) sellSignals += 1; // Sobrecompra moderada
  }
  
  // 2. Análisis de tendencia EMA
  if (technicals.ema_cross) {
    if (technicals.ema_cross === 'bullish') buySignals += 2;
    else if (technicals.ema_cross === 'bearish') sellSignals += 2;
  }
  
  // 3. Análisis de Bollinger Bands
  if (technicals.bband_percent !== undefined) {
    if (technicals.bband_percent < 0.2) buySignals += 1; // Cerca de la banda inferior
    else if (technicals.bband_percent > 0.8) sellSignals += 1; // Cerca de la banda superior
  }
  
  // 4. Análisis de volumen
  if (technicals.volume_ratio !== undefined) {
    if (technicals.volume_ratio > 1.5) buySignals += 1; // Volumen creciente
  }
  
  // 5. Incorporar sentimiento
  if (sentimentScore > 70) buySignals += 2;
  else if (sentimentScore > 60) buySignals += 1;
  else if (sentimentScore < 40) sellSignals += 1;
  else if (sentimentScore < 30) sellSignals += 2;
  
  // Decidir la acción basada en el balance de señales
  const signalDifference = buySignals - sellSignals;
  
  if (signalDifference >= 3) return 'BUY';
  if (signalDifference <= -3) return 'SELL';
  return 'HOLD';
}

/**
 * Obtiene una señal de trading para un símbolo
 * @param symbol Símbolo a analizar (ej: BTCUSDT)
 * @param capital Capital disponible para la operación
 * @returns Señal de trading con recomendación
 */
export async function getTradeSignal(symbol: string, capital: number = 1000): Promise<TradeSignal | null> {
  try {
    logger.info({ symbol, capital }, 'Solicitando señal de trading');
    
    // 1. Obtener datos de mercado
    const ticker = await binanceService.getTicker24H(symbol);
    if (!ticker) {
      logger.warn({ symbol }, 'No se encontraron datos de ticker para el símbolo');
      return null;
    }
    
    // 2. Obtener datos técnicos
    const md = await marketDataService.getEnhancedMarketData(symbol);
    
    // 3. Obtener sentimiento desde LunarCrush
    const asset = symbol.replace('USDT', '');
    const galaxyScore = await lunarCrushService.galaxyScore(asset);
    
    // 4. Preparar datos para DeepSeek
    const marketData = {
      symbol,
      price: parseFloat(ticker.lastPrice),
      volume24h: parseFloat(ticker.quoteVolume),
      sentiment: galaxyScore,
      technicals: md.technicals
    };
    
    // 5. Obtener señal usando el método multi-etapa con mejor manejo de errores
    try {
      // Añadir timeout para evitar bloqueos indefinidos
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout exceeded while waiting for DeepSeek API')), 25000);
      });
      
      // Competir entre la llamada real y el timeout
      const signal = await Promise.race([
        deepSeekService.decideMultiStage(marketData, capital, 'medium'),
        timeoutPromise
      ]) as TradeSignal;
      
      logger.info({ 
        symbol, 
        action: signal.action,
        confidence: signal.confidence
      }, 'Señal de trading generada');
      
      return signal;
    } catch (deepseekError) {
      // Mejorar el logging con información detallada del error
      const errorMessage = deepseekError instanceof Error ? deepseekError.message : String(deepseekError);
      const isApiError = (deepseekError as any)?.isApiError || 
                         errorMessage.includes('API') || 
                         errorMessage.includes('deepseek-reasoner') || 
                         errorMessage.includes('timeout') ||
                         errorMessage.includes('rate limit') ||
                         errorMessage.includes('Json Output');
      
      logger.error({ 
        errorMessage,
        errorType: deepseekError instanceof Error ? deepseekError.constructor.name : typeof deepseekError,
        symbol,
        isApiError,
        hasOriginalError: !!(deepseekError as any)?.originalError,
        retries: (deepseekError as any)?.retries
      }, 'Error al obtener señal de DeepSeek AI');
      
      // Si hay error con la API de DeepSeek, proporcionar una señal basada en análisis técnico básico
      if (isApiError) {
        logger.warn({ 
          symbol,
          technicals: md.technicals ? 'present' : 'missing',
          galaxyScore
        }, 'DeepSeek error detectado, generando señal basada en análisis técnico básico');
        
        try {
          // Generar señal basada en indicadores técnicos básicos con mejor logging
          logger.debug({
            rsi: md.technicals?.rsi,
            ema_cross: md.technicals?.ema_cross,
            bband_percent: md.technicals?.bband_percent,
            galaxyScore
          }, 'Preparando indicadores para generar señal básica');
          
          const action = getBasicSignalFromTechnicals(md.technicals, galaxyScore);
          
          // Logging más detallado de los valores analizados
          logger.debug({
            symbol,
            technicals: {
              rsi: md.technicals?.rsi,
              ema_cross: md.technicals?.ema_cross,
              bband_percent: md.technicals?.bband_percent,
              volume_ratio: md.technicals?.volume_ratio
            },
            galaxyScore,
            generatedAction: action,
            price: md.price
          }, 'Análisis técnico básico generado');
          
          // Mejorar puntos de entrada/salida basados en datos técnicos
          // Accedemos a atr con seguridad usando notación de índice para evitar errores TypeScript
          const atr = md.technicals && 'atr' in md.technicals ? (md.technicals as any).atr : undefined;
          const volatilityFactor = atr ? atr / md.price : 0.01;
          const stopLossFactor = Math.max(0.985, 1 - (volatilityFactor * 1.5));
          const takeProfitFactor = Math.min(1.02, 1 + (volatilityFactor * 2));
          
          // Si tenemos acción clara, proporcionar detalles más precisos
          return {
            action: action,
            confidence: action !== 'HOLD' ? 0.7 : 0.5,
            reasoning: action === 'BUY' 
              ? `Señal de compra basada en indicadores técnicos básicos (RSI: ${md.technicals?.rsi?.toFixed(1) || 'N/A'}, EMA: ${md.technicals?.ema_cross || 'N/A'}) y sentiment score de ${galaxyScore}. Recomendable para posición a medio plazo.`
              : action === 'SELL'
              ? `Señal de venta basada en indicadores técnicos básicos (RSI: ${md.technicals?.rsi?.toFixed(1) || 'N/A'}, EMA: ${md.technicals?.ema_cross || 'N/A'}) y sentiment score de ${galaxyScore}. Considerar reducir exposición.`
              : `Análisis no concluyente con RSI: ${md.technicals?.rsi?.toFixed(1) || 'N/A'} y sentiment score de ${galaxyScore}. Mantener posiciones actuales y reevaluar después.`,
            entry: action === 'BUY' ? md.price * 0.999 : undefined,
            stopLoss: action === 'BUY' ? md.price * stopLossFactor : undefined,
            takeProfit: action === 'BUY' ? md.price * takeProfitFactor : undefined,
            multiStage: false, // Marcar como señal de fallback
            useTrailingStop: action === 'BUY' ? true : undefined,
            trailingStopPercent: action === 'BUY' ? 1.0 : undefined
          };
        } catch (analysisError) {
          logger.error({
            error: analysisError instanceof Error ? analysisError.message : String(analysisError),
            symbol,
            technicals: md.technicals ? Object.keys(md.technicals).join(',') : 'missing',
            galaxyScore
          }, 'Error generando análisis técnico básico');
          
          // En caso de error con el análisis básico, proporcionar una señal básica conservadora
          return {
            action: 'HOLD',
            confidence: 0.5,
            reasoning: `Análisis técnico no disponible. Manteniendo posiciones actuales con sentiment score de ${galaxyScore}.`,
            multiStage: false // Marcar como señal de fallback
          };
        }
      }
      
      // Para otros errores, intentar un último fallback antes de devolver null
      try {
        logger.warn({ symbol, errorType: 'no_api_error' }, 'Intentando fallback con señal conservadora');
        return {
          action: 'HOLD',
          confidence: 0.5,
          reasoning: `No se pudo analizar ${symbol} debido a un error no relacionado con la API. Recomendamos observar el mercado de forma manual antes de tomar decisiones.`,
          multiStage: false
        };
      } catch (fallbackError) {
        logger.error({ error: String(fallbackError) }, 'Error en fallback final');
        return null;
      }
    }
  } catch (error) {
    logger.error({ 
      errorMessage: error instanceof Error ? error.message : String(error),
      symbol 
    }, 'Error al obtener señal de trading');
    return null;
  }
}

/**
 * Genera un mensaje formateado para Telegram con la señal de trading
 * @param symbol Símbolo analizado
 * @param signal Señal de trading generada
 * @returns Mensaje formateado para Telegram
 */
/**
 * Escanea el mercado y genera señales de trading para múltiples monedas
 * @param maxCoins Número máximo de monedas a analizar
 * @param capital Capital disponible para la operación 
 * @returns Lista de símbolos con sus señales de trading, ordenadas por confianza
 */
export async function scanMultipleCoins(maxCoins: number = 10, capital: number = 1000): Promise<{symbol: string, signal: TradeSignal}[]> {
  try {
    logger.info({ maxCoins, capital }, 'Escaneando múltiples monedas para señales de trading');
    
    // 1. Obtener información de todos los pares USDT disponibles
    logger.debug('Obteniendo información del exchange de Binance');
    const exchangeInfoResponse = await binanceService.getRest().exchangeInfo();
    logger.debug({ 
      responseStatus: exchangeInfoResponse?.status, 
      hasHeaders: !!exchangeInfoResponse?.headers,
      hasBody: !!exchangeInfoResponse
    }, 'Respuesta de exchangeInfo obtenida');
    
    // Extraer la estructura correcta de la respuesta
    // La respuesta puede tener diferentes estructuras según la versión de la API
    let symbols: any[] = [];
    
    if (exchangeInfoResponse?.data?.symbols && Array.isArray(exchangeInfoResponse.data.symbols)) {
      // Estructura 1: respuesta.data.symbols
      symbols = exchangeInfoResponse.data.symbols;
      logger.debug('Usando estructura 1: respuesta.data.symbols');
    } else if (exchangeInfoResponse?.data && Array.isArray(exchangeInfoResponse.data)) {
      // Estructura 2: respuesta.data (array directo)
      symbols = exchangeInfoResponse.data;
      logger.debug('Usando estructura 2: respuesta.data (array)');
    } else if (exchangeInfoResponse?.symbols && Array.isArray(exchangeInfoResponse.symbols)) {
      // Estructura 3: respuesta.symbols
      symbols = exchangeInfoResponse.symbols;
      logger.debug('Usando estructura 3: respuesta.symbols');
    } else if (exchangeInfoResponse && Array.isArray(exchangeInfoResponse)) {
      // Estructura 4: respuesta (array directo)
      symbols = exchangeInfoResponse;
      logger.debug('Usando estructura 4: respuesta (array directo)');
    } else {
      // Intento final - buscar la propiedad symbols en la respuesta completa
      const responseStr = JSON.stringify(exchangeInfoResponse);
      try {
        const responseObj = JSON.parse(responseStr);
        if (responseObj?.symbols && Array.isArray(responseObj.symbols)) {
          symbols = responseObj.symbols;
          logger.debug('Usando estructura encontrada en parseado manual');
        } else {
          logger.error({ 
            responseStructure: responseStr.substring(0, 300) + '...'
          }, 'No se pudo encontrar array de símbolos en la respuesta');
          
          // Alternativa: usar pares populares directamente
          symbols = [
            {symbol: 'BTCUSDT', quoteAsset: 'USDT', status: 'TRADING'},
            {symbol: 'ETHUSDT', quoteAsset: 'USDT', status: 'TRADING'},
            {symbol: 'BNBUSDT', quoteAsset: 'USDT', status: 'TRADING'},
            {symbol: 'SOLUSDT', quoteAsset: 'USDT', status: 'TRADING'},
            {symbol: 'ADAUSDT', quoteAsset: 'USDT', status: 'TRADING'},
            {symbol: 'DOGEUSDT', quoteAsset: 'USDT', status: 'TRADING'}
          ];
          logger.info('Usando lista de símbolos populares predefinida como fallback');
        }
      } catch (parseError) {
        logger.error({ parseError }, 'Error al intentar parsear respuesta');
        
        // Usar al menos los símbolos más populares como fallback
        symbols = [
          {symbol: 'BTCUSDT', quoteAsset: 'USDT', status: 'TRADING'},
          {symbol: 'ETHUSDT', quoteAsset: 'USDT', status: 'TRADING'},
          {symbol: 'BNBUSDT', quoteAsset: 'USDT', status: 'TRADING'},
          {symbol: 'ADAUSDT', quoteAsset: 'USDT', status: 'TRADING'}
        ];
        logger.info('Usando lista mínima de símbolos predefinida como fallback');
      }
    }
    
    // 2. Filtrar solo pares USDT activos
    logger.debug({ symbolsCount: symbols.length }, 'Filtrando pares USDT activos');
    const usdtPairs = symbols
      .filter((s: any) => {
        const isValid = s && typeof s === 'object' && 
                       (s.quoteAsset === 'USDT' || 
                        (s.symbol && s.symbol.endsWith('USDT'))) && 
                       (s.status === 'TRADING' || !s.status);
        if (!isValid && s) {
          logger.trace({ symbol: s.symbol, quoteAsset: s.quoteAsset, status: s.status }, 'Par no válido filtrado');
        }
        return isValid;
      })
      .map((s: any) => s.symbol);
    
    logger.debug({ usdtPairsCount: usdtPairs.length }, 'Pares USDT filtrados');
    
    // 3. Seleccionar monedas populares primero y algunas aleatorias
    const popularCoins = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'XRPUSDT'];
    
    // 4. Obtener los populares que existan en la lista
    const popularPairs = popularCoins.filter(coin => usdtPairs.includes(coin));
    
    // 5. Añadir algunos aleatorios para completar hasta maxCoins
    const remainingCount = Math.min(maxCoins - popularPairs.length, 10);
    const otherPairs = usdtPairs
      .filter((pair: string) => !popularPairs.includes(pair))
      .sort(() => 0.5 - Math.random())
      .slice(0, remainingCount);
    
    const pairsToAnalyze = [...popularPairs, ...otherPairs];
    
    logger.info({ count: pairsToAnalyze.length, pairs: pairsToAnalyze }, 'Monedas seleccionadas para análisis');
    
    // 6. Para cada par, obtener ticker para filtrar por volumen
    logger.debug({ pairsCount: pairsToAnalyze.length }, 'Filtrando pares por volumen');
    const highVolumePairs = [];
    for (const pair of pairsToAnalyze) {
      try {
        logger.trace({ pair }, 'Obteniendo datos de ticker para filtrado de volumen');
        const ticker = await binanceService.getTicker24H(pair);
        
        if (!ticker) {
          logger.warn({ pair }, 'Ticker no disponible para par');
          continue;
        }
        
        const volume = parseFloat(ticker.quoteVolume || '0');
        if (isNaN(volume)) {
          logger.warn({ pair, quoteVolume: ticker.quoteVolume }, 'Volumen no numérico');
          continue;
        }
        
        if (volume > 5000000) { // Mínimo 5M USD de volumen
          logger.trace({ pair, volume }, 'Par con volumen suficiente agregado');
          highVolumePairs.push(pair);
        } else {
          logger.trace({ pair, volume }, 'Par con volumen insuficiente descartado');
        }
      } catch (error) {
        logger.warn({ 
          errorMessage: error instanceof Error ? error.message : String(error),
          pair 
        }, 'Error al obtener datos de ticker para filtrado de volumen');
      }
    }
    
    logger.info({ 
      highVolumePairsCount: highVolumePairs.length, 
      highVolumePairs 
    }, 'Pares con volumen alto identificados');
    
    // Verificar si tenemos pares para analizar
    if (highVolumePairs.length === 0) {
      logger.warn('No se encontraron pares con volumen suficiente para analizar');
      return [];
    }
    
    // 7. Generar señales para cada par con volumen alto
    logger.debug('Iniciando generación de señales individuales');
    const results: {symbol: string, signal: TradeSignal}[] = [];
    let processedCount = 0;
    
    for (const symbol of highVolumePairs) {
      try {
        logger.debug({ symbol, processedCount: ++processedCount }, 'Generando señal para moneda');
        const signal = await getTradeSignal(symbol, capital);
        
        if (signal) {
          logger.debug({ 
            symbol, 
            action: signal.action, 
            confidence: signal.confidence 
          }, 'Señal generada correctamente');
          results.push({ symbol, signal });
        } else {
          logger.warn({ symbol }, 'No se pudo generar señal válida');
        }
      } catch (error) {
        logger.error({ 
          errorMessage: error instanceof Error ? error.message : String(error),
          symbol 
        }, 'Error al generar señal para moneda en escaneo múltiple');
      }
    }
    
    logger.info({ resultsCount: results.length }, 'Señales generadas con éxito');
    
    // 8. Ordenar por confianza y acción (primero compras, luego ventas, luego hold)
    return results.sort((a, b) => {
      // Primero ordenar por acción (BUY > SELL > HOLD)
      if (a.signal.action !== b.signal.action) {
        if (a.signal.action === 'BUY') return -1;
        if (b.signal.action === 'BUY') return 1;
        if (a.signal.action === 'SELL') return -1;
        if (b.signal.action === 'SELL') return 1;
      }
      
      // Luego por confianza (de mayor a menor)
      return b.signal.confidence - a.signal.confidence;
    });
  } catch (error) {
    // Captura detallada del error
    logger.error({ 
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorStack: error instanceof Error ? error.stack : undefined,
      errorObject: JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
    }, 'Error en escaneo múltiple de monedas');
    return [];
  }
}

/**
 * Genera un mensaje formateado para Telegram con múltiples señales de trading
 * @param results Lista de símbolos con sus señales, ordenadas por relevancia
 * @returns Mensaje formateado para Telegram
 */
export function formatMultipleSignalsMessage(results: {symbol: string, signal: TradeSignal}[]): string {
  if (results.length === 0) {
    return '❌ <b>No se encontraron oportunidades de trading</b>\n\nIntenta más tarde o especifica un símbolo manualmente.';
  }
  
  // Contar señales por tipo
  const buySignals = results.filter(r => r.signal.action === 'BUY').length;
  const sellSignals = results.filter(r => r.signal.action === 'SELL').length;
  const holdSignals = results.filter(r => r.signal.action === 'HOLD').length;
  
  // Construir mensaje principal
  let message = `<b>🔍 ESCANEO COMPLETO DE MERCADO</b>\n\n`;
  message += `Analizadas: ${results.length} monedas\n`;
  message += `Señales: ${buySignals} 🟢 Compra | ${sellSignals} 🔴 Venta | ${holdSignals} ⚪ Mantener\n\n`;
  
  // Destacar las mejores oportunidades (COMPRAS y VENTAS)
  const actionableSignals = results.filter(r => r.signal.action !== 'HOLD');
  
  if (actionableSignals.length > 0) {
    message += `<b>🔝 MEJORES OPORTUNIDADES:</b>\n\n`;
    
    // Incluir hasta 5 mejores oportunidades con detalles
    actionableSignals.slice(0, 5).forEach((result, index) => {
      const { symbol, signal } = result;
      
      const actionEmoji = signal.action === 'BUY' ? '🟢 COMPRA' : '🔴 VENTA';
      const confidence = (signal.confidence * 100).toFixed(1);
      
      message += `<b>${index + 1}. ${symbol}</b>: ${actionEmoji} (${confidence}%)\n`;
      
      if (signal.entry) {
        message += `Entrada: $${signal.entry.toFixed(4)} `;
      }
      
      if (signal.stopLoss) {
        message += `SL: $${signal.stopLoss.toFixed(4)} `;
      }
      
      if (signal.takeProfit) {
        message += `TP: $${signal.takeProfit.toFixed(4)}`;
      }
      
      message += '\n\n';
    });
  } else {
    message += `<b>⚠️ No se encontraron oportunidades claras de trading</b>\n\n`;
  }
  
  // Añadir el resto de monedas analizadas como lista compacta
  if (results.length > 5) {
    message += `<b>Otras monedas analizadas:</b>\n`;
    
    results.slice(5).forEach(result => {
      const actionSymbol = result.signal.action === 'BUY' ? '🟢' : 
                           result.signal.action === 'SELL' ? '🔴' : '⚪';
      message += `${actionSymbol} ${result.symbol} (${(result.signal.confidence * 100).toFixed(1)}%)\n`;
    });
  }
  
  // Añadir nota final
  message += `\n<i>Generado por DeepSeek AI a las ${new Date().toLocaleTimeString()}</i>\n`;
  message += `<i>Para más detalles de una moneda usa /signal SÍMBOLO</i>`;
  
  return message;
}

export function formatSignalMessage(symbol: string, signal: TradeSignal): string {
  // Emoji según acción
  const actionEmoji = signal.action === 'BUY' ? '🟢 COMPRA' : 
                      signal.action === 'SELL' ? '🔴 VENTA' : 
                      '⚪ MANTENER';
  
  // Emoji según nivel de confianza
  let confidenceEmoji = '';
  if (signal.confidence > 0.8) confidenceEmoji = '⭐⭐⭐';
  else if (signal.confidence > 0.6) confidenceEmoji = '⭐⭐';
  else confidenceEmoji = '⭐';
  
  // Formar mensaje base
  let message = `
<b>📊 Señal de Trading: ${symbol}</b>

<b>Recomendación:</b> ${actionEmoji}
<b>Confianza:</b> ${(signal.confidence * 100).toFixed(1)}% ${confidenceEmoji}
`;

  // Añadir detalles si es BUY o SELL
  if (signal.action !== 'HOLD') {
    message += `
<b>📈 Detalles Operativos:</b>
${signal.entry ? `<b>Entrada:</b> $${signal.entry.toFixed(4)}` : ''}
${signal.stopLoss ? `<b>Stop Loss:</b> $${signal.stopLoss.toFixed(4)}` : ''}
${signal.takeProfit ? `<b>Take Profit:</b> $${signal.takeProfit.toFixed(4)}` : ''}
${signal.position_size ? `<b>Tamaño Posición:</b> $${signal.position_size.toFixed(2)}` : ''}
${signal.useTrailingStop ? `<b>Trailing Stop:</b> ${signal.trailingStopPercent?.toFixed(1) || 1.0}%` : ''}
`;
  }
  
  // Añadir razonamiento
  if (signal.reasoning) {
    message += `
<b>💬 Análisis:</b>
${signal.reasoning}
`;
  }
  
  // Añadir nota final
  message += `
<i>Generado por DeepSeek AI a las ${new Date().toLocaleTimeString()}</i>
<i>Esto es información educativa, no consejo financiero.</i>
`;
  
  return message;
}
