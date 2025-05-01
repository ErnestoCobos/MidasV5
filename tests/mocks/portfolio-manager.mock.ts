import { 
  Holding, 
  Opportunity, 
  Order, 
  RotationDecision,
  RotationResult 
} from '../setup';

export class MockPortfolioManager {
  constructor() {}

  // Define the methods we're testing
  async getCurrentHoldings(): Promise<Holding[]> {
    return [];
  }

  async evaluateAndRotate(): Promise<RotationResult> {
    return {
      rotated: false,
      reason: ''
    };
  }

  async scanMarketForOpportunities(): Promise<Opportunity[]> {
    return [];
  }

  async executeOrder(order: Order): Promise<void> {
    return;
  }

  async evaluateRotationDecision(
    currentHoldings: Holding[], 
    opportunities: Opportunity[]
  ): Promise<RotationDecision> {
    return {
      decision: 'HOLD',
      reasoning: '',
      confidence: 0
    };
  }
}

// Re-export the mock as if it were the real thing
export { MockPortfolioManager as PortfolioManager };
