import axios, { AxiosResponse } from 'axios';
import NodeCache from 'node-cache';
import PQueue from 'p-queue';
import { logger, apiLogger } from '../utils/logging';
import { env } from '../utils/env';

// Interfaz para la respuesta de LunarCrush
interface LunarCrushResponse {
  data?: Array<{
    symbol: string;
    name: string;
    price: number;
    galaxyScore?: number;
    altRank?: number;
    social_score?: number;
    market_cap?: number;
    percent_change_24h?: number;
    volume_24h?: number;
    bearish_sentiment?: number;
    bullish_sentiment?: number;
    social_change_24h?: number;
    social_change_7d?: number;
    galaxy_score?: number;
    alt_rank?: number;
  }>;
  config?: {
    data_points: number;
  };
  status?: number;
  error?: string;
}

// Interfaz para datos de influencers
interface LunarCrushInfluencerResponse {
  data?: Array<{
    influencer: string;
    followers: number;
    engagement: number;
    sentiment: string;
    twitter_url?: string;
  }>;
}

// Interfaz para información completa de sentimiento
export interface EnhancedSentiment {
  galaxyScore: number;
  altRank?: number;
  socialVolumeChange24h?: number;
  bearishSentiment?: number;
  bullishSentiment?: number;
  topInfluencers?: Array<{name: string, followers: number, sentiment: string}>;
}

// Opciones para usar LunarCrush
export interface LunarCrushOptions {
  apiKey: string;
  cacheTTL?: number; // Tiempo de vida de caché en segundos
  maxRequestsPerMinute?: number;
}

export class LunarCrushService {
  private readonly baseURL = 'https://lunarcrush.com/api4'; // API v4 base URL
  private galaxyScoreCache: NodeCache;
  private dataCache: NodeCache; // Caché para otros tipos de datos
  private queue: PQueue;
  private apiAvailable = true;
  private mockMode = false; // Modo simulación para desarrollo sin API
  
  constructor(options: LunarCrushOptions) {
    const {
      apiKey,
      cacheTTL = 300, // 5 minutos por defecto (recomendación)
      maxRequestsPerMinute = 9 // Límite seguro para el plan Discover (10 req/min)
    } = options;
    
    this.galaxyScoreCache = new NodeCache({ stdTTL: cacheTTL });
    this.dataCache = new NodeCache({ stdTTL: cacheTTL });
    
    // Crear cola con límites de tasa
    this.queue = new PQueue({
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
      logger.warn('LunarCrush API key no configurada, usando modo simulación');
    } else {
      // Verificar la disponibilidad de la API al iniciar
      this.checkApiAvailability();
    }
    
    // Log de la inicialización
    logger.info({
      cacheTTL,
      maxRequestsPerMinute,
      mockMode: this.mockMode
    }, 'LunarCrush service initialized');
  }
  
  private readonly apiKey: string;
  
  /**
   * Verifica si la API de LunarCrush está disponible
   */
  private async checkApiAvailability(): Promise<void> {
    try {
      // Si estamos en modo mock, no verificar
      if (this.mockMode) {
        this.apiAvailable = false;
        return;
      }
      
      // Hacer una solicitud pequeña para verificar
      // v4 requiere un encabezado de autenticación en lugar de parámetro key
      await axios.get(`${this.baseURL}/public/coins/BTC/v1`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 5000
      });
      
      this.apiAvailable = true;
      logger.info('LunarCrush API está disponible');
    } catch (error) {
      this.apiAvailable = false;
      
      // Registrar detalles del error
      if (axios.isAxiosError(error)) {
        apiLogger.error({
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        }, 'LunarCrush API no disponible');
      } else {
        apiLogger.error({ error }, 'Error desconocido al verificar LunarCrush API');
      }
      
      logger.warn('LunarCrush API no disponible - se usará el sistema alternativo de scoring');
    }
  }
  
