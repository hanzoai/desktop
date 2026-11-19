import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DESKTOP_CROSS_APPS, resolveDesktopShellBrand } from '../lib/brand-identity';
import { DEFAULT_BOT_ROSTER, UnifiedDesktopShell } from '../unified-shell';

describe('UnifiedDesktopShell (Hanzo Dev chrome + Bot & Team sidebars)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('resolves desktop shell brand across viteBrand, hostname, and pathname', () => {
    expect(resolveDesktopShellBrand({ viteBrand: 'bot' })).toBe('bot');
    expect(resolveDesktopShellBrand({ hostname: 'hanzo.bot' })).toBe('bot');
    expect(resolveDesktopShellBrand({ pathname: '/bots' })).toBe('bot');

    expect(resolveDesktopShellBrand({ viteBrand: 'team' })).toBe('team');
    expect(resolveDesktopShellBrand({ hostname: 'hanzo.team' })).toBe('team');
    expect(resolveDesktopShellBrand({ pathname: '/team/general' })).toBe('team');

    expect(resolveDesktopShellBrand({ viteBrand: 'dev' })).toBe('dev');
    expect(resolveDesktopShellBrand({ pathname: '/dev/runs' })).toBe('dev');

    expect(resolveDesktopShellBrand({ viteBrand: 'hanzo', pathname: '/chat' })).toBe('hanzo');
    expect(DESKTOP_CROSS_APPS.map((a) => a.id)).toEqual([
      'chat',
      'dev',
      'bot',
      'team',
      'console',
      'desktop',
    ]);
  });

  it('renders Hanzo Bot unified obsidian shell with first-class Bots sidebar section, zen6/qwen3+ badges (no zen4/zen5/qwen2), quick links, and X-Org-Id switcher', () => {
    const onNavigate = vi.fn();
    render(<UnifiedDesktopShell brand="bot" onNavigate={onNavigate} />);

    // Verify obsidian chrome tokens on floor, sidebar, and inset stage
    const floor = screen.getByTestId('unified-desktop-shell');
    const sidebar = screen.getByTestId('unified-left-sidebar');
    const stage = screen.getByTestId('unified-stage-pane');
    expect(floor.style.backgroundColor).toBe('rgb(5, 5, 5)');
    expect(sidebar.style.backgroundColor).toBe('rgb(9, 9, 11)');
    expect(sidebar.style.width).toBe('256px');
    expect(stage.style.backgroundColor).toBe('rgb(15, 15, 18)');

    // Verify zen6 / zen6-flash badges and zero zen4, zen5, or qwen2 references anywhere in bot roster or rendered UI
    expect(DEFAULT_BOT_ROSTER.some((b) => b.runtimeBadge === 'zen6 · cloud resident')).toBe(true);
    expect(DEFAULT_BOT_ROSTER.some((b) => b.runtimeBadge === 'zen6-flash · cloud resident')).toBe(true);
    for (const bot of DEFAULT_BOT_ROSTER) {
      const badge = bot.runtimeBadge.toLowerCase();
      expect(badge).not.toContain('qwen2');
      expect(badge).not.toContain('zen4');
      expect(badge).not.toContain('zen5');
    }
    expect(floor.textContent).not.toMatch(/zen[45]|qwen2/i);

    // Search/filter input for bots & routines
    const filter = screen.getByTestId('sidebar-filter-input') as HTMLInputElement;
    expect(filter.placeholder).toBe('Filter bots & routines...');

    // Live status dots (running emerald, awaiting_approval amber, idle zinc)
    expect(screen.getAllByTestId('bot-status-dot-running').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('bot-status-dot-awaiting_approval').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('bot-status-dot-idle').length).toBeGreaterThan(0);

    // Filter bots down to PR Guardian
    fireEvent.change(filter, { target: { value: 'Guardian' } });
    expect(screen.getByText('PR Guardian')).toBeTruthy();
    expect(screen.queryByText('Research Scout')).toBeNull();
    fireEvent.change(filter, { target: { value: '' } });

    // Create a new bot from sidebar "+ New Bot"
    fireEvent.click(screen.getByTestId('bots-section-add-btn'));
    const botInput = screen.getByLabelText('New bot name') as HTMLInputElement;
    expect(botInput.placeholder).toBe('Bot name (zen6)...');
    fireEvent.change(botInput, { target: { value: 'Canary Watcher' } });
    fireEvent.submit(screen.getByTestId('create-bot-inline-form'));
    expect(screen.getAllByText('Canary Watcher').length).toBeGreaterThan(0);

    // Quick sidebar links: Workflows (/flow), Approvals, Runs
    const workflowsBtn = screen.getByTestId('bot-quick-link-workflows');
    expect(within(workflowsBtn).getByText('/flow')).toBeTruthy();
    fireEvent.click(workflowsBtn);
    expect(onNavigate).toHaveBeenCalledWith('/flow');
    expect(screen.getByTestId('bot-quick-link-approvals')).toBeTruthy();
    expect(screen.getByTestId('bot-quick-link-runs')).toBeTruthy();

    // Unified Account & Org Switcher (X-Org-Id)
    fireEvent.click(screen.getByTestId('unified-account-org-switcher'));
    const menu = screen.getByTestId('account-org-menu');
    expect(within(menu).getByText('Sign in via hanzo.id')).toBeTruthy();
    fireEvent.click(screen.getByTestId('org-switch-lux'));
    expect(window.localStorage.getItem('hanzo:x-org-id')).toBe('lux');
    expect(screen.getByText('X-Org-Id: lux')).toBeTruthy();
  });

  it('renders Hanzo Team unified shell with Channels list, unread badges, + New Channel, and Direct & Bot Handoffs', () => {
    render(<UnifiedDesktopShell brand="team" />);

    const filter = screen.getByTestId('sidebar-filter-input') as HTMLInputElement;
    expect(filter.placeholder).toContain('Jump to channel or person...');

    // Default Channels in sidebar
    expect(screen.getByTestId('sidebar-channel-general')).toBeTruthy();
    expect(screen.getByTestId('sidebar-channel-engineering')).toBeTruthy();
    expect(screen.getByTestId('sidebar-channel-deployments')).toBeTruthy();
    expect(screen.getByTestId('sidebar-channel-approvals')).toBeTruthy();
    expect(screen.getByTestId('sidebar-channel-incidents')).toBeTruthy();

    // Unread badge clears when channel clicked
    expect(screen.getByTestId('channel-unread-engineering').textContent).toBe('5');
    fireEvent.click(screen.getByTestId('sidebar-channel-engineering'));
    expect(screen.queryByTestId('channel-unread-engineering')).toBeNull();

    // Create channel via "+ New Channel"
    fireEvent.click(screen.getByTestId('channels-section-add-btn'));
    fireEvent.change(screen.getByLabelText('New channel name'), {
      target: { value: 'security-ops' },
    });
    fireEvent.submit(screen.getByTestId('create-channel-inline-form'));
    expect(screen.getByTestId('sidebar-channel-security-ops')).toBeTruthy();

    // Direct & Bot Handoffs (@hanzo-dev, @release-bot)
    const directs = screen.getByTestId('team-directs-section');
    expect(within(directs).getByText('@hanzo-dev')).toBeTruthy();
    expect(within(directs).getByText('@release-bot')).toBeTruthy();
  });

  it('handles ⌘B sidebar collapse, ⌘K command palette, ⌘/ shortcuts dialog, and ⌘, settings', () => {
    const onNavigate = vi.fn();
    render(<UnifiedDesktopShell brand="team" onNavigate={onNavigate} />);

    expect(screen.getByTestId('unified-left-sidebar')).toBeTruthy();

    // ⌘B collapses and expands left sidebar
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(screen.queryByTestId('unified-left-sidebar')).toBeNull();
    expect(screen.getByTestId('stage-expand-sidebar-trigger')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(screen.getByTestId('unified-left-sidebar')).toBeTruthy();

    // ⌘K opens Command Palette
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByTestId('unified-command-palette')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByTestId('unified-command-palette')).toBeNull();

    // ⌘/ opens Keyboard Shortcuts dialog
    fireEvent.keyDown(window, { key: '/', metaKey: true });
    expect(screen.getByTestId('unified-shortcuts-dialog')).toBeTruthy();

    // ⌘, navigates to /settings
    fireEvent.keyDown(window, { key: ',', metaKey: true });
    expect(onNavigate).toHaveBeenCalledWith('/settings');
  });
});
