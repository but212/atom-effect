import type { Dependency, Subscriber } from '@/types';
import { ArrayPool } from '@/utils/array-pool';

// Shared Constants
export const EMPTY_DEPS = Object.freeze([]) as unknown as Dependency[];
export const EMPTY_SUBS = Object.freeze([]) as unknown as Subscriber[];
export const EMPTY_UNSUBS = Object.freeze([]) as unknown as (() => void)[];

export const EMPTY_VERSIONS = Object.freeze([]) as unknown as number[];

export const depArrayPool = new ArrayPool<Dependency>();
export const subArrayPool = new ArrayPool<Subscriber>();
export const unsubArrayPool = new ArrayPool<() => void>();
export const versionArrayPool = new ArrayPool<number>();
