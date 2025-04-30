# Documentación del Sistema MidasTS

## Introducción

MidasTS es un sistema de trading algorítmico optimizado para el crecimiento de capital pequeño, que utiliza DeepSeek Reasoner como núcleo de IA para la toma de decisiones. Este sistema está especialmente diseñado para maximizar el crecimiento de capitales desde $54 USD.

## Índice de Documentación

### Componentes Principales

1. **[Gestor Dinámico de Portafolio](portfolio-manager.md)**
   - Sistema de rotación automática de activos
   - Arquitectura basada en eventos
   - Configuración y parámetros
   - Gestión de rotaciones y persistencia
   - Integración con sistema de feedback

2. **[Escáner de Mercado](market-scanner.md)**
   - Algoritmo de puntuación de oportunidades
   - Diversificación inteligente
   - Símbolos escaneados y filtros
   - Estimación de retorno potencial

3. **[Integración con DeepSeek IA](deepseek-integration.md)**
   - Proceso de decisión en dos etapas
   - Prompts especializados por tipo de estrategia
   - Integración con sistema de feedback
   - Formato de respuestas y validación
   - Configuración optimizada del modelo

4. **[Sistema de Feedback y Aprendizaje](feedback-system.md)**
   - Recopilación de resultados de trading
   - Métricas de rendimiento por activo
   - Integración con DeepSeek IA
   - Optimización continua basada en resultados

5. **[Integración con LunarCrush](lunarcrush-integration.md)**
   - Análisis de sentimiento social
   - Implementación de Galaxy Score
   - Tolerancia a fallos y modo offline
   - Señales de trading basadas en sentimiento

### Infraestructura y Utilidades

6. **[Base de Datos](database.md)**
   - Estructura y esquema
   - TimescaleDB para series temporales
   - Migración y mantenimiento
   - Optimizaciones para datos financieros

7. **[Arquitectura y Patrones de Diseño](architecture.md)**
   - Diagrama de componentes
   - Patrones implementados
   - Flujo de decisiones inteligentes
   - Tolerancia a fallos

8. **[Worker Pool](worker-pool.md)**
   - Procesamiento paralelo
   - Cálculo de indicadores técnicos
   - Optimización de rendimiento
   - Distribución de carga

9. **[Interfaz de Línea de Comandos](command-line-interface.md)**
   - Ejecutables principales y opciones
   - Interfaz interactiva del gestor de portafolio
   - Formato de salida y códigos de color
   - Ejemplos de uso y recomendaciones

### Aspectos Técnicos

10. **[Indicadores Técnicos](technical-indicators.md)**
    - Implementaciones y algoritmos
    - Parámetros optimizados
    - Uso en decisiones de trading
    - Ejemplos y visualizaciones

11. **[Criterio de Kelly](kelly-criterion.md)**
    - Fundamentos matemáticos
    - Implementación específica para micro-capital
    - Ejemplos y fórmulas
    - Optimización de tamaño de posición

12. **[Gestión de Riesgo](risk-management.md)**
    - Estrategias implementadas
    - Stop-loss y trailing stops
    - Diversificación y correlación
    - Protección de capital pequeño

## Componentes Ejecutables

- **Sistema de Crecimiento de Capital**: `run-growth-system.js`
  - Demuestra el criterio de Kelly para optimización de posiciones
  - Escanea el mercado para encontrar oportunidades
  - Ejecuta la estrategia optimizada para el crecimiento

- **Gestor Dinámico de Portafolio**: `run-portfolio-manager.js`
  - Monitoriza continuamente el mercado
  - Rota activos automáticamente basado en decisiones de DeepSeek
  - Proporciona una interfaz interactiva para gestión en tiempo real

## Arquitectura del Sistema

```mermaid
graph TD
    A[CLI Commands] --> B[Portfolio Manager]
    A --> C[Growth System]
    
    B --> D[Market Scanner]
    C --> D
    
    D --> E[Market Data]
    B --> F[DeepSeek AI]
    
    F <--> G[Feedback System]
    B --> G
    
    E --> H[Binance API]
    E --> I[LunarCrush API]
    
    J[Worker Pool] <-- K[Technical Indicators]
```

## Preguntas Frecuentes

### ¿Qué es el Criterio de Kelly?
El Criterio de Kelly es una fórmula matemática que determina el tamaño óptimo de una serie de apuestas para maximizar el crecimiento del capital. En trading, ayuda a determinar qué porcentaje del capital asignar a cada operación.

### ¿Cómo decide el sistema cuándo rotar activos?
El sistema escanea continuamente el mercado en busca de oportunidades, compara el potencial de nuevas oportunidades con los activos actuales, y consulta a DeepSeek para la decisión final. Solo rota cuando encuentra una oportunidad significativamente mejor.

### ¿Es posible perder todo el capital?
El sistema implementa múltiples capas de gestión de riesgo, incluyendo stop loss automáticos, diversificación forzada y reserva de efectivo. Sin embargo, el trading implica riesgos y no se puede garantizar que no habrá pérdidas.

### ¿Cómo se puede verificar el rendimiento del sistema?
El sistema mantiene un registro detallado de todas las rotaciones y los cambios en el portafolio. Puedes usar el comando `status` en el gestor de portafolio para ver el rendimiento actual.

## Recomendaciones para Empezar

1. Lee la documentación completa para entender el sistema
2. Ejecuta primero `run-growth-system.js` para ver la demostración de Kelly
3. Prueba el gestor de portafolio con `run-portfolio-manager.js`
4. Monitorea regularmente el estado con el comando `status`
5. Usa `force` solo cuando identifices oportunidades excepcionales
