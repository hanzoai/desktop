import { type Dispatch, type SetStateAction, useCallback, useState } from 'react';

/**
 * State that is controlled when the caller passes `prop`, and uncontrolled
 * otherwise — the standard React pattern, one hook.
 *
 * `setState` accepts a value or an updater either way. When controlled, the
 * updater is applied to the incoming `prop` and only `onChange` fires; the
 * caller owns the value. When uncontrolled, local state moves and `onChange`
 * still fires, so a call site can observe changes without taking control.
 */
export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop?: T;
  defaultProp: T;
  onChange?: (value: T) => void;
}): [T, Dispatch<SetStateAction<T>>] {
  const [uncontrolled, setUncontrolled] = useState(defaultProp);
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : uncontrolled;

  const setState = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const resolve = (current: T) =>
        typeof next === 'function' ? (next as (prev: T) => T)(current) : next;

      if (isControlled) {
        const resolved = resolve(prop);
        if (!Object.is(resolved, prop)) onChange?.(resolved);
        return;
      }
      setUncontrolled((current) => {
        const resolved = resolve(current);
        if (!Object.is(resolved, current)) onChange?.(resolved);
        return resolved;
      });
    },
    [isControlled, prop, onChange],
  );

  return [value, setState];
}
