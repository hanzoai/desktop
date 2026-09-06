import * as React from 'react';

/**
 * `asChild` — render the caller's own element instead of ours, wearing our props.
 *
 * The only thing the desktop ever used @radix-ui/react-slot for. Forty lines of
 * prop merging is not a dependency: the child owns the tag, we own the wiring
 * (id / aria / handlers / class / style / ref), and the child's own value wins
 * wherever both sides set the same thing — which is exactly the contract every
 * `asChild` call site in this repo was written against.
 *
 * Event handlers compose instead of overwriting (ours first, then the child's,
 * same order Radix used) so a caller can add an onClick to a Button without
 * silently deleting the Button's own.
 */
export type SlotProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
  ref?: React.Ref<HTMLElement>;
};

const isHandler = (key: string) => /^on[A-Z]/.test(key);

const mergeRefs =
  (...refs: (React.Ref<unknown> | undefined)[]) =>
  (node: unknown) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(node);
      else if (ref && typeof ref === 'object')
        (ref as React.RefObject<unknown>).current = node;
    }
  };

export const Slot = ({ children, ref, ...slotProps }: SlotProps) => {
  if (!React.isValidElement(children)) return null;

  const childProps = children.props as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...slotProps };

  for (const [key, value] of Object.entries(childProps)) {
    const ours = merged[key];
    if (
      isHandler(key) &&
      typeof ours === 'function' &&
      typeof value === 'function'
    ) {
      merged[key] = (...args: unknown[]) => {
        (ours as (...a: unknown[]) => void)(...args);
        (value as (...a: unknown[]) => void)(...args);
      };
    } else if (
      key === 'className' &&
      typeof ours === 'string' &&
      typeof value === 'string'
    ) {
      merged[key] = `${ours} ${value}`;
    } else if (key === 'style') {
      merged[key] = { ...(ours as object), ...(value as object) };
    } else {
      merged[key] = value;
    }
  }

  const childRef = (children as unknown as { ref?: React.Ref<unknown> }).ref;
  if (ref || childRef)
    merged.ref = mergeRefs(ref as React.Ref<unknown>, childRef);

  return React.cloneElement(children, merged);
};
Slot.displayName = 'Slot';
