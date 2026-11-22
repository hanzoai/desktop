import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EngineStatusBadge,
  fitsSystemRam,
  formatBytes,
  getTitlebarInset,
  isMacOS,
  isTauriAvailable,
  memoryNeededGb,
  probeEngineHealth,
  safeInvoke,
  sendChatCompletion,
  WindowTitlebar,
} from '../index';

describe('@hanzo/desktop-sdk runtime and local-engine helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects plain browser runtime safely and returns null from safeInvoke', async () => {
    expect(isTauriAvailable()).toBe(false);
    await expect(safeInvoke('ping')).resolves.toBeNull();
  });

  it('computes macOS traffic-light titlebar inset only on Mac user agents', () => {
    expect(isMacOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)')).toBe(true);
    expect(getTitlebarInset('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)')).toBe(78);
    expect(isMacOS('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
    expect(getTitlebarInset('Mozilla/5.0 (X11; Linux x86_64)')).toBe(0);
  });

  it('computes memory requirements and human-readable byte sizes', () => {
    expect(memoryNeededGb(4_200_000_000)).toBe(6);
    expect(fitsSystemRam(4_200_000_000, 16)).toBe(true);
    expect(fitsSystemRam(4_200_000_000, 8)).toBe(false);
    expect(formatBytes(4_200_000_000)).toBe('4.2 GB');
    expect(formatBytes(250_000_000)).toBe('250 MB');
  });

  it('probes an OpenAI-compatible engine and sends chat completions', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'zen-mini' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/v1/chat/completions')) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Hello from local engine!' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    });

    const health = await probeEngineHealth('http://127.0.0.1:36900/');
    expect(health).toEqual({
      online: true,
      baseUrl: 'http://127.0.0.1:36900',
      models: ['zen-mini'],
    });

    const reply = await sendChatCompletion({
      baseUrl: 'http://127.0.0.1:36900',
      model: 'zen-mini',
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(reply).toBe('Hello from local engine!');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('@hanzo/desktop-sdk UI components', () => {
  it('renders WindowTitlebar with drag region and macOS inset', () => {
    render(
      <WindowTitlebar
        actions={<button type="button">Settings</button>}
        status={<EngineStatusBadge modelCount={2} online />}
        title="Starter Desktop"
        userAgent="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)"
      />,
    );

    const banner = screen.getByRole('banner');
    expect(banner.hasAttribute('data-tauri-drag-region')).toBe(true);
    expect(banner.style.paddingLeft).toBe('90px');
    expect(screen.getByText('Starter Desktop')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Engine online (2 models)');
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });
});
