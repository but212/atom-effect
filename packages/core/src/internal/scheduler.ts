import { PHASE_THRESHOLD, SCHEDULER_CONFIG } from '@/constants';
import { SchedulerError } from '@/errors/errors';
import { endFlush, startFlush } from '@/internal/epoch';

export enum SchedulerPhase {
  IDLE = 0,
  BATCHING = 1,
  FLUSHING = 2,
}

/**
 * Scheduler job interface with phase-shift tracking support.
 * _cachedVersion enables priority calculation based on staleness.
 */
export interface SchedulerJob {
  (): void;
  /** Epoch for deduplication */
  _nextEpoch?: number;
  /** Cached version for phase-shift priority calculation */
  _cachedVersion?: number;
}

/**
 * Interface for nodes that support phase-shift priority calculation.
 * Used by Scheduler to determine job urgency.
 */
interface PhaseShiftNode {
  getShift(cachedVersion: number): number;
}

/**
 * Scheduler for reactive updates with phase-shift priority scheduling.
 *
 * Features:
 * - Double-buffered queue for efficient processing
 * - Urgent queue for high-priority updates (glitch reduction)
 * - Branchless priority calculation using phase-shift
 * - Batching support for transactional updates
 *
 * Priority Logic:
 * When a job's phase shift exceeds PHASE_THRESHOLD (90° equivalent),
 * it's considered "urgent" and processed before normal jobs.
 * This reduces glitches by prioritizing stale updates.
 */
class Scheduler {
  // Normal queue (double-buffered)
  private _queues: [SchedulerJob[], SchedulerJob[]] = [[], []];
  private _queueIndex: 0 | 1 = 0;
  private queue: SchedulerJob[] = this._queues[0];
  private queueSize = 0;

  // Urgent queue (double-buffered)
  private _urgentQueues: [SchedulerJob[], SchedulerJob[]] = [[], []];
  private _urgentQueueIndex: 0 | 1 = 0;
  private urgentQueue: SchedulerJob[] = this._urgentQueues[0];
  private urgentQueueSize = 0;

  private _epoch = 0;
  private isProcessing: boolean = false;
  public isBatching: boolean = false;
  private batchDepth: number = 0;
  private batchQueue: SchedulerJob[] = [];
  private batchQueueSize = 0;
  private isFlushingSync: boolean = false;
  private maxFlushIterations: number = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;

  get phase(): SchedulerPhase {
    if (this.isProcessing || this.isFlushingSync) {
      return SchedulerPhase.FLUSHING;
    }
    if (this.isBatching) {
      return SchedulerPhase.BATCHING;
    }
    return SchedulerPhase.IDLE;
  }

  /**
   * Schedules a task for execution with optional priority based on phase shift.
   *
   * Priority Calculation (Branchless):
   * - If sourceNode and cachedVersion are provided, calculates shift
   * - Jobs with shift >= PHASE_THRESHOLD go to urgentQueue
   * - Uses branchless bit manipulation: ((shift - THRESHOLD) >>> 31) ^ 1
   *
   * @param callback - The function to execute
   * @param sourceNode - Optional reactive node for shift calculation
   * @throws {SchedulerError} If the callback is not a function
   */
  schedule(callback: SchedulerJob, sourceNode?: PhaseShiftNode): void {
    if (typeof callback !== 'function') {
      throw new SchedulerError('Scheduler callback must be a function');
    }

    if (callback._nextEpoch === this._epoch) return;
    callback._nextEpoch = this._epoch;

    if (this.isBatching || this.isFlushingSync) {
      this.batchQueue[this.batchQueueSize++] = callback;
    } else {
      const isUrgent = this._calculateUrgency(callback, sourceNode);

      this.urgentQueue[this.urgentQueueSize] = callback;
      this.queue[this.queueSize] = callback;
      this.urgentQueueSize += isUrgent;
      this.queueSize += isUrgent ^ 1;

      if (!this.isProcessing) {
        this.flush();
      }
    }
  }

  /**
   * Calculates urgency flag using branchless bit manipulation.
   *
   * Formula: ((shift - PHASE_THRESHOLD) >>> 31) ^ 1
   * - If shift >= THRESHOLD: (negative >>> 31) = 0, XOR 1 = 1 (urgent)
   * - If shift < THRESHOLD: (positive >>> 31) = 0... wait, that's wrong
   *
   * Correct formula: (shift >= THRESHOLD) ? 1 : 0
   * Branchless: ((PHASE_THRESHOLD - 1 - shift) >>> 31)
   *
   * @returns 1 if urgent, 0 if normal
   */
  private _calculateUrgency(callback: SchedulerJob, sourceNode?: PhaseShiftNode): number {
    if (!sourceNode || callback._cachedVersion === undefined) {
      return 0;
    }

    const shift = sourceNode.getShift(callback._cachedVersion);

    // Branchless urgency check:
    // If shift >= PHASE_THRESHOLD, result is 1
    // If shift < PHASE_THRESHOLD, result is 0
    // Formula: ((PHASE_THRESHOLD - 1 - shift) >> 31) & 1 gives 1 when shift >= THRESHOLD
    return ((PHASE_THRESHOLD - 1 - shift) >>> 31) & 1;
  }

