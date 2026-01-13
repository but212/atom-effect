/** Configuration options for creating an atom. */
export interface AtomOptions {
  /** If true, the atom will notify its subscribers synchronously when its value changes. */
  sync?: boolean;
}

/** Represents a read-only reactive atom. */
export interface ReadonlyAtom<T = unknown> {
  /** The current value of the atom. Accessing this tracks it as a dependency. */
  readonly value: T;
  /**
   * Subscribes a listener function to changes in the atom's value.
   * @param listener - Callback receiving both the new and old values.
   * @returns An unsubscribe function.
   */
  subscribe(listener: (newValue?: T, oldValue?: T) => void): () => void;
  /** Returns the current value without registering it as a dependency. */
  peek(): T;
}

/** Represents a writable reactive atom. */
export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  /** The current value of the atom. Setting this will trigger notifications if the value changes. */
  value: T;
  /** Disposes of the atom and releases associated resources. */
  dispose(): void;
}
