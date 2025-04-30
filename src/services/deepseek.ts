import { z } from 'zod';
import { ChatDeepSeek } from '@langchain/deepseek';
import { logger } from '../utils/logging';
import { env } from '../utils/env';
import PQueue from 'p-queue';

// Interfaz básica para datos de mercado
export interface MarketData {
  price: number;
  volume24h: number;
  sentiment: number;
  technicals?: {
    rsi?: number;
    ema_cross?: string;
    volume_ratio?: number;
    bband_percent?: number;
    supports?: number[];
    resistances?: number[];
  };
}

// Interfaz para señales de trading
export interface TradeSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  position_size?: number;
  reasoning?: string;
  // Nuevos campos para trailing stop
  trailingStopPercent?: number;
  useTrailingStop?: boolean;
}

// Esquema de validación para señales de trading
const tradeSignalSchema = z.object({
  action: z.enum(['BUY', 'SELL', 'HOLD']),
  confidence: z.number().min(0).max(1),
  entry: z.number().optional().nullable(),
  stopLoss: z.number().optional().nullable(),
  takeProfit: z.number().optional().nullable(),
  position_size: z.number().optional().nullable(),
  reasoning: z.string().optional(),
  // Nuevos campos para trailing stop
  trailingStopPercent: z.number().optional().nullable(),
  useTrailingStop: z.boolean().optional().nullable()
}).transform(data => ({
  action: data.action,
  confidence: data.confidence,
  entry: data.entry || undefined,
  stopLoss: data.stopLoss || undefined,
  takeProfit: data.takeProfit || undefined,
  position_size: data.position_size || undefined,
  reasoning: data.reasoning,
  // Transformación de campos nuevos
  trailingStopPercent: data.trailingStopPercent || undefined,
  useTrailingStop: data.useTrailingStop || undefined
}));

export class DeepSeekService {
  private llm: ChatDeepSeek;
  private queue: PQueue;
  
  constructor(apiKey: string) {
    // Inicializar DeepSeek con el modelo Reasoner y configuraciones óptimas
    this.llm = new ChatDeepSeek({ 
      apiKey, 
      model: 'deepseek-reasoner',
      modelKwargs: {
        // Parámetros para mejorar la salida JSON y el razonamiento
        temperature: 0.1,  // Baja temperatura para respuestas más deterministas
        presence_penalty: 0,
        frequency_penalty: 0,
        response_format: { type: "json_object" } // Solicitar formato JSON explícito
      }
    });
    
    // Crear una cola para manejar el rate-limiting
    this.queue = new PQueue({
      concurrency: 1,
      intervalCap: 4,   // 4 req/min como máximo
      interval: 60 * 1000
    });
    
    logger.info('DeepSeek Reasoner service initialized with JSON response format');
  }
  
