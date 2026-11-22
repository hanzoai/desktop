/** Which Settings section each settings address opens: none lands on Appearance unless it names it. */
import { GuiProvider } from '@hanzo/gui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import config from '../../gui.config';
import { DesktopSettings, sectionOf } from '../desktop-shortcuts';

describe('settings addresses', () => {
  it.each([
    ['/settings', 'account'],
    ['/settings/profile', 'account'],
    ['/settings/personalization', 'account'],
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
  });
});
