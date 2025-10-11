import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';

export function useStateDeferred<T>(
  initialState: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setStateOriginal] = useState<T>(initialState);

  const setState = useCallback<Dispatch<SetStateAction<T>>>((value) => {
    queueMicrotask(() => {
      setStateOriginal(value);
    });
  }, []);

  return [state, setState];
}