  /**
   * Analiza datos de mercado y genera una señal de trading
   * @param md Datos de mercado a analizar
   * @param capital Capital disponible para la operación
   * @param strategyType Tipo de estrategia a utilizar
   * @returns Señal de trading validada
   */
  async decide(
    md: MarketData, 
    capital: number = 1000, 
    strategyType: 'micro' | 'medium' | 'large' | 'growth' = 'medium'
  ): Promise<TradeSignal> {
    // Construir el prompt adecuado basado en el tipo de estrategia
    const prompt = this.buildPrompt(md, capital, strategyType);
    
    try {
      // Definir función para realizar la llamada a la API
      const callDeepSeek = async () => {
        const startTime = Date.now();
        
        // Sistema mejorado con instrucciones específicas para trabajar con DeepSeek Reasoner
        const systemMessage = { 
          role: 'system', 
          content: `You are an expert crypto trading assistant that provides well-reasoned analysis.
          You should:
          1. Think through the problem step by step using the reasoning_content field
          2. Consider all available market data and technical indicators
          3. Always provide your final answer as valid JSON with these fields:
             - action: "BUY", "SELL", or "HOLD"
             - confidence: number between 0.0 and 1.0
             - entry: recommended entry price (if applicable)
             - stopLoss: stop loss price (if applicable)
             - takeProfit: take profit price (if applicable)
             - position_size: recommended position size in USD (if applicable)
             - reasoning: brief 1-2 sentence summary of your decision
             - useTrailingStop: boolean indicating if a trailing stop is recommended
             - trailingStopPercent: percentage for trailing stop (if applicable)
          
          Your reasoning should show how you arrived at the recommendation, but keep your final response in perfect JSON format.` 
        };
        
        const userMessage = { role: 'user', content: prompt };
        
        try {
          // Invocar a DeepSeek (sin opciones extra no soportadas por el tipo)
          const response = await this.llm.invoke([systemMessage, userMessage]);
          
          // Registrar el tiempo de respuesta
          const duration = Date.now() - startTime;
          logger.debug({ duration: `${duration}ms` }, 'DeepSeek API response time');
          
          return response;
        } catch (error) {
          logger.error({ 
            errorMessage: error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.name : 'Unknown',
            prompt: prompt.substring(0, 100) + '...'
          }, 'Error calling DeepSeek API');
          return null;
        }
      };
      
      // Encolar la solicitud
      const result = await this.queue.add(callDeepSeek);
      
      // Si no hay resultado, lanzar error
      if (!result) {
        throw new Error('No response from DeepSeek API');
      }
      
      // Extraer y procesar la respuesta
      let content = '';
      
      if (result) {
        // Verificar si hay contenido adicional de razonamiento en cualquier propiedad personalizada
        // Usamos type assertion para acceder a propiedades potencialmente no definidas
        const anyResult = result as any;
        if (anyResult.reasoning_content || anyResult.reasoning) {
          const reasoning = anyResult.reasoning_content || anyResult.reasoning;
          logger.debug({ 
            reasoning: typeof reasoning === 'string' ? 
              reasoning.substring(0, 300) + '...' : 
              'Non-string reasoning received'
          }, 'DeepSeek reasoning content found');
        }
        
        // Extraer el contenido principal
        if (typeof result.content === 'string') {
          content = result.content.trim();
        } else if (result.content) {
          content = JSON.stringify(result.content);
        } else {
          // No hay contenido válido, usar plantilla de HOLD
          logger.warn('Empty response from DeepSeek API, using default HOLD signal');
          return { action: 'HOLD', confidence: 0 };
        }
      } else {
        logger.warn('Null response from DeepSeek API, using default HOLD signal');
        return { action: 'HOLD', confidence: 0 };
      }
      
      // Limpiar cualquier formato markdown que pueda estar presente
      if (content.includes('```json') || content.includes('```')) {
        content = content.replace(/```json\s*/g, '')
                         .replace(/```\s*/g, '')
                         .trim();
      }
      
      // Loguear la respuesta sin procesar para depuración
      logger.debug({ rawContent: content.substring(0, 200) }, 'Raw DeepSeek response');
      
      // Parsear el contenido como JSON
      const parsedContent = JSON.parse(content);
      
      // Validar el contenido con Zod
      const validSignal = tradeSignalSchema.parse(parsedContent);
      
      // Loguear la señal validada
      logger.info({
        action: validSignal.action,
        confidence: validSignal.confidence,
        capital
      }, 'Generated trade signal');
      
      return validSignal;
    } catch (error) {
      // Loguear errores detallados
      if (error instanceof z.ZodError) {
        logger.error({ 
          zodErrors: error.errors,
          capital,
          strategyType
        }, 'Validation error in DeepSeek response');
      } else {
        logger.error({ 
          error: error instanceof Error ? error.message : String(error),
          capital,
          strategyType
        }, 'Error processing DeepSeek response');
      }
      
      // En caso de error, devolver señal segura (HOLD)
      return { action: 'HOLD', confidence: 0 };
    }
  }
  
  /**
   * Construye un prompt adecuado según el tipo de estrategia
   */
  private buildPrompt(md: MarketData, capital: number, strategyType: 'micro' | 'medium' | 'large' | 'growth'): string {
    switch (strategyType) {
      case 'growth':
        return this.buildGrowthOptimizedPrompt(md, capital);
      case 'micro':
        return this.buildMicroCapitalPrompt(md, capital);
      case 'large':
        return this.buildLargeCapitalPrompt(md, capital);
      default:
        return this.buildMediumCapitalPrompt(md, capital);
    }
  }
  
