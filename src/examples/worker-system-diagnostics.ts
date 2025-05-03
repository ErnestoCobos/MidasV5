/**
 * Worker System Diagnostics Tool
 * 
 * Este script proporciona una herramienta de diagnóstico para el sistema de worker threads.
 * Permite:
 * - Ver el estado actual del sistema
 * - Inspeccionar workers individuales
 * - Analizar métricas de rendimiento
 * - Ejecutar pruebas de carga
 * - Diagnosticar problemas específicos
 */
import { initializeSystem } from '../index';
import { Task } from '../core/domain/task';
import * as os from 'os';

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

/**
 * Mostrar cabecera
 */
function showHeader() {
  console.log(`\n${colors.bright}${colors.cyan}==============================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}   MidasTS - Worker System Diagnostics Tool   ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}==============================================${colors.reset}\n`);
}

/**
 * Mostrar información del sistema
 */
function showSystemInfo() {
  console.log(`${colors.bright}${colors.blue}Información del Sistema:${colors.reset}`);
  console.log(`${colors.dim}• OS: ${colors.reset}${os.platform()} ${os.release()}`);
  console.log(`${colors.dim}• Arquitectura: ${colors.reset}${os.arch()}`);
  console.log(`${colors.dim}• CPUs: ${colors.reset}${os.cpus().length} cores`);
  console.log(`${colors.dim}• Memoria Total: ${colors.reset}${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`);
  console.log(`${colors.dim}• Memoria Libre: ${colors.reset}${Math.round(os.freemem() / (1024 * 1024 * 1024))} GB`);
  console.log(`${colors.dim}• Tiempo de actividad: ${colors.reset}${Math.floor(os.uptime() / 3600)} horas\n`);
}

/**
 * Mostrar estado actual del sistema
 */
async function showSystemStatus(system: any) {
  try {
    const status = await system.taskManager.getSystemStatus();
    
    console.log(`${colors.bright}${colors.blue}Estado de Workers:${colors.reset}`);
    console.log(`${colors.dim}• Total: ${colors.reset}${status.workers.total}`);
    console.log(`${colors.dim}• Disponibles: ${colors.reset}${status.workers.available}`);
    console.log(`${colors.dim}• Ocupados: ${colors.reset}${status.workers.busy}`);
    console.log(`${colors.dim}• No saludables: ${colors.reset}${status.workers.unhealthy > 0 ? colors.red + status.workers.unhealthy + colors.reset : '0'}\n`);
    
    console.log(`${colors.bright}${colors.blue}Estado de Tareas:${colors.reset}`);
    console.log(`${colors.dim}• Pendientes: ${colors.reset}${status.tasks.pending}`);
    console.log(`${colors.dim}• Procesando: ${colors.reset}${status.tasks.processing}`);
    console.log(`${colors.dim}• Completadas: ${colors.reset}${status.tasks.completed}`);
    console.log(`${colors.dim}• Fallidas: ${colors.reset}${status.tasks.failed > 0 ? colors.red + status.tasks.failed + colors.reset : '0'}\n`);
    
    console.log(`${colors.bright}${colors.blue}Rendimiento:${colors.reset}`);
    console.log(`${colors.dim}• Throughput: ${colors.reset}${status.performance.throughput.toFixed(2)} tareas/seg`);
    console.log(`${colors.dim}• Latencia promedio: ${colors.reset}${status.performance.averageLatency.toFixed(2)} ms`);
    console.log(`${colors.dim}• Utilización de workers: ${colors.reset}${(status.performance.resourceUtilization.worker * 100).toFixed(2)}%`);
    console.log(`${colors.dim}• Utilización de CPU: ${colors.reset}${(status.performance.resourceUtilization.cpu).toFixed(2)}%`);
    console.log(`${colors.dim}• Utilización de memoria: ${colors.reset}${(status.performance.resourceUtilization.memory).toFixed(2)} MB\n`);
  } catch (error) {
    console.error(`${colors.red}Error al obtener estado del sistema: ${error}${colors.reset}`);
  }
}

