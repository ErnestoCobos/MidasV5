const { Pool } = require('pg');
require('dotenv').config();

async function testConnection() {
  console.log('Probando conexión a PostgreSQL...');
  
  const sslConfig = process.env.DATABASE_SSL === 'true' ? {
    rejectUnauthorized: false // Permitir certificados autofirmados
  } : false;
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig,
    max: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '30000', 10)
  });
  
  try {
    console.log('Intentando conexión con SSL rejectUnauthorized=false...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Conexión exitosa a PostgreSQL');
    console.log(`Tiempo del servidor: ${result.rows[0].now}`);
    
    // Probar si TimescaleDB está disponible
    try {
      const tsResult = await pool.query(
        "SELECT extname FROM pg_extension WHERE extname = 'timescaledb'"
      );
      
      if (tsResult.rowCount > 0) {
        console.log('✅ TimescaleDB está disponible y activo');
        
        // Intentar ejecutar una función específica de TimescaleDB
        try {
          const tsVersion = await pool.query('SELECT get_telemetry_report();');
          console.log(`Versión de TimescaleDB: ${tsVersion.rows[0].get_telemetry_report.split('\n')[0]}`);
        } catch (tsVerErr) {
          console.log('ℹ️ No se pudo determinar la versión exacta de TimescaleDB');
        }
      } else {
        console.log('ℹ️ TimescaleDB no está disponible');
      }
    } catch (tsErr) {
      console.log('ℹ️ Error al verificar TimescaleDB:', tsErr.message);
    }
    
    // Listar todas las extensiones disponibles
    try {
      const extensions = await pool.query('SELECT extname, extversion FROM pg_extension ORDER BY extname');
      console.log('\nExtensiones PostgreSQL disponibles:');
      extensions.rows.forEach(ext => {
        console.log(`- ${ext.extname} (${ext.extversion})`);
      });
    } catch (extErr) {
      console.log('Error al listar extensiones:', extErr.message);
    }
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error al conectar a PostgreSQL:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('Asegúrate de que el servidor PostgreSQL esté en ejecución y acepte conexiones en el host y puerto especificados.');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('Tiempo de espera agotado. Verifica la dirección del servidor y si hay un firewall bloqueando la conexión.');
    } else if (error.code === 'ENOTFOUND') {
      console.error('No se pudo resolver el nombre de host. Verifica la URL de la base de datos.');
    }
    
    try {
      await pool.end();
    } catch (e) {
      // Ignorar errores al cerrar el pool
    }
  }
}

testConnection();
