# Paradigm-Choice Guard
# Garantiza que cada módulo use el paradigma adecuado (OOP ↔ Funcional)
# según las guías de MidasTS y refuerza la arquitectura hexagonal.

## When
after_save          # Se dispara al guardar un archivo .ts/.tsx

## Steps
1. **Clasificación de carpetas y expectativas**

| Carpeta                                       | Paradigma esperado                           |
| --------------------------------------------- | -------------------------------------------- |
| `core/analysis/**`, `core/math/**`            | **Funciones puras** (FP) sin estado mutable  |
| `core/domain/**`                              | Entidades/Value Objects inmutables (OOP)     |
| `services/**`, `managers/**`                  | Clases OOP que orquestan lógica              |
| `adapters/**`                                 | Clases OOP que implementan puertos           |
| `ports/**`                                    | **Interfaces** para contratos entre capas    |
| `ui/components/**`                            | Componentes React (preferencia funcionales)  |
| `tests/**`                                    | Cualquier paradigma para pruebas             |

2. **Heurísticas de comprobación**

- **FP folders (`analysis`, `math`)**  
  - Si detecta `class` con `private`/`public` => ⚠️ warn: "Usa funciones puras en esta carpeta o mueve la clase a `services/`."
  - Si existen asignaciones `let` mutables fuera de función ➜ warn.
  - Si hay efectos secundarios (network calls, I/O) ➜ warn: "Extrae efectos secundarios a servicios."

- **OOP folders (`adapters`, `services`, `managers`)**  
  - Si solo exportan funciones sueltas con estado global (`let cache = …`) ➜ warn: "Encapsula en clase o mueve a carpeta FP."
  - Si mezclan responsabilidades de adaptadores y lógica core ➜ error: "Separa adaptadores de lógica de negocio."

- **Archivo mixto**  
  - >1 clase **y** exportaciones de función pura ➜ sugiere separar en módulos.
  - Si usa múltiples paradigmas sin clara separación ➜ warn: "Elige un paradigma consistente para este módulo."

3. **Restricción de imports**

- Prohíbe que módulos en `core/**` importen *directamente* desde `adapters/**` o `infrastructure/**`.  
  Mensaje: "Core solo debe depender de puertos; extrae interfaz a `ports/`."
- Verifica que módulos en `adapters/**` implementen interfaces de `ports/**`.
  Mensaje: "Los adaptadores deben implementar interfaces de puertos."

4. **Reporting**

- Enumera todos los problemas con: `path:line → descripción + sugerencia`.
- Si flag `--verbose` presente, muestra snippet de código conflictivo.
- Agrega sugerencias de refactoring cuando sea posible.

## Fail-level
warn          # Solo advierte en local; en CI se puede elevar a error.

## Config
severity:
  paradigm_mismatch : warn
  fp_state          : warn
  core_import_violation : error
  mixed_module      : warn
  adapter_port_missing : warn

allowed_exceptions:
  - pattern: "core/utils/testHelpers.ts"    # Permitir cualquier paradigma en helpers de test
  - pattern: "infrastructure/di/**"         # Contenedor DI puede referenciar todas las capas

## Ejemplos

✔️ **Correcto**  
`core/analysis/rsi.ts` exporta `function calculateRSI(prices: number[]): number`

✔️ **Correcto**  
`ports/repositories/UserRepository.ts` define `interface UserRepository { findById(id: string): Promise<User>; }`

❌ **Incorrecto**  
`core/analysis/RSIService.ts` contiene `class RSIService { private period = 14; … }`

❌ **Import violación**  
`core/domain/Portfolio.ts` → `import { BinanceAdapter } from '../../adapters/outbound'`

❌ **Falta implementación de puerto**  
`adapters/outbound/BinanceAdapter.ts` no implementa una interfaz de `ports/`

---

_Ajusta `severity`, `allowed_exceptions` o `allowed_folders` según evolucione la estructura de tu proyecto._
