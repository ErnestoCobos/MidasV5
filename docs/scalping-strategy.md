# Estrategia de Scalping - MidasTS

La estrategia de scalping automatizado es un componente clave del sistema MidasTS para operaciones de trading de muy corto plazo. Esta documentación detalla su funcionamiento, configuración y las mejoras implementadas.

## Características Principales

- **Ajustes dinámicos basados en volatilidad**: Stop loss y take profit se adaptan automáticamente a la volatilidad del mercado mediante ATR.
- **Análisis multi-timeframe**: Utiliza datos de 1m, 5m y 15m para decisiones más robustas.
- **Integración con DeepSeek AI**: Para análisis avanzado y generación de señales.
- **Trailing stops automáticos**: Maximiza ganancias en tendencias favorables.
- **Filtros pre-entrada**: Verificaciones de spread y volumen para evitar condiciones desfavorables.
- **Monitoreo de rendimiento**: Seguimiento de métricas completas y persistencia en base de datos.
- **Capacidades de backtesting**: Permite probar la estrategia con datos históricos.

## Parámetros Configurables

```typescript
interface ScalpingConfig {
  // Parámetros básicos
  stopLossPercent: number;        // Porcentaje de stop loss (defecto: 0.8%)
  takeProfitPercent: number;      // Porcentaje de take profit (defecto: 1.5%)
  trailingStopPercent: number;    // Porcentaje de trailing stop (defecto: 0.4%)
  positionSizePercent: number;    // Tamaño de posición como % del capital (defecto: 10%)
  maxPositions: number;           // Máximo de posiciones simultáneas (defecto: 3)
  minVolume: number;              // Volumen mínimo (defecto: 1,000,000)
  maxSpread: number;              // Spread máximo permitido (defecto: 0.2%)
  maxDailyDrawdown: number;       // Drawdown diario máximo (defecto: 5%)
  
  // Parámetros de ajuste dinámico
  dynamicStopLoss: boolean;       // Activa ajuste dinámico de SL basado en ATR
  dynamicTakeProfit: boolean;     // Activa ajuste dinámico de TP basado en ATR
  atrMultiplierSL: number;        // Multiplicador de ATR para stop loss (defecto: 1.5)
  atrMultiplierTP: number;        // Multiplicador de ATR para take profit (defecto: 3.0)
  atrPeriod: number;              // Período para cálculo de ATR (defecto: 14)
  
  // Parámetros de testeo
  simulationMode: boolean;        // Ejecuta en modo simulación (sin órdenes reales)
  trackPerformance: boolean;      // Registra métricas detalladas de rendimiento
}
```

## Indicadores Técnicos Utilizados

1. **RSI (Relative Strength Index)**: Para identificar condiciones de sobrecompra/sobreventa.
2. **EMAs (Medias Móviles Exponenciales)**: Para detectar cruces y tendencias:
   - EMA rápida: 8 períodos
   - EMA lenta: 21 períodos
3. **ATR (Average True Range)**: Para medir volatilidad y ajustar parámetros dinámicamente.
4. **Volumen relativo**: Compara el volumen actual con el promedio histórico.
5. **Soportes y resistencias**: Identifica niveles clave según pivots en el precio.

## Métodos Principales

### `execute(symbol, capital, options?)`
Ejecuta la estrategia y genera una señal de trading para el par especificado.

### `runBacktest(symbol, startTime, endTime, capital)`
Ejecuta un backtest de la estrategia en un rango de tiempo determinado.

### `getPerformanceMetrics()`
Obtiene estadísticas sobre el rendimiento de la estrategia.

### `resetPerformanceMetrics()`
Reinicia las métricas de rendimiento.

## Uso del Script de Prueba

Se ha creado un script específico para probar la estrategia y evaluar su rendimiento:

```bash
# Compilar el proyecto
npm run build

# Ejecutar el script de prueba
node dist/test-scalping-strategy.js
```

El script realiza las siguientes operaciones:
1. Prueba la estrategia en varios pares predefinidos
2. Muestra las señales generadas y su justificación
3. Ejecuta un backtest histórico de 7 días
4. Genera métricas de rendimiento
5. Guarda los resultados en archivos JSON para análisis posterior

## Integración con Otros Componentes

La estrategia de scalping se integra con:

- **Binance Service**: Para obtener datos de mercado y ejecutar órdenes
- **DeepSeek Service**: Para análisis avanzado basado en IA
- **Trade History Service**: Para seguimiento y persistencia de operaciones
- **Portfolio Manager**: Para gestión global de portafolio

## Recomendaciones de Uso

1. **Iniciar en modo simulación**: Activar `simulationMode: true` inicialmente.
2. **Ajustar parámetros progresivamente**: Comenzar con los valores por defecto y ajustar gradualmente.
3. **Monitorear spread**: El spread es crítico para el scalping; vigilar `maxSpread`.
4. **Evaluar backtests regulares**: Realizar backtests frecuentes a medida que se ajustan los parámetros.
5. **Considerar la correlación entre pares**: Evitar posiciones altamente correlacionadas.

## Próximos Desarrollos

- Mejora del análisis de liquidez en tiempo real
- Incorporación de análisis de order book
- Adaptación automática a diferentes regímenes de volatilidad
- Optimización de parámetros mediante algoritmos genéticos
- Análisis de sentimiento en tiempo real con DeepSeek

## Monitoreo y Alertas

La estrategia registra actividad detallada a través del sistema de logging:
- Señales generadas
- Ejecución de órdenes
- Métricas de rendimiento
- Errores y anomalías

Cualquier error se registra de forma detallada para facilitar el diagnóstico y la solución.
