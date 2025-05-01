# Midas-Conventional-Commit
# Regla específica para commits automáticos/manuales de **MidasTS**.
# Incluye scopes preferidos y autor por defecto.

## When
commit_msg

## Allowed types
feat, fix, docs, style, refactor, test, chore, perf, build, ci, revert

## Preferred scopes
core, domain, analysis, adapter, service, infra, config, deps

## Author default
--author="Ernesto Cobos <ernesto@cobos.io>"

## Steps
1. Validar que el mensaje cumpla la spec global (invoca Global-Conventional-Commit).
2. Verificar `scope`:
   - Si falta → sugerir uno de la lista preferida.
3. Verificar descripción:
   - Máx 72 chars (error si > 72, warn si > 60).
4. Auto‑insert footer si se detecta keyword "BREAKING":
   ```
   BREAKING CHANGE: describe motivation
   ```
5. Si commit generado por regla Auto-Commit:
   - Prefija scope automáticamente según patrón de carpeta.

## Fail-level
error

## Ejemplos válidos

```
feat(core): add order builder pattern
fix(adapter-binance): handle 429 errors
chore(deps): bump vitest to 1.5.0
```
