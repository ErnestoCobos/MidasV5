# Architecture Guard
# Refuerza la arquitectura hexagonal de MidasTS:
#  • Dominio y lógica de aplicación ≠ infraestructura
#  • Adaptadores solo implementan puertos (interfaces)
#  • Core nunca conoce detalles externos (inversión de dependencias)

## When
after_save                 # Se ejecuta cada vez que guardas un archivo
pre_commit                 # Segunda línea de defensa antes de subir código

## Carpetas y roles esperados
| Carpeta                           | Rol                                  |
|-----------------------------------|--------------------------------------|
| `core/domain/**`                  | Entidades, Value Objects, Domain Events |
| `core/application/**`             | Casos de uso, Services (stateless)  |
| `core/analysis/**` `core/math/**` | Funciones puras (FP) y cálculos      |
| `ports/**`                        | Interfaces (puertos) del hexágono    |
| `adapters/inbound/**`             | Entradas : CLI, Telegram, HTTP, etc. |
| `adapters/outbound/**`            | Salidas : Binance, DB, LunarCrush, etc. |
| `infrastructure/**`               | Wiring, configuración, DI contenedor |
| `services/**`                     | Implementaciones de servicios        |
| `strategies/**`                   | Implementaciones de estrategias de trading |
| `utils/**`                        | Utilidades generales (circuit-breaker, worker-pool) |
| `repositories/**`                 | Acceso a datos y persistencia        |

> **ℹ️ Configurable**: añade más carpetas en `allowed_folders:` si tu proyecto crece.

## Steps
1. **Import boundary check**
   - Prohíbe `core/**` (o `ports/**`) → importar *directamente* desde:
     - `adapters/**`
     - `infrastructure/**`
     - `services/**` (implementaciones concretas)
   - Si ocurre, muestra error con ubicación y sugiere:
     1. Mover interfaz al paquete `ports/**`
     2. Hacer que `core` dependa solo del puerto
2. **Folder role heuristics**
   - Si archivo bajo `core/analysis` contiene `class` con campos `private` o `public`
     ➜ *warning*: "Este módulo debería ser funcional puro".
   - Si archivo bajo `adapters/**` solo expone funciones sueltas con `let` mutables
     ➜ sugiere encapsular en clase implementando puerto X.
   - Si un archivo de servicio (`services/**`) no implementa un puerto definido
     ➜ *warning*: "Servicio debería implementar un puerto definido en ports/"
3. **Naming conventions**
   - Clases de adaptador ➜ deben terminar en `Adapter` (`BinanceAdapter`),
     inbound terminan en `Handler` o `Controller`.
   - Ports ➜ deben llevar sufijo `Port` o prefijo `I`.
   - Servicios importantes como `PortfolioManager` o `DeepSeekService` deben tener interfaces asociadas.
4. **Circular dependency detection**
   ```bash
   npx madge --warning --circular src | grep -q "Circular"
   ```
   - Si detecta círculos entre capas distintas ➜ error.
5. **Optional autofix (beta)**
   - Si el import prohibido es simple (`import { X } from '../../adapters/...';`)
     y existe puerto con mismo nombre en `ports/**`:
     - Reescribe import para usar el puerto y agrega implementación en adaptador.
6. **Reporting**
   - Lista todos los problemas con path + línea.
   - Para cada aviso:
     ```
     core/domain/Trade.ts:12 -> Importa infraestructura
       Sugerencia: extrae interface ExchangePort a /ports/exchange.ts
     ```

## Fail-level
warn          # Cambia a `error` en CI para bloquear merges

## Config
allowed_folders:
  - src
  - tests
  - scripts
  - config
  - src/services
  - src/strategies
  - src/utils
  - src/repositories

severity:
  import_violation: error
  core_adapter_import: error
  port_implementation_missing: warn
  folder_mismatch: warn
  naming: warn
  circular: error
  mixed_responsibilities: warn
  deepseek_direct_import: error       # Error específico para importaciones directas a DeepSeek sin puerto
  service_without_interface: warn     # Advertencia para servicios sin interfaz definida

allowed_exceptions:
  - pattern: "infrastructure/di/**"         # El contenedor DI necesita conocer todas las capas
  - pattern: "tests/**"                     # Tests pueden importar cualquier cosa
  - pattern: "core/utils/testHelpers.ts"    # Utilidades para testing
  - pattern: "**/index.ts"                  # Archivos de barril pueden re-exportar
  - pattern: "simple-test.js"               # Script de pruebas simple

ignore_patterns:
  - "**/*.spec.ts"
  - "**/*.test.ts"
  - "**/mocks/**"
  - "**/node_modules/**"

## Ejemplos
✔️ **Permitido**  
`core/application/PlaceOrderService.ts` → `import { ExchangePort } from '../../ports';`

✔️ **Permitido**  
`adapters/outbound/BinanceAdapter.ts` → `implements ExchangePort from '../../ports'`

✔️ **Permitido**  
`services/portfolio-manager.ts` → `implements PortfolioManagerPort from '../ports/portfolio-manager'`

❌ **Prohibido**  
`core/domain/Portfolio.ts` → `import { BinanceAdapter } from '../../adapters/outbound/binance';`

❌ **Prohibido**  
`core/analysis/market-scanner.ts` → `import { DeepSeekService } from '../../services/deepseek';`  
En su lugar: `import { DeepSeekPort } from '../../ports/deepseek';`

❌ **Prohibido**  
`adapters/outbound/BinanceAdapter.ts` sin implementar ninguna interfaz de `ports/`

## Servicios principales y sus puertos
Para los servicios principales de MidasTS, asegúrate de definir estos puertos:

1. `ports/portfolio-manager.ts`: Interfaz para gestión de rotaciones y monitoreo
2. `ports/market-scanner.ts`: Interfaz para escaneo de oportunidades
3. `ports/deepseek.ts`: Interfaz para interacciones con DeepSeek IA
4. `ports/exchange.ts`: Interfaz para interacciones con exchanges como Binance
5. `ports/sentiment-analyzer.ts`: Interfaz para análisis de sentimiento (LunarCrush)
6. `ports/feedback-store.ts`: Interfaz para el sistema de feedback y aprendizaje

## Tips
- **Inyección de dependencias**: usa constructor injection o *tsyringe* para
  que `application`/`services` reciban puertos sin conocer implementaciones.
- **Mocks en tests**: importa puertos, nunca adaptadores reales.
- **Componentes de UI**: separa la lógica de presentación de la lógica de negocio usando adaptadores.
- **Migrando código legacy**: crea adaptadores temporales hasta que puedas refactorizar completamente.
- **Eventos**: los servicios como PortfolioManager pueden emitir eventos, pero los suscriptores
  deben depender solo de interfaces de eventos (EventEmitter), no de la implementación concreta.
- **Worker Pool**: el sistema de procesamiento paralelo debe encapsularse tras una interfaz
  para que las funciones de análisis técnico no dependan directamente de la implementación.
