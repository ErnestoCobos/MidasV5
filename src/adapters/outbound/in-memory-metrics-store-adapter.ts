/**
 * In-Memory Metrics Store Adapter
 * Implements MetricsStorePort using in-memory storage
 */
import { MetricsStorePort } from '../../ports/outbound/metrics-store-port';

export class InMemoryMetricsStoreAdapter implements MetricsStorePort {
  private metrics: Array<{
    name: string;
    value: number;
    timestamp: number;
    tags: Record<string, string>;
  }> = [];
  
  private events: Array<{
    timestamp: number;
    eventType: string;
    details: Record<string, unknown>;
  }> = [];
  
  private systemHealth: {
    cpu: number;
    memory: number;
    uptime: number;
    lastError: string | null;
    status: 'healthy' | 'degraded' | 'unhealthy';
  } = {
    cpu: 0,
    memory: 0,
    uptime: 0,
    lastError: null,
    status: 'healthy'
  };
  
  constructor(
    private readonly maxMetricsEntries: number = 10000,
    private readonly maxEventsEntries: number = 1000,
    private readonly startTime: number = Date.now()
  ) {}
  
  /**
   * Store a performance metric datapoint
   */
  async storeMetric(
    name: string, 
    value: number, 
    tags: Record<string, string> = {}
  ): Promise<void> {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
      tags
    });
    
    // Manage size limit to prevent memory leaks
    if (this.metrics.length > this.maxMetricsEntries) {
      this.metrics = this.metrics.slice(-this.maxMetricsEntries);
    }
  }
  
  /**
   * Query metrics for a given time range
   */
  async queryMetrics(
    name: string, 
    timeRangeMs: number, 
    aggregation: 'avg' | 'sum' | 'min' | 'max'
  ): Promise<Array<{
    timestamp: number;
    value: number;
  }>> {
    const now = Date.now();
    const minTimestamp = now - timeRangeMs;
    
    // Filter metrics by name and time period
    const matchingMetrics = this.metrics.filter(metric => 
      metric.name === name && metric.timestamp >= minTimestamp
    );
    
    // Return empty array if no data
    if (matchingMetrics.length === 0) {
      return [];
    }
    
    // Determine intervals for aggregation based on total range
    // We use a maximum of 60 points for any range
    const intervalMs = Math.max(timeRangeMs / 60, 1000); // At least 1 second
    
    // Group metrics by interval
    const groupedMetrics: Map<number, number[]> = new Map();
    
    matchingMetrics.forEach(metric => {
      // Normalize timestamp to start of interval
      const intervalStart = Math.floor(metric.timestamp / intervalMs) * intervalMs;
      
      if (!groupedMetrics.has(intervalStart)) {
        groupedMetrics.set(intervalStart, []);
      }
      
      groupedMetrics.get(intervalStart)?.push(metric.value);
    });
    
    // Apply aggregation function
    return Array.from(groupedMetrics.entries()).map(([timestamp, values]) => {
      let aggregatedValue: number;
      
      switch (aggregation) {
        case 'avg':
          aggregatedValue = values.reduce((sum, val) => sum + val, 0) / values.length;
          break;
        case 'sum':
          aggregatedValue = values.reduce((sum, val) => sum + val, 0);
          break;
        case 'min':
          aggregatedValue = Math.min(...values);
          break;
        case 'max':
          aggregatedValue = Math.max(...values);
          break;
      }
      
      return {
        timestamp,
        value: aggregatedValue
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp); // Sort by timestamp
  }
  
  /**
   * Store a system event
   */
  async storeEvent(
    eventType: string, 
    details: Record<string, unknown>
  ): Promise<void> {
    // If this is an error event, update system health
    if (eventType.includes('error') || eventType.includes('failure')) {
      this.systemHealth.lastError = `${eventType}: ${JSON.stringify(details)}`;
      this.systemHealth.status = 'degraded';
      
      // After a lot of errors, mark as unhealthy
      const recentErrors = this.events
        .filter(e => e.timestamp > Date.now() - 300000) // Last 5 minutes
        .filter(e => e.eventType.includes('error') || e.eventType.includes('failure'));
      
      if (recentErrors.length > 10) {
        this.systemHealth.status = 'unhealthy';
      }
    }
    
    this.events.push({
      timestamp: Date.now(),
      eventType,
      details
    });
    
    // Manage size limit
    if (this.events.length > this.maxEventsEntries) {
      this.events = this.events.slice(-this.maxEventsEntries);
    }
  }
  
  /**
   * Get recent system events
   */
  async getRecentEvents(
    limit: number, 
    eventTypes?: string[]
  ): Promise<Array<{
    timestamp: number;
    eventType: string;
    details: Record<string, unknown>;
  }>> {
    let filteredEvents = this.events;
    
    // Filter by type if specified
    if (eventTypes && eventTypes.length > 0) {
      filteredEvents = filteredEvents.filter(event => 
        eventTypes.some(type => event.eventType.includes(type))
      );
    }
    
    // Sort by timestamp (newest first) and limit
    return filteredEvents
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  
  /**
   * Get current system health metrics
   */
  async getSystemHealth(): Promise<{
    cpu: number;
    memory: number;
    uptime: number;
    lastError: string | null;
    status: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    // Update uptime
    this.systemHealth.uptime = (Date.now() - this.startTime) / 1000; // in seconds
    
    // Try to get real CPU/memory usage if possible
    try {
      // This is just a simulation - in a real implementation, 
      // you'd use os.cpuUsage() and process.memoryUsage()
      this.systemHealth.cpu = Math.random() * 100;
      this.systemHealth.memory = Math.random() * 100;
      
      // Auto-heal system if it's been degraded for a while with no new errors
      const lastErrorTime = this.events.find(e => 
        e.eventType.includes('error') || e.eventType.includes('failure')
      )?.timestamp || 0;
      
      if (this.systemHealth.status === 'degraded' && 
          lastErrorTime < Date.now() - 600000) { // No errors in last 10 minutes
        this.systemHealth.status = 'healthy';
      }
    } catch (error) {
      // If we can't get metrics, that's a problem
      this.systemHealth.status = 'degraded';
    }
    
    return { ...this.systemHealth };
  }
  
  /**
   * Clear old metrics
   */
  async pruneMetrics(olderThanMs: number): Promise<number> {
    const cutoffTime = Date.now() - olderThanMs;
    const initialCount = this.metrics.length;
    
    // Remove old metrics
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoffTime);
    
    // Also prune old events
    this.events = this.events.filter(e => e.timestamp >= cutoffTime);
    
    // Return number of pruned items
    return initialCount - this.metrics.length;
  }
}
