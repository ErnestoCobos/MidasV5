# Auto-Tests
# Genera plantillas de prueba específicas para los componentes de MidasTS y
# ejecuta Vitest para asegurar cobertura adecuada en código nuevo o modificado.

## When
on_command: task_done         # Se dispara manual al cerrar una tarea
after_save? false             # Actívalo si quieres pruebas tras cada guardado
pre_commit? false             # Opcional: verificar cobertura antes de commit

## Herramientas
- **Vitest** para unit & integration
- **ts-node** (o tsx) para ejecutar scripts de generación
- **npm** para comandos de monorepo
- **Istanbul/c8** para cobertura

---

## Steps
1. **Detectar archivos modificados**  
   ```bash
   git diff --name-only HEAD~1 | grep '\.ts$' | grep -v '\.spec\.ts$' | grep -v '\.test\.ts$' > /tmp/changed-ts.txt
   ```
   - Si el tamaño es 0 → sin acción.

2. **Identificar tipo de componente**
   Para cada archivo detectado, analizar su ruta y estructura:
   - `/services/` → Servicios (DeepSeek, Portfolio, etc.)
   - `/core/domain/` → Entidades de dominio
   - `/core/analysis/` → Funciones de análisis técnico
   - `/repositories/` → Repositorios de datos
   - `/adapters/` → Adaptadores (Binance, LunarCrush, etc.)
   - `/strategies/` → Estrategias de trading
   - `/utils/` → Utilidades

3. **Generar pruebas faltantes**  
   Para cada archivo listado:
   - Busca patrón según tipo (clase, función, etc.)
   - Verifica si existe test: `tests/**/<Name>.spec.ts` o `<path>/<Name>.spec.ts`
   - Si falta, crea plantilla según tipo del componente:

   **Para servicios principales (DeepSeek, PortfolioManager)**:
   ```ts
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { <Name> } from '<import-path>';
   import { EventEmitter } from 'events';

   describe('<Name>', () => {
     let <instanceName>: <Name>;
     
     beforeEach(() => {
       // Mock external dependencies
       vi.mock('../services/dependencia1', () => ({
         Dependencia1: vi.fn().mockImplementation(() => ({
           method1: vi.fn().mockResolvedValue({}),
           method2: vi.fn().mockResolvedValue({})
         }))
       }));
       
       <instanceName> = new <Name>({
         // Mock constructor parameters
       });
     });

     afterEach(() => {
       vi.clearAllMocks();
     });
     
     describe('<methodName>', () => {
       it('should correctly process valid inputs', async () => {
         // Arrange
         const input = {};
         
         // Act
         const result = await <instanceName>.<methodName>(input);
         
         // Assert
         expect(result).toBeDefined();
       });
       
       it('should handle errors correctly', async () => {
         // Arrange
         vi.spyOn(<instanceName>, '<dependencyMethod>').mockRejectedValueOnce(new Error('Test error'));
         
         // Act & Assert
         await expect(<instanceName>.<methodName>({})).rejects.toThrow();
       });
     });

     // Test event emissions if extends EventEmitter
     if (<Name>.prototype instanceof EventEmitter) {
       it('should emit events correctly', async () => {
         // Arrange
         const eventSpy = vi.fn();
         <instanceName>.on('<eventName>', eventSpy);
         
         // Act
         await <instanceName>.<methodThatEmits>({});
         
         // Assert
         expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
           // Expected event properties
         }));
       });
     }
   });
   ```

   **Para funciones de análisis**:
   ```ts
   import { describe, it, expect } from 'vitest';
   import { <functionName> } from '<import-path>';

   describe('<functionName>', () => {
     it('should calculate correctly with valid inputs', () => {
       // Arrange
       const input = [/* test data */];
       
       // Act
       const result = <functionName>(input);
       
       // Assert
       expect(result).toBeDefined();
       // Add specific assertions based on function purpose
     });
     
     it('should handle edge cases', () => {
       // Test empty arrays, extreme values, etc.
       expect(<functionName>([])).toEqual(/* expected result */);
     });
     
     it('should throw on invalid inputs', () => {
       // @ts-ignore - Testing invalid inputs
       expect(() => <functionName>(null)).toThrow();
     });
   });
   ```
   
   **Para adaptadores externos (Binance, LunarCrush)**:
   ```ts
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { <Name> } from '<import-path>';

   describe('<Name>', () => {
     let <instanceName>: <Name>;
     let mockFetch: any;
     
     beforeEach(() => {
       mockFetch = vi.fn();
       global.fetch = mockFetch;
       
       <instanceName> = new <Name>({
         apiKey: 'test-api-key',
         apiSecret: 'test-api-secret'
       });
     });
     
     describe('<methodName>', () => {
       it('should correctly call API endpoint', async () => {
         // Arrange
         mockFetch.mockResolvedValueOnce({
           ok: true,
           json: async () => ({ /* mock response */ })
         });
         
         // Act
         const result = await <instanceName>.<methodName>({});
         
         // Assert
         expect(mockFetch).toHaveBeenCalledWith(
           expect.stringContaining('<endpoint>'),
           expect.objectContaining({
             method: 'GET', // or POST, etc.
             headers: expect.objectContaining({
               'X-API-Key': 'test-api-key'
             })
           })
         );
         expect(result).toBeDefined();
       });
       
       it('should handle API errors', async () => {
         // Arrange
         mockFetch.mockResolvedValueOnce({
           ok: false,
           status: 429,
           statusText: 'Too Many Requests'
         });
         
         // Act & Assert
         await expect(<instanceName>.<methodName>({})).rejects.toThrow();
       });
     });
   });
   ```
   
   - Añade la ruta al `git add`.

