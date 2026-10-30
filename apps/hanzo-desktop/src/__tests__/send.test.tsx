/**
 * The composer's send rule, exercised through the barrel every chat surface
 * imports.
 *
 * `ChatInput` had its own rule — `key === 'Enter' && !shiftKey` — and it sent a
 * keystroke the IME had claimed. A Japanese, Chinese or Korean writer pressing
 * Enter to ACCEPT a candidate submitted the half-typed word instead, on all
 * eight surfaces that mount this component. The rule is now `sends` and `ready`
 * from `@hanzo/ui/chat`: two pure functions, no gui runtime, the same decisions
 * every Hanzo composer makes.
 *
 * Asserted here rather than trusted from the package, because what matters is
 * that THIS component reaches them with the right event fields — React's
 * synthetic event carries the modifiers but keeps `isComposing` on the native
 * one, and reading the wrong object puts the IME bug straight back.
 */
import { ChatInputArea } from '@hanzo/desktop-ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

function Composer({ onSubmit, initial = '' }: { onSubmit: () => void; initial?: string }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <ChatInputArea
      onChange={setValue}
      onSubmit={onSubmit}
      placeholder="Ask anything"
      ref={ref}
      value={value}
    />
  );
}

const field = () => screen.getByPlaceholderText('Ask anything');

describe('the composer send rule', () => {
  it('sends on Enter', () => {
    const sent = vi.fn();
    render(<Composer initial="hello" onSubmit={sent} />);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('writes a newline on Shift+Enter', () => {
    const sent = vi.fn();
    render(<Composer initial="hello" onSubmit={sent} />);
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true });
    expect(sent).not.toHaveBeenCalled();
  });

  it('force-sends on Cmd+Enter, even with Shift down', () => {
    const sent = vi.fn();
    render(<Composer initial="hello" onSubmit={sent} />);
    fireEvent.keyDown(field(), { key: 'Enter', metaKey: true, shiftKey: true });
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('leaves a keystroke the IME has claimed to the IME', () => {
    const sent = vi.fn();
    render(<Composer initial="にほんご" onSubmit={sent} />);
    // Chrome and Firefox: isComposing on the native event.
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });
    // Safari, which reports neither isComposing nor 'Enter' reliably.
    fireEvent.keyDown(field(), { key: 'Process' });
    fireEvent.keyDown(field(), { key: 'Enter', keyCode: 229 });
    expect(sent).not.toHaveBeenCalled();
  });

  it('does not send a draft that is only whitespace', () => {
    const sent = vi.fn();
    render(<Composer initial="   " onSubmit={sent} />);
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(sent).not.toHaveBeenCalled();
  });
});
