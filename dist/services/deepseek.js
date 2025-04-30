"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepSeekService = exports.DeepSeekService = void 0;
const zod_1 = require("zod");
const deepseek_1 = require("@langchain/deepseek");
const logging_1 = require("../utils/logging");
const env_1 = require("../utils/env");
const p_queue_1 = __importDefault(require("p-queue"));
const feedback_store_1 = require("./feedback-store");
// Esquema de validación para señales de trading
const tradeSignalSchema = zod_1.z.object({
    action: zod_1.z.enum(['BUY', 'SELL', 'HOLD']),
    confidence: zod_1.z.number().min(0).max(1),
    entry: zod_1.z.number().optional().nullable(),
    stopLoss: zod_1.z.number().optional().nullable(),
    takeProfit: zod_1.z.number().optional().nullable(),
    position_size: zod_1.z.number().optional().nullable(),
    reasoning: zod_1.z.string().optional(),
    // Nuevos campos para trailing stop
    trailingStopPercent: zod_1.z.number().optional().nullable(),
    useTrailingStop: zod_1.z.boolean().optional().nullable(),
    // Aunque estos campos no vienen en la respuesta JSON, los añadiremos después
    // en el procesamiento, así que los declaramos aquí para TypeScript
    analysis: zod_1.z.string().optional(),
    multiStage: zod_1.z.boolean().optional()
}).transform(data => {
    const result = {
        action: data.action,
        confidence: data.confidence,
        entry: data.entry || undefined,
        stopLoss: data.stopLoss || undefined,
        takeProfit: data.takeProfit || undefined,
        position_size: data.position_size || undefined,
        reasoning: data.reasoning,
        // Transformación de campos nuevos
        trailingStopPercent: data.trailingStopPercent || undefined,
        useTrailingStop: data.useTrailingStop || undefined,
        // Campos para análisis detallado y proceso multi-etapa
        analysis: data.analysis,
        multiStage: data.multiStage
    };
    return result;
});
class DeepSeekService {
    constructor(apiKey) {
        // Inicializar DeepSeek con el modelo Reasoner y configuraciones óptimas
        this.llm = new deepseek_1.ChatDeepSeek({
            apiKey,
            model: 'deepseek-reasoner',
            modelKwargs: {
                // Parámetros para mejorar la salida JSON y el razonamiento
                temperature: 0.1, // Baja temperatura para respuestas más deterministas
                presence_penalty: 0,
                frequency_penalty: 0,
                response_format: { type: "json_object" } // Solicitar formato JSON explícito
            }
        });
        // Crear una cola para manejar el rate-limiting
        this.queue = new p_queue_1.default({
            concurrency: 1,
            intervalCap: 4, // 4 req/min como máximo
            interval: 60 * 1000
        });
        logging_1.logger.info('DeepSeek Reasoner service initialized with JSON response format');
    }
    /**
     * Método mejorado de decisión que usa un enfoque de dos etapas:
     * 1. Análisis técnico puro
     * 2. Decisión de trading basada en el análisis
     *
     * Esto mejora la calidad del razonamiento y reduce sesgos cognitivos
     */
    decideMultiStage(md_1) {
        return __awaiter(this, arguments, void 0, function* (md, capital = 1000, strategyType = 'medium') {
            try {
                // Asegurar que tenemos un símbolo para feedback
                const symbol = md.symbol || 'UNKNOWN';
                // ETAPA 1: Análisis técnico puro sin decisión de trading
                const analysisPrompt = this.buildAnalysisPrompt(md, symbol);
                const systemMessageAnalysis = {
                    role: 'system',
                    content: `Eres un analista técnico experto en criptomonedas. Tu tarea es SOLO analizar 
        los datos proporcionados y explicar la situación actual del mercado. NO hagas recomendaciones 
        de trading. Proporciona un análisis detallado de los indicadores técnicos, patrones de precio, 
        niveles de soporte/resistencia y sentimiento. Concluye con una evaluación de la dirección 
        probable del mercado a corto plazo.`
                };
                const userMessageAnalysis = { role: 'user', content: analysisPrompt };
                // Primera llamada a la API: solo análisis
                const analysisResponse = yield this.queue.add(() => __awaiter(this, void 0, void 0, function* () {
                    logging_1.logger.debug('Ejecutando primera etapa (análisis) de DeepSeek');
                    return this.llm.invoke([systemMessageAnalysis, userMessageAnalysis]);
                }));
                if (!analysisResponse) {
                    throw new Error('No response from DeepSeek API during analysis phase');
                }
                const analysis = typeof analysisResponse.content === 'string'
                    ? analysisResponse.content
                    : JSON.stringify(analysisResponse.content);
                logging_1.logger.debug({
                    analysisLength: analysis.length,
                    analysisExcerpt: analysis.substring(0, 100) + '...'
                }, 'Análisis técnico recibido');
                // ETAPA 2: Decisión de trading basada en el análisis previo
                const decisionPrompt = this.buildDecisionPrompt(md, capital, strategyType, analysis, symbol);
                const systemMessageDecision = {
                    role: 'system',
                    content: `Eres un experto en trading algorítmico de criptomonedas que proporciona recomendaciones
        precisas. Basándote en el análisis técnico proporcionado y los datos de mercado, genera una 
        señal de trading con alta confianza. Tu respuesta final debe ser un objeto JSON válido con:
        - action: "BUY", "SELL", o "HOLD"
        - confidence: número entre 0.0 y 1.0
        - entry: precio recomendado de entrada (si aplica)
        - stopLoss: precio de stop loss (si aplica)
        - takeProfit: precio de take profit (si aplica)
        - position_size: tamaño recomendado de posición en USD (si aplica)
        - reasoning: breve explicación de 1-2 oraciones de tu decisión
        - useTrailingStop: boolean indicando si se recomienda trailing stop
        - trailingStopPercent: porcentaje para trailing stop (si aplica)`
                };
                const userMessageDecision = { role: 'user', content: decisionPrompt };
                // Segunda llamada a la API: decisión basada en el análisis
                const decisionResponse = yield this.queue.add(() => __awaiter(this, void 0, void 0, function* () {
                    logging_1.logger.debug('Ejecutando segunda etapa (decisión) de DeepSeek');
                    return this.llm.invoke([systemMessageDecision, userMessageDecision]);
                }));
                if (!decisionResponse) {
                    throw new Error('No response from DeepSeek API during decision phase');
                }
                // Procesar respuesta
                let content = '';
                if (decisionResponse) {
                    if (typeof decisionResponse.content === 'string') {
                        content = decisionResponse.content.trim();
                    }
                    else if (decisionResponse.content) {
                        content = JSON.stringify(decisionResponse.content);
                    }
                    else {
                        logging_1.logger.warn('Empty response from DeepSeek API, using default HOLD signal');
                        return { action: 'HOLD', confidence: 0 };
                    }
                }
                else {
                    logging_1.logger.warn('Null response from DeepSeek API, using default HOLD signal');
                    return { action: 'HOLD', confidence: 0 };
                }
                // Limpiar formato markdown si existe
                if (content.includes('```json') || content.includes('```')) {
                    content = content.replace(/```json\s*/g, '')
                        .replace(/```\s*/g, '')
                        .trim();
                }
                // Parsear y validar con Zod
                const parsedContent = JSON.parse(content);
                const validSignal = tradeSignalSchema.parse(parsedContent);
                // Guardar el análisis completo para referencia futura
                validSignal.analysis = analysis;
                validSignal.multiStage = true;
                // Loguear la señal validada
                logging_1.logger.info({
                    action: validSignal.action,
                    confidence: validSignal.confidence,
                    multiStage: true,
                    capital
                }, 'Generated multi-stage trade signal');
                return validSignal;
            }
            catch (error) {
                // Manejo de errores similar al método decide() original
                if (error instanceof zod_1.z.ZodError) {
                    logging_1.logger.error({
                        zodErrors: error.errors,
                        capital,
                        strategyType
                    }, 'Validation error in DeepSeek multi-stage response');
                }
                else {
                    logging_1.logger.error({
                        error: error instanceof Error ? error.message : String(error),
                        capital,
                        strategyType
                    }, 'Error in multi-stage decision process');
                }
                return { action: 'HOLD', confidence: 0 };
            }
        });
    }
    /**
     * Método auxiliar para construir prompt de análisis
     */
    buildAnalysisPrompt(md, symbol) {
        var _a, _b, _c, _d;
        const tech = md.technicals || {};
        // Obtener estadísticas pasadas para este símbolo si existen
        let feedbackSection = '';
        const symbolStats = feedback_store_1.feedbackStore.getSuccessRateForSymbol(symbol);
        if (symbolStats.totalTrades > 0) {
            feedbackSection = `
ESTADÍSTICAS HISTÓRICAS:
- Operaciones totales: ${symbolStats.totalTrades}
- Tasa de éxito: ${(symbolStats.successRate * 100).toFixed(1)}%
- Tasa de ganancia: ${(symbolStats.winRate * 100).toFixed(1)}%
- Ganancia promedio: ${symbolStats.avgProfit.toFixed(2)}%
- Duración promedio: ${symbolStats.avgHoldDuration ?
                `${Math.round(symbolStats.avgHoldDuration)} minutos` : 'N/A'}
`;
        }
        return `
ANÁLISIS TÉCNICO SOLICITADO

SÍMBOLO: ${symbol}

DATOS DE MERCADO:
- Precio actual: ${md.price}
- Volumen 24h: ${md.volume24h}
- Sentimiento social (Galaxy Score): ${md.sentiment}/100
- RSI(14): ${tech.rsi || 'N/A'}
- Tendencia EMA: ${tech.ema_cross || 'N/A'}
- Volumen actual vs promedio: ${((_a = tech.volume_ratio) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || 'N/A'}
- Posición en Bollinger Bands: ${((_b = tech.bband_percent) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || 'N/A'}
- Soportes cercanos: ${((_c = tech.supports) === null || _c === void 0 ? void 0 : _c.join(', ')) || 'N/A'}
- Resistencias cercanas: ${((_d = tech.resistances) === null || _d === void 0 ? void 0 : _d.join(', ')) || 'N/A'}
- ATR (Volatilidad): ${tech.atr || 'N/A'}
${feedbackSection}

ENFOQUE DEL ANÁLISIS:
1. Evalúa la tendencia actual (alcista, bajista, lateral)
2. Analiza la fuerza del momentum
3. Identifica niveles clave de soporte/resistencia
4. Evalúa la divergencia entre precio e indicadores
5. Considera el sentimiento del mercado
6. Evalúa la volatilidad actual y sus implicaciones

Proporciona un análisis detallado de la situación técnica actual.`;
    }
    /**
     * Método auxiliar para construir prompt de decisión
     */
    buildDecisionPrompt(md, capital, strategyType, analysis, symbol) {
        let feedbackSection = '';
        const recentFeedback = feedback_store_1.feedbackStore.getRelevantFeedback(symbol, 'BUY');
        if (recentFeedback.length > 0) {
            feedbackSection = `\nRESULTADOS RECIENTES:`;
            recentFeedback.forEach(entry => {
                var _a;
                feedbackSection += `\n- ${entry.result.action} a $${entry.result.entryPrice.toFixed(2)}: ${entry.successful ? 'ÉXITO' : 'FRACASO'} (${(_a = entry.result.profitPercentage) === null || _a === void 0 ? void 0 : _a.toFixed(2)}%, ${entry.result.holdDuration ? `duración: ${entry.result.holdDuration} min` : 'sin datos de duración'})`;
            });
        }
        return `
SOLICITUD DE DECISIÓN DE TRADING

SÍMBOLO: ${symbol}
CAPITAL DISPONIBLE: $${capital.toFixed(2)} USD

ANÁLISIS TÉCNICO PREVIO:
${analysis}

DATOS DE MERCADO ADICIONALES:
- Precio actual: ${md.price}
- Volumen 24h: ${md.volume24h}
- Sentimiento: ${md.sentiment}/100

ESTRATEGIA: ${strategyType.toUpperCase()}

${this.getStrategyParameters(strategyType, capital)}
${feedbackSection}

Basándote en el análisis previo y estos datos adicionales, proporciona una señal de trading 
con los siguientes campos en formato JSON:
- action: "BUY", "SELL", o "HOLD"
- confidence: nivel de confianza (0.0 a 1.0)
- entry: precio recomendado de entrada
- stopLoss: nivel de stop loss
- takeProfit: nivel principal de take profit
- position_size: tamaño óptimo de posición según el capital
- useTrailingStop: true/false
- trailingStopPercent: porcentaje para trailing stop
- reasoning: explicación breve de la decisión`;
    }
    /**
     * Método auxiliar para obtener parámetros según tipo de estrategia
     */
    getStrategyParameters(strategyType, capital) {
        switch (strategyType) {
            case 'growth':
                return `PARÁMETROS DE CRECIMIENTO:
- Take Profit: Entre 2.0% y 4.5% (considera escalonamiento)
- Stop Loss: Entre 1.2% y 1.8% (según volatilidad)
- Ratio R/R objetivo: Mínimo 1:2
- Confianza mínima aceptable: 0.8
- Tamaño de posición: Hasta 40% del capital (${(capital * 0.4).toFixed(2)} USD)`;
            case 'micro':
                return `PARÁMETROS MICRO-CAPITAL:
- Prioriza preservación de capital
- Señales de muy alta confianza (>0.85)
- Tamaño máximo: 20% del capital (${(capital * 0.2).toFixed(2)} USD)
- Stop loss máximo: 1.2% del precio actual
- Take profit mínimo: 1.5% del precio actual`;
            case 'large':
                return `PARÁMETROS CAPITAL GRANDE:
- Enfoque en preservación de capital
- Diversificación máxima
- Confianza mínima: 0.9
- Exposición máxima por posición: 5-10% del capital`;
            default:
                return `PARÁMETROS ESTÁNDAR:
- Balance entre preservación y crecimiento
- Confianza mínima: 0.75
- Stop loss: 1.5-2.0%
- Take profit: 2.0-3.0%`;
        }
    }
    /**
     * Analiza datos de mercado y genera una señal de trading
     *
     * Versión original de un solo paso, mantenida para compatibilidad.
     * Para mejor calidad de decisiones, usar decideMultiStage()
     *
     * @param md Datos de mercado a analizar
     * @param capital Capital disponible para la operación
     * @param strategyType Tipo de estrategia a utilizar
     * @returns Señal de trading validada
     */
    decide(md_1) {
        return __awaiter(this, arguments, void 0, function* (md, capital = 1000, strategyType = 'medium') {
            const symbol = md.symbol || 'UNKNOWN';
            // Obtener feedback histórico para este símbolo si existe
            let feedbackSection = '';
            const symbolStats = feedback_store_1.feedbackStore.getSuccessRateForSymbol(symbol);
            const recentFeedback = feedback_store_1.feedbackStore.getRelevantFeedback(symbol, 'BUY');
            // Añadir estadísticas de feedback al prompt
            let prompt = this.buildPrompt(md, capital, strategyType);
            if (symbolStats.totalTrades > 0) {
                prompt += `\n\nESTADÍSTICAS HISTÓRICAS:
- Operaciones totales: ${symbolStats.totalTrades}
- Tasa de éxito: ${(symbolStats.successRate * 100).toFixed(1)}%
- Tasa de ganancia: ${(symbolStats.winRate * 100).toFixed(1)}%
- Ganancia promedio: ${symbolStats.avgProfit.toFixed(2)}%`;
            }
            if (recentFeedback.length > 0) {
                prompt += `\n\nRESULTADOS RECIENTES:`;
                recentFeedback.forEach(entry => {
                    var _a;
                    prompt += `\n- ${entry.result.action} a $${entry.result.entryPrice.toFixed(2)}: ${entry.successful ? 'ÉXITO' : 'FRACASO'} (${(_a = entry.result.profitPercentage) === null || _a === void 0 ? void 0 : _a.toFixed(2)}%)`;
                });
            }
            try {
                // Definir función para realizar la llamada a la API
                const callDeepSeek = () => __awaiter(this, void 0, void 0, function* () {
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
                        const response = yield this.llm.invoke([systemMessage, userMessage]);
                        // Registrar el tiempo de respuesta
                        const duration = Date.now() - startTime;
                        logging_1.logger.debug({ duration: `${duration}ms` }, 'DeepSeek API response time');
                        return response;
                    }
                    catch (error) {
                        logging_1.logger.error({
                            errorMessage: error instanceof Error ? error.message : String(error),
                            errorName: error instanceof Error ? error.name : 'Unknown',
                            prompt: prompt.substring(0, 100) + '...'
                        }, 'Error calling DeepSeek API');
                        return null;
                    }
                });
                // Encolar la solicitud
                const result = yield this.queue.add(callDeepSeek);
                // Si no hay resultado, lanzar error
                if (!result) {
                    throw new Error('No response from DeepSeek API');
                }
                // Extraer y procesar la respuesta
                let content = '';
                if (result) {
                    // Verificar si hay contenido adicional de razonamiento en cualquier propiedad personalizada
                    // Usamos type assertion para acceder a propiedades potencialmente no definidas
                    const anyResult = result;
                    if (anyResult.reasoning_content || anyResult.reasoning) {
                        const reasoning = anyResult.reasoning_content || anyResult.reasoning;
                        logging_1.logger.debug({
                            reasoning: typeof reasoning === 'string' ?
                                reasoning.substring(0, 300) + '...' :
                                'Non-string reasoning received'
                        }, 'DeepSeek reasoning content found');
                    }
                    // Extraer el contenido principal
                    if (typeof result.content === 'string') {
                        content = result.content.trim();
                    }
                    else if (result.content) {
                        content = JSON.stringify(result.content);
                    }
                    else {
                        // No hay contenido válido, usar plantilla de HOLD
                        logging_1.logger.warn('Empty response from DeepSeek API, using default HOLD signal');
                        return { action: 'HOLD', confidence: 0 };
                    }
                }
                else {
                    logging_1.logger.warn('Null response from DeepSeek API, using default HOLD signal');
                    return { action: 'HOLD', confidence: 0 };
                }
                // Limpiar cualquier formato markdown que pueda estar presente
                if (content.includes('```json') || content.includes('```')) {
                    content = content.replace(/```json\s*/g, '')
                        .replace(/```\s*/g, '')
                        .trim();
                }
                // Loguear la respuesta sin procesar para depuración
                logging_1.logger.debug({ rawContent: content.substring(0, 200) }, 'Raw DeepSeek response');
                // Parsear el contenido como JSON
                const parsedContent = JSON.parse(content);
                // Validar el contenido con Zod
                const validSignal = tradeSignalSchema.parse(parsedContent);
                // Loguear la señal validada
                logging_1.logger.info({
                    action: validSignal.action,
                    confidence: validSignal.confidence,
                    capital
                }, 'Generated trade signal');
                return validSignal;
            }
            catch (error) {
                // Loguear errores detallados
                if (error instanceof zod_1.z.ZodError) {
                    logging_1.logger.error({
                        zodErrors: error.errors,
                        capital,
                        strategyType
                    }, 'Validation error in DeepSeek response');
                }
                else {
                    logging_1.logger.error({
                        error: error instanceof Error ? error.message : String(error),
                        capital,
                        strategyType
                    }, 'Error processing DeepSeek response');
                }
                // En caso de error, devolver señal segura (HOLD)
                return { action: 'HOLD', confidence: 0 };
            }
        });
    }
    /**
     * Construye un prompt adecuado según el tipo de estrategia
     */
    buildPrompt(md, capital, strategyType) {
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
    buildGrowthOptimizedPrompt(md, capital) {
        var _a, _b, _c, _d;
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
  - Volumen actual vs promedio: ${((_a = tech.volume_ratio) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || 'N/A'}
  - Posición en Bollinger Bands: ${((_b = tech.bband_percent) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || 'N/A'}
  - Soportes cercanos: ${((_c = tech.supports) === null || _c === void 0 ? void 0 : _c.join(', ')) || 'N/A'}
  - Resistencias cercanas: ${((_d = tech.resistances) === null || _d === void 0 ? void 0 : _d.join(', ')) || 'N/A'}

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
    buildMicroCapitalPrompt(md, capital) {
        var _a, _b, _c, _d;
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
  - Volumen actual vs promedio: ${((_a = tech.volume_ratio) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || 'N/A'}
  - Posición en Bollinger Bands: ${((_b = tech.bband_percent) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || 'N/A'}
  - Soportes cercanos: ${((_c = tech.supports) === null || _c === void 0 ? void 0 : _c.join(', ')) || 'N/A'}
  - Resistencias cercanas: ${((_d = tech.resistances) === null || _d === void 0 ? void 0 : _d.join(', ')) || 'N/A'}

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
    buildMediumCapitalPrompt(md, capital) {
        var _a;
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
  - Ratio de volumen: ${((_a = tech.volume_ratio) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || 'N/A'}

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
    buildLargeCapitalPrompt(md, capital) {
        var _a, _b;
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
  - Ratio de volumen: ${((_a = tech.volume_ratio) === null || _a === void 0 ? void 0 : _a.toFixed(2)) || 'N/A'}
  - Bollinger %B: ${((_b = tech.bband_percent) === null || _b === void 0 ? void 0 : _b.toFixed(2)) || 'N/A'}

Responde con un objeto JSON que incluya acción recomendada (BUY/SELL/HOLD), nivel de confianza,
precios de entrada/salida, tamaño de posición y razonamiento.`;
    }
}
exports.DeepSeekService = DeepSeekService;
// Crear instancia singleton para uso en toda la aplicación
exports.deepSeekService = new DeepSeekService(env_1.env.DEEPSEEK_API_KEY);
