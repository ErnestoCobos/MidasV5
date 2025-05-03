/**
 * MetricsStorePort: Outbound port for metrics storage and retrieval
 */

export interface MetricsStorePort {
  /**
   * Store a performance metric datapoint
   */
  storeMetric(
    name: string, 
    value: number, 
    tags?: Record<string, string>
  ): Promise<void>;
  
  /**
   * Query metrics for a given time range
   */
  queryMetrics(
    name: string, 
    timeRangeMs: number, 
    aggregation: 'avg' | 'sum' | 'min' | 'max'
  ): Promise<Array<{
    timestamp: number;
    value: number;
  }>>;
  
  /**
   * Store a system event
   */
  storeEvent(
    eventType: string, 
    details: Record<string, unknown>
  ): Promise<void>;
  
  /**
   * Get recent system events
   */
  getRecentEvents(
    limit: number, 
    eventTypes?: string[]
  ): Promise<Array<{
    timestamp: number;
    eventType: string;
    details: Record<string, unknown>;
  }>>;
  
  /**
   * Get current system health metrics
   */
  getSystemHealth(): Promise<{
    cpu: number;
    memory: number;
    uptime: number;
    lastError: string | null;
    status: 'healthy' | 'degraded' | 'unhealthy';
  }>;
  
  /**
   * Clear old metrics
   */
  pruneMetrics(olderThanMs: number): Promise<number>;
}
