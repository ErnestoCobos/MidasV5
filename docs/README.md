# MidasTS Documentation

This documentation follows the [Diátaxis framework](https://diataxis.fr/), organizing content into four categories to better serve different user needs.

## Documentation Structure

### [🔍 Tutorials](./tutorials/README.md)
Step-by-step lessons to get you started with MidasTS:
- Getting started guides
- First trading strategy implementation
- Setup and configuration walkthroughs

### [🛠️ How-to Guides](./how-to/README.md)
Practical guides for accomplishing specific tasks:
- Portfolio manager configuration
- Telegram bot integration
- Database setup and maintenance
- Custom adapter creation

### [📚 Reference](./reference/index.html)
Comprehensive API documentation and technical details:
- Generated API documentation
- Configuration parameters
- Port and adapter specifications

### [💡 Explanations](./explanations/README.md)
Conceptual explanations of MidasTS architecture and algorithms:
- System architecture
- Trading algorithms
- Kelly Criterion implementation
- Risk management approach

## System Architecture

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

## Quick Links

- [Getting Started](./tutorials/getting-started.md)
- [Portfolio Manager Configuration](./how-to/configure-portfolio-manager.md)
- [Architecture Overview](./explanations/architecture.md)
- [API Reference](./reference/index.html)
- [Test Coverage](./badges/coverage.svg)
- [Telegram Bot Architecture](./telegram-hexagonal-architecture.md)
- [Telegram Multithreading Guide](./telegram-multithreading-guide.md)
- [Telegram Architecture Diagram](./telegram-architecture-diagram.md)

## Components Overview

### Core Components

1. **[Gestor Dinámico de Portafolio](./explanations/portfolio-manager.md)**
   - Sistema de rotación automática de activos
   - Arquitectura basada en eventos
   
2. **[Escáner de Mercado](./explanations/market-scanner.md)**
   - Algoritmo de puntuación de oportunidades
   - Diversificación inteligente
   
3. **[Integración con DeepSeek IA](./explanations/deepseek-integration.md)**
   - Proceso de decisión en dos etapas
   - Prompts especializados por tipo de estrategia

4. **[Sistema de Feedback y Aprendizaje](./explanations/feedback-system.md)**
   - Recopilación de resultados de trading
   - Métricas de rendimiento por activo
   
5. **[Bot de Telegram con Arquitectura Hexagonal](./telegram-hexagonal-architecture.md)**
   - Implementación de puertos y adaptadores
   - Integración con sistema de multithreading
   - Procesamiento paralelo de señales de trading

6. **[Sistema de Multithreading](./telegram-multithreading-guide.md)**
   - Worker threads para procesamiento intensivo
   - Distribución de tareas según tipo y prioridad
   - Escalado automático de workers
