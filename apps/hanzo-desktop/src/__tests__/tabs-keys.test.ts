import { afterEach, describe, expect, it, vi } from 'vitest';

import { pressTabs } from '../tabs-keys';

/** What @hanzo/tabs draws for two panes, by data-slot; `b` is focused. */
function workspace() {
  document.body.innerHTML = ['a', 'b']
    .map(
      (id) => `
    <div data-slot="terminal-pane">
      <div data-slot="pane-name" data-focused="${id === 'b'}">
        <button data-slot="pane-split" data-dir="right"></button>
        <button data-slot="pane-split" data-dir="down"></button>
        <button data-slot="pane-close"></button>
      </div>
      <iframe data-pane="${id}"></iframe>
    </div>`,
    )
    .join('');
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div data-slot="tabs-size"><button aria-label="Smaller text"></button><button aria-label="Larger text"></button></div>',
  );
  const press = (sel: string, pane?: string) => {
    const root = pane ? document.querySelector(`iframe[data-pane="${pane}"]`)!.closest('[data-slot="terminal-pane"]')! : document;
    const fn = vi.fn();
    root.querySelector(sel)!.addEventListener('click', fn);
    return fn;
  };
  return { press };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Tabs keys', () => {
  it('one split press is exactly one split, on the focused pane', () => {
    const { press } = workspace();
    const focused = press('[data-dir="right"]', 'b');
    const other = press('[data-dir="right"]', 'a');
    // The webview's own key press (⌘D) reaches nothing: the menu is the only path.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true }));
    expect(focused).not.toHaveBeenCalled();
    expect(pressTabs('split-right')).toBe(true);
    expect(focused).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  it('splits down, closes the focused pane, or the one a tab names', () => {
    const { press } = workspace();
    const down = press('[data-dir="down"]', 'b');
    const closeB = press('[data-slot="pane-close"]', 'b');
    const closeA = press('[data-slot="pane-close"]', 'a');
    expect(pressTabs('split-down')).toBe(true);
    expect(pressTabs('close')).toBe(true);
    expect(pressTabs('close', 'a')).toBe(true);
    expect([down, closeB, closeA].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('steps the type size', () => {
    const { press } = workspace();
    const bigger = press('[aria-label="Larger text"]');
    const smaller = press('[aria-label="Smaller text"]');
    expect(pressTabs('larger')).toBe(true);
    expect(pressTabs('smaller')).toBe(true);
    expect([bigger, smaller].map((f) => f.mock.calls.length)).toEqual([1, 1]);
  });

  it('presses nothing, and says so, when there is no pane or the button is off', () => {
    expect(pressTabs('close')).toBe(false);
    workspace();
    expect(pressTabs('close', 'missing')).toBe(false);
    (document.querySelector('[data-focused="true"] [data-slot="pane-close"]') as HTMLButtonElement).disabled = true;
    expect(pressTabs('close')).toBe(false);
  });
});
