require('dotenv').config();
const axios = require('axios');
const { Spot } = require('@binance/spot');

// Simple color functions to replace chalk
const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`
};

async function testLunarCrush() {
    console.log(colors.blue('\n--- Testing LunarCrush API ---'));
    try {
        const apiKey = process.env.LUNAR_KEY;
        console.log(`Using key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'undefined'}`);
        
        // Test Galaxy Score endpoint
        console.log('Attempting to fetch Galaxy Score for BTC...');
        const response = await axios.get('https://lunarcrush.com/api/v3/assets', {
            params: { 
                symbol: 'BTC', 
                data: 'galaxyScore', 
                key: apiKey 
            }
        });
        
        console.log(chalk.green('Success! Status:'), response.status);
        console.log('Galaxy Score:', response.data?.data?.[0]?.galaxyScore);
    } catch (error) {
        console.error(chalk.red('LunarCrush API Error:'));
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response received:', error.message);
        } else {
            console.error('Error setting up request:', error.message);
        }
        
        // Check API documentation for potential changes
        console.log(chalk.yellow('\nPossible Solutions:'));
        console.log('1. Verify API key is valid and correctly formatted');
        console.log('2. Check if endpoint URL has changed (https://lunarcrush.com/developers/docs)');
        console.log('3. Verify parameter names (data=galaxyScore might have changed)');
    }
}

async function testBinance() {
    console.log(chalk.blue('\n--- Testing Binance API ---'));
    try {
        const apiKey = process.env.BINANCE_KEY;
        const apiSecret = process.env.BINANCE_SECRET;
        console.log(`Using Binance key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'undefined'}`);
        
        const spot = new Spot({
            configurationRestAPI: {
                apiKey,
                apiSecret
            }
        });
        
        // Test ticker endpoint
        console.log('Testing ticker24hr for BTCUSDT...');
        const tickerResponse = await spot.restAPI.ticker24hr({ symbol: 'BTCUSDT' });
        console.log(chalk.green('Success! Status:'), tickerResponse.status);
        console.log('Last price:', tickerResponse.data.lastPrice);
        console.log('Volume:', tickerResponse.data.volume);
        
        // Test klines endpoint
        console.log('\nTesting klines for BTCUSDT...');
        const klinesResponse = await spot.restAPI.klines({
            symbol: 'BTCUSDT',
            interval: '5m',
            limit: 10
        });
        console.log(chalk.green('Success! Received data points:'), klinesResponse.data.length);
    } catch (error) {
        console.error(chalk.red('Binance API Error:'));
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Message:', error.response.data?.msg || 'No message');
        } else {
            console.error('Error:', error.message);
        }
        
        console.log(chalk.yellow('\nPossible Solutions:'));
        console.log('1. Verify API key permissions (READ access required)');
        console.log('2. Check if IP restrictions are enabled in Binance account');
        console.log('3. Verify endpoint methods (use ticker24hr, not ticker24H)');
    }
}

async function testDeepSeek() {
    console.log(chalk.blue('\n--- Testing DeepSeek API ---'));
    try {
        const apiKey = process.env.DEEPSEEK_API_KEY;
        console.log(`Using DeepSeek key: ${apiKey ? apiKey.substring(0, 5) + '...' : 'undefined'}`);
        
        // We can't directly import ChatDeepSeek here due to ESM requirements
        // This is a basic validation check only
        console.log('Validating DeepSeek API key format...');
        if (!apiKey || apiKey === 'your_deepseek_api_key') {
            throw new Error('DeepSeek API key appears to be missing or default value');
        }
        
        console.log(chalk.green('API key format appears valid (but full validation requires actual API call)'));
        console.log(chalk.yellow('Note: Full DeepSeek API testing requires ESM module support'));
    } catch (error) {
        console.error(chalk.red('DeepSeek API Error:'), error.message);
        
        console.log(chalk.yellow('\nPossible Solutions:'));
        console.log('1. Get a valid DeepSeek API key from: https://platform.deepseek.com/');
        console.log('2. Update .env file with valid key');
    }
}

// Main
(async () => {
    console.log(chalk.green('===== API DIAGNOSTICS TOOL ====='));
    console.log(chalk.gray('Testing all API connections for midasTS bot\n'));
    
    // Load environment variables
    const envVars = {
        BINANCE_KEY: process.env.BINANCE_KEY,
        BINANCE_SECRET: process.env.BINANCE_SECRET,
        LUNAR_KEY: process.env.LUNAR_KEY,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY
    };
    
    console.log(chalk.blue('Environment Variables:'));
    Object.keys(envVars).forEach(key => {
        const value = envVars[key];
        if (!value) {
            console.log(`${key}: ${chalk.red('Missing')}`);
        } else if (value === `your_${key.toLowerCase()}`) {
            console.log(`${key}: ${chalk.yellow('Default value (needs update)')}`);
        } else {
            console.log(`${key}: ${chalk.green('Set')} (${value.substring(0, 5)}...)`);
        }
    });
    
    // Run tests
    await testLunarCrush();
    await testBinance();
    await testDeepSeek();
    
    console.log(chalk.green('\n===== DIAGNOSTICS COMPLETE ====='));
})().catch(err => {
    console.error(chalk.red('Fatal error running diagnostics:'), err);
});
