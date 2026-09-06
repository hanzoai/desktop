import '@testing-library/jest-dom';
import { vi, beforeAll, afterAll } from 'vitest';

// React only flushes an `act(...)` body when it is told it is under test.
// Without this flag `act` returns having done nothing: a state change made
// inside it never reaches the DOM, so a component that reacts correctly in the
// app looks inert in a test. React says so on console.error, which is silenced
// below — so the symptom is a passing-looking suite that cannot observe any
// update it causes.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// vitest 4's jsdom window exposes localStorage as an accessor that yields
// undefined (sessionStorage is fine) — zustand's persist middleware then
// crashes on every setState. Back it with a real Storage so persisted stores
// behave in tests the way they do in the app.
if (typeof window !== 'undefined' && !window.localStorage) {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    configurable: true,
  });
}

// jsdom ships no matchMedia, and @hanzo/gui reads it at MODULE LOAD (its media
// registry is built during import, before any test body runs). Without this,
// importing any gui-backed component throws `window.matchMedia is not a
// function` and the whole suite fails to collect. Setup files run before the
// module graph is imported, which is the only place this can be installed.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// Same story for ResizeObserver (@hanzogui/tabs measures its indicator) and
// IntersectionObserver (@hanzogui/slider tracks its thumb). jsdom has neither.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

// And scrollIntoView — jsdom defines no layout, so it ships none at all.
// @hanzogui/select calls it on the selected row when a picker opens, so without
// this every Select test dies with `scrollIntoView is not a function`.
if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.scrollIntoView !== 'function'
) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeAll(() => {
  console.error = vi.fn();
  console.warn = vi.fn();
  console.log = vi.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});
