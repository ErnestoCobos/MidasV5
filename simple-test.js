require('dotenv').config();
const axios = require('axios');
const { Spot } = require('@binance/spot');

// Función para probar LunarCrush
async function testLunarCrush() {
    console.log('\n=== PRUEBA DE LUNARCRUSH ===');
    try {
        const apiKey = process.env.LUNAR_KEY;
        console.log(`Usando clave: ${apiKey?.substring(0, 5)}...`);
        
        const url = 'https://lunarcrush.com/api/v3/assets';
        console.log(`URL: ${url}`);
        
        const response = await axios.get(url, {
            params: { 
                symbol: 'BTC', 
                data: 'galaxyScore', 
                key: apiKey 
            }
        });
        
        console.log('Respuesta:', response.status);
        console.log('Galaxy Score:', response.data?.data?.[0]?.galaxyScore);
        return true;
    } catch (error) {
        console.error('ERROR en LunarCrush:');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Datos:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
        return false;
    }
}

// Función para probar Binance
async function testBinance() {
    console.log('\n=== PRUEBA DE BINANCE ===');
    try {
        const apiKey = process.env.BINANCE_KEY;
        const apiSecret = process.env.BINANCE_SECRET;
        console.log(`Usando clave Binance: ${apiKey?.substring(0, 5)}...`);
        
        const spot = new Spot({
            configurationRestAPI: {
                apiKey,
                apiSecret
            }
        });
        
        // Probar endpoint ticker24hr
        console.log('Probando ticker24hr para BTCUSDT...');
        const tickerResponse = await spot.restAPI.ticker24hr({ symbol: 'BTCUSDT' });
        console.log('Precio actual:', tickerResponse.data.lastPrice);
        
        return true;
    } catch (error) {
        console.error('ERROR en Binance:');
        console.error('Error:', error.message);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
        }
        return false;
    }
}

// Función principal
async function main() {
    console.log('HERRAMIENTA DE DIAGNÓSTICO PARA MIDASTS');
    console.log('======================================\n');
    
    // Variables de entorno
    console.log('Variables de entorno:');
    const envVars = {
        BINANCE_KEY: process.env.BINANCE_KEY,
        BINANCE_SECRET: process.env.BINANCE_SECRET,
        LUNAR_KEY: process.env.LUNAR_KEY,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY
    };
    
    Object.entries(envVars).forEach(([key, value]) => {
        if (!value) {
            console.log(`${key}: FALTA`);
        } else {
            console.log(`${key}: CONFIGURADO (${value.substring(0, 5)}...)`);
        }
    });
    
    // Ejecutar pruebas
    const lunarResult = await testLunarCrush();
    const binanceResult = await testBinance();
    
    // Resumen final
    console.log('\n=== RESUMEN ===');
    console.log(`LunarCrush: ${lunarResult ? 'FUNCIONANDO' : 'ERROR'}`);
    console.log(`Binance: ${binanceResult ? 'FUNCIONANDO' : 'ERROR'}`);
    
    // Análisis de errores
    console.log('\n=== ANÁLISIS DE ERRORES ===');
    if (!lunarResult) {
        console.log('- LunarCrush: Es posible que la API haya cambiado o que la clave API sea inválida.');
        console.log('  Verifique su documentación en: https://lunarcrush.com/developers/docs');
    }
    if (!binanceResult) {
        console.log('- Binance: Verifique que su clave API tenga permisos de lectura y no haya restricciones IP.');
    }
}

// Ejecutar
main().catch(err => {
    console.error('Error fatal:', err.message);
});
