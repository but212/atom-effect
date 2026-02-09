/**
 * Base error class.
 */
export class AtomError extends Error {
  constructor(
    message: string,
    public cause: Error | null = null,
    public recoverable = true
  ) {
    super(message);
    this.name = 'AtomError';
  }
}

/** Computed error. */
export class ComputedError extends AtomError {
  constructor(message: string, cause: Error | null = null) {
    super(message, cause, true);
    this.name = 'ComputedError';
  }
}

/** Effect error. */
export class EffectError extends AtomError {
  constructor(message: string, cause: Error | null = null) {
    super(message, cause, false);
    this.name = 'EffectError';
  }
}

/** Scheduler error. */
export class SchedulerError extends AtomError {
  constructor(message: string, cause: Error | null = null) {
    super(message, cause, false);
    this.name = 'SchedulerError';
  }
}
