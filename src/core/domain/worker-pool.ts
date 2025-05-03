/**
 * Core domain entity: WorkerPool
 * Manages a collection of workers of the same type
 */
import { Worker, WorkerType } from './worker';

export class WorkerPool {
  private _workers: Map<string, Worker>;
  
  constructor(
    private readonly _id: string,
    private readonly _type: WorkerType,
    private readonly _maxSize: number,
    private readonly _minSize: number = 1
  ) {
    this._workers = new Map<string, Worker>();
  }
  
  // Getters
  get id(): string { return this._id; }
  get type(): WorkerType { return this._type; }
  get maxSize(): number { return this._maxSize; }
  get minSize(): number { return this._minSize; }
  get size(): number { return this._workers.size; }
  get workers(): Worker[] { return Array.from(this._workers.values()); }
  
  // Worker management
  addWorker(worker: Worker): void {
    if (this._workers.size >= this._maxSize) {
      throw new Error(`Worker pool has reached maximum size of ${this._maxSize}`);
    }
    
    if (worker.type !== this._type) {
      throw new Error(`Cannot add worker of type ${worker.type} to pool of type ${this._type}`);
    }
    
    this._workers.set(worker.id, worker);
  }
  
  removeWorker(workerId: string): Worker | null {
    const worker = this._workers.get(workerId);
    
    if (!worker) {
      return null;
    }
    
    this._workers.delete(workerId);
    return worker;
  }
  
  getWorker(workerId: string): Worker | null {
    return this._workers.get(workerId) || null;
  }
  
  // Finding workers for tasks
  getAvailableWorker(): Worker | null {
    for (const worker of this._workers.values()) {
      if (worker.isAvailable) {
        return worker;
      }
    }
    
    return null;
  }
  
  getAvailableWorkers(): Worker[] {
    return this.workers.filter(worker => worker.isAvailable);
  }
  
  getUnhealthyWorkers(): Worker[] {
    return this.workers.filter(worker => !worker.isHealthy);
  }
  
  // Statistics
  getStatistics(): Record<string, unknown> {
    const availableCount = this.getAvailableWorkers().length;
    const unhealthyCount = this.getUnhealthyWorkers().length;
    
    return {
      id: this._id,
      type: this._type,
      maxSize: this._maxSize,
      minSize: this._minSize,
      currentSize: this.size,
      availableCount,
      busyCount: this.size - availableCount,
      unhealthyCount,
      utilizationRate: this.size > 0 ? (this.size - availableCount) / this.size : 0
    };
  }
  
  toJSON(): Record<string, unknown> {
    return {
      ...this.getStatistics(),
      workers: this.workers.map(worker => worker.toJSON())
    };
  }
}
