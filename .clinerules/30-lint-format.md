# Lint-Format
# Garantiza que todo el código TypeScript/JavaScript siga las reglas ESLint estrictas
# y el formato Prettier antes de que los cambios se comprometan.

## When
pre_commit                 # Ejecutado por Husky (`.husky/pre-commit`)
after_save? false          # Descomenta si quieres lint instantáneo al guardar

## Herramientas
- **ESLint flat config** (`eslint.config.js`) con `@typescript-eslint` y
  `eslint-plugin-simple-import-sort`.
- **Prettier** (`.prettierrc`) para formato consistente.
- **npm** como gestor de paquetes.

---

## Steps
1. <b>Banner de inicio</b>  
   ```bash
   echo "🔍  Running ESLint & Prettier checks…"
   ```

2. <b>ESLint — modo fix</b>  
   ```bash
   npm exec eslint .      --ext .ts,.tsx,.mts,.cts      --max-warnings 0      --fix
   ```
   - El flag `--max-warnings 0` falla si hay <em>warnings</em> sin corregir.
   - La configuración exige:  
     * sin `any` (&lt;= reglas strict)  
     * imports ordenados (`simple-import-sort`)  
     * sin `console.log` producción.

3. <b>Prettier — modo write</b>  
   ```bash
   npm exec prettier --write .
   ```

4. <b>Verificar staged diffs</b>  
   ```bash
   CHANGED=$(git diff --name-only --cached)
   if [ -n "$CHANGED" ]; then
     echo "⚠️  Some files were auto‑fixed. Adding them to commit…"
     git add $CHANGED
   fi
   ```

5. <b>Límite de archivos modificados</b>  
   ```bash
   FILE_COUNT=$(echo "$CHANGED" | wc -l)
   if [ "$FILE_COUNT" -gt 60 ]; then
     echo "🚫  Más de 60 archivos modificados por Prettier. Divide el commit."
     exit 1
   fi
   ```

6. <b>Resumen y éxito</b>  
   - Muestra número de archivos fijos y tiempo total de lint+format.

---

## Fail-level
error        # Cancela el commit si ESLint o Prettier devuelven error.

---

## Config
```yaml
extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"]
ignorePatterns:
  - "dist/**"
  - "node_modules/**"
  - "*.generated.ts"
eslintConfigFile: "eslint.config.js"
prettierConfigFile: ".prettierrc"
maxAutofixFiles: 60
```

---

## Ejemplo `.husky/pre-commit`
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npm exec cline run-rule Lint-Format
```

---

## Consejos
* Ejecutar `npm lint` en CI para todos los archivos, no solo stageados.
* Usa `eslint --print-config <file>` para depurar reglas efectivas.
* Prettier debe extender reglas de ESLint para evitar conflictos (`eslint-config-prettier`).

