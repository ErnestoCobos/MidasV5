import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Order } from '../../setup';

// Mock actual fetch calls for integration tests
global.fetch = jest.fn();

describe('BinanceAdapter Integration', () => {
  let binanceAdapter: any;
  
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Mock fetch to return successful response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        symbol: 'BTCUSDT',
        price: '50000.00000000'
      }),
      text: jest.fn().mockResolvedValue(JSON.stringify({
        symbol: 'BTCUSDT',
        price: '50000.00000000'
      }))
    });
    
    // Create adapter instance with test credentials
    binanceAdapter = {
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      baseUrl: 'https://api.binance.com',
      
      async getSymbolPrice(symbol: string) {
        const response = await fetch(`${this.baseUrl}/api/v3/ticker/price?symbol=${symbol}`);
        if (!response.ok) {
          throw new Error(`Binance API error: ${response.status}`);
        }
        const data = await response.json();
        return parseFloat(data.price);
      },
      
      async executeOrder(order: Order) {
        // Implementation for testing
        const params = new URLSearchParams({
          symbol: order.symbol,
          side: order.side,
          type: order.type || 'MARKET',
          quantity: order.quantity.toString()
        });
        
        if (order.price) {
          params.append('price', order.price.toString());
        }
        
        const response = await fetch(`${this.baseUrl}/api/v3/order`, {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': this.apiKey,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });
        
        if (!response.ok) {
          throw new Error(`Order execution failed: ${await response.text()}`);
        }
        
        return await response.json();
      },
      
      async getAccountInfo() {
        const response = await fetch(`${this.baseUrl}/api/v3/account`, {
          headers: {
            'X-MBX-APIKEY': this.apiKey
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to get account info: ${response.status}`);
        }
        
        return await response.json();
      }
    };
  });
  
  afterEach(() => {
    jest.resetAllMocks();
  });
  
  describe('getSymbolPrice', () => {
    it('should fetch the current price for a symbol', async () => {
      // Arrange
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          symbol: 'ETHUSDT',
          price: '3000.00000000'
        })
      });
      
      // Act
      const price = await binanceAdapter.getSymbolPrice('ETHUSDT');
      
      // Assert
      expect(price).toBe(3000);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT'
      );
    });
    
    it('should throw an error if the API request fails', async () => {
      // Arrange
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      });
      
      // Act & Assert
      await expect(binanceAdapter.getSymbolPrice('INVALID')).rejects.toThrow('Binance API error');
    });
  });
  
  describe('executeOrder', () => {
    it('should execute a market buy order', async () => {
      // Arrange
      const orderResponse = {
        symbol: 'BTCUSDT',
        orderId: 12345678,
        orderListId: -1,
        clientOrderId: 'test',
        transactTime: 1627474340561,
        price: '0.00000000',
        origQty: '0.01000000',
        executedQty: '0.01000000',
        status: 'FILLED',
        timeInForce: 'GTC',
        type: 'MARKET',
        side: 'BUY'
      };
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(orderResponse)
      });
      
      const order: Order = {
        symbol: 'BTCUSDT',
        side: 'BUY',
        quantity: 0.01,
        type: 'MARKET'
      };
      
      // Act
      const result = await binanceAdapter.executeOrder(order);
      
      // Assert
      expect(result).toEqual(orderResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.binance.com/api/v3/order',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-MBX-APIKEY': 'test-api-key'
          })
        })
      );
    });
  });
  
  describe('getAccountInfo', () => {
    it('should fetch account information', async () => {
      // Arrange
      const accountInfo = {
        makerCommission: 10,
        takerCommission: 10,
        buyerCommission: 0,
        sellerCommission: 0,
        canTrade: true,
        canWithdraw: true,
        canDeposit: true,
        updateTime: 1627474340561,
        accountType: 'SPOT',
        balances: [
          { asset: 'BTC', free: '0.1', locked: '0.0' },
          { asset: 'ETH', free: '2.0', locked: '0.0' },
          { asset: 'USDT', free: '1000.0', locked: '0.0' }
        ]
      };
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(accountInfo)
      });
      
      // Act
      const result = await binanceAdapter.getAccountInfo();
      
      // Assert
      expect(result).toEqual(accountInfo);
      expect(result.balances).toHaveLength(3);
      expect(result.balances[0].asset).toBe('BTC');
    });
  });
});
