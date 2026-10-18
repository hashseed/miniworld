import { useEffect, useState } from 'preact/hooks';
import type { Store } from '../core/store.ts';

/** Re-renders when a store changes. */
export function useStore<T>(store: Store<T>): T {
  const [value, setValue] = useState(store.value);
  useEffect(() => {
    setValue(store.value);
    return store.subscribe(setValue);
  }, [store]);
  return value;
}
