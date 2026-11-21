/** The main window's error screen: a sentence, Reload and Copy details; the stack only in the copy. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(async () => '9.9.9') }));

import { Crash, scrub } from '../crash';

describe('Crash', () => {
  it('says what happened in a sentence, keeps the stack off the screen, and copies it with the screen and version', async () => {
    window.history.replaceState(null, '', '/chat/abc?code=secret');
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const error = new Error('fetch failed: Authorization: Bearer abc.def token=xyz');
    error.stack = 'Error: boom\n    at Thing (host.tsx:1:1)';

    render(<Crash error={error} />);

    expect(screen.getByText('Something went wrong.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).not.toContain('host.tsx');

    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy());
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain('App version: 9.9.9');
    expect(copied).toContain('Screen: /chat/abc');
    expect(copied).not.toContain('secret');
    expect(copied).toContain('at Thing (host.tsx:1:1)');
    expect(copied).not.toContain('abc.def');
    expect(copied).not.toContain('xyz');
  });

  it('scrubs a JWT wherever it sits', () => {
    expect(scrub('saw eyJhbGciOi.eyJzdWIiOi.c2lnbmF0dXJl in a url')).toBe('saw [redacted] in a url');
  });
});
