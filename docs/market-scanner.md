# Escáner de Mercado

El Escáner de Mercado es un componente crítico del sistema que busca continuamente las mejores oportunidades de trading en el mercado de criptomonedas, optimizado para crecimiento de capital pequeño.

## Funcionalidades Principales

- **Escaneo multi-símbolo** para encontrar las mejores oportunidades
- **Puntuación algorítmica** que combina indicadores técnicos y sentimiento
- **Enfoque en crecimiento** para capital pequeño (<$200)
- **Cálculo de diversificación óptima** mediante análisis de correlaciones
- **Paralelización** para escaneo eficiente de múltiples activos

## Algoritmo de Puntuación

El escáner utiliza un algoritmo sofisticado para puntuar cada oportunidad basado en:

1. **Indicadores técnicos**:
   - RSI (Relative Strength Index): Sobreventa = mayor puntuación
   - Cruces de EMA: Tendencias alcistas = mayor puntuación
   - Volatilidad (ATR): Mayor volatilidad = mayor puntuación en modo crecimiento
   - Bollinger Bands: Posición en la banda (inferior = más potencial alcista)

2. **Sentimiento social**:
   - Galaxy Score de LunarCrush: Mayor sentimiento = mayor puntuación
   - Integración de percepción del mercado

3. **Ajustes específicos para crecimiento**:
   - Bonus para activos con alta volatilidad y buen sentimiento
   - Enfoque en momentos oportunos para entradas (posiciones bajas en BBands)
   - Mayor prioridad a activos con momentum alcista

## Diversificación Inteligente

El escáner no solo encuentra las mejores oportunidades individuales, sino que también construye portfolios diversificados:

1. Primero identifica las mejores oportunidades por puntuación
2. Luego calcula una matriz de correlaciones entre estas oportunidades
3. Selecciona activos poco correlacionados entre sí para maximizar la diversificación
4. Distribuye el capital de manera óptima según puntuación y correlación

### Ejemplo de Matriz de Correlación

```
         | BTCUSDT | ETHUSDT | SOLUSDT | AVAXUSDT
---------|---------|---------|---------|---------
BTCUSDT  |   1.00  |   0.85  |   0.65  |   0.72
ETHUSDT  |   0.85  |   1.00  |   0.78  |   0.80
SOLUSDT  |   0.65  |   0.78  |   1.00  |   0.62
AVAXUSDT |   0.72  |   0.80  |   0.62  |   1.00
```

## Símbolos Escaneados

El escáner analiza un conjunto predeterminado de símbolos, priorizando aquellos con mayor potencial de crecimiento:

### Modo Crecimiento (< $200):
```
'SOLUSDT', 'INJUSDT', 'APTUSDT', 'SUIUSDT', 'AVSUSDT',
'ARBUSDT', 'OPUSDT', 'MATICUSDT', 'NEARUSDT', 'FTMUSDT',
'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'AVAXUSDT', 'ADAUSDT',
'DOTUSDT', 'LINKUSDT'
```

### Modo Estándar:
```
'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT',
'AVAXUSDT', 'ADAUSDT', 'DOTUSDT', 'MATICUSDT',
'LINKUSDT', 'ARBUSDT', 'NEARUSDT', 'OPUSDT'
```

## Estimación de Retorno Potencial

El escáner estima el retorno potencial para cada activo basado en su volatilidad y posición técnica. Esta estimación se utiliza tanto para puntuar oportunidades como para determinar objetivos de toma de beneficios.

Fórmula básica:
```
retorno_potencial = min(5, max(1, volatilidad * 0.6))
```

Esta fórmula limita el retorno potencial entre 1% y 5%, con mayor volatilidad indicando mayor potencial de retorno.

## Interfaces de Datos

### MarketOpportunity
```typescript
interface MarketOpportunity {
  symbol: string;       // Símbolo (ej: 'BTCUSDT')
  score: number;        // Puntuación (0-1)
  price: number;        // Precio actual
  galaxyScore: number;  // Sentimiento (0-100)
  rsi?: number;         // RSI (0-100)
  trend?: string;       // Tendencia ('bullish', 'bearish', etc)
  volatility?: number;  // Volatilidad como porcentaje
  potentialReturn?: number; // Retorno potencial estimado
}
```

### PortfolioAllocation
```typescript
interface PortfolioAllocation {
  symbol: string;      // Símbolo (ej: 'BTCUSDT')
  allocation: number;  // Asignación en USD
  percentage: number;  // Porcentaje del capital total
  correlation?: number; // Correlación promedio con otros activos
}
```

## Integración con DeepSeek

El escáner proporciona datos al servicio DeepSeek, permitiendo un análisis profundo basado en IA de cada oportunidad. Las puntuaciones algorítmicas del escáner sirven como filtro inicial, mientras que DeepSeek proporciona el análisis final.
