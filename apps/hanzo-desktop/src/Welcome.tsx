import { getBrand } from '@hanzo/desktop-brand-config';
import { BrandMark } from '@hanzo/desktop-logo';
import { Button, Text, XStack, YStack } from '@hanzo/gui';
import { PrimaryButton } from '@hanzo/ui/product';
import { ArrowRight, Cpu, Sparkles } from '@hanzogui/lucide-icons-2';

// What a signed-out window shows: the brand, sign-in, and a first-class
// "Continue without login (Local AI)" path. Sign-in opens the brand's page in
// the system browser and comes back on the brand's deep link (host.tsx).
// Continuing without login opens the workspace immediately backed by the
// embedded local Hanzo Engine.
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
    <YStack flex={1} height="100dvh" items="center" justify="center" p="$6" bg="$background">
      <YStack width="100%" maxW={420} gap="$5">
        <YStack gap="$4">
          <BrandMark brand={brand} size={32} />
          <YStack gap="$2">
            <Text fontSize={22} lineHeight={28} fontWeight="600" letterSpacing={-0.4} color="$color">
              Welcome to {productName}
            </Text>
            <Text fontSize="$3" lineHeight={20} color="$color11">
              Chat, code with Dev, and run local Zen models on your GPU. Sign in with your {name} account, or continue without login using Local AI.
            </Text>
          </YStack>
        </YStack>

        <YStack gap="$2.5">
          <PrimaryButton
            size="$3"
            rounded={999}
            disabled={busy}
            iconAfter={<ArrowRight size={15} />}
            onPress={onSignIn}
          >
            {busy ? 'Finish signing in in your browser…' : `Sign in with ${name}`}
          </PrimaryButton>

          <Button
            id="continue-without-login"
            size="$3"
            rounded={999}
            borderWidth={1}
            borderColor="rgba(255,255,255,0.18)"
            bg="rgba(255,255,255,0.06)"
            hoverStyle={{
              bg: 'rgba(255,255,255,0.11)',
              borderColor: 'rgba(255,255,255,0.28)',
            }}
            pressStyle={{
              bg: 'rgba(255,255,255,0.04)',
            }}
            icon={<Sparkles size={15} />}
            onPress={onSkip}
          >
            Continue without login · Local AI
          </Button>
        </YStack>

        {onBenchmark ? (
          <XStack justify="center" pt="$1">
            <Button
              size="$2"
              rounded={999}
              chromeless
              opacity={0.75}
              hoverStyle={{ opacity: 1, bg: 'rgba(255,255,255,0.04)' }}
              icon={<Cpu size={13} />}
              onPress={onBenchmark}
            >
              Open Local Engine & D-LSA Benchmarks
            </Button>
          </XStack>
        ) : null}

        {error ? (
          <Text fontSize="$2" color="$color" fontWeight="600">
            {error.message}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
}
