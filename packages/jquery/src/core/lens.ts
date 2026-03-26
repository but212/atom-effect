import type { WritableAtom } from '@but212/atom-effect';

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
    (newArray as any)[key] = newValue;
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
export function atomLens<T extends object, U = unknown>(
  atom: WritableAtom<T>,
  path: string
): WritableAtom<U> {
  const parts = path.includes('.') ? path.split('.') : [path];

  return {
    get value() {
      return getPathValue(atom.value, parts) as U;
    },
    set value(newVal: U) {
      const current = atom.peek();
      const next = setDeepValue(current, parts, 0, newVal);

      // Only write back to the atom if a change actually occurred.
      if (next !== current) {
        atom.value = next as T;
      }
    },
    peek() {
      return getPathValue(atom.peek(), parts) as U;
    },
    subscribe(listener: (newValue: U, oldValue: U) => void) {
      return atom.subscribe((newParent, oldParent) => {
        const newValue = getPathValue(newParent, parts) as U;
        const oldValue = getPathValue(oldParent, parts) as U;
        if (!Object.is(newValue, oldValue)) {
          listener(newValue, oldValue);
        }
      });
    },
    subscriberCount() {
      return atom.subscriberCount();
    },
    dispose() {},
    [Symbol.dispose]() {},
    [ATOM_BRAND]: true,
    [WRITABLE_BRAND]: true,
  } as unknown as WritableAtom<U>;
}
