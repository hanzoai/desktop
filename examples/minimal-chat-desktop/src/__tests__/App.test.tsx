import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

describe('minimal-chat-desktop example App', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders starter titlebar, checks engine health, and completes a chat turn', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'qwen3-4b' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/v1/chat/completions')) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Local model response ready.' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    });

    render(<App />);

    expect(screen.getByText('Hanzo Desktop Starter')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Engine online (1 models)');
    });

    const promptInput = screen.getByLabelText('Prompt');
    fireEvent.change(promptInput, { target: { value: 'Hello starter!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(screen.getByText('Local model response ready.')).toBeTruthy();
    });
  });
});
