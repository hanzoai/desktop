/**
 * Split, close and type size on the Tabs page, pressed the way a hand would.
 *
 * @hanzo/app mounts the Workspace without its `shortcuts` prop, so the
 * Workspace ignores split and close sent as `hanzo:tabs-action` and installs no
 * key handler of its own. The window's native menu (main.rs) is therefore the
 * ONE path for ⌘D, ⇧⌘D, ⌘W and ⌘= / ⌘-: it names the action, and this presses
 * the matching button the Workspace draws, found by its data-slot. A key press
 * the webview sees reaches nothing, so one chord is one action.
 */
export type TabsKey = 'split-right' | 'split-down' | 'close' | 'larger' | 'smaller';

const BUTTON: Record<TabsKey, string> = {
  'split-right': '[data-slot="pane-split"][data-dir="right"]',
  'split-down': '[data-slot="pane-split"][data-dir="down"]',
  close: '[data-slot="pane-close"]',
  larger: '[data-slot="tabs-size"] button[aria-label="Larger text"]',
  smaller: '[data-slot="tabs-size"] button[aria-label="Smaller text"]',
};

/** The pane to act on: the one `id` names (its frame carries `data-pane`), else the focused one. */
function paneOf(id?: string): Element | null {
  const at = id
    ? document.querySelector(`iframe[data-pane="${CSS.escape(id)}"]`)
    : document.querySelector('[data-slot="pane-name"][data-focused="true"]');
  return at?.closest('[data-slot="terminal-pane"]') ?? null;
}

/** Press `key`; true when there was a button to press (⌘W falls to the window when there is not). */
export function pressTabs(key: TabsKey, id?: string): boolean {
  const scope = key === 'larger' || key === 'smaller' ? document : paneOf(id);
  const button = scope?.querySelector<HTMLButtonElement>(BUTTON[key]);
  if (!button || button.disabled) return false;
  button.click();
  return true;
}
