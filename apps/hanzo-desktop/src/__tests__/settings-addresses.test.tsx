/** Which Settings section each settings address opens: a section opens by name, bare /settings is General, any other address is Account. */
import { GuiProvider } from '@hanzo/gui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import config from '../../gui.config';
import { DesktopSettings, sectionOf } from '../desktop-shortcuts';

describe('settings addresses', () => {
  it.each([
    ['/settings', 'general'],
    ['/settings/profile', 'account'],
    ['/settings/personalization', 'account'],
    ['/settings/appearance', 'appearance'],
    ['/settings/engine', 'engine'],
    ['/settings/node', 'account'],
  ])('%s opens %s', (address, section) => {
    expect(sectionOf(address)).toBe(section);
  });

  it('the app’s Profile, Personalization and Account (/settings/profile) open Account, which names where those pages are', () => {
    render(
      <GuiProvider config={config} defaultTheme="dark">
        <DesktopSettings initialSection={sectionOf('/settings/profile')} isAuthenticated siteUrl="https://hanzo.ai" onSignIn={() => undefined} onBack={() => undefined} />
      </GuiProvider>,
    );
    expect(screen.getByTestId('desktop-account').textContent).toMatch(
      /profile, personalization, organization, billing, usage and API keys are on hanzo\.ai/,
    );
    expect(screen.getByRole('button', { name: 'Open on hanzo.ai' })).toBeTruthy();
  });
});