/**
 * Ejecutar una prueba de carga para diferentes tipos de tareas
 */
async function runLoadTest(system: any) {
  console.log(`${colors.bright}${colors.blue}Iniciando prueba de carga...${colors.reset}`);
  
  const taskTypes = ['calculation', 'io', 'network', 'custom'] as const;
  const priorities = ['critical', 'high', 'medium', 'low'] as const;
  const tasksPerType = 5;
  const tasks: Task[] = [];
  
  // Crear tareas para cada tipo y prioridad
  for (const type of taskTypes) {
    for (const priority of priorities) {
      for (let i = 0; i < tasksPerType; i++) {
        let payload: any;
        
        // Configurar payload según tipo
        switch (type) {
          case 'calculation':
            payload = { iterations: 1000000 + i * 500000 }; // Variación de carga CPU
            break;
          case 'io':
            payload = { delay: 100 + i * 50 }; // Variación de tiempo I/O
            break;
          case 'network':
            payload = { url: 'https://example.com', delay: 200 + i * 50 }; // Variación network
            break;
          case 'custom':
            payload = {
              operation: 'transformText',
              params: {
                text: `Test message ${i} with priority ${priority}`,
                operation: ['uppercase', 'lowercase', 'reverse'][i % 3]
              }
            };
            break;
        }
        
        const task = await system.taskManager.submitTask(payload, type, priority);
        tasks.push(task);
        console.log(`${colors.dim}• Tarea creada: ${colors.reset}${task.id} (${type}, ${priority})`);
      }
    }
  }
  
  console.log(`\n${colors.green}Total de tareas creadas: ${tasks.length}${colors.reset}`);
  console.log(`${colors.bright}${colors.blue}Monitoreando estado durante la ejecución...${colors.reset}\n`);
  
  // Monitorear progreso
  let completedAll = false;
  const statusInterval = setInterval(async () => {
    const status = await system.taskManager.getSystemStatus();
    const pendingCount = status.tasks.pending;
    const processingCount = status.tasks.processing;
    const completedCount = status.tasks.completed;
    const failedCount = status.tasks.failed;
    
    // Mostrar progreso
    console.log(`${colors.dim}[${new Date().toISOString()}] Pendientes: ${pendingCount}, Procesando: ${processingCount}, Completadas: ${completedCount}, Fallidas: ${failedCount}${colors.reset}`);
    
    if (pendingCount === 0 && processingCount === 0) {
      completedAll = true;
      clearInterval(statusInterval);
      
      // Mostrar resultados finales
      console.log(`\n${colors.green}Prueba de carga completada${colors.reset}`);
      await showSystemStatus(system);
      
      // Mostrar tareas con errores (si hay)
      if (failedCount > 0) {
        const allTasks = await system.taskManager.getTasks();
        const failedTasks = allTasks.filter((t: Task) => t.status === 'failed');
        
        console.log(`\n${colors.red}Tareas fallidas:${colors.reset}`);
        for (const task of failedTasks) {
          console.log(`${colors.dim}• Tarea ${task.id} (${task.type}, ${task.priority}): ${colors.reset}${task.error}`);
        }
      }
      
      // Finalizar el proceso después de un tiempo
      setTimeout(() => {
        console.log(`\n${colors.bright}${colors.cyan}Finalizando diagnóstico...${colors.reset}`);
        process.exit(0);
      }, 1000);
    }
  }, 1000);
  
  // Timeout de seguridad para salir si algo se cuelga
  setTimeout(() => {
    if (!completedAll) {
      console.log(`\n${colors.yellow}Advertencia: Tiempo límite alcanzado. Algunas tareas pueden no haber completado.${colors.reset}`);
      clearInterval(statusInterval);
      process.exit(1);
    }
  }, 60000); // 1 minuto máximo
}

/**
 * Diagnosticar problemas específicos
 */