  /**
   * Obtiene el Galaxy Score de un activo
   * @param asset Símbolo del activo (sin USDT, e.g. 'BTC')
   * @returns Puntuación galaxyScore (0-100)
   */
  async galaxyScore(asset: string): Promise<number> {
    const assetUpperCase = asset.toUpperCase();
    
    // 1. Verificar caché primero
    const cacheKey = `galaxy_${assetUpperCase}`;
    const cachedScore = this.galaxyScoreCache.get<number>(cacheKey);
    
    if (cachedScore !== undefined) {
      logger.debug(`Usando Galaxy Score en caché para ${assetUpperCase}: ${cachedScore}`);
      return cachedScore;
    }
    
    // 2. Si la API no está disponible, usar sistema alternativo
    if (!this.apiAvailable) {
      return this.getAlternativeScore(assetUpperCase);
    }
    
    // 3. Encolar solicitud a la API
    try {
      // v4: snapshot endpoint already includes galaxy_score; /insights path is deprecated
      const fetchScore = async (): Promise<number> => {
        const startTime = Date.now();

        const response = await axios.get(`${this.baseURL}/public/coins/${assetUpperCase}/v1`, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
          timeout: 10000
        });

        const duration = Date.now() - startTime;
        apiLogger.debug(
          { asset: assetUpperCase, status: response.status, duration: `${duration}ms` },
          'LunarCrush API request successful'
        );

        /**
         *  La estructura v4 puede venir en 3 variantes conocidas:
         *  A) { data: { galaxy_score: 72.5, ... } }
         *  B) { data: { BTC: { galaxy_score: 72.5, ... } } }
         *  C) { data: [ { galaxy_score: 72.5, ... } ] }
         */
        let score: number | undefined;
        const d = response.data?.data;

        if (Array.isArray(d) && d.length) {
          score = d[0].galaxy_score ?? d[0].galaxyScore;
        } else if (d && typeof d === 'object') {
          if (typeof d.galaxy_score === 'number' || typeof d.galaxyScore === 'number') {
            score = d.galaxy_score ?? d.galaxyScore;
          } else if (d[assetUpperCase]) {
            const coinObj = d[assetUpperCase];
            score = coinObj?.galaxy_score ?? coinObj?.galaxyScore;
          }
        }

        if (typeof score !== 'number') {
          throw new Error('Formato de respuesta de LunarCrush inesperado o sin datos galaxy_score');
        }

        return Math.round(score);
      };
      
      // Usar la cola y manejar el posible valor 'void' que podría devolver
      const result = await this.queue.add(fetchScore);
      const score = typeof result === 'number' ? result : 70; // Valor por defecto si es void
      
      // Guardar en caché
      this.galaxyScoreCache.set(cacheKey, score);
      
      return score;
    } catch (error) {
      // Si hay error, marcar la API como no disponible para próximos intentos
      this.apiAvailable = false;
      
      // Registrar el error
      if (axios.isAxiosError(error)) {
        apiLogger.error({
          asset: assetUpperCase,
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        }, 'Error obteniendo Galaxy Score de LunarCrush');
      } else {
        apiLogger.error({ 
          asset: assetUpperCase,
          error 
        }, 'Error desconocido al consultar LunarCrush');
      }
      
      // Usar sistema alternativo de scoring
      return this.getAlternativeScore(assetUpperCase);
    }
  }
  
  /**
   * Obtiene una señal de trading basada en el Galaxy Score
   * @param asset Símbolo del activo
   * @returns Objeto con score, umbral y señal de trading
   */
  async getMicroTradingSignal(asset: string): Promise<{
    score: number;
    threshold: number;
    signal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  }> {
    // Obtener Galaxy Score
    const galaxyScore = await this.galaxyScore(asset);
    
    // Para micro-capital, necesitamos criterios más estrictos
    const threshold = 65; // Umbral más alto que el estándar
    
    // Lógica de señal especializada para micro-capital
    let signal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL' = 'NEUTRAL';
    
    if (galaxyScore > threshold + 15) {
      signal = 'STRONG_BUY';
    } else if (galaxyScore > threshold) {
      signal = 'BUY';
    } else if (galaxyScore < threshold - 15) {
      signal = 'STRONG_SELL';
    } else if (galaxyScore < threshold) {
      signal = 'SELL';
    }
    
    // Registrar la señal
    logger.info({
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
  }
  
  /**
   * Sistema alternativo para generar un score cuando la API falla
   * @param asset Símbolo del activo
   * @returns Score generado (0-100)
   */
  private getAlternativeScore(asset: string): number {
    logger.debug(`Usando sistema alternativo de scoring para ${asset}`);
    
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
  async getInfluencers(asset: string, limit: number = 10): Promise<any[] | undefined> {
    const assetUpperCase = asset.toUpperCase();
    
    // Verificar caché primero
    const cacheKey = `influencers_${assetUpperCase}`;
    const cached = this.dataCache.get<any[]>(cacheKey);
    
    if (cached) {
      logger.debug(`Usando datos de influencers en caché para ${assetUpperCase}`);
      return cached;
    }
    
    // Si la API no está disponible, retornar undefined
    if (!this.apiAvailable) {
      logger.warn(`API no disponible para obtener influencers de ${assetUpperCase}`);
      return undefined;
    }
    
    try {
      const fetchInfluencers = async (): Promise<any[]> => {
        const startTime = Date.now();
        
        const response = await axios.get<LunarCrushInfluencerResponse>(`${this.baseURL}/public/coins/${assetUpperCase}/influencers/v1`, {
          params: { interval: '24h', limit },
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          },
          timeout: 10000
        });
        
        const duration = Date.now() - startTime;
        
        apiLogger.debug({
          asset: assetUpperCase,
          status: response.status,
          duration: `${duration}ms`
        }, 'LunarCrush influencers request successful');
        
        if (!response.data?.data || !Array.isArray(response.data.data)) {
          throw new Error('Formato de respuesta de influencers inesperado');
        }
        
        return response.data.data;
      };
      
      const result = await this.queue.add(fetchInfluencers) as any[];
      
      // Guardar en caché con TTL más largo (10 min)
      this.dataCache.set(cacheKey, result, 600);
      
      return result;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        apiLogger.error({
          asset: assetUpperCase,
          status: error.response?.status,
          data: error.response?.data,
          message: error.message
        }, 'Error obteniendo influencers de LunarCrush');
      } else {
        apiLogger.error({ 
          asset: assetUpperCase,
          error 
        }, 'Error inesperado al consultar influencers');
      }
      
      return undefined;
    }
  }
  
  /**
   * Obtiene métricas de cambio social en diferentes períodos
   * @param asset Símbolo del activo
   * @returns Datos sociales o undefined en caso de error
   */
  async getSocialMetrics(asset: string): Promise<any | undefined> {
    const assetUpperCase = asset.toUpperCase();
    
    // Verificar caché primero
    const cacheKey = `social_${assetUpperCase}`;
    const cached = this.dataCache.get<any>(cacheKey);
    
    if (cached) {
      return cached;
    }
    
    // Si la API no está disponible, retornar undefined
    if (!this.apiAvailable) {
      return undefined;
    }
    
    try {
      const fetchSocial = async (): Promise<any> => {
        const response = await axios.get<LunarCrushResponse>(`${this.baseURL}/public/coins/${assetUpperCase}/time-series/v2`, {
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
        
        if (!response.data?.data?.[0]) {
          throw new Error('Formato de respuesta social inesperado');
        }
        
        return response.data.data[0];
      };
      
      const result = await this.queue.add(fetchSocial) as any;
      
      // Guardar en caché
      this.dataCache.set(cacheKey, result, 300);
      
      return result;
    } catch (error) {
      apiLogger.error({ 
        asset: assetUpperCase,
        error: axios.isAxiosError(error) ? error.message : String(error)
      }, 'Error obteniendo métricas sociales');
      
      return undefined;
    }
  }
  
  /**
   * Obtiene información completa de sentimiento para un activo
   * @param asset Símbolo del activo
   * @returns Objeto con información completa de sentimiento
   */
  async getCompleteSentiment(asset: string): Promise<EnhancedSentiment> {
    const assetUpperCase = asset.toUpperCase();
    logger.info(`Obteniendo sentimiento completo para ${assetUpperCase}`);
    
    try {
      // Obtener Galaxy Score primero (el dato más importante)
      const galaxyScore = await this.galaxyScore(assetUpperCase);
      
      // Realizar las demás llamadas en paralelo
      const [socialMetrics, influencers] = await Promise.all([
        this.getSocialMetrics(assetUpperCase),
        this.getInfluencers(assetUpperCase, 3)
      ]);
      
      // Construir objeto de respuesta
      const result: EnhancedSentiment = {
        galaxyScore
      };
      
      // Añadir datos sociales si están disponibles
      if (socialMetrics) {
        result.altRank = socialMetrics.altRank ?? socialMetrics.alt_rank;
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
      
      logger.debug({ 
        asset: assetUpperCase, 
        galaxyScore,
        hasSocial: !!socialMetrics,
        hasInfluencers: influencers ? influencers.length : 0
      }, 'Sentimiento completo generado');
      
      return result;
    } catch (error) {
      logger.error({ 
        asset: assetUpperCase,
        error: error instanceof Error ? error.message : String(error)
      }, 'Error obteniendo sentimiento completo');
      
      // Retornar al menos el Galaxy Score
      return {
        galaxyScore: await this.galaxyScore(assetUpperCase)
      };
    }
  }
}

// Crear instancia singleton (para uso en toda la aplicación)
import { getEnv } from '../utils/env';

export const lunarCrushService = new LunarCrushService({
  apiKey: getEnv().LUNAR_KEY,
  cacheTTL: 300, // 5 minutos como recomendado
  maxRequestsPerMinute: 9 // 9 req/min para dejar margen (límite real es 10)
});