  private flush(): void {
    if (this.isProcessing || (this.queueSize === 0 && this.urgentQueueSize === 0)) return;

    this.isProcessing = true;

    queueMicrotask(() => {
      try {
        if (this.queueSize === 0 && this.urgentQueueSize === 0) return;

        const flushStarted = startFlush();
        this._drainQueue();
        if (flushStarted) endFlush();
      } finally {
        this.isProcessing = false;

        if ((this.queueSize > 0 || this.urgentQueueSize > 0) && !this.isBatching) {
          this.flush();
        }
      }
    });
  }

  private flushSync(): void {
    this.isFlushingSync = true;
    const flushStarted = startFlush();

    try {
      this._mergeBatchQueue();
      this._drainQueue();
    } finally {
      this.isFlushingSync = false;
      if (flushStarted) endFlush();
    }
  }

  private _mergeBatchQueue(): void {
    this._epoch++;
    if (this.batchQueueSize > 0) {
      for (let i = 0; i < this.batchQueueSize; i++) {
        const job = this.batchQueue[i];
        if (job && job._nextEpoch !== this._epoch) {
          job._nextEpoch = this._epoch;
          this.queue[this.queueSize++] = job;
        }
      }
      this.batchQueueSize = 0;
    }
  }

  /**
   * Drains all queues, processing urgent queue completely first.
   *
   * Processing Order:
   * 1. Process all urgent jobs (high phase shift = stale updates)
   * 2. Process normal jobs
   * 3. Repeat until both queues are empty
   *
   * This ordering reduces glitches by ensuring that the most
   * impactful state changes are propagated first.
   */
  private _drainQueue(): void {
    let iterations = 0;

    while (this.urgentQueueSize > 0 || this.queueSize > 0) {
      if (++iterations > this.maxFlushIterations) {
        this._handleFlushOverflow();
        return;
      }

      // Process urgent queue first (glitch reduction)
      if (this.urgentQueueSize > 0) {
        this._processUrgentQueue();
      }

      // Then process normal queue
      if (this.queueSize > 0) {
        this._processCurrentQueue();
      }

      this._mergeBatchQueue();
    }
  }

  /**
   * Processes the urgent queue using double-buffering.
   */
  private _processUrgentQueue(): void {
    const jobs = this.urgentQueue;
    const count = this.urgentQueueSize;

    // Swap to other buffer
    this._urgentQueueIndex = (this._urgentQueueIndex ^ 1) as 0 | 1;
    this.urgentQueue = this._urgentQueues[this._urgentQueueIndex];
    this.urgentQueueSize = 0;
    this._epoch++;

    this._processJobs(jobs, count);
  }

  private _processCurrentQueue(): void {
    const jobs = this.queue;
    const count = this.queueSize;

    this._queueIndex = (this._queueIndex ^ 1) as 0 | 1;
    this.queue = this._queues[this._queueIndex];
    this.queueSize = 0;
    this._epoch++;

    this._processJobs(jobs, count);
  }

  private _handleFlushOverflow(): void {
    console.error(
      new SchedulerError(
        `Maximum flush iterations (${this.maxFlushIterations}) exceeded. Possible infinite loop.`
      )
    );
    this.queueSize = 0;
    this.queue.length = 0;
    this.urgentQueueSize = 0;
    this.urgentQueue.length = 0;
    this.batchQueueSize = 0;
  }

  private _processJobs(jobs: SchedulerJob[], count: number): void {
    for (let i = 0; i < count; i++) {
      const job = jobs[i];
      if (job) {
        try {
          job();
        } catch (error) {
          console.error(
            new SchedulerError('Error occurred during scheduler execution', error as Error)
          );
        }
      }
    }
    jobs.length = 0;
  }

  /** Starts a new batch of updates. Updates will be deferred until endBatch is called. */
  startBatch(): void {
    this.batchDepth++;
    this.isBatching = true;
  }

  /**
   * Ends the current batch. If the batch depth reaches zero, all pending updates are flushed synchronously.
   */
  endBatch(): void {
    this.batchDepth = Math.max(0, this.batchDepth - 1);

    if (this.batchDepth === 0) {
      this.flushSync();
      this.isBatching = false;
    }
  }

  /**
   * Configures the maximum number of iterations allowed during a synchronous flush.
   * Used to prevent infinite loops.
   * @param max - Maximum iterations count.
   */
  setMaxFlushIterations(max: number): void {
    if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS) {
      throw new SchedulerError(
        `Max flush iterations must be at least ${SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS}`
      );
    }
    this.maxFlushIterations = max;
  }
}

export const scheduler = new Scheduler();
