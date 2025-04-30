# Integración con DeepSeek IA

DeepSeek Reasoner es el núcleo de inteligencia artificial del sistema, proporcionando análisis avanzado y toma de decisiones de trading. Este documento explica cómo se integra DeepSeek en la arquitectura y cómo optimiza el crecimiento de capital.

## Funcionalidades Principales

- **Toma de decisiones de trading**: Genera señales (BUY/SELL/HOLD) basadas en datos de mercado
- **Evaluación de rotación de portafolio**: Analiza si conviene rotar entre activos
- **Optimización de parámetros**: Ajusta take profit, stop loss y tamaño de posición
- **Análisis cualitativo**: Proporciona razonamiento detallado para cada decisión

## Arquitectura de Integración

DeepSeek se integra en múltiples puntos del sistema:

1. **Estrategias de Trading**: Proporciona señales directas de entrada/salida
2. **Gestor de Portafolio**: Evalúa oportunidades de rotación entre activos
3. **Dimensionamiento de Posiciones**: Optimiza el tamaño de acuerdo al capital y riesgo

```
                       ┌─────────────────┐
                       │                 │
                       │  Market Scanner │
                       │                 │
                       └────────┬────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│                 │    │                 │    │                 │
│  Market Data    │───▶│    DeepSeek     │◀───│  User Settings  │
│                 │    │                 │    │                 │
└─────────────────┘    └────────┬────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │                 │
                       │ Portfolio Mgr   │
                       │                 │
                       └─────────────────┘
```

## Prompts Especializados

El sistema utiliza prompts especializados para diferentes contextos y tamaños de capital. Cada prompt está optimizado para su caso de uso específico:

### 1. Estrategia Micro-Capital (< $100)

Optimizado para preservación de capital con crecimiento cauteloso.

```
Eres un experto en micro-trading de criptomonedas con capital muy limitado.

CONTEXTO:
- Capital total disponible: $54.00
- Riesgo máximo por operación: $0.27 (0.5% del capital)
- Datos de mercado para análisis:
  - Precio actual: 76543.20
  - Volumen 24h: 2450000000
  - Sentimiento social (Galaxy Score): 72/100
  - RSI(14): 48
  - Tendencia EMA: bullish
  - Volumen actual vs promedio: 1.2
  - Posición en Bollinger Bands: 0.35
  - Soportes cercanos: 75200, 74800, 73500
  - Resistencias cercanas: 77000, 78500, 80000

RESTRICCIONES CRÍTICAS:
1. Prioriza PRESERVACIÓN DE CAPITAL - extremadamente conservador
2. Solo señales de muy alta confianza (>0.85)
3. Tamaño de posición máximo: 20% del capital ($10.80)
4. Ratio riesgo/recompensa mínimo: 1:1.5
5. Stop loss máximo: 1.2% del precio actual
6. Take profit mínimo: 1.5% del precio actual
```

### 2. Estrategia Growth-Optimized (crecimiento)

Diseñada para maximizar crecimiento de capital pequeño.

```
Eres un experto en trading algorítmico de criptomonedas especializado en crecimiento acelerado de capital.

CONTEXTO:
- Capital total disponible: $54.00 USD (OBJETIVO: MAXIMIZAR CRECIMIENTO)
- Datos de mercado para análisis:
  - Precio actual: 134.50
  - Volumen 24h: 980000000
  - Sentimiento social (Galaxy Score): 85/100
  - RSI(14): 42
  - Tendencia EMA: bullish
  - Volumen actual vs promedio: 1.5
  - Posición en Bollinger Bands: 0.25
  - Soportes cercanos: 131.20, 128.50
  - Resistencias cercanas: 138.00, 142.50

INSTRUCCIONES (ENFOQUE EN CRECIMIENTO):
1. Analiza oportunidades de alto potencial de retorno
2. Busca configuraciones técnicas con asimetría positiva (mayor recompensa que riesgo)
3. PRIORIZA OPORTUNIDADES DE ALTO RETORNO SOBRE PRESERVACIÓN (ser más agresivo)
4. Identifica puntos de entrada óptimos donde exista momentum y soporte técnico
5. Recomienda take profits escalonados y trailing stops para maximizar ganancias
```

