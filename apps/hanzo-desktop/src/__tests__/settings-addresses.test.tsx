/** Which Settings section each settings address opens: none lands on Appearance unless it names it. */
import { GuiProvider } from '@hanzo/gui';
import { openUrl } from '@tauri-apps/plugin-opener';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}));

import config from '../../gui.config';
import { DesktopSettings, sectionOf } from '../desktop-shortcuts';

describe('settings addresses', () => {
  it.each([
    ['/settings', 'account'],
    ['/settings/profile', 'account'],
    ['/settings/personalization', 'account'],
    ['/settings/organization', 'account'],
    ['/settings/organization/billing', 'usage'],
    ['/settings/organization/usage', 'usage'],
    ['/settings/billing', 'usage'],
    ['/settings/appearance', 'appearance'],
    ['/settings/advanced', 'advanced'],
  ])('%s opens %s', (address, section) => {
    expect(sectionOf(address)).toBe(section);
  });

  it('the app’s Profile, Personalization and Account (/settings) open Account, which names where those pages are', () => {
    window.history.replaceState(null, '', '/settings');
    render(
      <GuiProvider config={config} defaultTheme="dark">
        <DesktopSettings isAuthenticated siteUrl="https://hanzo.ai" onSignIn={() => undefined} onBack={() => undefined} />
      </GuiProvider>,
    );
    expect(screen.getByTestId('desktop-account').textContent).toMatch(
      /profile, personalization, organization, billing, usage and API keys are on hanzo\.ai/,
    );
    expect(screen.getByRole('button', { name: 'Open on hanzo.ai' })).toBeTruthy();
    expect(screen.queryByTestId('desktop-appearance')).toBeNull();
  }, 15_000);

  it('Usage & Billing (/settings/organization/billing) opens pay flows on hanzo.ai/pay and never passes directory org=hanzo', () => {
    window.history.replaceState(null, '', '/settings/organization/billing');
    vi.mocked(openUrl).mockClear();
    render(
      <GuiProvider config={config} defaultTheme="dark">
        <DesktopSettings
          isAuthenticated
          user={{ name: 'Ada', email: 'ada@example.com', org: 'hanzo' }}
          siteUrl="https://hanzo.ai"
          onSignIn={() => undefined}
          onBack={() => undefined}
        />
      </GuiProvider>,
    );

    expect(screen.getByTestId('desktop-usage')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Manage billing' }));
    expect(openUrl).toHaveBeenLastCalledWith('https://hanzo.ai/pay');

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade plan' }));
    expect(openUrl).toHaveBeenLastCalledWith('https://hanzo.ai/pay/cart');

    fireEvent.click(screen.getByRole('button', { name: 'Add credits' }));
    expect(openUrl).toHaveBeenLastCalledWith('https://hanzo.ai/pay/amount/card');

    fireEvent.click(screen.getByRole('button', { name: '+$25' }));
    expect(openUrl).toHaveBeenLastCalledWith('https://hanzo.ai/pay/confirm/card?amount=25.00');

    fireEvent.click(screen.getByRole('button', { name: 'Open Usage dashboard' }));
    expect(openUrl).toHaveBeenLastCalledWith('https://hanzo.ai/pay/usage');
  }, 15_000);
});
