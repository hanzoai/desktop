import { ready, sends } from '@hanzo/ui/chat';
import * as React from 'react';

import { cn } from '../../utils';

export interface ChatInputProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  onSend?: () => void;
  ref: React.RefObject<HTMLTextAreaElement | null>;
}

export const useAutoResizeTextarea = (
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string | number | readonly string[] | undefined,
  autoResize = true, //later to unify
) => {
  const textAreaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useImperativeHandle(ref, () => textAreaRef.current!);

  React.useEffect(() => {
    const ref = textAreaRef?.current;

    const updateTextareaHeight = () => {
      if (ref && autoResize) {
        ref.style.height = 'auto';
        ref.style.height = ref?.scrollHeight + 'px';
      }
    };

    updateTextareaHeight();

    ref?.addEventListener('input', updateTextareaHeight);
    return () => ref?.removeEventListener('input', updateTextareaHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return { textAreaRef };
};

const ChatInputBase = ({
  className,
  onSend,
  onKeyDown,
  ref,
  ...props
}: ChatInputProps) => {
  const { textAreaRef } = useAutoResizeTextarea(ref, props.value);

  return (
    <textarea
      className={cn(
        'placeholder:!text-text-placeholder flex max-h-[40vh] min-h-[80px] w-full resize-none overflow-y-auto border-none bg-transparent px-3 py-2 text-base leading-normal break-words focus:outline-hidden focus-visible:ring-0 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      id="chat-input"
      /**
       * The two decisions come from `@hanzo/ui/chat` — pure functions, no gui
       * runtime, the same rules every Hanzo composer runs.
       *
       * The rule here used to be `key === 'Enter' && !shiftKey`, which sends a
       * keystroke the IME has claimed: a Japanese, Chinese or Korean writer
       * pressing Enter to ACCEPT a candidate submitted the half-typed word
       * instead. `sends` reads all three signals browsers use for that
       * (`isComposing`, `key === 'Process'`, `keyCode === 229`) because Safari
       * sets only the last two. It also honours Cmd/Ctrl+Enter as force-send.
       *
       * `ready` stops a whitespace-only draft. Every call site here submits
       * through a validated form, so an empty Enter was already a silent
       * no-op — now it does not make the round trip to find that out.
       */
      onKeyDown={(event) => {
        onKeyDown?.(event);
        // React's synthetic event carries the modifiers but not `isComposing`,
        // which lives on the native one — read both, as the shell's own
        // composer does.
        const mods = {
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          isComposing: event.nativeEvent?.isComposing,
          keyCode: event.nativeEvent?.keyCode,
        };
        if (!sends(event.key, mods)) return;
        event.preventDefault();
        if (ready(String(props.value ?? ''), false, props.disabled)) onSend?.();
      }}
      ref={textAreaRef}
      spellCheck={false}
      {...props}
    />
  );
};

ChatInputBase.displayName = 'ChatInput';
export const ChatInput = React.memo(ChatInputBase);
