import { PHASE_THRESHOLD, SCHEDULER_CONFIG } from '@/constants';
import { SchedulerError } from '@/errors/errors';
import { endFlush, startFlush } from '@/internal/epoch';

/**
 * Current state of the scheduler.
 */
export enum SchedulerPhase {
  /** No pending jobs, not currently flushing. */
  IDLE = 0,
  /** Currently within a batch() block. */
  BATCHING = 1,
  /** Currently executing queued jobs. */
  FLUSHING = 2,
}

/**
 * Scheduler job interface with phase-shift tracking support.
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
 */
interface PhaseShiftNode {
  getShift(cachedVersion: number): number;
}

/**
 * Scheduler for reactive updates with double-buffered priority queues.
 */
class Scheduler {
  private _queueBuffers: [[SchedulerJob[], SchedulerJob[]], [SchedulerJob[], SchedulerJob[]]];
  private _bufferIndices: Uint8Array;
  private _sizes: Uint32Array;
  private _activeQueues: [SchedulerJob[], SchedulerJob[]];
  private _epoch: number;
  private isProcessing: boolean;
  public isBatching: boolean;
  private batchDepth: number;
  private batchQueue: SchedulerJob[];
  private batchQueueSize: number;
  private isFlushingSync: boolean;
  private maxFlushIterations: number;

  constructor() {
    this._queueBuffers = [
      [[], []], // Normal [0][0], [0][1]
      [[], []], // Urgent [1][0], [1][1]
    ];
    this._bufferIndices = new Uint8Array(2);
    this._sizes = new Uint32Array(2);
    this._activeQueues = [this._queueBuffers[0][0], this._queueBuffers[1][0]];
    this._epoch = 0;
    this.isProcessing = false;
    this.isBatching = false;
    this.batchDepth = 0;
    this.batchQueue = [];
    this.batchQueueSize = 0;
    this.isFlushingSync = false;
    this.maxFlushIterations = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;
  }

  /**
   * Returns the current operational phase of the scheduler.
   */
  get phase(): SchedulerPhase {
    if (this.isProcessing || this.isFlushingSync) {
      return SchedulerPhase.FLUSHING;
    }
    if (this.isBatching) {
      return SchedulerPhase.BATCHING;
    }
    return SchedulerPhase.IDLE;
  }

  /** Current number of pending normal jobs. */
  get queueSize(): number {
    return this._sizes[0]!;
  }

  /** Current number of pending urgent jobs. */
  get urgentQueueSize(): number {
    return this._sizes[1]!;
  }

  /**
   * Schedules a task for execution with optional priority based on phase shift.
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
      // Truly branchless routing: 0 -> normal, 1 -> urgent
      const urgent = this._calculateUrgency(callback, sourceNode);
      this._activeQueues[urgent][this._sizes[urgent]!++] = callback;

      if (!this.isProcessing) {
        this.flush();
      }
    }
  }

  /**
   * Calculates urgency flag using branchless bit manipulation.
   *
   * Logic:
   * 1. Calculate the 'shift' (rotation distance) from the cached version.
   * 2. Compare against PHASE_THRESHOLD (180° rotation equivalent).
   * 3. Use (N >>> 31) to extract the sign bit in O(1) time.
   *
   * @returns 1 if urgent (shift >= PHASE_THRESHOLD), 0 otherwise.
   */
  private _calculateUrgency(callback: SchedulerJob, sourceNode?: PhaseShiftNode): 0 | 1 {
    if (!sourceNode || callback._cachedVersion === undefined) {
      return 0;
    }
    const shift = sourceNode.getShift(callback._cachedVersion);
    // Formula: ((THRESHOLD - 1 - shift) >>> 31) & 1
    // If shift >= THRESHOLD: (negative >>> 31) = 1
    // If shift < THRESHOLD: (positive >>> 31) = 0
    return (((PHASE_THRESHOLD - 1 - shift) >>> 31) & 1) as 0 | 1;
  }

  /**
   * Schedules a microtask-based flush of the queues.
   * Coalesces multiple schedule calls into a single microtask execution.
   */
  private flush(): void {
    if (this.isProcessing || (this._sizes[0]! === 0 && this._sizes[1]! === 0)) return;

    this.isProcessing = true;

    queueMicrotask(() => {
      try {
        if (this._sizes[0]! === 0 && this._sizes[1]! === 0) return;

        const flushStarted = startFlush();
        this._drainQueue();
        if (flushStarted) endFlush();
      } finally {
        this.isProcessing = false;

        // Recursively trigger next flush if new jobs were added during drainage
        if ((this._sizes[0]! > 0 || this._sizes[1]! > 0) && !this.isBatching) {
          this.flush();
        }
      }
    });
  }

  /**
   * Immediately flushes all queues synchronously.
   * Used at the end of a batch block or when immediate reflection is required.
   */
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

  /**
   * Merges jobs from the batching queue into the primary normal queue.
   * Increments the epoch to ensure stale jobs from previous iterations are discarded.
   */
  private _mergeBatchQueue(): void {
    this._epoch++;
    const size = this.batchQueueSize;
    if (size > 0) {
      const queue = this.batchQueue;
      for (let i = 0; i < size; i++) {
        const job = queue[i];
        if (job && job._nextEpoch !== this._epoch) {
          job._nextEpoch = this._epoch;
          this._activeQueues[0][this._sizes[0]!++] = job;
        }
      }
      this.batchQueueSize = 0;
    }
  }

  private _drainQueue(): void {
    let iterations = 0;

    while (this._sizes[1]! > 0 || this._sizes[0]! > 0) {
      if (++iterations > this.maxFlushIterations) {
        this._handleFlushOverflow();
        return;
      }

      if (this._sizes[1]! > 0) this._processQueue(1);
      if (this._sizes[0]! > 0) this._processQueue(0);

      this._mergeBatchQueue();
    }
  }

  private _processQueue(type: 0 | 1): void {
    const jobs = this._activeQueues[type];
    const count = this._sizes[type]!;

    // Swap to other buffer branchlessly
    this._bufferIndices[type]! ^= 1;
    this._activeQueues[type] = this._queueBuffers[type][this._bufferIndices[type]!]!;
    this._sizes[type] = 0;
    this._epoch++;

    this._processJobs(jobs, count);
  }

  private _handleFlushOverflow(): void {
    console.error(
      new SchedulerError(
        `Maximum flush iterations (${this.maxFlushIterations}) exceeded. Possible infinite loop.`
      )
    );
    this._sizes[0] = 0;
    this._activeQueues[0].length = 0;
    this._sizes[1] = 0;
    this._activeQueues[1].length = 0;
    this.batchQueueSize = 0;
  }

  /**
   * Low-level job executor. Processes a fixed number of jobs from an array
   * and then clears the array's length to assist Garbage Collection.
   */
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
    // O(1) clear of the array to release references without re-allocating
    jobs.length = 0;
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
    if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS) {
      throw new SchedulerError(
        `Max flush iterations must be at least ${SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS}`
      );
    }
    this.maxFlushIterations = max;
  }
}

export const scheduler = new Scheduler();
