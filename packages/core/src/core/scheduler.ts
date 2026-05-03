import { Result } from '@but212/atom-effect-utils';
import { IS_DEV, SCHEDULER_CONFIG, SMI_MAX } from '@/constants';
import { ERROR_MESSAGES, SchedulerError } from '@/errors';
import { trackingContext } from './tracking';

// ── Epoch & Version Management ──────────────────────────────────────────

/**
 * Bitwise wrap-around to keep integers within V8's SMI (Small Integer) range.
 * Reason: Prevents performance drops caused by integer overflow transitioning to doubles.
 */
const nextSmi = (v: number): number => {
  const next = (v + 1) & SMI_MAX;
  return next === 0 ? 1 : next;
};

/**
 * Increments version numbers for stateful objects (Atoms).
 */
export function nextVersion(v: number): number {
  return nextSmi(v);
}

// Proxies to the global scheduler instance to maintain existing API while unifying state.
export const nextEpoch = (): number => scheduler.nextEpoch();
export const currentEpoch = (): number => scheduler.currentEpoch();
export const currentFlushEpoch = (): number => scheduler.currentFlushEpoch();
export const startFlush = (): boolean => scheduler.startFlush();
export const endFlush = (): void => scheduler.endFlush();
export const incrementFlushExecutionCount = (): number => scheduler.incrementFlushExecutionCount();
export const resetFlushState = (): void => scheduler.resetFlushState();

/**
 * Scopes a function execution within a flush lifecycle.
 * Ensures the scheduler state is cleaned up even if the provided function throws.
 */
export function runInFlushScope<T>(fn: () => T): T | undefined {
  const started = startFlush();
  try {
    const result = Result.tryCatch(fn);
    return Result.unwrap(result);
  } finally {
    if (started) endFlush();
  }
}

// ── Scheduler ───────────────────────────────────────────────────────────

export interface SchedulerJobObject {
  execute(): void;
  /** Internal tracking for deduplication within a specific epoch. */
  _nextEpoch?: number | undefined;
}

export interface SchedulerJobFunction {
  (): void;
  _nextEpoch?: number | undefined;
}

export type SchedulerJob = SchedulerJobFunction | SchedulerJobObject;

// State flags used for fast bitwise checking of scheduler status.
const S_IDLE = 0;
const S_PROCESSING = 1 << 0; // Currently running the microtask loop.
const S_FLUSHING_SYNC = 1 << 1; // Running a forced synchronous update.
const S_BATCHING = 1 << 2; // Inside a user-defined batch() block.
const MASK_DEFERRED = S_FLUSHING_SYNC | S_BATCHING;

/**
 * Core engine managing the timing and deduplication of reactive updates.
 *
 * Uses a "Double-Buffer + Batch-Buffer" (Triple Buffer) design:
 * 1. Active: Jobs being processed right now.
 * 2. Standby: Jobs scheduled while the current buffer is being processed.
 * 3. Batch: Jobs held until a batching scope finishes.
 */
class Scheduler {
  private _size = 0;
  private _epoch = 0;
  private _batchQueueSize = 0;
  private _state = S_IDLE;
  private _batchDepth = 0;
  private _maxFlushIterations: number = SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS;

  private _sessionActive = false;
  private _sessionEpoch = 0;
  private _sessionExecutionCount = 0;

  // Optimization: Flattened buffer layout for cache locality and reduced indirection.
  private _activeBuffer: (SchedulerJob | undefined)[] = [];
  private _standbyBuffer: (SchedulerJob | undefined)[] = [];
  private _batchBuffer: (SchedulerJob | undefined)[] = [];

  onOverflow: ((droppedCount: number) => void) | null = null;

  private readonly _boundRunLoop = this._runLoop.bind(this);

  get queueSize(): number {
    return this._size + this._batchQueueSize;
  }

  get isBatching(): boolean {
    return (this._state & S_BATCHING) !== 0;
  }

