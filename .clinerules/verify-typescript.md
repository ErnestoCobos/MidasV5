## Objetivo  
Garantizar que Cline ejecute la comprobación de tipos en cada cambio que pueda romper la compilación.

## Cuándo dispararse  
- Después de crear o editar cualquier archivo `.ts`, `.tsx` o `tsconfig.json`.

## Pasos que Cline debe seguir  
1. Pregunta permiso para correr el comando de chequeo:
   ```bash
   # usa el gestor que detecte, en orden de preferencia
   pnpm exec tsc --noEmit --pretty \
   || npm run type-check \
   || npx tsc --noEmit --pretty