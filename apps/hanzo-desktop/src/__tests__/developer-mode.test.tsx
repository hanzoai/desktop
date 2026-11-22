/**
 * Developer mode in the window's own Settings: off for a new person, one switch,
 * kept on this device, and the same switch the account card, ⌘K and a run's menu
 * hold (@hanzo/build's `hanzo.dev_mode`), so turning it on here shows the process
 * in Dev at once.
 */
import { DEV_MODE_KEY } from '@hanzo/build/dev-mode';
import { GuiProvider } from '@hanzo/gui';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import config from '../../gui.config';
import { DesktopSettings } from '../desktop-shortcuts';

// Developer mode is on the General section, the one Settings opens on.
const page = () =>
  render(
    <GuiProvider config={config} defaultTheme="dark">
      <DesktopSettings isAuthenticated onSignIn={() => undefined} onBack={() => undefined} />
    </GuiProvider>,
  );

describe('Developer mode in Settings', () => {
  beforeEach(() => window.localStorage.clear());

  it('is off for a new person, and says what it shows', () => {
    page();
    const mark = screen.getByRole('switch', { name: 'Developer mode' });
    expect(mark).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('desktop-dev-mode')).toHaveTextContent(
      'Shows the process: the terminal, the commands Hanzo runs and each step. Off, Hanzo shows the result.',
    );
  });

  it('turns on with one press, is kept on this device, and turns off again', () => {
    page();
    const mark = screen.getByRole('switch', { name: 'Developer mode' });
    fireEvent.click(mark);
    expect(mark).toHaveAttribute('aria-checked', 'true');
    expect(window.localStorage.getItem(DEV_MODE_KEY)).toBe('true');
    fireEvent.click(mark);
    expect(mark).toHaveAttribute('aria-checked', 'false');
    expect(window.localStorage.getItem(DEV_MODE_KEY)).toBe('false');
  });

  it('opens on what the device kept', () => {
    window.localStorage.setItem(DEV_MODE_KEY, 'true');
    page();
    expect(screen.getByRole('switch', { name: 'Developer mode' })).toHaveAttribute('aria-checked', 'true');
  });
});
