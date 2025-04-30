#!/usr/bin/env node
/**
 * Sistema Completo de Crecimiento de Capital
 * Este script ejecuta todos los componentes del sistema de optimización
 * para maximizar el crecimiento de un capital pequeño ($54 USD)
 */

const { spawn } = require('child_process');
const path = require('path');

// Color formatting para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    crimson: '\x1b[38m'
  },
  
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
    crimson: '\x1b[48m'
  }
};

// Parámetros del sistema
const DEFAULT_CONFIG = {
  capital: 54,
  maxPositions: 2,
  scanTopN: 10,
  waitTimeSeconds: 5,
  defaultSymbol: 'SOLUSDT', // Usado si no hay scan
  runDemo: true,
  runScan: true,
  runTrade: true
};

// Extraer parámetros de la línea de comandos
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  
  for (const arg of args) {
    if (arg.startsWith('--capital=')) {
      config.capital = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--positions=')) {
      config.maxPositions = Number(arg.split('=')[1]);
    } else if (arg === '--no-demo') {
      config.runDemo = false;
    } else if (arg === '--no-scan') {
      config.runScan = false;
    } else if (arg === '--no-trade') {
      config.runTrade = false;
    } else if (arg.startsWith('--symbol=')) {
      config.defaultSymbol = arg.split('=')[1];
    }
  }
  
  return config;
}

// Ejecuta un comando como proceso hijo y devuelve una promesa
function executeCommand(command, args = [], silent = false) {
  return new Promise((resolve, reject) => {
    console.log(`${colors.dim}> ${command} ${args.join(' ')}${colors.reset}`);
    
    const child = spawn(command, args, { 
      shell: true,
      stdio: silent ? 'ignore' : 'inherit'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Comando falló con código ${code}`));
      }
    });
    
    child.on('error', (err) => {
      reject(err);
    });
  });
}

// Ejecuta una secuencia de comandos con un delay entre ellos
async function executeSequence(sequence) {
  for (const [index, item] of sequence.entries()) {
    const { title, command, args = [], delay = 1000 } = item;
    
    console.log(`\n${colors.fg.cyan}${colors.bright}[${index + 1}/${sequence.length}] ${title}${colors.reset}`);
    console.log(`${colors.fg.yellow}${'='.repeat(80)}${colors.reset}`);
    
    try {
      await executeCommand(command, args);
      if (delay > 0 && index < sequence.length - 1) {
        process.stdout.write(`${colors.dim}Esperando ${delay/1000} segundos...${colors.reset}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        process.stdout.write('\n');
      }
    } catch (err) {
      console.error(`${colors.fg.red}Error: ${err.message}${colors.reset}`);
      if (item.required) {
        throw err; // Detener la ejecución si es un paso requerido
      }
    }
  }
}

// Función principal
async function main() {
  const config = parseArgs();
  const baseDir = path.join(__dirname);
  const nodeCmd = process.execPath; // Path al ejecutable de Node
  
  console.log(`
${colors.fg.green}${colors.bright}╔════════════════════════════════════════════════════╗
║                                                    ║
║        SISTEMA DE CRECIMIENTO DE CAPITAL           ║
║              Capital: $${config.capital.toFixed(2)}                      ║
║                                                    ║
╚════════════════════════════════════════════════════╝${colors.reset}
  `);
  
  // Definir la secuencia de comandos a ejecutar
  const sequence = [];
  
  // 1. Ejecutar demo de Kelly para mostrar fundamentos matemáticos
  if (config.runDemo) {
    sequence.push({
      title: 'Demostración del Criterio de Kelly para Optimización de Capital',
      command: nodeCmd,
      args: [path.join(baseDir, 'demo-kelly.js'), `--capital=${config.capital}`],
      delay: config.waitTimeSeconds * 1000,
      required: false
    });
  }
  
  // 2. Escanear mercado para encontrar mejores oportunidades
  if (config.runScan) {
    sequence.push({
      title: 'Escáner de Mercado: Buscando Mejores Oportunidades',
      command: 'npx',
      args: [
        'ts-node',
        path.join(baseDir, 'index.ts'), 
        'scan-market',
        `--capital=${config.capital}`,
        `--top=${config.scanTopN}`,
        '--growth-focus'
      ],
      delay: config.waitTimeSeconds * 1000,
      required: false
    });
  }
  
  // 3. Ejecutar la estrategia de trading optimizada
  if (config.runTrade) {
    // Podemos intentar obtener el mejor símbolo del escáner y usarlo
    const symbol = config.defaultSymbol; // Fallback a default
    
    sequence.push({
      title: `Ejecutando Estrategia de Crecimiento para ${symbol}`,
      command: 'npx',
      args: [
        'ts-node',
        path.join(baseDir, 'index.ts'),
        'growth-trade',
        `-s=${symbol}`,
        `-c=${config.capital}`,
        '--dry-run' // Quitar esto para operaciones reales
      ],
      delay: 0,
      required: true
    });
  }
  
  try {
    await executeSequence(sequence);
    
    console.log(`\n${colors.fg.green}${colors.bright}✓ Sistema de crecimiento ejecutado correctamente${colors.reset}`);
    console.log(`\n${colors.dim}Para ejecutar el sistema sin simulación (operaciones reales), edite el script y elimine la opción --dry-run${colors.reset}`);
  } catch (err) {
    console.error(`\n${colors.fg.red}${colors.bright}✗ Error ejecutando el sistema: ${err.message}${colors.reset}`);
    process.exit(1);
  }
}

// Ejecutar
main().catch(console.error);