  /**
   * Prompt especializado para crecimiento de capital (<$200)
   * Optimizado para maximizar crecimiento en lugar de preservación
   */
  private buildGrowthOptimizedPrompt(md: MarketData, capital: number): string {
    const tech = md.technicals || {};
    
    return `
Eres un experto en trading algorítmico de criptomonedas especializado en crecimiento acelerado de capital.

CONTEXTO:
- Capital total disponible: $${capital.toFixed(2)} USD (OBJETIVO: MAXIMIZAR CRECIMIENTO)
- Datos de mercado para análisis:
  - Precio actual: ${md.price}
  - Volumen 24h: ${md.volume24h}
  - Sentimiento social (Galaxy Score): ${md.sentiment}/100
  - RSI(14): ${tech.rsi || 'N/A'}
  - Tendencia EMA: ${tech.ema_cross || 'N/A'}
  - Volumen actual vs promedio: ${tech.volume_ratio?.toFixed(2) || 'N/A'}
  - Posición en Bollinger Bands: ${tech.bband_percent?.toFixed(2) || 'N/A'}
  - Soportes cercanos: ${tech.supports?.join(', ') || 'N/A'}
  - Resistencias cercanas: ${tech.resistances?.join(', ') || 'N/A'}

INSTRUCCIONES (ENFOQUE EN CRECIMIENTO):
1. Analiza oportunidades de alto potencial de retorno
2. Busca configuraciones técnicas con asimetría positiva (mayor recompensa que riesgo)
3. PRIORIZA OPORTUNIDADES DE ALTO RETORNO SOBRE PRESERVACIÓN (ser más agresivo)
4. Identifica puntos de entrada óptimos donde exista momentum y soporte técnico
5. Recomienda take profits escalonados y trailing stops para maximizar ganancias

PARÁMETROS AJUSTADOS PARA CRECIMIENTO:
- Take Profit: Entre 2.0% y 4.5% (puedes sugerir escalonamiento)
- Stop Loss: Entre 1.2% y 1.8% (según volatilidad)
- Ratio R/R objetivo: Mínimo 1:2
- Confianza mínima aceptable: 0.8 (más permisivo que el estándar 0.85)
- Tamaño de posición: Hasta 40% del capital en operaciones de alta confianza

FASES DE CRECIMIENTO:
1. FASE INICIAL (${capital < 100 ? 'ACTUAL - ' : ''}54-100 USD):
   - Prioriza oportunidades con potencial de retorno >2.0%
   - Activos preferidos: Alta volatilidad con soporte técnico claro
   - Take profits escalonados

2. META SIGUIENTE (${capital >= 100 && capital < 200 ? 'ACTUAL - ' : ''}100-200 USD):
   - Mayor diversificación
   - Mayor uso de trailing stops

Devuelve un objeto JSON con:
- action: "BUY", "SELL" o "HOLD"
- confidence: nivel de confianza (0.0 a 1.0)
- entry: precio recomendado de entrada
- stopLoss: nivel de stop loss
- takeProfit: nivel principal de take profit
- position_size: tamaño óptimo de posición según potencial de retorno
- useTrailingStop: true/false (recomendado true para crecimiento)
- trailingStopPercent: porcentaje para trailing stop (1.0-2.5%)
- reasoning: explicación del análisis y expectativa de retorno`;
  }
  
