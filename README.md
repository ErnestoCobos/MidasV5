# MidasTS: Sistema de Trading Algorítmico con DeepSeek IA

Sistema de trading algorítmico optimizado para el crecimiento de capital pequeño (desde $54 USD) que utiliza DeepSeek Reasoner como núcleo de decisión.

## Características Principales

- **Optimizado para Micro-Capital**: Diseñado específicamente para capital inicial pequeño ($54 USD)
- **Impulsado por IA**: Utiliza DeepSeek para análisis avanzado y toma de decisiones
- **Gestión Dinámica de Portafolio**: El sistema puede rotar activos automáticamente buscando las mejores oportunidades
- **Criterio de Kelly Optimizado**: Cálculo matemático preciso para dimensionar posiciones
- **Análisis Técnico y Sentimiento**: Combina indicadores técnicos y datos de sentimiento social

## Componentes del Sistema

1. **Sistema de Crecimiento de Capital** (`run-growth-system.js`)
   - Enfocado en estrategias optimizadas para el crecimiento
   - Utiliza el criterio de Kelly para optimizar el tamaño de las posiciones
   - Análisis básico del mercado para encontrar oportunidades

2. **Gestor Dinámico de Portafolio** (`run-portfolio-manager.js`) - NUEVA FUNCIÓN
   - **Monitoreo continuo del mercado** para detectar nuevas oportunidades
   - **Rotación automática de activos** basada en DeepSeek y análisis técnico
   - **Interfaz interactiva** para ver el estado del portafolio y forzar rotaciones
   - **Análisis de correlación** para optimizar la diversificación

## Cómo Ejecutar

### Sistema de Crecimiento (Básico)
```bash
./src/run-growth-system.js --capital=54
```

Opciones:
- `--capital=X`: Capital inicial (por defecto: 54)
- `--no-scan`: Omitir escaneo de mercado
- `--no-demo`: Omitir demostración de Kelly
- `--symbol=X`: Usar símbolo específico (ej: BTCUSDT)

### Gestor Dinámico de Portafolio (Nuevo)
```bash
./src/run-portfolio-manager.js --capital=54 --interval=5
```

Opciones:
- `--capital=X`: Capital inicial (por defecto: 54)
- `--interval=X`: Intervalo de escaneo en minutos (por defecto: 1)
- `--threshold=X`: Umbral de confianza para rotaciones (0-1, por defecto: 0.8)
- `--cash-reserve=X`: Porcentaje de efectivo a mantener (por defecto: 15)
- `--max-positions=X`: Número máximo de posiciones (por defecto: 2)
- `--no-diversification`: No forzar diversificación

### Comandos del Gestor de Portafolio

Una vez iniciado el gestor, tienes acceso a estos comandos:

- `status`: Muestra el estado actual del portafolio
- `force SYMBOL [AMOUNT]`: Fuerza una rotación hacia un activo específico
- `exit`: Detiene el gestor y sale

Ejemplo:
```
> status
> force SOL 20
> exit
```

## Núcleo de IA con DeepSeek

El sistema utiliza DeepSeek Reasoner para:
- Analizar datos de mercado
- Generar señales de trading
- Tomar decisiones de rotación de activos
- Optimizar la relación riesgo/beneficio

## Requisitos

- Node.js v18+
- TypeScript
- Claves API configuradas en variables de entorno:
  - `BINANCE_API_KEY`
  - `BINANCE_API_SECRET`
  - `DEEPSEEK_API_KEY`
  - `LUNARCRUSH_API_KEY`

## Limitaciones

Este sistema está diseñado para fines educativos y de demostración. El trading de criptomonedas conlleva riesgos y la rentabilidad pasada no garantiza resultados futuros.
