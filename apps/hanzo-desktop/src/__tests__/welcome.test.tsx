/**
 * The signed-out Welcome screen: what each way in gives, a pending sign-in the
 * reader can open again or cancel, and an error that reads as a sentence. Props
 * are asserted on the DOM because @hanzo/gui drops the ones it does not know.
 */
import { GuiProvider } from '@hanzo/gui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import config from '../../gui.config';
import { sentence, Welcome } from '../Welcome';

const mount = (props: Partial<Parameters<typeof Welcome>[0]> = {}) => {
  const on = { onSignIn: vi.fn(), onSkip: vi.fn(), onCancel: vi.fn(), onReopen: vi.fn() };
  render(
    <GuiProvider config={config} defaultTheme="dark">
      <Welcome busy={false} error={null} {...on} {...props} />
    </GuiProvider>,
  );
  return on;
};

describe('Welcome', () => {
  it('says what signing in gives and what continuing without it gives, and offers no benchmarks', () => {
    const on = mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in to');
    expect(screen.getByTestId('welcome-explainer')).toHaveTextContent(
      /cloud models.*Without signing in, chat uses your own models and your chats stay on this computer\./,
    );
    expect(screen.queryByText(/Benchmark/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue without signing in' }));
    expect(on.onSkip).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Sign in with/ }));
    expect(on.onSignIn).toHaveBeenCalledTimes(1);
  });

  it('signs in on Enter when no control has focus, and leaves a focused button to answer it', () => {
    const on = mount();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(on.onSignIn).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Continue without signing in' }), { key: 'Enter' });
    expect(on.onSignIn).toHaveBeenCalledTimes(1);
  });

  it('while pending: open the page again, or cancel, and Enter does not start a second attempt', () => {
    const on = mount({ busy: true });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Finish signing in in your browser');
    expect(screen.queryByRole('button', { name: /Sign in with/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open the sign-in page again' }));
    expect(on.onReopen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(on.onCancel).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(on.onSignIn).not.toHaveBeenCalled();
  });

  it('cannot reopen a page that has not been opened yet', () => {
    mount({ busy: true, onReopen: undefined });
    const again = screen.getByRole('button', { name: 'Open the sign-in page again' });
    expect(again).toHaveAttribute('aria-disabled', 'true');
  });

  it('reads an error as a sentence, in an alert', () => {
    mount({ error: new Error("cannot read properties of undefined (reading 'invoke')") });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Sign-in did not finish');
    expect(alert).toHaveTextContent("Cannot read properties of undefined (reading 'invoke').");
    expect(sentence(new Error(''))).toBe('Sign-in did not finish. Try again.');
    expect(sentence(new Error('Try again.'))).toBe('Try again.');
  });
});
