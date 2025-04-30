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
    useTrailingStop: zod_1.z.boolean().optional().nullable()
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
     * Analiza datos de mercado y genera una señal de trading
     * @param md Datos de mercado a analizar
     * @param capital Capital disponible para la operación
     * @param strategyType Tipo de estrategia a utilizar
     * @returns Señal de trading validada
     */
    decide(md_1) {
        return __awaiter(this, arguments, void 0, function* (md, capital = 1000, strategyType = 'medium') {
            // Construir el prompt adecuado basado en el tipo de estrategia
            const prompt = this.buildPrompt(md, capital, strategyType);
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
            case 'micro':
                return this.buildMicroCapitalPrompt(md, capital);
            case 'large':
                return this.buildLargeCapitalPrompt(md, capital);
            default:
                return this.buildMediumCapitalPrompt(md, capital);
        }
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
