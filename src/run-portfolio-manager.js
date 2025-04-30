#!/usr/bin/env node
/**
 * Sistema de Gestión de Portafolio Dinámico
 * 
 * Este script ejecuta el gestor de portafolio que utiliza DeepSeek para
 * rotar activos automáticamente buscando maximizar el crecimiento del capital.
 */

const path = require('path');
const { PortfolioManager, PortfolioEvents } = require('../dist/services/portfolio-manager');
const readline = require('readline');

// Configuración de colores para consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Interfaz para input del usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

async function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Configuración del sistema
 */
const DEFAULT_CONFIG = {
  capital: 54,
  scanIntervalMinutes: 1, // Intervalo corto para demostración
  rotationThreshold: 0.8, // Umbral de confianza para rotaciones (0-1)
  forceDiversification: true, // Diversificar portafolio
  cashReservePercent: 15, // Porcentaje de efectivo a mantener como reserva
  maxPositions: 2, // Número máximo de posiciones simultáneas
  dataDir: path.join(process.cwd(), 'portfolio-data')
};

/**
 * Función principal que ejecuta el gestor de portafolio
 */
async function runPortfolioManager() {
  console.log(`
${colors.bright}${colors.cyan}
═══════════════════════════════════════════════════════════
   SISTEMA DE GESTIÓN DE PORTAFOLIO DINÁMICO CON DEEPSEEK
   Optimizado para crecimiento máximo de capital pequeño
═══════════════════════════════════════════════════════════
${colors.reset}
  `);
  
  try {
    // Obtener configuración de los argumentos
    const config = parseArgs();
    
    console.log(`${colors.bright}Configuración:${colors.reset}`);
    console.log(`- Capital inicial: ${colors.green}$${config.capital}${colors.reset}`);
    console.log(`- Intervalo de escaneo: ${config.scanIntervalMinutes} minutos`);
    console.log(`- Umbral de rotación: ${config.rotationThreshold * 100}% confianza`);
    console.log(`- Diversificación forzada: ${config.forceDiversification ? 'Sí' : 'No'}`);
    console.log(`- Reserva de efectivo: ${config.cashReservePercent}%`);
    console.log(`- Posiciones máximas: ${config.maxPositions}`);
    console.log(`- Directorio de datos: ${config.dataDir}`);
    
    // Crear instancia del gestor de portafolio
    const portfolioManager = new PortfolioManager(config.capital, config);
    
    // Configurar manejadores de eventos
    setupEventListeners(portfolioManager);
    
    // Iniciar el sistema
    console.log(`\n${colors.yellow}>${colors.reset} Iniciando gestor de portafolio...`);
    await portfolioManager.start();
    
    console.log(`\n${colors.green}✓${colors.reset} Gestor de portafolio iniciado correctamente.\n`);
    console.log(`${colors.bright}COMANDOS DISPONIBLES:${colors.reset}`);
    console.log(`- ${colors.cyan}status${colors.reset}: Mostrar estado actual del portafolio`);
    console.log(`- ${colors.cyan}force SYMBOL [AMOUNT]${colors.reset}: Forzar rotación a un activo específico`);
    console.log(`- ${colors.cyan}exit${colors.reset}: Detener y salir\n`);
    
    // Iniciar interfaz de comandos
    startCommandInterface(portfolioManager);
    
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

/**
 * Analiza los argumentos de línea de comandos
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  
  for (const arg of args) {
    if (arg.startsWith('--capital=')) {
      config.capital = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--interval=')) {
      config.scanIntervalMinutes = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--threshold=')) {
      config.rotationThreshold = Number(arg.split('=')[1]);
    } else if (arg === '--no-diversification') {
      config.forceDiversification = false;
    } else if (arg.startsWith('--cash-reserve=')) {
      config.cashReservePercent = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--max-positions=')) {
      config.maxPositions = Number(arg.split('=')[1]);
    }
  }
  
  return config;
}

/**
 * Configura los listeners de eventos del gestor de portafolio
 */
function setupEventListeners(portfolioManager) {
  portfolioManager.on(PortfolioEvents.INITIALIZED, (portfolio) => {
    console.log(`${colors.green}▶${colors.reset} Portafolio inicializado con ${portfolio.assets.length} activos.`);
    displayPortfolioSummary(portfolio);
  });
  
  portfolioManager.on(PortfolioEvents.OPPORTUNITY_FOUND, (data) => {
    const { opportunity, exitAsset, confidence, reason } = data;
    
    console.log(`\n${colors.bright}${colors.yellow}!${colors.reset} Oportunidad de rotación detectada:`);
    console.log(`- Nueva oportunidad: ${colors.bright}${opportunity.symbol}${colors.reset} (score: ${opportunity.score.toFixed(2)})`);
    
    if (exitAsset) {
      console.log(`- Reemplazando: ${colors.dim}${exitAsset.symbol}${colors.reset} (rendimiento: ${exitAsset.performance.toFixed(2)}%)`);
    } else {
      console.log(`- Nueva posición (cash disponible)`);
    }
    
    console.log(`- Confianza DeepSeek: ${colors.bright}${(confidence * 100).toFixed(2)}%${colors.reset}`);
    console.log(`- Razón: ${reason}`);
  });
  
  portfolioManager.on(PortfolioEvents.ROTATION_EXECUTED, (data) => {
    console.log(`\n${colors.green}✓${colors.reset} ${colors.bright}Rotación ejecutada:${colors.reset}`);
    console.log(`- Nuevo activo: ${colors.green}${data.enteredAsset.symbol}${colors.reset} ($${data.enteredAsset.allocation.toFixed(2)})`);
    
    if (data.exitAsset) {
      console.log(`- Salida de: ${colors.red}${data.exitAsset.symbol}${colors.reset}`);
    }
    
    console.log(`- Razón: ${data.reason}`);
  });
  
  portfolioManager.on(PortfolioEvents.UPDATED, (portfolio) => {
    console.log(`\n${colors.cyan}↻${colors.reset} Portafolio actualizado`);
  });
  
  portfolioManager.on(PortfolioEvents.SCAN_COMPLETED, (data) => {
    const { opportunities, rotationExecuted } = data;
    
    if (!rotationExecuted && opportunities.length > 0) {
      console.log(`\n${colors.blue}i${colors.reset} Escáner completado: ${opportunities.length} oportunidades encontradas, ninguna rotación necesaria.`);
    } else if (!rotationExecuted) {
      console.log(`\n${colors.blue}i${colors.reset} Escáner completado: No se encontraron oportunidades.`);
    }
  });
  
  portfolioManager.on(PortfolioEvents.ERROR, (error) => {
    console.error(`\n${colors.red}Error: ${error.message}${colors.reset}`);
  });
}

/**
 * Muestra un resumen del portafolio actual
 */
function displayPortfolioSummary(portfolio) {
  console.log('\n');
  console.log(`${colors.bright}RESUMEN DEL PORTAFOLIO${colors.reset}`);
  console.log('═══════════════════════════════');
  console.log(`Capital total: ${colors.bright}$${portfolio.totalCapital.toFixed(2)}${colors.reset}`);
  console.log(`Rendimiento total: ${formatPerformance(portfolio.totalPerformance)}`);
  console.log(`Efectivo disponible: $${portfolio.cashReserve.toFixed(2)}`);
  console.log(`Última actualización: ${new Date(portfolio.lastUpdatedAt).toLocaleString()}`);
  
  if (portfolio.assets.length === 0) {
    console.log(`\n${colors.dim}No hay activos en el portafolio.${colors.reset}`);
    return;
  }
  
  console.log('\nACTIVOS:');
  console.log('--------------------------------------------------');
  console.log(`SÍMBOLO   | ASIGNACIÓN |  PRECIO  |    REND.   | MOMENTUM`);
  console.log('--------------------------------------------------');
  
  for (const asset of portfolio.assets) {
    const performanceStr = formatPerformance(asset.performance);
    
    console.log(
      `${asset.symbol.padEnd(9)} | ` +
      `$${asset.allocation.toFixed(2).padStart(9)} | ` +
      `${asset.currentPrice.toFixed(4).padStart(8)} | ` +
      `${performanceStr.padStart(10)} | ` +
      `${asset.momentum.toFixed(0).padStart(5)}/100`
    );
  }
  
  console.log('--------------------------------------------------');
  
  // Mostrar historial de rotaciones si hay alguno
  if (portfolio.rotations.length > 0) {
    console.log('\nÚLTIMAS ROTACIONES:');
    
    // Mostrar últimas 3 rotaciones
    const recentRotations = portfolio.rotations.slice(-3).reverse();
    
    for (const rotation of recentRotations) {
      const date = new Date(rotation.timestamp).toLocaleString();
      const fromSymbol = rotation.exitedAsset ? rotation.exitedAsset.symbol : 'EFECTIVO';
      
      console.log(`${colors.dim}${date}${colors.reset}: ${fromSymbol} → ${colors.bright}${rotation.enteredAsset.symbol}${colors.reset}`);
    }
  }
  
  console.log('');
}

/**
 * Formatea el valor de rendimiento con color según sea positivo o negativo
 */
function formatPerformance(value) {
  if (value > 0) {
    return `${colors.green}+${value.toFixed(2)}%${colors.reset}`;
  } else if (value < 0) {
    return `${colors.red}${value.toFixed(2)}%${colors.reset}`;
  } else {
    return `${colors.dim}0.00%${colors.reset}`;
  }
}

/**
 * Inicia la interfaz de comandos para interactuar con el gestor
 */
function startCommandInterface(portfolioManager) {
  const askForCommand = async () => {
    const command = await askQuestion(`${colors.bright}>${colors.reset} `);
    
    if (command.trim().toLowerCase() === 'status') {
      // Mostrar estado actual del portafolio
      const portfolio = portfolioManager.getPortfolioSnapshot();
      displayPortfolioSummary(portfolio);
      
    } else if (command.trim().toLowerCase() === 'exit') {
      // Detener el gestor y salir
      console.log(`${colors.yellow}Deteniendo gestor de portafolio...${colors.reset}`);
      portfolioManager.stop();
      console.log(`${colors.green}¡Hasta pronto!${colors.reset}`);
      rl.close();
      setTimeout(() => process.exit(0), 500);
      return;
      
    } else if (command.trim().toLowerCase().startsWith('force ')) {
      // Forzar rotación manual
      const parts = command.trim().split(' ');
      
      if (parts.length >= 2) {
        const symbol = parts[1].toUpperCase() + 'USDT';
        const amount = parts.length >= 3 ? Number(parts[2]) : undefined;
        
        console.log(`${colors.yellow}Forzando rotación a ${symbol}...${colors.reset}`);
        
        try {
          const result = await portfolioManager.forceRotation(symbol, amount);
          
          if (result) {
            console.log(`${colors.green}Rotación manual ejecutada con éxito.${colors.reset}`);
          } else {
            console.log(`${colors.red}Error al ejecutar rotación manual.${colors.reset}`);
          }
        } catch (error) {
          console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
        }
      } else {
        console.log(`${colors.red}Comando incorrecto. Uso: force SYMBOL [AMOUNT]${colors.reset}`);
      }
    } else {
      console.log(`${colors.red}Comando no reconocido. Comandos disponibles: status, force, exit${colors.reset}`);
    }
    
    // Continuar pidiendo comandos
    setTimeout(askForCommand, 100);
  };
  
  // Iniciar la interfaz de comandos
  askForCommand();
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  runPortfolioManager().catch(err => {
    console.error(`Error fatal: ${err.message}`);
    process.exit(1);
  });
}
