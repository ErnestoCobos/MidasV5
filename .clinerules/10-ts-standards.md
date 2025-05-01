 # TS-Standards
# Reglas de consistencia TypeScript estricto para MidasTS
# Objetivo: mantener un código 100 % tipado, legible y fácil de refactorizar.

## When
on_command: ts_file_saved         # Dispara cada vez que se guarda un .ts/.tsx

## Steps
1. **Compilación sin emisión**
   ```bash
   npm exec tsc --noEmit
   ```
   - Si aparecen errores → mostrar los 20 primeros y **avisa** (`fail_level` configurable).

2. **Chequeos rápidos de calidad**
   - ❌ `any` &rarr; permite solo en archivos marcados con `// @legacy`.
   - ❌ `console.log` fuera de tests.
   - ❌ `TODO` sin ticket de referencia.
   - ✅ Importación de tipos con `import type { … }` cuando sea posible.

3. **Paradigm hints** *(nuevo)*
   | Carpeta                                      | Esperado                                       |
   | -------------------------------------------- | ---------------------------------------------- |
   | `core/analysis/**`, `core/math/**`           | Funciones puras sin estado mutable             |
   | `adapters/**`, `services/**`, `managers/**`  | Clases/instancias OOP que implementan puertos  |
   - Si regla violada → mensaje “⛔ Considera mover/cambiar a estilo FP/OOP”.

4. **Patrones buscados y sugerencias**
   - *Switch exhaustivo*: añade `const _exhaustiveCheck: never = x;`.
   - Promesas encadenadas (`.then().then()`) &gt; 2 → sugiere `async/await`.
   - Funciones públicas sin tipo de retorno → añadirlo.
   - Literales mágicos (‘BUY’, ‘SELL’…) → extraer a `type` o `enum`.

5. **Import order & sorting (opcional)**
   ```bash
   npx eslint --rule 'simple-import-sort/imports:error' src/<file>
   ```
   - Se autocorrige si `--fix` está activo.

6. **Resumen**
   - Imprime tabla con:
     | Errores | Warnings | Tiempo total (ms) |
   - Si `--verbose` flag: lista sugerencias con línea y fix rápido.

## Fail-level
warn           # Local: solo advierte; CI puede cambiar a `error`.

## Config
allow_legacy_any: true
legacy_any_tag : "// @legacy"
max_console_log: 0
