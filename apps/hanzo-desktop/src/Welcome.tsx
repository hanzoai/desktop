import { getBrand } from '@hanzo/desktop-brand-config';
import { BrandMark } from '@hanzo/desktop-logo';
import { Button, Text, XStack, YStack } from '@hanzo/gui';
import { PrimaryButton } from '@hanzo/ui/product';
import { ArrowRight, Smartphone } from '@hanzogui/lucide-icons-2';
import { openUrl } from '@tauri-apps/plugin-opener';

// Clean monochrome sign-in screen matching hanzo.app/login.
// Sign-in opens Hanzo IAM in the system browser and returns via loopback;
// continuing without login opens the workspace directly.
export function Welcome({
  busy,
  error,
  onSignIn,
  onSkip,
}: {
  busy: boolean;
  error: Error | null;
  onSignIn: () => void;
  onSkip: () => void;
  onBenchmark?: () => void;
}) {
  const { brand, name, productName } = getBrand();

  return (
    <YStack flex={1} height="100dvh" items="center" justify="center" p="$6" bg="#0a0a0a" data-slot="desktop-signin">
      <div data-tauri-drag-region="" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40 }} />
      <YStack width="100%" maxW={360} items="center" gap="$5">
        <YStack width="100%" items="center" gap="$3">
          <BrandMark brand={brand} size={28} />
          <YStack width="100%" items="center" gap="$1.5">
            <Text fontSize={24} lineHeight={30} fontWeight="600" letterSpacing={-0.4} color="#f5f5f5" style={{ textAlign: 'center' }}>
              Sign in to {productName}
            </Text>
            <Text fontSize="$2" lineHeight={19} color="#818181" style={{ textAlign: 'center', textWrap: 'balance' }}>
              One workspace for all AI providers, local engines, and linked devices.
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
            borderColor="rgba(255,255,255,0.1)"
            bg="transparent"
            color="#d4d4d8"
            hoverStyle={{ bg: '#141414' }}
            onPress={onSkip}
          >
            Continue without login
          </Button>
        </YStack>

        <XStack justify="center" pt="$1">
          <Button
            size="$2"
            rounded={8}
            chromeless
            color="#818181"
            hoverStyle={{ color: '#f5f5f5', bg: '#141414' }}
            icon={<Smartphone size={13} />}
            onPress={() => void openUrl('https://hanzo.ai/download')}
          >
            Get Hanzo Mobile
          </Button>
        </XStack>

        {error ? (
          <Text fontSize="$2" color="$red10" fontWeight="500" style={{ textAlign: 'center' }}>
            {error.message}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
}
