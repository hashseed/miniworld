// A minimal observable value, used to connect state to the interface.

export class Store<T> {
  private current: T;
  private listeners = new Set<(value: T) => void>();

  constructor(initial: T) {
    this.current = initial;
  }

  get value(): T {
    return this.current;
  }

  set(value: T): void {
    if (Object.is(value, this.current)) return;
    this.current = value;
    for (const l of this.listeners) l(value);
  }

  update(patch: Partial<T>): void {
    this.set({ ...this.current, ...patch });
  }

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
