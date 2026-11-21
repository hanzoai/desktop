import { getBrand } from '@hanzo/desktop-brand-config';
import { BrandMark } from '@hanzo/desktop-logo';
import { Button, Text, XStack, YStack } from '@hanzo/gui';
import { PrimaryButton } from '@hanzo/ui/product';
import { ArrowRight, Cpu, Sparkles } from '@hanzogui/lucide-icons-2';

// What a signed-out window shows: the brand, sign-in, and a first-class
// "Continue without login (Local AI)" path. Sign-in opens the brand's page in
// the system browser and comes back on the brand's deep link (host.tsx).
// Continuing without login opens the workspace backed by the embedded local
// Hanzo Engine. The strip across the top drags the window: there is no bar yet.
export function Welcome({
  busy,
  error,
  onSignIn,
  onSkip,
  onBenchmark,
}: {
  busy: boolean;
  error: Error | null;
  onSignIn: () => void;
  onSkip: () => void;
  onBenchmark?: () => void;
}) {
  const { brand, name, productName } = getBrand();

  return (
    <YStack flex={1} height="100dvh" items="center" justify="center" p="$6" bg="$background" data-slot="desktop-signin">
      <div data-tauri-drag-region="" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40 }} />
      <YStack width="100%" maxW={400} items="center" gap="$5">
        <YStack width="100%" items="center" gap="$3">
          <BrandMark brand={brand} size={28} />
          <YStack width="100%" items="center" gap="$2">
            <Text fontSize={24} lineHeight={30} fontWeight="600" letterSpacing={-0.4} color="$color" style={{ textAlign: 'center' }}>
              Sign in to {productName}
            </Text>
            <Text fontSize="$3" lineHeight={20} color="$color11" style={{ textAlign: 'center', textWrap: 'balance' }}>
              Chat, code with Dev, and run local Zen models on your GPU.
            </Text>
          </YStack>
        </YStack>

        <YStack width="100%" gap="$2.5">
          <PrimaryButton width="100%" height={42} rounded={10} disabled={busy} iconAfter={<ArrowRight size={15} />} onPress={onSignIn}>
            {busy ? 'Finish signing in in your browser…' : `Sign in with ${name}`}
          </PrimaryButton>

          <Button
            id="continue-without-login"
            width="100%"
            height={42}
            rounded={10}
            borderWidth={1}
            borderColor="$borderColor"
            bg="transparent"
            color="$color"
            hoverStyle={{ bg: '$hover' }}
            icon={<Sparkles size={15} />}
            onPress={onSkip}
          >
            Continue without login · Local AI
          </Button>
        </YStack>

        {onBenchmark ? (
          <XStack justify="center">
            <Button size="$2" rounded={8} chromeless color="$color11" hoverStyle={{ bg: '$hover' }} icon={<Cpu size={13} />} onPress={onBenchmark}>
              Local Engine & D-LSA Benchmarks
            </Button>
          </XStack>
        ) : null}

        {error ? (
          <Text fontSize="$2" color="$red10" fontWeight="500" style={{ textAlign: 'center' }}>
            {error.message}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
}
