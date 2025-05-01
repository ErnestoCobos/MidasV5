import { describe, it, expect, jest, beforeEach } from '@jest/globals';
// Use 'any' type for testing purposes to bypass TypeScript errors
import { PortfolioManager } from '../../mocks/portfolio-manager.mock';
import { 
  Holding, 
  Opportunity,
  Order,
  RotationDecision,
  RotationResult
} from '../../setup';

describe('PortfolioManager', () => {
  let portfolioManager: any;
  let mockExchangeAdapter: any;
  let mockMarketScanner: any;
  let mockDeepSeekService: any;

  beforeEach(() => {
    // Create mocks for dependencies
    mockExchangeAdapter = {
      executeOrder: jest.fn(),
      getAccountInfo: jest.fn().mockResolvedValue({
        balances: [
          { asset: 'BTC', free: '0.1', locked: '0' },
          { asset: 'USDT', free: '1000', locked: '0' }
        ]
      }),
      getSymbolPrices: jest.fn().mockResolvedValue({
        'BTCUSDT': 50000,
        'ETHUSDT': 3000,
        'SOLUSDT': 100
      })
    };

    mockMarketScanner = {
      scanMarket: jest.fn().mockResolvedValue([
        { symbol: 'ETHUSDT', score: 0.85, potentialReturn: 0.12 },
        { symbol: 'SOLUSDT', score: 0.78, potentialReturn: 0.09 }
      ] as Opportunity[])
    };

    mockDeepSeekService = {
      evaluateRotationOpportunity: jest.fn().mockResolvedValue({
        decision: 'ROTATE',
        reasoning: 'Better opportunity detected',
        confidence: 0.92
      } as RotationDecision)
    };
    
    // Initialize the portfolio manager with mocks
    portfolioManager = new PortfolioManager();
    
    // Add required properties after creation for testing
    portfolioManager.exchangeAdapter = mockExchangeAdapter;
    portfolioManager.marketScanner = mockMarketScanner;
    portfolioManager.deepSeekService = mockDeepSeekService;
  });

  describe('rotateAssets', () => {
    it('should rotate assets when better opportunity is found', async () => {
      // Arrange
      const currentHoldings = [{ symbol: 'BTCUSDT', amount: 0.1, valueUSD: 5000 }] as Holding[];
      portfolioManager.getCurrentHoldings = jest.fn().mockResolvedValue(currentHoldings);
      
      // Act
      const result = await portfolioManager.evaluateAndRotate();
      
      // Assert
      expect(mockMarketScanner.scanMarket).toHaveBeenCalled();
      expect(mockDeepSeekService.evaluateRotationOpportunity).toHaveBeenCalledWith(
        expect.objectContaining({
          currentHoldings,
          opportunities: expect.any(Array)
        })
      );
      expect(mockExchangeAdapter.executeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          side: 'SELL'
        })
      );
      expect(mockExchangeAdapter.executeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'ETHUSDT',
          side: 'BUY'
        })
      );
      expect(result.rotated).toBe(true);
    });

    it('should not rotate assets when no better opportunity is found', async () => {
      // Arrange
      const currentHoldings = [{ symbol: 'ETHUSDT', amount: 1.5, valueUSD: 4500 }] as Holding[];
      portfolioManager.getCurrentHoldings = jest.fn().mockResolvedValue(currentHoldings);
      
      mockDeepSeekService.evaluateRotationOpportunity = jest.fn().mockResolvedValue({
        decision: 'HOLD',
        reasoning: 'Current portfolio is optimal',
        confidence: 0.88
      } as RotationDecision);
      
      // Act
      const result = await portfolioManager.evaluateAndRotate();
      
      // Assert
      expect(mockMarketScanner.scanMarket).toHaveBeenCalled();
      expect(mockDeepSeekService.evaluateRotationOpportunity).toHaveBeenCalled();
      expect(mockExchangeAdapter.executeOrder).not.toHaveBeenCalled();
      expect(result.rotated).toBe(false);
    });
  });

  describe('getCurrentHoldings', () => {
    it('should return current portfolio holdings with USD values', async () => {
      // Act
      const holdings = await portfolioManager.getCurrentHoldings();
      
      // Assert
      expect(holdings).toContainEqual(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          amount: 0.1,
          valueUSD: 5000 // 0.1 BTC * $50,000
        })
      );
      expect(holdings).toContainEqual(
        expect.objectContaining({
          symbol: 'USDT',
          amount: 1000,
          valueUSD: 1000
        })
      );
    });
  });

  describe('handleError', () => {
    it('should handle API errors appropriately', async () => {
      // Arrange
      mockExchangeAdapter.getAccountInfo = jest.fn().mockRejectedValue(
        new Error('API rate limit exceeded')
      );
      
      // Act & Assert
      await expect(portfolioManager.getCurrentHoldings()).rejects.toThrow('API rate limit exceeded');
      
      // Verify error handling and retry logic if implemented
    });
  });
});
