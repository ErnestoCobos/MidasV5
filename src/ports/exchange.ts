/**
 * Exchange Port - Interface for external exchange adapters
 * This port defines the contract that exchange adapters must implement
 */

export interface ExchangePort {
  /**
   * Get account information including balances
   */
  getAccountInfo(): Promise<{ balances: Array<{ asset: string; free: string; locked: string }> }>;

  /**
   * Get market prices for specified symbol
   */
  getPrice(symbol: string): Promise<{ price: string }>;

  /**
   * Get kline/candlestick data for a symbol
   */
  getKlines(params: {
    symbol: string;
    interval: string;
    limit?: number;
    startTime?: number;
    endTime?: number;
  }): Promise<Array<any>>;

  /**
   * Place a new order
   */
  placeOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT';
    quantity: string;
    price?: string;
    timeInForce?: 'GTC' | 'IOC' | 'FOK';
  }): Promise<any>;

  /**
   * Cancel an order
   */
  cancelOrder(params: { symbol: string; orderId: number }): Promise<any>;

  /**
   * Get all open orders
   */
  getOpenOrders(params?: { symbol?: string }): Promise<Array<any>>;
}
