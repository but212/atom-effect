/**
 * Base error class for all atom-effect errors.
 * Tracks original cause, recoverability, and timestamp.
 */
export class AtomError extends Error {
  readonly timestamp = new Date();

  constructor(
    message: string,
    public cause: Error | null = null,
    public recoverable = true
  ) {
    super(message);
    this.name = 'AtomError';
  }
}

/** Error thrown during computed value computation (recoverable). */
export class ComputedError extends AtomError {
  constructor(message: string, cause: Error | null = null) {
    super(message, cause, true);
    this.name = 'ComputedError';
  }
}

/** Error thrown during effect execution (non-recoverable). */
export class EffectError extends AtomError {
  constructor(message: string, cause: Error | null = null) {
    super(message, cause, false);
    this.name = 'EffectError';
  }
}

/** Error thrown by the scheduler system (non-recoverable). */
export class SchedulerError extends AtomError {
  constructor(message: string, cause: Error | null = null) {
    super(message, cause, false);
    this.name = 'SchedulerError';
  }
}