  nextEpoch(): number {
    const next = nextSmi(this._epoch);
    this._epoch = next;
    return next;
  }

  currentEpoch(): number {
    return this._epoch;
  }

  currentFlushEpoch(): number {
    return this._sessionEpoch;
  }

  startFlush(): boolean {
    if (this._sessionActive) {
      if (IS_DEV) console.warn('startFlush() called during flush - ignored');
      return false;
    }

    this._sessionActive = true;
    this._sessionEpoch = this.nextEpoch();
    this._sessionExecutionCount = 0;
    return true;
  }

  endFlush(): void {
    this._sessionActive = false;
  }

  incrementFlushExecutionCount(): number {
    if (!this._sessionActive) return 0;

    const count = ++this._sessionExecutionCount;
    if (count <= SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH) {
      return count;
    }

    throw new Error(
      `[atom-effect] Infinite loop detected: flush execution count exceeded ${SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_FLUSH}`
    );
  }

  resetFlushState(): void {
    this._sessionEpoch = 0;
    this._sessionExecutionCount = 0;
    this._sessionActive = false;
  }

  schedule(callback: SchedulerJob): void {
    if (IS_DEV) {
      if (
        typeof callback !== 'function' &&
        (!callback || typeof (callback as SchedulerJobObject).execute !== 'function')
      ) {
        throw new SchedulerError(ERROR_MESSAGES.SCHEDULER_CALLBACK_MUST_BE_FUNCTION);
      }
    }

    if (callback._nextEpoch === this._epoch) return;
    callback._nextEpoch = this._epoch;

    this._push(callback);

    if ((this._state & S_PROCESSING) === 0) {
      this._flush();
    }
  }

  private _push(job: SchedulerJob): void {
    if ((this._state & MASK_DEFERRED) === 0) {
      this._activeBuffer[this._size++] = job;
      return;
    }
    this._batchBuffer[this._batchQueueSize++] = job;
  }

  private _flush(): void {
    if ((this._state & S_PROCESSING) !== 0 || (this._size === 0 && this._batchQueueSize === 0))
      return;
    this._state |= S_PROCESSING;
    queueMicrotask(this._boundRunLoop);
  }

  private _runLoop(): void {
    try {
      if (this._size === 0 && this._batchQueueSize === 0) return;

      const started = this.startFlush();
      this._drainQueue();
      if (started) this.endFlush();
    } catch (e) {
      trackingContext.reset();
      throw e;
    } finally {
      this._state &= ~S_PROCESSING;
    }
  }

  _flushSync(): void {
    if (this._size === 0 && this._batchQueueSize === 0) return;

    const prevState = this._state;
    this._state |= S_FLUSHING_SYNC;
    const started = this.startFlush();
    try {
      this._mergeBatchQueue();
      this._drainQueue();
    } finally {
      this._state = prevState;
      if (started) this.endFlush();
    }
  }

  private _mergeBatchQueue(): void {
    const queueSize = this._batchQueueSize;
    if (queueSize === 0) return;

    const epoch = this.nextEpoch();
    const bQueue = this._batchBuffer;
    const targetBuffer = this._activeBuffer;
    let currentSize = this._size;

    for (let i = 0; i < queueSize; i++) {
      const job = bQueue[i]!;
      if (job._nextEpoch !== epoch) {
        job._nextEpoch = epoch;
        targetBuffer[currentSize++] = job;
      }
      bQueue[i] = undefined;
    }

    this._size = currentSize;
    this._batchQueueSize = 0;

    if (bQueue.length > SCHEDULER_CONFIG.BATCH_QUEUE_SHRINK_THRESHOLD) {
      bQueue.length = 0;
    }
  }

  private _drainQueue(): void {
    let iterations = 0;
    const max = this._maxFlushIterations;

    while (this._size > 0 || this._batchQueueSize > 0) {
      if (++iterations > max) {
        this._handleFlushOverflow();
        return;
      }

      if (this._batchQueueSize > 0) {
        this._mergeBatchQueue();
      }

      if (this._size > 0) {
        this._processQueue();
      }
    }
  }

