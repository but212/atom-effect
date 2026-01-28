import type { DependencyLink, SubscriberLink } from '@/core/dep-tracking';
import type { Dependency, Subscriber } from '@/types';
import { ArrayPool } from '@/utils/array-pool';

const freeze = <T>() => Object.freeze([]) as unknown as T[];

export const EMPTY_DEPS = freeze<Dependency>();
export const EMPTY_SUBS = freeze<Subscriber>();
export const EMPTY_UNSUBS = freeze<() => void>();
export const EMPTY_VERSIONS = freeze<number>();
export const EMPTY_LINKS = freeze<DependencyLink>();
export const EMPTY_SUBSCRIBERS = freeze<SubscriberLink<unknown>>();

export const depArrayPool = new ArrayPool<Dependency>();
export const unsubArrayPool = new ArrayPool<() => void>();
export const versionArrayPool = new ArrayPool<number>();
export const linksArrayPool = new ArrayPool<DependencyLink>();
export const subscriberPool = new ArrayPool<SubscriberLink<unknown>>();
