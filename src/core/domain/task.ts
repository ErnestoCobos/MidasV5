/**
 * Core domain entity: Task
 * Represents a unit of work to be processed by workers
 */
import * as crypto from 'crypto';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskType = 'calculation' | 'io' | 'network' | 'custom';
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export class Task {
  private readonly _id: string;
  private _status: TaskStatus;
  private _result: unknown | null;
  private _error: Error | null;
  private _startTime: number | null;
  private _endTime: number | null;
  private _assignedWorkerId: string | null;
  private _retryCount: number;
  private readonly _maxRetries: number;

  constructor(
    private readonly _payload: unknown,
    private readonly _type: TaskType,
    private readonly _priority: TaskPriority,
    options?: {
      id?: string;
      maxRetries?: number;
    }
  ) {
    this._id = options?.id || crypto.randomUUID();
    this._status = 'pending';
    this._result = null;
    this._error = null;
    this._startTime = null;
    this._endTime = null;
    this._assignedWorkerId = null;
    this._retryCount = 0;
    this._maxRetries = options?.maxRetries || 3;
  }

  // Getters
  get id(): string { return this._id; }
  get payload(): unknown { return this._payload; }
  get type(): TaskType { return this._type; }
  get priority(): TaskPriority { return this._priority; }
  get status(): TaskStatus { return this._status; }
  get result(): unknown | null { return this._result; }
  get error(): Error | null { return this._error; }
  get duration(): number | null {
    if (this._startTime && this._endTime) {
      return this._endTime - this._startTime;
    }
    return null;
  }
  get assignedWorkerId(): string | null { return this._assignedWorkerId; }
  get canRetry(): boolean { return this._retryCount < this._maxRetries; }

  // State transition methods
  markAsProcessing(workerId: string): void {
    if (this._status !== 'pending' && this._status !== 'failed') {
      throw new Error(`Cannot mark task as processing from status: ${this._status}`);
    }
    
    this._status = 'processing';
    this._startTime = Date.now();
    this._assignedWorkerId = workerId;
  }

  complete(result: unknown): void {
    if (this._status !== 'processing') {
      throw new Error(`Cannot complete task from status: ${this._status}`);
    }
    
    this._status = 'completed';
    this._result = result;
    this._endTime = Date.now();
  }

  fail(error: Error): void {
    if (this._status !== 'processing') {
      throw new Error(`Cannot fail task from status: ${this._status}`);
    }
    
    this._status = 'failed';
    this._error = error;
    this._endTime = Date.now();
    this._retryCount++;
  }

  reset(): void {
    this._status = 'pending';
    this._startTime = null;
    this._endTime = null;
    this._assignedWorkerId = null;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this._id,
      type: this._type,
      priority: this._priority,
      status: this._status,
      result: this._result,
      error: this._error ? this._error.message : null,
      startTime: this._startTime,
      endTime: this._endTime,
      duration: this.duration,
      assignedWorkerId: this._assignedWorkerId,
      retryCount: this._retryCount,
      maxRetries: this._maxRetries
    };
  }
}
