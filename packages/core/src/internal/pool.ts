import type { DependencyLink } from '@/core/dep-tracking';
import type { Dependency, Subscriber } from '@/types';
import { ArrayPool } from '@/utils/array-pool';

const freeze = <T>(arr: T[]): readonly T[] => Object.freeze(arr);

// Empty constants
export const EMPTY_DEPS = freeze<Dependency>([]);
export const EMPTY_SUBS = freeze<Subscriber>([]);
export const EMPTY_UNSUBS = freeze<() => void>([]);
export const EMPTY_VERSIONS = freeze<number>([]);
export const EMPTY_LINKS: DependencyLink[] = freeze<DependencyLink>([]) as DependencyLink[];

// Array pools
export const depArrayPool = new ArrayPool<Dependency>();
export const unsubArrayPool = new ArrayPool<() => void>();
export const versionArrayPool = new ArrayPool<number>();
export const linksArrayPool = new ArrayPool<DependencyLink>();
