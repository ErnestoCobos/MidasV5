require('dotenv').config();
const { Client } = require('pg');

// Use separate DB params from .env instead of CONNECTION_URL
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  // Disable SSL for local connections
  ssl: process.env.DATABASE_SSL === 'true' ? {
    rejectUnauthorized: false // For self-signed certificates
  } : false
};

console.log('Testing PostgreSQL connection with parameters:');
console.log('Host:', config.host);
console.log('Port:', config.port);
console.log('Database:', config.database);
console.log('User:', config.user);
console.log('Password:', config.password ? '******' : 'not set');
console.log('SSL:', config.ssl ? 'enabled' : 'disabled');

const client = new Client(config);

async function testConnection() {
  try {
    console.log('Connecting to PostgreSQL...');
    await client.connect();
    
    console.log('Connection successful!');
    const res = await client.query('SELECT NOW() as current_time');
    console.log('Current database time:', res.rows[0].current_time);
    
    await client.end();
    console.log('Connection closed');
    return true;
  } catch (err) {
    console.error('Connection error:', err);
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      stack: err.stack.split('\n').slice(0, 3).join('\n')
    });
    
    if (err.code === 'ENOTFOUND') {
      console.error('\nHostname could not be resolved. Check if DB_HOST is correct.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('\nConnection refused. Check if PostgreSQL is running and accessible.');
    } else if (err.code === '28P01') {
      console.error('\nAuthentication failed. Check DB_USER and DB_PASSWORD.');
    } else if (err.code === '3D000') {
      console.error('\nDatabase does not exist. Check DB_NAME.');
    }
    
    return false;
  }
}

testConnection();
