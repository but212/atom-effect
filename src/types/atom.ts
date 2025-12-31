export interface AtomOptions {
  sync?: boolean;
}

export interface ReadonlyAtom<T = unknown> {
  readonly value: T;
  subscribe(listener: (newValue?: T, oldValue?: T) => void): () => void;
  peek(): T;
}

export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  value: T;
  dispose(): void;
}
