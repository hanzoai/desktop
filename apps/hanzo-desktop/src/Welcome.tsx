import { getBrand } from '@hanzo/desktop-brand-config';
import { BrandMark } from '@hanzo/desktop-logo';
import { Text, XStack, YStack } from '@hanzo/gui';
import { Button } from '@hanzo/ui';
import { PrimaryButton } from '@hanzo/ui/product';
import { ArrowRight, CircleAlert, ExternalLink } from '@hanzogui/lucide-icons-2';
import { useEffect } from 'react';

/** An error as a sentence a reader can act on, whatever shape it arrived in. */
export function sentence(error: Error): string {
  const raw = error.message.trim();
  if (!raw) return 'Sign-in did not finish. Try again.';
  const said = raw.charAt(0).toUpperCase() + raw.slice(1);
  return /[.!?]$/.test(said) ? said : `${said}.`;
}

// What a signed-out window shows: the brand, one sentence on each way in, and
// the two ways. Sign-in opens the brand's page in the system browser and comes
// back on a loopback port (host.tsx). While it waits, the reader can open that
// page again or cancel, so a closed browser tab never strands the window.
// Continuing without signing in opens Chat answered by models on this computer.
// The strip across the top drags the window: there is no bar yet.
export function Welcome({
  busy,
  error,
  onSignIn,
  onSkip,
  onCancel,
  onReopen,
}: {
  busy: boolean;
  error: Error | null;
  onSignIn: () => void;
  onSkip: () => void;
  onCancel?: () => void;
  /** Present once the sign-in page has been opened. */
  onReopen?: () => void;
}) {
  const { brand, name, productName } = getBrand();

  // Enter signs in from anywhere on the screen that is not itself a control:
  // a focused button already answers Enter on its own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.repeat || busy) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]')) return;
      e.preventDefault();
      onSignIn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onSignIn]);

  return (
    <YStack flex={1} height="100dvh" items="center" justify="center" p="$6" bg="$background" data-slot="desktop-signin">
      <div data-tauri-drag-region="" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40 }} />
      <YStack width="100%" maxW={400} items="center" gap="$6">
        <YStack width="100%" items="center" gap="$3">
          <BrandMark brand={brand} size={28} />
          <Text
            role="heading"
            aria-level={1}
            fontSize={24}
            lineHeight={30}
            fontWeight="600"
            letterSpacing={-0.4}
            color="$color"
            style={{ textAlign: 'center' }}
          >
            {busy ? 'Finish signing in in your browser' : `Sign in to ${productName}`}
          </Text>
          <Text
            data-testid="welcome-explainer"
            fontSize="$3"
            lineHeight={21}
            color="$color11"
            style={{ textAlign: 'center', textWrap: 'pretty' }}
          >
            {/* "your own models", not "installed on this computer", and the HISTORY stays
                here, not the chats: signed out, a message can still go to a custom or
                network model server set on the Local AI screen. */}
            {busy
              ? `We opened the ${name} sign-in page in your browser. When you finish there, this window carries on by itself.`
              : `Signing in gives you ${name}'s cloud models and keeps your chats on every device. Without signing in, chat uses your own models and your chat history is saved only on this computer.`}
          </Text>
        </YStack>

        {busy ? (
          <YStack width="100%" gap="$2.5" data-testid="welcome-pending">
            <PrimaryButton
              width="100%"
              height={42}
              rounded={10}
              disabled={!onReopen}
              iconAfter={<ExternalLink size={15} />}
              onPress={onReopen}
            >
              Open the sign-in page again
            </PrimaryButton>
            <Button width="100%" height={42} rounded={10} variant="outline" onPress={onCancel}>
              Cancel
            </Button>
          </YStack>
        ) : (
          <YStack width="100%" gap="$2.5">
            <PrimaryButton width="100%" height={42} rounded={10} iconAfter={<ArrowRight size={15} />} onPress={onSignIn}>
              {`Sign in with ${name}`}
            </PrimaryButton>
            <Button id="continue-without-login" width="100%" height={42} rounded={10} variant="outline" onPress={onSkip}>
              Continue without signing in
            </Button>
          </YStack>
        )}

        {error && !busy ? (
          <XStack
            role="alert"
            data-testid="welcome-error"
            width="100%"
            gap="$2.5"
            items="flex-start"
            p="$3"
            rounded={10}
            borderWidth={1}
            borderColor="$bad"
            bg="$panel"
          >
            <CircleAlert size={16} color="$bad" style={{ flexShrink: 0, marginTop: 2 }} />
            <YStack flex={1} gap="$1">
              <Text fontSize="$3" lineHeight={20} fontWeight="600" color="$color">
                Sign-in did not finish
              </Text>
              <Text fontSize="$3" lineHeight={20} color="$color11">
                {sentence(error)}
              </Text>
            </YStack>
          </XStack>
        ) : null}
      </YStack>
    </YStack>
  );
}