  /**
   * Prompt especializado para micro-capital (<$100)
   */
  private buildMicroCapitalPrompt(md: MarketData, capital: number): string {
    const maxRiskAmount = capital * 0.005; // 0.5% máximo riesgo
    const tech = md.technicals || {};
    
    return `
Eres un experto en micro-trading de criptomonedas con capital muy limitado.

CONTEXTO:
- Capital total disponible: $${capital.toFixed(2)}
- Riesgo máximo por operación: $${maxRiskAmount.toFixed(2)} (0.5% del capital)
- Datos de mercado para análisis:
  - Precio actual: ${md.price}
  - Volumen 24h: ${md.volume24h}
  - Sentimiento social (Galaxy Score): ${md.sentiment}/100
  - RSI(14): ${tech.rsi || 'N/A'}
  - Tendencia EMA: ${tech.ema_cross || 'N/A'}
  - Volumen actual vs promedio: ${tech.volume_ratio?.toFixed(2) || 'N/A'}
  - Posición en Bollinger Bands: ${tech.bband_percent?.toFixed(2) || 'N/A'}
  - Soportes cercanos: ${tech.supports?.join(', ') || 'N/A'}
  - Resistencias cercanas: ${tech.resistances?.join(', ') || 'N/A'}

RESTRICCIONES CRÍTICAS:
1. Prioriza PRESERVACIÓN DE CAPITAL - extremadamente conservador
2. Solo señales de muy alta confianza (>0.85)
3. Tamaño de posición máximo: 20% del capital ($${(capital * 0.2).toFixed(2)})
4. Ratio riesgo/recompensa mínimo: 1:1.5
5. Stop loss máximo: 1.2% del precio actual
6. Take profit mínimo: 1.5% del precio actual

INSTRUCCIONES:
Analiza los datos y proporciona una señal de trading precisa.
Si no encuentras una oportunidad clara con alta probabilidad, devuelve HOLD.

Devuelve un objeto JSON con los siguientes campos:
- action: "BUY" | "SELL" | "HOLD"
- confidence: número entre 0.0 y 1.0
- entry: precio objetivo de entrada
- stopLoss: precio para stop loss
- takeProfit: precio objetivo de salida
- position_size: tamaño de posición recomendado en USD
- reasoning: explicación breve de 1-2 frases`;
  }
  
  /**
   * Prompt para capital medio ($100-$10,000)
   */
  private buildMediumCapitalPrompt(md: MarketData, capital: number): string {
    const tech = md.technicals || {};
    
    return `
Eres un experto en trading algorítmico de criptomonedas. Analiza estos datos de mercado y genera una señal de trading.

CONTEXTO:
- Capital disponible: $${capital.toFixed(2)}
- Datos de mercado:
  - Precio: ${md.price}
  - Volumen 24h: ${md.volume24h}
  - Sentimiento (Galaxy Score): ${md.sentiment}/100
  - RSI(14): ${tech.rsi || 'N/A'}
  - EMA Cross: ${tech.ema_cross || 'N/A'}
  - Ratio de volumen: ${tech.volume_ratio?.toFixed(2) || 'N/A'}

Responde con un objeto JSON que incluya:
- action: "BUY", "SELL" o "HOLD"
- confidence: un valor entre 0.0 y 1.0
- entry, stopLoss, takeProfit: precios recomendados
- position_size: tamaño de posición recomendado en USD
- reasoning: una breve explicación`;
  }
  
  /**
   * Prompt para capital grande (>$10,000)
   */
  private buildLargeCapitalPrompt(md: MarketData, capital: number): string {
    const tech = md.technicals || {};
    
    return `
Eres un gestor profesional de fondos de inversión en criptomonedas. Analiza estos datos y genera una decisión de trading.

CONTEXTO:
- Capital disponible: $${capital.toFixed(2)}
- Datos de mercado:
  - Precio: ${md.price}
  - Volumen 24h: ${md.volume24h}
  - Sentimiento (Galaxy Score): ${md.sentiment}/100
  - Indicadores técnicos: RSI=${tech.rsi || 'N/A'}, EMA=${tech.ema_cross || 'N/A'}
  - Ratio de volumen: ${tech.volume_ratio?.toFixed(2) || 'N/A'}
  - Bollinger %B: ${tech.bband_percent?.toFixed(2) || 'N/A'}

Responde con un objeto JSON que incluya acción recomendada (BUY/SELL/HOLD), nivel de confianza,
precios de entrada/salida, tamaño de posición y razonamiento.`;
  }
}

// Crear instancia singleton para uso en toda la aplicación
export const deepSeekService = new DeepSeekService(env.DEEPSEEK_API_KEY);
