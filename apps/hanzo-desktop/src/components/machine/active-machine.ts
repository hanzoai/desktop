import { type Machine } from '../../machine-state';

const STORAGE_KEY = 'hanzo.activeMachine';

export const getActiveMachineName = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v ?? undefined;
};

export const setActiveMachineName = (name: string | undefined): void => {
  if (typeof window === 'undefined') return;
  if (name) window.localStorage.setItem(STORAGE_KEY, name);
  else window.localStorage.removeItem(STORAGE_KEY);
};

export const pickDefaultActiveMachine = (
  machines: Machine[] | undefined,
): string | undefined => {
  if (!machines || machines.length === 0) return undefined;
  const stored = getActiveMachineName();
  if (stored && machines.some((m) => m.name === stored)) return stored;
  const running = machines.find((m) => m.state === 'running');
  return (running ?? machines[0]).name;
};
