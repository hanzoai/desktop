/** Mining's switch under Settings > Advanced: off unless the person turned it on, and their press is what changes it. */
import { GuiProvider } from '@hanzo/gui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import config from '../../gui.config';
import { DesktopSettings } from '../desktop-shortcuts';

const NAME = "Earn rewards by sharing this computer's power";

function page(enabled: boolean) {
  (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
  invoke.mockImplementation(async (cmd: string) => (cmd === 'mining_get_enabled' ? enabled : undefined));
  window.history.replaceState(null, '', '/settings/advanced');
  render(
    <GuiProvider config={config} defaultTheme="dark">
      <DesktopSettings isAuthenticated onSignIn={() => undefined} onBack={() => undefined} />
    </GuiProvider>,
  );
}

describe('the mining switch', () => {
  afterEach(() => {
    invoke.mockReset();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('shows off for a new install, says what it does, and starts only on a press', async () => {
    page(false);
    const sw = await screen.findByRole('switch', { name: NAME });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/processor in the background.*not paid out yet/)).toBeTruthy();
    expect(invoke).not.toHaveBeenCalledWith('mining_set_enabled', expect.anything());

    fireEvent.click(sw);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('mining_set_enabled', { on: true }));
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('opens on what was kept, and turns off with a press', async () => {
    page(true);
    const sw = await screen.findByRole('switch', { name: NAME });
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(sw);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('mining_set_enabled', { on: false }));
  });

  it('is not drawn outside the desktop app', () => {
    window.history.replaceState(null, '', '/settings/advanced');
    render(
      <GuiProvider config={config} defaultTheme="dark">
        <DesktopSettings isAuthenticated onSignIn={() => undefined} onBack={() => undefined} />
      </GuiProvider>,
    );
    expect(screen.queryByRole('switch', { name: NAME })).toBeNull();
  });
});
