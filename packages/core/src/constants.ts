export const TIME_CONSTANTS = { ONE_SECOND_MS: 1000 } as const;

export const AsyncState = {
  IDLE: 'idle',
  PENDING: 'pending',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
} as const;

export const NODE_FLAGS = { DISPOSED: 1 << 0, HAS_FN_SUBS: 1 << 1, HAS_OBJ_SUBS: 1 << 2 } as const;
export const EFFECT_STATE_FLAGS = { ...NODE_FLAGS, EXECUTING: 1 << 3 } as const;
export const COMPUTED_STATE_FLAGS = {
  ...NODE_FLAGS,
  DIRTY: 1 << 3,
  IDLE: 1 << 4,
  PENDING: 1 << 5,
  RESOLVED: 1 << 6,
  REJECTED: 1 << 7,
  RECOMPUTING: 1 << 8,
  HAS_ERROR: 1 << 9,
} as const;
export const ATOM_STATE_FLAGS = {
  ...NODE_FLAGS,
  SYNC: 1 << 3,
  NOTIFICATION_SCHEDULED: 1 << 4,
} as const;

export const POOL_CONFIG = { MAX_SIZE: 1000, WARMUP_SIZE: 100 } as const;

export const SCHEDULER_CONFIG = {
  MAX_EXECUTIONS_PER_SECOND: 1000,
  CLEANUP_THRESHOLD: 1000,
  MAX_EXECUTIONS_PER_EFFECT: 100,
  MAX_EXECUTIONS_PER_FLUSH: 10000,
  MAX_FLUSH_ITERATIONS: 1000,
  MIN_FLUSH_ITERATIONS: 10,
  BATCH_QUEUE_SHRINK_THRESHOLD: 1000,
} as const;

export const DEBUG_CONFIG = { MAX_DEPENDENCIES: 1000, WARN_INFINITE_LOOP: true } as const;

export const SMI_MAX = 0x3fffffff;
export const IS_DEV =
  typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';
export const EMPTY_ERROR_ARRAY: readonly Error[] = Object.freeze([]);
