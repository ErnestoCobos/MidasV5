# GitHub Actions

Este proyecto utiliza GitHub Actions para automatizar procesos de pruebas, análisis de código y publicación. A continuación se detallan los flujos de trabajo configurados.

## Flujos de trabajo (Workflows)

### 1. Tests (`.github/workflows/test.yml`)

Ejecuta las pruebas automatizadas y reporta la cobertura del código.

**Eventos de activación:**
- Push a las ramas `main` o `master`
- Pull Request a las ramas `main` o `master`

**Tareas:**
- Ejecuta pruebas en múltiples versiones de Node.js (16.x, 18.x, 20.x)
- Genera informes de cobertura de código
- Sube los informes de cobertura a Codecov

**Configuración requerida:**
- Para la integración con Codecov, se necesita configurar el secreto `CODECOV_TOKEN` en la configuración del repositorio.

### 2. Calidad de Código (`.github/workflows/code-quality.yml`)

Realiza verificaciones de calidad de código y seguridad.

**Eventos de activación:**
- Push a las ramas `main` o `master`
- Pull Request a las ramas `main` o `master`

**Tareas:**
- Verifica errores de TypeScript
- Realiza auditorías de seguridad en las dependencias
- Detecta dependencias desactualizadas

**Notas:**
- La verificación de linting está comentada y debe ser activada una vez que se configure ESLint en el proyecto.

## Personalización

Para personalizar estos flujos de trabajo:

1. **Ajustar las ramas monitoreadas:** Modifica los campos `branches` en la sección `on` si usas diferentes nombres de ramas principales.

2. **Configurar ESLint:** Cuando se configure ESLint, descomenta la sección correspondiente en `code-quality.yml`.

3. **Versiones de Node.js:** Puedes ajustar las versiones de Node.js en la matriz de `test.yml` según las necesidades del proyecto.

4. **Integración continua:** Puedes extender estos workflows para desplegar automáticamente a entornos de desarrollo, staging, o producción cuando sea necesario.

## Secretos Requeridos

Para que estos workflows funcionen correctamente, debes configurar los siguientes secretos en la configuración del repositorio en GitHub:

- `CODECOV_TOKEN`: Token de acceso para subir informes de cobertura a Codecov
- `NPM_TOKEN`: Token de acceso para publicar en npm
- `GITHUB_TOKEN`: Automáticamente proporcionado por GitHub, no requiere configuración manual

## Comandos Útiles para Probar Localmente

Antes de hacer push, puedes probar algunos aspectos de estos workflows localmente:

```bash
# Verificar errores de TypeScript
npx tsc --noEmit

# Ejecutar auditoría de seguridad
npm audit

# Revisar dependencias desactualizadas
npm outdated

# Ejecutar pruebas con cobertura
npm run test:coverage
```
