// Script para verificar si las variables de entorno se cargan correctamente
require('dotenv').config();
const fs = require('fs');

// Función para ocultar parte de las claves API (por seguridad)
function maskApiKey(key) {
  if (!key || typeof key !== 'string') return 'No disponible';
  if (key.length <= 8) return '*'.repeat(key.length);
  return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
}

// Variables a verificar
const varsToCheck = [
  'BINANCE_KEY',
  'BINANCE_SECRET',
  'LUNAR_KEY',
  'DEEPSEEK_API_KEY',
  'NODE_ENV',
  'LOG_LEVEL',
  'DRY_RUN'
];

console.log('== VERIFICACIÓN DE VARIABLES DE ENTORNO ==\n');

// 1. Comprobar si el archivo .env existe
console.log('1. Archivo .env:');
if (fs.existsSync('.env')) {
  console.log('✅ Archivo .env encontrado');
  
  // Mostrar el contenido del archivo parcialmente oculto
  const envContent = fs.readFileSync('.env', 'utf8');
  const maskedContent = envContent
    .split('\n')
    .map(line => {
      const parts = line.split('=');
      if (parts.length === 2) {
        return parts[0] + '=' + maskApiKey(parts[1]);
      }
      return line;
    })
    .join('\n');
  
  console.log('Contenido (parcialmente oculto):\n' + maskedContent);
} else {
  console.log('❌ Archivo .env NO encontrado');
}

// 2. Verificar si las variables están disponibles en process.env
console.log('\n2. Variables cargadas en process.env:');
varsToCheck.forEach(varName => {
  if (process.env[varName]) {
    console.log(`✅ ${varName}: ${maskApiKey(process.env[varName])}`);
  } else {
    console.log(`❌ ${varName}: No disponible`);
  }
});

// 3. Verificar la carga con dotenv explícitamente
console.log('\n3. Verificación del paquete dotenv:');
try {
  const dotenv = require('dotenv');
  const parsed = dotenv.config();
  
  if (parsed.error) {
    console.log('❌ Error al cargar dotenv:', parsed.error.message);
  } else {
    console.log('✅ dotenv cargado correctamente');
    console.log('Variables disponibles:', Object.keys(parsed.parsed).length);
  }
} catch (error) {
  console.log('❌ Error al cargar dotenv:', error.message);
}

// 4. Verificar otras condiciones que pueden afectar la carga
console.log('\n4. Información adicional:');
console.log('Directorio actual:', process.cwd());
console.log('NODE_ENV:', process.env.NODE_ENV || 'no definido');
console.log('Versión de Node.js:', process.version);