### 3. Evaluación de Rotación de Portafolio

Especializado en decidir si rotar entre activos.

```
Eres un experto en rotación de capital para maximizar crecimiento en carteras de cripto.

CONTEXTO:
- Capital total: $54.00 USD
- Tipo de cartera: Crecimiento acelerado

ACTIVO ACTUAL EN CARTERA:
- Símbolo: BTCUSDT
- Precio: 76234.50
- Asignación: $25.00 (46.3% del capital)
- Rendimiento actual: 3.5%
- Galaxy Score: 75/100
- Potencial de retorno estimado: 2.2%
- Volatilidad: 1.5%
- Momentum: 65/100
- RSI: 58
- Tendencia EMA: bullish
- Posición en Bollinger Bands: 0.65

NUEVA OPORTUNIDAD DETECTADA:
- Símbolo: SOLUSDT
- Precio: 136.20
- Galaxy Score: 85/100
- Potencial de retorno estimado: 3.5%
- Score algorítmico: 0.88
- RSI: 48
- Tendencia EMA: bullish
- Posición en Bollinger Bands: 0.30

INSTRUCCIONES:
1. Analiza si vale la pena rotar el capital desde el activo actual hacia la nueva oportunidad
2. Considera rendimiento pasado, potencial futuro, momentum y situación técnica
3. Para decisiones de crecimiento acelerado, prioriza potencial futuro y momentum
```

## Formato de Respuesta

DeepSeek genera respuestas en formato JSON estructurado:

```json
{
  "action": "BUY",
  "confidence": 0.92,
  "entry": 135.20,
  "stopLoss": 133.50,
  "takeProfit": 138.60,
  "position_size": 16.20,
  "reasoning": "RSI en zona de sobreventa con soporte técnico cercano y alto Galaxy Score. Configuración ideal para entrada con riesgo controlado.",
  "useTrailingStop": true,
  "trailingStopPercent": 1.2
}
```

## Optimizaciones y Ajustes

### Configuración del Modelo

El sistema utiliza el modelo DeepSeek Reasoner con parámetros optimizados:

```typescript
this.llm = new ChatDeepSeek({ 
  apiKey, 
  model: 'deepseek-reasoner',
  modelKwargs: {
    temperature: 0.1,  // Baja temperatura para respuestas más deterministas
    presence_penalty: 0,
    frequency_penalty: 0,
    response_format: { type: "json_object" } // Formato JSON explícito
  }
});
```

### Control de Rate Limiting

Un sistema de cola gestiona las solicitudes para evitar problemas de rate limiting:

```typescript
// Crear una cola para manejar el rate-limiting
this.queue = new PQueue({
  concurrency: 1,
  intervalCap: 4,   // 4 req/min como máximo
  interval: 60 * 1000
});
```

## Validación y Seguridad

Las respuestas de DeepSeek son validadas para garantizar que cumplen con los requisitos del sistema:

1. Esquema Zod para validar estructura y tipos de datos
2. Transformación a formato estandarizado
3. Valores por defecto seguros en caso de fallos
4. Manejo robusto de errores con señal HOLD como fallback

## Mejores Prácticas y Recomendaciones

1. **Prompt Engineering**: Mantener los prompts claros, concisos y con objetivos específicos
2. **Temperatura**: Usar valores bajos (0.1-0.2) para decisiones financieras deterministicas
3. **Contexto Limitado**: Proporcionar solo datos relevantes para evitar ruido
4. **Validación**: Siempre validar y sanear las respuestas de la IA
5. **Fallbacks**: Implementar comportamientos seguros por defecto (HOLD)
