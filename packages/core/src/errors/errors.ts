/**
 * Base error class.
 */
export class AtomError extends Error {
  override name = 'AtomError';

  constructor(
    message: string,
    public cause: Error | null = null,
    public recoverable = true
  ) {
    super(message);
  }
}

/** Computed error. */
export class ComputedError extends AtomError {
  override name = 'ComputedError';

  constructor(message: string, cause: Error | null = null) {
    super(message, cause, true);
  }
}

/** Effect error. */
export class EffectError extends AtomError {
  override name = 'EffectError';

  constructor(message: string, cause: Error | null = null) {
    super(message, cause, false);
  }
}

/** Scheduler error. */
export class SchedulerError extends AtomError {
  override name = 'SchedulerError';

  constructor(message: string, cause: Error | null = null) {
    super(message, cause, false);
  }
}
