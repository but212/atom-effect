import type { DependencyLink } from '@/core/dep-tracking';
import { ArrayPool } from '@/utils/array-pool';

export const EMPTY_LINKS: DependencyLink[] = Object.freeze(
  [] as unknown as DependencyLink[]
) as DependencyLink[];

export const linksArrayPool = new ArrayPool<DependencyLink>();
