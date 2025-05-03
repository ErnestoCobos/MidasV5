/**
 * Core domain entity: Worker
 * Represents a worker that can process tasks (thread, cluster node, child process)
 */

export type WorkerType = 'thread' | 'cluster' | 'child-process';
export type WorkerStatus = 'idle' | 'busy' | 'starting' | 'terminated' | 'failed';

export class Worker {
  private _status: WorkerStatus;
  private _currentTaskId: string | null;
  private _lastHeartbeat: number;
  private _taskCount: number;
  private _failureCount: number;
  private _cpuUsage: number | null;
  private _memoryUsage: number | null;

  constructor(
    private readonly _id: string,
    private readonly _type: WorkerType,
    private readonly _processId: number
  ) {
    this._status = 'idle';
    this._currentTaskId = null;
    this._lastHeartbeat = Date.now();
    this._taskCount = 0;
    this._failureCount = 0;
    this._cpuUsage = null;
    this._memoryUsage = null;
  }

  // Getters
  get id(): string { return this._id; }
  get type(): WorkerType { return this._type; }
  get processId(): number { return this._processId; }
  get status(): WorkerStatus { return this._status; }
  get currentTaskId(): string | null { return this._currentTaskId; }
  get lastHeartbeat(): number { return this._lastHeartbeat; }
  get taskCount(): number { return this._taskCount; }
  get failureCount(): number { return this._failureCount; }
  get cpuUsage(): number | null { return this._cpuUsage; }
  get memoryUsage(): number | null { return this._memoryUsage; }
  get isHealthy(): boolean { 
    return this._status !== 'failed' && this._status !== 'terminated'; 
  }
  get isAvailable(): boolean { 
    return this._status === 'idle'; 
  }
  
  // Method to update metrics
  updateMetrics(metrics: { cpu?: number; memory?: number }): void {
    if (metrics.cpu !== undefined) {
      this._cpuUsage = metrics.cpu;
    }
    
    if (metrics.memory !== undefined) {
      this._memoryUsage = metrics.memory;
    }
    
    this._lastHeartbeat = Date.now();
  }
  
  // Methods to change state
  assignTask(taskId: string): void {
    if (this._status !== 'idle') {
      throw new Error(`Cannot assign task to worker with status: ${this._status}`);
    }
    
    this._status = 'busy';
    this._currentTaskId = taskId;
    this._taskCount++;
  }
  
  completeTask(): void {
    if (this._status !== 'busy') {
      throw new Error(`Cannot complete task for worker with status: ${this._status}`);
    }
    
    this._status = 'idle';
    this._currentTaskId = null;
  }
  
  markAsFailed(): void {
    this._status = 'failed';
    this._failureCount++;
    this._currentTaskId = null;
  }
  
  terminate(): void {
    this._status = 'terminated';
    this._currentTaskId = null;
  }
  
  restart(): void {
    this._status = 'starting';
    this._currentTaskId = null;
  }
  
  markAsIdle(): void {
    this._status = 'idle';
    this._currentTaskId = null;
  }
  
  // Reset for reuse
  reset(): void {
    this._status = 'idle';
    this._currentTaskId = null;
    this._taskCount = 0;
    this._failureCount = 0;
    this._cpuUsage = null;
    this._memoryUsage = null;
  }
  
  toJSON(): Record<string, unknown> {
    return {
      id: this._id,
      type: this._type,
      processId: this._processId,
      status: this._status,
      currentTaskId: this._currentTaskId,
      lastHeartbeat: this._lastHeartbeat,
      taskCount: this._taskCount,
      failureCount: this._failureCount,
      cpuUsage: this._cpuUsage,
      memoryUsage: this._memoryUsage,
      isHealthy: this.isHealthy,
      isAvailable: this.isAvailable
    };
  }
}
