/** The main window's error screen: a sentence, Reload and Copy details; the stack only in the copy. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(async () => '9.9.9') }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { Crash } from '../crash';

function crash() {
  window.history.replaceState(null, '', '/chat/abc');
  const writeText = vi.fn(async (_: string) => undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  const error = new Error('fetch failed');
  error.stack = 'Error: boom\n    at Thing (host.tsx:1:1)';
  render(<Crash error={error} />);
  return writeText;
}

describe('Crash', () => {
  afterEach(() => invoke.mockReset());

  it('says what happened in a sentence, keeps the stack off the screen, and copies only what the redactor returns', async () => {
    invoke.mockImplementation(async (_cmd: string, args: { text: string }) => `redacted(${args.text.length})`);
    const writeText = crash();

    expect(screen.getByText('Something went wrong.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).not.toContain('host.tsx');

    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy());
    const [cmd, { text }] = invoke.mock.calls[0];
    expect(cmd).toBe('report_redact');
    expect(text).toContain('App version: 9.9.9');
    expect(text).toContain('Screen: /chat/abc');
    expect(text).toContain('at Thing (host.tsx:1:1)');
    expect(writeText).toHaveBeenCalledWith(`redacted(${text.length})`);
  });

  it('copies nothing when the redactor cannot be reached', async () => {
    invoke.mockRejectedValue(new Error('no window'));
    const writeText = crash();
    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    await waitFor(() => expect(screen.getByText('The details could not be copied.')).toBeTruthy());
    expect(writeText).not.toHaveBeenCalled();
  });
});
