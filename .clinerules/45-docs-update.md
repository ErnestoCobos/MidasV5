# Docs-Update (Diátaxis)
# Actualiza o genera Markdown de documentación cada vez que cambien
# fuentes relevantes. Cubre Diátaxis:
#   • Tutorials      → docs/tutorials/
#   • How‑to Guides  → docs/how-to/
#   • Reference API  → docs/reference/   (Typedoc)
#   • Explanations   → docs/explanations/
#   • Métricas       → cobertura, badges, changelog

## When
on_command: task_done        # disparo manual al cerrar feature / fix
pre_push                     # safety net antes de enviar a remoto

## Steps
1. **Detectar módulos cambiados**
   ```bash
   git diff --name-only origin/main...HEAD | grep -E '^src/.*\.(ts|tsx)$' > /tmp/changed.txt
   ```
   - Si el archivo está vacío → salir.

2. **Generar / actualizar Referencia API (Typedoc)**
   ```bash
   npm exec typedoc --out docs/reference src
   ```
   - Si la salida cambia, añade los archivos a Git.

3. **Actualizar How‑to / Tutorials / Explanations**
   - Por cada archivo en `/tmp/changed.txt`:
     | Capa origen          | Destino Diátaxis            |
     |----------------------|-----------------------------|
     | `services/**`        | `docs/how-to/`              |
     | `adapters/**`        | `docs/how-to/`              |
     | `core/**`            | `docs/explanations/`        |
     | `utils/**`           | `docs/how-to/`              |
     | `strategies/**`      | `docs/explanations/`        |
     | `portfolio-manager/**` | `docs/portfolio-manager.md` |
     | `telegram/**`        | `docs/telegram-integration-update.md` |
   - Crear plantilla `.md` si no existe, o inyectar sección **"Cambios recientes"** con diff.

4. **Actualizar métricas**
   ```bash
   node scripts/generate-coverage-summary.js   # actualiza docs/test-coverage.md
   node scripts/generate-coverage-badge.js     # actualiza docs/badges/coverage.svg
   ```

5. **Tabla de contenidos automática**
   ```bash
   npx markdown-toc -i docs/README.md
   ```

6. **Commit documentación**
   ```bash
   git add docs/**/*.md docs/reference/** docs/badges/*
   if git diff --cached --quiet; then exit 0; fi
   git commit -m "docs: update project documentation" --no-verify
   ```

## Fail-level
info    # solo informa; cambia a warn/error si lo deseas

## Config
typedoc_options:
  entryPoints: ["src/index.ts"]
  tsconfig: "tsconfig.json"
doc_folders:
  tutorials: docs/tutorials
  howto: docs/how-to
  reference: docs/reference
  explanations: docs/explanations
coverage_badge: docs/badges/coverage.svg
toc_root: docs/README.md
readme_files:
  - README.md
  - docs/README.md
  - docs/command-line-interface.md
  - docs/portfolio-manager.md
  - docs/database.md
