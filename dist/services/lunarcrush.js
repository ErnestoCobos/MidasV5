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
exports.lunarCrushService = exports.LunarCrushService = void 0;
const axios_1 = __importDefault(require("axios"));
const node_cache_1 = __importDefault(require("node-cache"));
const p_queue_1 = __importDefault(require("p-queue"));
const logging_1 = require("../utils/logging");
const env_1 = require("../utils/env");
class LunarCrushService {
    constructor(options) {
        this.baseURL = 'https://lunarcrush.com/api4'; // API v4 base URL
        this.apiAvailable = true;
        this.mockMode = false; // Modo simulación para desarrollo sin API
        const { apiKey, cacheTTL = 300, // 5 minutos por defecto (recomendación)
        maxRequestsPerMinute = 9 // Límite seguro para el plan Discover (10 req/min)
         } = options;
        this.galaxyScoreCache = new node_cache_1.default({ stdTTL: cacheTTL });
        this.dataCache = new node_cache_1.default({ stdTTL: cacheTTL });
        // Crear cola con límites de tasa
        this.queue = new p_queue_1.default({
            concurrency: 1, // Una solicitud a la vez
            intervalCap: maxRequestsPerMinute,
            interval: 60 * 1000, // 1 minuto
            carryoverConcurrencyCount: true
        });
        // Guardar la API key
        this.apiKey = apiKey;
        // Habilitar modo mock para desarrollo si no hay API key
        if (!apiKey || apiKey === 'YOUR_API_KEY' || apiKey === '') {
            this.mockMode = true;
            this.apiAvailable = false;
            logging_1.logger.warn('LunarCrush API key no configurada, usando modo simulación');
        }
        else {
            // Verificar la disponibilidad de la API al iniciar
            this.checkApiAvailability();
        }
        // Log de la inicialización
        logging_1.logger.info({
            cacheTTL,
            maxRequestsPerMinute,
            mockMode: this.mockMode
        }, 'LunarCrush service initialized');
    }
    /**
     * Verifica si la API de LunarCrush está disponible
     */
    checkApiAvailability() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                // Si estamos en modo mock, no verificar
                if (this.mockMode) {
                    this.apiAvailable = false;
                    return;
                }
                // Hacer una solicitud pequeña para verificar
                // v4 requiere un encabezado de autenticación en lugar de parámetro key
                yield axios_1.default.get(`${this.baseURL}/public/coins/BTC/v1`, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`
                    },
                    timeout: 5000
                });
                this.apiAvailable = true;
                logging_1.logger.info('LunarCrush API está disponible');
            }
            catch (error) {
                this.apiAvailable = false;
                // Registrar detalles del error
                if (axios_1.default.isAxiosError(error)) {
                    logging_1.apiLogger.error({
                        status: (_a = error.response) === null || _a === void 0 ? void 0 : _a.status,
                        data: (_b = error.response) === null || _b === void 0 ? void 0 : _b.data,
                        message: error.message
                    }, 'LunarCrush API no disponible');
                }
                else {
                    logging_1.apiLogger.error({ error }, 'Error desconocido al verificar LunarCrush API');
                }
                logging_1.logger.warn('LunarCrush API no disponible - se usará el sistema alternativo de scoring');
            }
        });
    }
    /**
     * Obtiene el Galaxy Score de un activo
     * @param asset Símbolo del activo (sin USDT, e.g. 'BTC')
     * @returns Puntuación galaxyScore (0-100)
     */
    galaxyScore(asset) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const assetUpperCase = asset.toUpperCase();
            // 1. Verificar caché primero
            const cacheKey = `galaxy_${assetUpperCase}`;
            const cachedScore = this.galaxyScoreCache.get(cacheKey);
            if (cachedScore !== undefined) {
                logging_1.logger.debug(`Usando Galaxy Score en caché para ${assetUpperCase}: ${cachedScore}`);
                return cachedScore;
            }
            // 2. Si la API no está disponible, usar sistema alternativo
            if (!this.apiAvailable) {
                return this.getAlternativeScore(assetUpperCase);
            }
            // 3. Encolar solicitud a la API
            try {
                // v4: snapshot endpoint already includes galaxy_score; /insights path is deprecated
                const fetchScore = () => __awaiter(this, void 0, void 0, function* () {
                    var _a, _b, _c, _d;
                    const startTime = Date.now();
                    const response = yield axios_1.default.get(`${this.baseURL}/public/coins/${assetUpperCase}/v1`, {
                        headers: { 'Authorization': `Bearer ${this.apiKey}` },
                        timeout: 10000
                    });
                    const duration = Date.now() - startTime;
                    logging_1.apiLogger.debug({ asset: assetUpperCase, status: response.status, duration: `${duration}ms` }, 'LunarCrush API request successful');
                    /**
                     *  La estructura v4 puede venir en 3 variantes conocidas:
                     *  A) { data: { galaxy_score: 72.5, ... } }
                     *  B) { data: { BTC: { galaxy_score: 72.5, ... } } }
                     *  C) { data: [ { galaxy_score: 72.5, ... } ] }
                     */
                    let score;
                    const d = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data;
                    if (Array.isArray(d) && d.length) {
                        score = (_b = d[0].galaxy_score) !== null && _b !== void 0 ? _b : d[0].galaxyScore;
                    }
                    else if (d && typeof d === 'object') {
                        if (typeof d.galaxy_score === 'number' || typeof d.galaxyScore === 'number') {
                            score = (_c = d.galaxy_score) !== null && _c !== void 0 ? _c : d.galaxyScore;
                        }
                        else if (d[assetUpperCase]) {
                            const coinObj = d[assetUpperCase];
                            score = (_d = coinObj === null || coinObj === void 0 ? void 0 : coinObj.galaxy_score) !== null && _d !== void 0 ? _d : coinObj === null || coinObj === void 0 ? void 0 : coinObj.galaxyScore;
                        }
                    }
                    if (typeof score !== 'number') {
                        throw new Error('Formato de respuesta de LunarCrush inesperado o sin datos galaxy_score');
                    }
                    return Math.round(score);
                });
                // Usar la cola y manejar el posible valor 'void' que podría devolver
                const result = yield this.queue.add(fetchScore);
                const score = typeof result === 'number' ? result : 70; // Valor por defecto si es void
                // Guardar en caché
                this.galaxyScoreCache.set(cacheKey, score);
                return score;
            }
            catch (error) {
                // Si hay error, marcar la API como no disponible para próximos intentos
                this.apiAvailable = false;
                // Registrar el error
                if (axios_1.default.isAxiosError(error)) {
                    logging_1.apiLogger.error({
                        asset: assetUpperCase,
                        status: (_a = error.response) === null || _a === void 0 ? void 0 : _a.status,
                        data: (_b = error.response) === null || _b === void 0 ? void 0 : _b.data,
                        message: error.message
                    }, 'Error obteniendo Galaxy Score de LunarCrush');
                }
                else {
                    logging_1.apiLogger.error({
                        asset: assetUpperCase,
                        error
                    }, 'Error desconocido al consultar LunarCrush');
                }
                // Usar sistema alternativo de scoring
                return this.getAlternativeScore(assetUpperCase);
            }
        });
    }
    /**
     * Obtiene una señal de trading basada en el Galaxy Score
     * @param asset Símbolo del activo
     * @returns Objeto con score, umbral y señal de trading
     */
    getMicroTradingSignal(asset) {
        return __awaiter(this, void 0, void 0, function* () {
            // Obtener Galaxy Score
            const galaxyScore = yield this.galaxyScore(asset);
            // Para micro-capital, necesitamos criterios más estrictos
            const threshold = 65; // Umbral más alto que el estándar
            // Lógica de señal especializada para micro-capital
            let signal = 'NEUTRAL';
            if (galaxyScore > threshold + 15) {
                signal = 'STRONG_BUY';
            }
            else if (galaxyScore > threshold) {
                signal = 'BUY';
            }
            else if (galaxyScore < threshold - 15) {
                signal = 'STRONG_SELL';
            }
            else if (galaxyScore < threshold) {
                signal = 'SELL';
            }
            // Registrar la señal
            logging_1.logger.info({
                asset,
                galaxyScore,
                threshold,
                signal
            }, 'Generada señal de trading desde LunarCrush');
            return {
                score: galaxyScore,
                threshold,
                signal
            };
        });
    }
    /**
     * Sistema alternativo para generar un score cuando la API falla
     * @param asset Símbolo del activo
     * @returns Score generado (0-100)
     */
    getAlternativeScore(asset) {
        logging_1.logger.debug(`Usando sistema alternativo de scoring para ${asset}`);
        // Generar un valor basado en la hora del día que sea relativamente estable
        // pero que varíe lentamente (para no dar siempre el mismo valor)
        const date = new Date();
        const hourFactor = date.getHours() / 24; // 0-1 basado en la hora
        const dayFactor = date.getDate() / 31; // 0-1 basado en el día
        // Calcular valor base entre 60-80 (rango neutral)
        const baseScore = 60 + Math.sin(hourFactor * Math.PI * 2) * 10 + Math.cos(dayFactor * Math.PI * 2) * 10;
        // Ajustar según el activo (para dar un poco de variabilidad entre activos)
        const assetSeed = asset.charCodeAt(0) + (asset.length > 1 ? asset.charCodeAt(1) : 0);
        const assetFactor = (assetSeed % 10) / 10; // 0-1 basado en el activo
        const finalScore = Math.round(baseScore + assetFactor * 10);
        // Mantener en rango 0-100
        return Math.max(0, Math.min(100, finalScore));
    }
    /**
     * Obtiene datos de influencers relevantes para un activo
     * @param asset Símbolo del activo (sin USDT, e.g. 'BTC')
     * @param limit Número máximo de influencers a obtener
     * @returns Array de datos de influencers o undefined en caso de error
     */
    getInfluencers(asset_1) {
        return __awaiter(this, arguments, void 0, function* (asset, limit = 10) {
            var _a, _b;
            const assetUpperCase = asset.toUpperCase();
            // Verificar caché primero
            const cacheKey = `influencers_${assetUpperCase}`;
            const cached = this.dataCache.get(cacheKey);
            if (cached) {
                logging_1.logger.debug(`Usando datos de influencers en caché para ${assetUpperCase}`);
                return cached;
            }
            // Si la API no está disponible, retornar undefined
            if (!this.apiAvailable) {
                logging_1.logger.warn(`API no disponible para obtener influencers de ${assetUpperCase}`);
                return undefined;
            }
            try {
                const fetchInfluencers = () => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    const startTime = Date.now();
                    const response = yield axios_1.default.get(`${this.baseURL}/public/coins/${assetUpperCase}/influencers/v1`, {
                        params: { interval: '24h', limit },
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`
                        },
                        timeout: 10000
                    });
                    const duration = Date.now() - startTime;
                    logging_1.apiLogger.debug({
                        asset: assetUpperCase,
                        status: response.status,
                        duration: `${duration}ms`
                    }, 'LunarCrush influencers request successful');
                    if (!((_a = response.data) === null || _a === void 0 ? void 0 : _a.data) || !Array.isArray(response.data.data)) {
                        throw new Error('Formato de respuesta de influencers inesperado');
                    }
                    return response.data.data;
                });
                const result = yield this.queue.add(fetchInfluencers);
                // Guardar en caché con TTL más largo (10 min)
                this.dataCache.set(cacheKey, result, 600);
                return result;
            }
            catch (error) {
                if (axios_1.default.isAxiosError(error)) {
                    logging_1.apiLogger.error({
                        asset: assetUpperCase,
                        status: (_a = error.response) === null || _a === void 0 ? void 0 : _a.status,
                        data: (_b = error.response) === null || _b === void 0 ? void 0 : _b.data,
                        message: error.message
                    }, 'Error obteniendo influencers de LunarCrush');
                }
                else {
                    logging_1.apiLogger.error({
                        asset: assetUpperCase,
                        error
                    }, 'Error inesperado al consultar influencers');
                }
                return undefined;
            }
        });
    }
    /**
     * Obtiene métricas de cambio social en diferentes períodos
     * @param asset Símbolo del activo
     * @returns Datos sociales o undefined en caso de error
     */
    getSocialMetrics(asset) {
        return __awaiter(this, void 0, void 0, function* () {
            const assetUpperCase = asset.toUpperCase();
            // Verificar caché primero
            const cacheKey = `social_${assetUpperCase}`;
            const cached = this.dataCache.get(cacheKey);
            if (cached) {
                return cached;
            }
            // Si la API no está disponible, retornar undefined
            if (!this.apiAvailable) {
                return undefined;
            }
            try {
                const fetchSocial = () => __awaiter(this, void 0, void 0, function* () {
                    var _a, _b;
                    const response = yield axios_1.default.get(`${this.baseURL}/public/coins/${assetUpperCase}/time-series/v2`, {
                        params: {
                            bucket: 'hour',
                            interval: '1d',
                            metrics: 'social_score,social_change_24h,social_change_7d,bearish_sentiment,bullish_sentiment,alt_rank'
                        },
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`
                        },
                        timeout: 10000
                    });
                    if (!((_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b[0])) {
                        throw new Error('Formato de respuesta social inesperado');
                    }
                    return response.data.data[0];
                });
                const result = yield this.queue.add(fetchSocial);
                // Guardar en caché
                this.dataCache.set(cacheKey, result, 300);
                return result;
            }
            catch (error) {
                logging_1.apiLogger.error({
                    asset: assetUpperCase,
                    error: axios_1.default.isAxiosError(error) ? error.message : String(error)
                }, 'Error obteniendo métricas sociales');
                return undefined;
            }
        });
    }
    /**
     * Obtiene información completa de sentimiento para un activo
     * @param asset Símbolo del activo
     * @returns Objeto con información completa de sentimiento
     */
    getCompleteSentiment(asset) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const assetUpperCase = asset.toUpperCase();
            logging_1.logger.info(`Obteniendo sentimiento completo para ${assetUpperCase}`);
            try {
                // Obtener Galaxy Score primero (el dato más importante)
                const galaxyScore = yield this.galaxyScore(assetUpperCase);
                // Realizar las demás llamadas en paralelo
                const [socialMetrics, influencers] = yield Promise.all([
                    this.getSocialMetrics(assetUpperCase),
                    this.getInfluencers(assetUpperCase, 3)
                ]);
                // Construir objeto de respuesta
                const result = {
                    galaxyScore
                };
                // Añadir datos sociales si están disponibles
                if (socialMetrics) {
                    result.altRank = (_a = socialMetrics.altRank) !== null && _a !== void 0 ? _a : socialMetrics.alt_rank;
                    result.socialVolumeChange24h = socialMetrics.social_change_24h;
                    result.bearishSentiment = socialMetrics.bearish_sentiment;
                    result.bullishSentiment = socialMetrics.bullish_sentiment;
                }
                // Añadir datos de influencers si están disponibles
                if (influencers && influencers.length > 0) {
                    result.topInfluencers = influencers.map(i => ({
                        name: i.influencer,
                        followers: i.followers,
                        sentiment: i.sentiment
                    }));
                }
                logging_1.logger.debug({
                    asset: assetUpperCase,
                    galaxyScore,
                    hasSocial: !!socialMetrics,
                    hasInfluencers: influencers ? influencers.length : 0
                }, 'Sentimiento completo generado');
                return result;
            }
            catch (error) {
                logging_1.logger.error({
                    asset: assetUpperCase,
                    error: error instanceof Error ? error.message : String(error)
                }, 'Error obteniendo sentimiento completo');
                // Retornar al menos el Galaxy Score
                return {
                    galaxyScore: yield this.galaxyScore(assetUpperCase)
                };
            }
        });
    }
}
exports.LunarCrushService = LunarCrushService;
// Crear instancia singleton (para uso en toda la aplicación)
exports.lunarCrushService = new LunarCrushService({
    apiKey: env_1.env.LUNAR_KEY,
    cacheTTL: 300, // 5 minutos como recomendado
    maxRequestsPerMinute: 9 // 9 req/min para dejar margen (límite real es 10)
});