  private _processQueue(): void {
    const jobs = this._activeBuffer;
    const count = this._size;

    // Swap active and standby buffers
    this._activeBuffer = this._standbyBuffer;
    this._standbyBuffer = jobs;

    this._size = 0;
    this.nextEpoch();

    for (let i = 0; i < count; i++) {
      const job = jobs[i]!;
      jobs[i] = undefined;

      const jobResult = Result.tryCatch(() => {
        if (typeof job === 'function') {
          job();
        } else {
          job.execute();
        }
      });

      Result.match(jobResult, {
        ok: () => {},
        err: (e) => {
          console.error(new SchedulerError('Error occurred during scheduler execution', e));
        },
      });
    }
  }

  private _handleFlushOverflow(): void {
    const droppedCount = this._size + this._batchQueueSize;
    console.error(
      new SchedulerError(
        ERROR_MESSAGES.SCHEDULER_FLUSH_OVERFLOW(this._maxFlushIterations, droppedCount)
      )
    );

    this._size = 0;
    this._activeBuffer.length = 0;
    this._standbyBuffer.length = 0;
    this._batchQueueSize = 0;
    this._batchBuffer.length = 0;

    const onOverflow = this.onOverflow;
    if (onOverflow) {
      try {
        onOverflow(droppedCount);
      } catch {
        /* Suppress */
      }
    }
  }

  startBatch(): void {
    this._batchDepth++;
    this._state |= S_BATCHING;
  }

  endBatch(): void {
    if (this._batchDepth === 0) {
      if (IS_DEV) console.warn(ERROR_MESSAGES.SCHEDULER_END_BATCH_WITHOUT_START);
      return;
    }

    if (--this._batchDepth === 0) {
      this._state &= ~S_BATCHING;
      if ((this._state & S_FLUSHING_SYNC) === 0) {
        this._flushSync();
      }
    }
  }

  setMaxFlushIterations(max: number): void {
    if (max < SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS)
      throw new SchedulerError(
        `Max iterations must be at least ${SCHEDULER_CONFIG.MIN_FLUSH_ITERATIONS}`
      );
    this._maxFlushIterations = max;
  }
}

export const scheduler = new Scheduler();

/**
 * Groups multiple state updates into a single atomic change.
 * Effects will only trigger once after the provided function finishes.
 *
 * @example
 * ```typescript
 * batch(() => {
 *   atomA.set(1);
 *   atomB.set(2);
 * }); // Effects listening to A or B run once here.
 * ```
 */
export function batch<T>(fn: () => T): T {
  if (IS_DEV && typeof fn !== 'function') {
    throw new TypeError(ERROR_MESSAGES.BATCH_CALLBACK_MUST_BE_FUNCTION);
  }

  scheduler.startBatch();
  try {
    const result = Result.tryCatch(fn);
    return Result.unwrap(result);
  } finally {
    scheduler.endBatch();
  }
}

let sharedNextTickPromise: Promise<void> | null = null;

/**
 * Returns a promise that resolves after the next scheduler flush.
 * Use this to wait for the reactive system to "settle" in tests or async logic.
 */
export function aeNextTick(fn?: () => void): Promise<void> {
  if (fn) {
    return new Promise<void>((resolve, reject) => {
      scheduler.schedule(() => {
        const result = Result.tryCatch(fn);
        Result.match(result, {
          ok: () => resolve(),
          err: (err) => reject(err),
        });
      });
    });
  }

  if (sharedNextTickPromise) {
    return sharedNextTickPromise;
  }

  sharedNextTickPromise = new Promise<void>((resolve) => {
    scheduler.schedule(() => {
      sharedNextTickPromise = null;
      resolve();
    });
  });

  return sharedNextTickPromise;
}
