import { SMI_MAX } from '@/constants';
import { generateId } from '@/utils/debug';

/**
 * Base class for all reactive nodes (Atoms, Computed, Effects).
 *
 * Optimized for V8 hidden classes:
 * - Initializes Smi (Small Integer) fields first.
 * - Provides common identity and flag management.
 */
export class ReactiveNode {
  // === Smi Fields (Fixed Order for V8 Hidden Class) ===
  /** Unique numerical identifier (Smi) */
  readonly id: number;

  /** Internal flags (Smi) for state management (Disposed, Dirty, etc.) */
  flags: number;

  constructor() {
    this.id = generateId() & SMI_MAX;
    this.flags = 0;
  }
}
