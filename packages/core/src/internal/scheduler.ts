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
 *
 * This scheduler implements a "Dual-Queue, Dual-Buffer" strategy to ensure
 * glitch-free propagation and high throughput:
 *
 * 1. **Priority Queues**: Normal and Urgent queues. Urgent jobs (stale updates)
 *    are processed first to reduce intermediate state glitches.
 * 2. **Double Buffering**: Each queue type has two buffers. While one buffer
 *    is being processed (drained), new jobs can be safely added to the other
 *    buffer without allocation or locking.
 * 3. **Branchless Routing**: Uses bitwise operations to route jobs to the
 *    correct queue and swap buffers, reducing branch misprediction overhead.
 */
class Scheduler {
  /**
   * Internal buffers for the double-buffering system.
   * Format: [normal_buffers, urgent_buffers] where each type has [buffer_A, buffer_B].
   */
  private _queueBuffers: [[SchedulerJob[], SchedulerJob[]], [SchedulerJob[], SchedulerJob[]]] = [
    [[], []], // Normal [0][0], [0][1]
    [[], []], // Urgent [1][0], [1][1]
  ];

  /**
   * Current active buffer index for each queue type.
   * [0]: Normal queue buffer index (0 or 1).
   * [1]: Urgent queue buffer index (0 or 1).
   * Toggled branchlessly using XOR: index ^= 1
   */
  private _bufferIndices = new Uint8Array(2);

  /**
   * Number of items in the CURRENTLY ACTIVE buffer for each queue type.
   * [0]: Normal size
   * [1]: Urgent size
   */
  private _sizes = new Uint32Array(2);

  /**
   * Cached references to the currently active buffers for fast access.
   * [0]: Reference to the active normal queue array.
   * [1]: Reference to the active urgent queue array.
   */
  private _activeQueues: [SchedulerJob[], SchedulerJob[]];

  /** Unique ID for the current flush cycle, used for job deduplication. */
  private _epoch = 0;

  /** Flag indicating if a microtask-scheduled flush is in progress. */
  private isProcessing = false;

  /** Flag indicating if we are currently batching updates. */
  public isBatching = false;

  /** Current nesting depth of batch() calls. */
  private batchDepth = 0;

  /** Temporary storage for jobs scheduled during a batch session. */
  private batchQueue: SchedulerJob[] = [];

  /** Number of jobs in the batchQueue. */
  private batchQueueSize = 0;

  /** Flag indicating if a synchronous flush (via endBatch) is in progress. */
  private isFlushingSync = false;

  /** Maximum iterations allowed in a single drain cycle to prevent infinite loops. */
  private maxFlushIterations: number = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;

  constructor() {
    this._activeQueues = [this._queueBuffers[0][0], this._queueBuffers[1][0]];
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
    if (this.batchQueueSize > 0) {
      for (let i = 0; i < this.batchQueueSize; i++) {
        const job = this.batchQueue[i];
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
