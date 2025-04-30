# Interfaz de Línea de Comandos

El sistema proporciona una interfaz de línea de comandos (CLI) robusta y fácil de usar para interactuar con los diferentes componentes del sistema de trading. Esta interfaz permite tanto ejecutar los scripts principales como interactuar con el gestor de portafolio en tiempo real.

## Ejecutables Principales

El sistema tiene dos ejecutables principales:

### 1. Sistema de Crecimiento de Capital

```bash
./src/run-growth-system.js
```

Este script ejecuta una secuencia de pasos para optimizar el crecimiento de capital pequeño:

1. Demostración del criterio de Kelly para optimización de posiciones
2. Escaneo del mercado para encontrar oportunidades
3. Ejecución de la estrategia de trading optimizada

#### Opciones Disponibles:

| Opción | Descripción | Valor por defecto |
|--------|-------------|-------------------|
| `--capital=X` | Capital inicial en USD | 54 |
| `--positions=X` | Número máximo de posiciones | 2 |
| `--no-demo` | Omitir la demostración de Kelly | - |
| `--no-scan` | Omitir el escaneo de mercado | - |
| `--no-trade` | Omitir la ejecución de trading | - |
| `--symbol=X` | Usar símbolo específico | SOLUSDT |

#### Ejemplos:

```bash
# Ejecutar con configuración predeterminada
./src/run-growth-system.js

# Ejecutar con capital personalizado
./src/run-growth-system.js --capital=100

# Omitir escaneo y usar símbolo específico
./src/run-growth-system.js --no-scan --symbol=ETHUSDT

# Solo ejecutar la demostración de Kelly
./src/run-growth-system.js --no-scan --no-trade
```

### 2. Gestor Dinámico de Portafolio

```bash
./src/run-portfolio-manager.js
```

Este script ejecuta el gestor de portafolio en modo interactivo, permitiendo monitorización continua y rotaciones dinámicas.

#### Opciones Disponibles:

| Opción | Descripción | Valor por defecto |
|--------|-------------|-------------------|
| `--capital=X` | Capital inicial en USD | 54 |
| `--interval=X` | Intervalo de escaneo en minutos | 1 |
| `--threshold=X` | Umbral de confianza para rotaciones (0-1) | 0.8 |
| `--cash-reserve=X` | Porcentaje de efectivo a mantener | 15 |
| `--max-positions=X` | Número máximo de posiciones | 2 |
| `--no-diversification` | No forzar diversificación | - |

#### Ejemplos:

```bash
# Ejecutar con configuración predeterminada
./src/run-portfolio-manager.js

# Ejecutar con capital personalizado e intervalo de 5 minutos
./src/run-portfolio-manager.js --capital=100 --interval=5

# Ejecutar en modo más agresivo (menor umbral y reserva)
./src/run-portfolio-manager.js --threshold=0.7 --cash-reserve=10
```

## Interfaz Interactiva del Gestor de Portafolio

Una vez iniciado el gestor de portafolio, se presenta una interfaz interactiva que permite al usuario ejecutar comandos en tiempo real.

### Comandos Disponibles:

| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `status` | Muestra el estado actual del portafolio | `status` |
| `force SYMBOL [AMOUNT]` | Fuerza una rotación hacia un activo específico | `force SOL 20` |
| `exit` | Detiene el gestor y sale | `exit` |

### Ejemplo de Sesión Interactiva:

```
Sistema de Gestión de Portafolio Dinámico con DeepSeek - Capital: $54
> status

RESUMEN DEL PORTAFOLIO
═══════════════════════════════
Capital total: $54.00
Rendimiento total: +2.35%
Efectivo disponible: $8.10
Última actualización: 30/04/2025, 09:25:15

ACTIVOS:
--------------------------------------------------
SÍMBOLO   | ASIGNACIÓN |  PRECIO  |    REND.   | MOMENTUM
--------------------------------------------------
SOLUSDT   | $    25.65 |  135.200 |     +3.20% |    72/100
NEARUSDT  | $    20.25 |    3.850 |     +1.10% |    64/100
--------------------------------------------------

> force ETH 15

Forzando rotación a ETHUSDT...
Rotación manual ejecutada con éxito.

> status

RESUMEN DEL PORTAFOLIO
═══════════════════════════════
Capital total: $54.00
Rendimiento total: +2.15%
Efectivo disponible: $13.35
Última actualización: 30/04/2025, 09:26:30

ACTIVOS:
--------------------------------------------------
SÍMBOLO   | ASIGNACIÓN |  PRECIO  |    REND.   | MOMENTUM
--------------------------------------------------
SOLUSDT   | $    25.65 |  134.800 |     +2.90% |    71/100
ETHUSDT   | $    15.00 |  3012.50 |      0.00% |    68/100
--------------------------------------------------

> exit

Deteniendo gestor de portafolio...
¡Hasta pronto!
```

## Formato de Salida

El sistema utiliza colores en la terminal para mejorar la legibilidad:

- **Verde**: Rendimientos positivos, confirmaciones de éxito
- **Rojo**: Rendimientos negativos, errores
- **Amarillo**: Advertencias, notificaciones importantes
- **Cian**: Títulos, información de progreso
- **Blanco brillante**: Valores importantes, comandos

## Logs y Depuración

El sistema genera logs detallados para análisis y depuración. Los logs incluyen:

1. **Logs de trading**: Decisiones de compra/venta, rotaciones
2. **Logs de sistema**: Inicialización, errores, conexiones
3. **Logs de DeepSeek**: Solicitudes, respuestas, razonamiento

Los logs se almacenan en la carpeta `logs/` del directorio raíz.

## Salida en Caso de Error

En caso de error, el sistema proporciona mensajes claros y descriptivos:

```
✗ Error ejecutando el sistema: No es posible conectar con el servicio de Binance. Compruebe su conexión a internet y las credenciales API.
```

## Recomendaciones para el Uso de la CLI

1. **Ejecutar primero con valores por defecto** para familiarizarse con el sistema
2. **Monitorear regularmente** el estado del portafolio con el comando `status`
3. **Usar `force`** con cautela, solo cuando se identifiquen oportunidades excepcionales
4. **Guardar logs** para análisis posterior de rendimiento
5. **Comenzar con capital pequeño** hasta estar familiarizado con el sistema
