import { SchedulerError } from '../errors/errors';

class Scheduler {
  private queue: Set<() => void> = new Set();
  private isProcessing: boolean = false;
  public isBatching: boolean = false;
  private batchDepth: number = 0;
  private batchQueue: Array<() => void> = [];
  private batchQueueSize = 0;
  private isFlushingSync: boolean = false;
  private maxFlushIterations: number = 1000;

  schedule(callback: () => void): void {
    if (typeof callback !== 'function') {
      throw new SchedulerError('Scheduler callback must be a function');
    }

    if (this.isBatching || this.isFlushingSync) {
      this.batchQueue[this.batchQueueSize++] = callback;
    } else {
      this.queue.add(callback);
      if (!this.isProcessing) {
        this.flush();
      }
    }
  }

  private flush(): void {
    if (this.isProcessing || this.queue.size === 0) return;

    this.isProcessing = true;
    const callbacks = Array.from(this.queue);
    this.queue.clear();

    queueMicrotask(() => {
      for (let i = 0; i < callbacks.length; i++) {
        try {
          callbacks[i]?.();
        } catch (error) {
          console.error(
            new SchedulerError('Error occurred during scheduler execution', error as Error)
          );
        }
      }

      this.isProcessing = false;

      if (this.queue.size > 0 && !this.isBatching) {
        this.flush();
      }
    });
  }

  private flushSync(): void {
    this.isFlushingSync = true;

    try {
      if (this.batchQueueSize > 0) {
        for (let i = 0; i < this.batchQueueSize; i++) {
          this.queue.add(this.batchQueue[i]!);
        }
        this.batchQueueSize = 0;
      }

      let iterations = 0;

      while (this.queue.size > 0) {
        if (++iterations > this.maxFlushIterations) {
          console.error(
            new SchedulerError(
              `Maximum flush iterations (${this.maxFlushIterations}) exceeded. ` +
                `Possible infinite loop in reactive dependencies. ` +
                `Consider increasing the limit with scheduler.setMaxFlushIterations()`
            )
          );
          this.queue.clear();
          this.batchQueueSize = 0;
          break;
        }

        const callbacks = Array.from(this.queue);
        this.queue.clear();

        for (let i = 0; i < callbacks.length; i++) {
          try {
            callbacks[i]?.();
          } catch (error) {
            console.error(
              new SchedulerError('Error occurred during batch execution', error as Error)
            );
          }
        }

        if (this.batchQueueSize > 0) {
          for (let i = 0; i < this.batchQueueSize; i++) {
            this.queue.add(this.batchQueue[i]!);
          }
          this.batchQueueSize = 0;
        }
      }
    } finally {
      this.isFlushingSync = false;
    }
  }

  startBatch(): void {
    this.batchDepth++;
    this.isBatching = true;
  }

  endBatch(): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);

    if (this.batchDepth === 0) {
      this.flushSync();
      this.isBatching = false;
    }
  }

  setMaxFlushIterations(max: number): void {
    if (max < 10) {
      throw new SchedulerError('Max flush iterations must be at least 10');
    }
    this.maxFlushIterations = max;
  }
}

export const scheduler = new Scheduler();
