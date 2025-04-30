# Base de Datos en midasTS

Este documento describe la implementación y uso de la base de datos PostgreSQL/TimescaleDB en el sistema midasTS.

## Introducción

midasTS ahora incorpora una robusta capa de persistencia de datos basada en PostgreSQL, con soporte opcional para TimescaleDB, que ofrece optimizaciones específicas para datos de series temporales como los precios e indicadores de mercado.

## Características

- **PostgreSQL**: Sistema de base de datos relacional robusto y maduro
- **TimescaleDB** (opcional): Extensión especializada para datos de series temporales
- **Esquema optimizado**: Tablas diseñadas para almacenar eficientemente datos de trading
- **Migración automática**: Sistema para migrar datos históricos desde archivos JSON
- **Caché integrada**: Combinación de caché en memoria y persistencia para rendimiento
- **Repositorios**: Capa de abstracción para cada entidad principal del sistema

## Arquitectura

```mermaid
graph TD
    App[Aplicación midasTS] --> Services[Servicios]
    Services --> Repositories[Repositorios]
    Repositories --> DB[(PostgreSQL/TimescaleDB)]
    
    subgraph "Capa de Persistencia"
        Repositories --> TR[TradeRepository]
        Repositories --> MDR[MarketDataRepository]
        
        TR -.-> Cache1[Cache en Memoria]
        MDR -.-> Cache2[Cache en Memoria]
    end
```

## Estructura de Datos

### Tablas Principales

1. **market_data_candles**
   - Datos OHLCV históricos para cada par de trading
   - Optimizada con TimescaleDB para consultas de series temporales
   - Índices para búsquedas rápidas por símbolo y timeframe

2. **market_sentiment**
   - Datos históricos de sentimiento (Galaxy Score) de LunarCrush
   - Índices para búsquedas por símbolo

3. **calculated_indicators**
   - Indicadores técnicos calculados (RSI, EMA, etc.)
   - Almacenados como JSONB para flexibilidad

4. **trades**
   - Operaciones de trading históricas y actuales
   - Índices para símbolos, estados y estrategias

5. **trade_tags**
   - Etiquetas para categorización de operaciones
   - Relación con la tabla trades

## Configuración

La configuración de la base de datos se realiza a través de variables de entorno:

```
# PostgreSQL
DATABASE_URL=postgres://usuario:contraseña@hostname:puerto/base_de_datos
DATABASE_SSL=true                # Si es true, se aceptan certificados autofirmados
DATABASE_MAX_CONNECTIONS=20
DATABASE_IDLE_TIMEOUT=30000

# Migración
MIGRATE_DATA=false
BACKUP_JSON_FILES=true

# TimescaleDB (opcional)
USE_TIMESCALE=true
TIMESCALE_CHUNK_INTERVAL_DAYS=1
TIMESCALE_COMPRESSION_AFTER_DAYS=7
```

> **Nota sobre SSL:** Cuando `DATABASE_SSL=true`, el sistema está configurado para aceptar certificados autofirmados (con `rejectUnauthorized: false`). Esto es útil para conexiones a servidores PostgreSQL como Vultr que pueden utilizar certificados autofirmados. En un entorno de producción con certificados firmados por una autoridad reconocida, se recomienda implementar una configuración SSL más estricta.

## Comandos Útiles

### Verificar la Conexión

Para verificar que la conexión a la base de datos funciona correctamente:

```
node src/index.js diagnose
```

### Migración de Datos

La migración de datos desde archivos JSON a PostgreSQL se realiza automáticamente al iniciar el sistema si `MIGRATE_DATA=true`. Para forzar una migración:

1. Edita el archivo `.env` y establece `MIGRATE_DATA=true`
2. Reinicia la aplicación

## Ventajas de la Implementación

1. **Mayor robustez**: Los datos se almacenan de forma segura y consistente.
2. **Escalabilidad**: Capacidad para manejar grandes volúmenes de datos históricos.
3. **Rendimiento**: Optimización de consultas y caché para acceso rápido a datos.
4. **Consultas avanzadas**: Posibilidad de realizar análisis complejos sobre datos históricos.
5. **Respaldo**: Mecanismos integrados de respaldo y recuperación.

## Extensiones Avanzadas

### TimescaleDB

Si la extensión TimescaleDB está disponible, se utiliza para:

- Compresión automática de datos antiguos
- Consultas optimizadas para series temporales
- Funciones especializadas para análisis de datos financieros

```sql
-- Ejemplo de consulta avanzada con TimescaleDB
SELECT 
  time_bucket('1 day', time) AS day,
  first(open, time) AS day_open,
  max(high) AS day_high,
  min(low) AS day_low,
  last(close, time) AS day_close,
  sum(volume) AS total_volume
FROM market_data_candles
WHERE symbol = 'BTCUSDT' AND time > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC;
```

## Migración desde Archivos JSON

El sistema incluye un mecanismo para migrar automáticamente datos desde los archivos JSON previamente utilizados. Esta migración:

1. Lee los archivos existentes (ej. `trade_history.json`)
2. Convierte los datos al formato de la base de datos
3. Guarda los datos en las tablas correspondientes
4. Opcionalmente, crea respaldos de los archivos originales

## Desarrollo Futuro

Posibles mejoras futuras:

- Implementación de particionado de tablas para mejor rendimiento
- Integración con herramientas de análisis y visualización
- Sistemas de auditoría y seguimiento de cambios
- Optimización de índices basada en patrones de uso