async function runDiagnostics(system: any) {
  console.log(`${colors.bright}${colors.blue}Ejecutando diagnósticos específicos...${colors.reset}`);
  
  // 1. Verificar disponibilidad de workers
  const allWorkers = system.workerManagement.getAllWorkers();
  if (allWorkers.length === 0) {
    console.log(`${colors.red}⚠ PROBLEMA: No hay workers disponibles${colors.reset}`);
    console.log(`${colors.dim}  Esto puede deberse a un error en la inicialización o a que todos los workers fallaron.${colors.reset}`);
    console.log(`${colors.dim}  Solución: Revisar logs de errores e intentar reiniciar el sistema.${colors.reset}\n`);
  } else {
    console.log(`${colors.green}✓ Workers disponibles: ${allWorkers.length}${colors.reset}\n`);
  }
  
  // 2. Comprobar responsividad de workers
  console.log(`${colors.dim}Verificando responsividad de workers...${colors.reset}`);
  const workerThreadAdapter = system.taskDistribution.workerThreadPort;
  let responsiveCount = 0;
  
  for (const worker of allWorkers) {
    try {
      const isResponsive = await workerThreadAdapter.isWorkerResponsive(worker.id);
      if (isResponsive) {
        responsiveCount++;
      } else {
        console.log(`${colors.yellow}⚠ Worker ${worker.id} no responde${colors.reset}`);
      }
    } catch (error) {
      console.log(`${colors.red}⚠ Error al verificar worker ${worker.id}: ${error}${colors.reset}`);
    }
  }
  
  if (responsiveCount < allWorkers.length) {
    console.log(`${colors.yellow}⚠ ADVERTENCIA: ${allWorkers.length - responsiveCount} workers no responden${colors.reset}`);
    console.log(`${colors.dim}  Esto puede indicar workers bloqueados o sobrecargados.${colors.reset}`);
    console.log(`${colors.dim}  Solución: El sistema debería recuperarse automáticamente. De lo contrario, reiniciar.${colors.reset}\n`);
  } else {
    console.log(`${colors.green}✓ Todos los workers (${responsiveCount}) responden correctamente${colors.reset}\n`);
  }
  
  // 3. Revisar rendimiento del sistema
  const monitoringStatus = await system.monitoring.getSystemStatus();
  const poolStats = system.taskDistribution.getPoolsStatistics();
  
  console.log(`${colors.bright}${colors.blue}Estadísticas de Worker Pools:${colors.reset}`);
  for (const poolName in poolStats) {
    if (poolName === 'timestamp') continue;
    
    const pool = poolStats[poolName];
    console.log(`${colors.dim}• ${poolName}:${colors.reset}`);
    console.log(`  ${colors.dim}- Capacidad: ${colors.reset}${pool.size} / ${pool.maxSize}`);
    console.log(`  ${colors.dim}- Utilización: ${colors.reset}${(pool.utilizationRate * 100).toFixed(2)}%`);
    
    if (pool.utilizationRate > 0.9) {
      console.log(`  ${colors.yellow}⚠ ADVERTENCIA: Pool casi al máximo de capacidad${colors.reset}`);
      console.log(`  ${colors.dim}  Considera aumentar el tamaño del pool o optimizar las tareas.${colors.reset}`);
    }
  }
  
  console.log(`\n${colors.green}Diagnóstico completado.${colors.reset}`);
}

/**
 * Función principal
 */
async function main() {
  showHeader();
  showSystemInfo();
  
  console.log(`${colors.bright}${colors.blue}Inicializando sistema de worker threads...${colors.reset}\n`);
  
  try {
    const system = await initializeSystem();
    console.log(`${colors.green}Sistema inicializado correctamente.${colors.reset}\n`);
    
    // Mostrar estado inicial
    await showSystemStatus(system);
    
    // Ejecutar diagnósticos específicos
    await runDiagnostics(system);
    
    // Ejecutar prueba de carga
    await runLoadTest(system);
    
  } catch (error) {
    console.error(`${colors.red}Error al inicializar el sistema: ${error}${colors.reset}`);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}Error fatal: ${error}${colors.reset}`);
    process.exit(1);
  });
}
