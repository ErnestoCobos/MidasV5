// Type definitions and setup for testing

// Interface for mocked Portfolio Manager dependencies
export interface MockExchangeAdapter {
  executeOrder: jest.Mock;
  getAccountInfo: jest.Mock;
  getSymbolPrices: jest.Mock; 
}

export interface MockMarketScanner {
  scanMarket: jest.Mock;
}

export interface MockDeepSeekService {
  evaluateRotationOpportunity: jest.Mock;
}

// Portfolio-related types
export interface Holding {
  symbol: string;
  amount: number;
  valueUSD: number;
}

export interface Opportunity {
  symbol: string;
  score: number;
  potentialReturn: number;
}

export interface RotationDecision {
  decision: 'ROTATE' | 'HOLD';
  reasoning: string;
  confidence: number;
}

export interface Order {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price?: number;
  type?: 'MARKET' | 'LIMIT';
}

export interface RotationResult {
  rotated: boolean;
  from?: Holding[];
  to?: Opportunity[];
  reason: string;
}

// Additional setup for Jest global mocks if needed
beforeAll(() => {
  // Any global Jest setup can go here
  
  // For example:
  // jest.useFakeTimers();
  
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterAll(() => {
  // Any cleanup
  
  // For example:
  // jest.useRealTimers();
});
