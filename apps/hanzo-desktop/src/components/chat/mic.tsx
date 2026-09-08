import { REFUSED, useVoice, Voice } from '@hanzo/voice';
import { cn } from '@hanzo/desktop-ui/utils';
import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';

import { speech } from '../../lib/voice/speech';
import { useAuth } from '../../store/auth';

/**
 * The composer's microphone.
 *
 * One click opens the mic and keeps it open: what is heard streams into the
 * composer, each pause sends that turn through the composer's own submit, and
 * the reply is read back. Speaking over the reply stops it and starts the next
 * turn. A second click ends the conversation.
 *
 * The machine is `@hanzo/voice`, the same one hanzo.chat and hanzo.app hold.
 * This file supplies the composer's two functions and the app's chrome, and
 * owns no voice logic of its own.
 */

const SIGN_IN = 'Sign in to your Hanzo account to use voice.';

const CHROME = cn(
  'text-text-secondary hover:bg-bg-quaternary inline-flex size-8 shrink-0 cursor-pointer',
  'items-center justify-center rounded-full p-2 transition-colors hover:text-white',
  'disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-full',
  // Open and hearing reads as live; speaking reads as its own thing; a service
  // that refused stays visible for the rest of the conversation.
  'data-[state=listening]:bg-bg-quaternary data-[state=listening]:text-white',
  'data-[state=speaking]:text-white',
  'data-[refusal]:text-yellow-500',
);

export function Mic({
  disabled,
  onPartial,
  onUtterance,
  reply,
}: {
  disabled?: boolean;
  /** What has been heard so far this turn. Show it in the composer. */
  onPartial: (text: string) => void;
  /** A finished turn. Send it through the composer's existing submit. */
  onUtterance: (text: string) => void;
  /** The assistant's last settled reply, or null while none has settled. */
  reply?: string | null;
}) {
  const token = useAuth((state) => state.auth?.hanzo_token ?? null);

  const services = useMemo(
    () => (token ? speech(() => token) : undefined),
    [token],
  );

  const voice = useVoice({
    speech: services,
    onPartial,
    onUtterance,
    // Hanzo's own speech refusing is the one failure that otherwise passes for
    // success: the browser reads the reply in its own voice and the bill stays
    // at zero. It is on the button for the rest of the conversation; the toast
    // is so it is not missed the first time.
    onRefusal: ({ service, error, covered }) =>
      toast.error(REFUSED[covered ? 'covered' : 'lost'], {
        description: `${service === 'ear' ? 'Transcription' : 'Speech'}: ${reason(error)}`,
      }),
  });

  // Read the reply back, once, and only inside a live conversation — `say` is a
  // no-op when the mic is shut. Seeded with whatever had already been said
  // before this composer mounted, so opening an old chat does not replay it.
  const said = useRef<string | null>(reply ?? null);
  useEffect(() => {
    if (reply === said.current) return;
    said.current = reply ?? null;
    if (reply) void voice.say(reply);
  }, [reply, voice]);

  // The package knows the browser cannot listen; it does not know nobody is
  // signed in. Say that one here, and otherwise leave the button's own label
  // alone — it already carries the blocker and any refusal.
  return (
    <Voice
      className={CHROME}
      disabled={disabled || !token}
      voice={voice}
      {...(token ? {} : { 'aria-label': SIGN_IN, title: SIGN_IN })}
    />
  );
}

/** What a service said when it refused, in words worth showing someone. */
function reason(error: Error): string {
  // The transport reports `Speech failed (401): <body>`; when that body is the
  // gateway's own JSON, its `msg` is the reason IAM gave and the rest is noise.
  const at = error.message.indexOf(': ');
  if (at < 0) return error.message;
  try {
    const { msg } = JSON.parse(error.message.slice(at + 2)) as { msg?: string };
    return msg ? `${error.message.slice(0, at)}: ${msg}` : error.message;
  } catch {
    return error.message;
  }
}

export default Mic;
