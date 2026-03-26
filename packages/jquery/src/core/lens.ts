import type { DeepPath, WritableAtom } from '@/types';

// Note: atom-effect brands are based on Symbol.for, which works across realms
// and library copies. This allows the lens to behave as a first-class atom
// to any consumer using the core's branding checks.
const ATOM_BRAND = Symbol.for('atom-effect/atom');
const WRITABLE_BRAND = Symbol.for('atom-effect/writable');

/**
 * Internal recursive helper for creating deep immutable copies with structural sharing.
 * Only clones nodes along the path where changes occur.
 *
 * @internal
 */
export function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;

  const key = keys[index]!;
  const currentLevel = obj && typeof obj === 'object' ? obj : {};
  const oldValue = (currentLevel as Record<string, unknown>)[key];

  const newValue = setDeepValue(oldValue, keys, index + 1, value);

  // Structural Sharing: If the value didn't change, return the original object
  // to avoid unnecessary allocations and downstream effect triggers.
  if (Object.is(oldValue, newValue)) return obj;

  if (Array.isArray(currentLevel)) {
    const newArray = [...currentLevel];
    Object.assign(newArray, { [key]: newValue });
    return newArray;
  }
  return { ...currentLevel, [key]: newValue };
}

/**
 * Helper to retrieve a nested value from an object/array at a given path.
 *
 * @param source The source object.
 * @param parts Array of path parts.
 * @returns The value at the path or undefined if not found.
 */
export function getPathValue(source: unknown, parts: string[]): unknown {
  let result = source;
  for (let i = 0, len = parts.length; i < len && result != null; i++) {
    result = (result as Record<string, unknown>)[parts[i]!];
  }
  return result;
}

/**
 * Creates a two-way "lens" for a specific property path on an object-based atom.
 * Optimized for performance using structural sharing and equality guards.
 *
 * This "fake" atom allows fine-grained binding to deep properties of a
 * monolithic state atom without extra memory or complex computed logic.
 *
 * @param atom The source atom containing the object.
 * @param path Dot-separated path to the property (e.g. 'user.profile.name').
 * @returns A WritableAtom that reads from and writes to the specified path.
 */
export function atomLens<T extends object, P extends string>(
  atom: WritableAtom<T>,
  path: P
): WritableAtom<DeepPath<T, P>> {
  const parts = path.includes('.') ? path.split('.') : [path];
  const unsubscribers = new Set<() => void>();

  const dispose = () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
    unsubscribers.clear();
  };

  return {
    get value() {
      return getPathValue(atom.value, parts) as DeepPath<T, P>;
    },
    set value(newVal: DeepPath<T, P>) {
      const current = atom.peek();
      const next = setDeepValue(current, parts, 0, newVal);

      // Only write back to the atom if a change actually occurred.
      if (next !== current) {
        atom.value = next as T;
      }
    },
    peek() {
      return getPathValue(atom.peek(), parts) as DeepPath<T, P>;
    },
    subscribe(listener: (newValue: DeepPath<T, P>, oldValue: DeepPath<T, P>) => void) {
      const unsub = atom.subscribe((newParent, oldParent) => {
        const newValue = getPathValue(newParent, parts) as DeepPath<T, P>;
        const oldValue = getPathValue(oldParent, parts) as DeepPath<T, P>;
        if (!Object.is(newValue, oldValue)) {
          listener(newValue, oldValue);
        }
      });

      unsubscribers.add(unsub);
      return () => {
        unsub();
        unsubscribers.delete(unsub);
      };
    },
    subscriberCount() {
      return atom.subscriberCount();
    },
    dispose,
    [Symbol.dispose]: dispose,
    [ATOM_BRAND]: true,
    [WRITABLE_BRAND]: true,
  } as unknown as WritableAtom<DeepPath<T, P>>;
}

/**
 * Composes an existing lens with a sub-path to create a deeper lens.
 *
 * @param lens The parent lens.
 * @param path Sub-path relative to the parent lens.
 * @returns A new lens pointing to the deeper path.
 */
export function composeLens<T extends object, P extends string>(
  lens: WritableAtom<T>,
  path: P
): WritableAtom<DeepPath<T, P>> {
  return atomLens(lens, path);
}