4. **Ejecutar pruebas**  
   ```bash
   npm vitest run --changedSince=HEAD~1 --coverage
   ```

5. **Cobertura mínima por tipo de componente**  
   - Dominio y Core: 90% líneas, 80% ramas
   - Servicios principales: 85% líneas, 70% ramas
   - Adaptadores externos: 80% líneas
   - Utilidades: 75% líneas
   
   Si < threshold → `warn` (configurable con `coverage.<tipo>`).

6. **Reporte**  
   - Imprime tabla: `Archivos | Tests Run | Passed | Coverage`.
   - Muestra ruta de reportes HTML.
   - Sugiere mejoras específicas para componentes con cobertura baja.

---

## Fail-level
warn           # Cambia a `error` si deseas bloquear commit/push.

## Config
coverage:
  domain: 90
  core: 90
  services: 85
  adapters: 80
  utils: 75
  strategies: 85

test_dir: tests
template_engine: ejs
add_git_stage: true
enable_watch_mode: false

specific_tests:
  - pattern: "services/portfolio-manager.ts"
    template: "templates/portfolio-manager-test.ejs"
  - pattern: "services/deepseek.ts"
    template: "templates/deepseek-service-test.ejs"

---

### Ejemplo de uso manual
```bash
# Probar un archivo específico
npm exec cline run-rule Auto-Tests --files src/services/portfolio-manager.ts

# Probar servicios principales
npm exec cline run-rule Auto-Tests --pattern "src/services/*"

# Probar todos los archivos modificados
npm exec cline run-rule Auto-Tests
```

---

### Tips
* **Estructura de pruebas recomendada**:
  * `tests/unit/`: Pruebas unitarias para funciones puras y lógica aislada
  * `tests/integration/`: Pruebas que conectan múltiples componentes
  * `tests/e2e/`: Pruebas completas de flujos de trading (con mocks)

* **Mocking externo**:
  * Binance: Utiliza `__mocks__/binance.ts` con respuestas realistas
  * LunarCrush: Simula diferentes niveles de Galaxy Score para probar decisiones
  * DeepSeek: Crea un mock que emule decisiones para diferentes escenarios de mercado

* **Pruebas de PortfolioManager**:
  * Prueba eventos emitidos (`SCAN_COMPLETED`, `ROTATION_EXECUTED`, etc.)
  * Verifica comportamiento con diferentes configuraciones de riesgo
  * Simula rotaciones y verifica decisiones de mantenimiento de portafolio

* **Entornos de prueba**:
  * Usa `process.env.NODE_ENV = 'test'` para activar comportamientos específicos
  * Configura `vitest.config.ts` con `coverage: { reporter: ['text', 'html', 'json'] }`
  * Utiliza `setupFiles` para inicializar mocks globales

* **Pruebas de base de datos**:
  * Usa SQLite en memoria para pruebas de repositorios
  * Prepara y limpia datos antes y después de cada prueba

