# Test Coverage

## Descripción General

Este proyecto utiliza Jest como framework de pruebas y tiene configurado el seguimiento de cobertura de código. Los informes de cobertura se generan automáticamente durante las ejecuciones de CI/CD y se pueden generar localmente para análisis.

## Ejecución Local de Pruebas con Cobertura

Para ejecutar las pruebas con generación de informes de cobertura:

```bash
npm run test:coverage
```

Este comando ejecutará todas las pruebas y generará un informe detallado de la cobertura del código en el directorio `coverage/`.

## Visualización del Informe de Cobertura

Después de ejecutar las pruebas con cobertura, puedes ver el informe HTML en tu navegador:

```bash
npm run coverage:view
```

## Insignias de Cobertura

Este proyecto genera automáticamente una insignia de cobertura que se puede incluir en el README.md. Esta insignia se actualiza cuando:

1. Se ejecutan las pruebas con éxito en la rama principal (main/master)
2. El flujo de trabajo de GitHub Actions dedicado a las insignias procesa los resultados

La insignia muestra el porcentaje de cobertura de líneas de código y utiliza un esquema de colores para indicar la calidad:

- 🟩 Verde (>= 90%): Excelente cobertura
- 🟨 Verde amarillento (>= 80%): Buena cobertura
- 🟨 Amarillo (>= 70%): Cobertura aceptable
- 🟧 Naranja (>= 50%): Cobertura baja
- 🟥 Rojo (< 50%): Cobertura insuficiente

## Scripts de Generación de Informes

El proyecto incluye dos scripts para la generación de informes de cobertura:

1. `scripts/generate-coverage-summary.js`: Analiza los archivos de cobertura y genera un resumen JSON
2. `scripts/generate-coverage-badge.js`: Crea una insignia SVG basada en el resumen de cobertura

Estos scripts se ejecutan automáticamente en el flujo de trabajo de CI/CD, pero también pueden ejecutarse manualmente:

```bash
npm run coverage:summary
npm run coverage:badge
```

## Configuración de Jest

La configuración de Jest para la cobertura se encuentra en el archivo `jest.config.js`. Por defecto:

- Se recogen métricas para líneas, declaraciones, funciones y ramas
- Se excluyen algunos directorios como `node_modules` y archivos de configuración

## Umbrales de Cobertura

Actualmente no hay umbrales mínimos de cobertura configurados que causen fallos en los procesos de CI/CD. Sin embargo, se recomienda mantener al menos un 70% de cobertura de líneas para el código de producción.

## Mejora Continua

Para mejorar la cobertura de pruebas:

1. Prioriza la escritura de pruebas para componentes críticos y lógica de negocio
2. Utiliza el informe HTML detallado para identificar áreas sin cobertura
3. Considera implementar umbrales mínimos de cobertura en el futuro
