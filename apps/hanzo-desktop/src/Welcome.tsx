import { getBrand } from '@hanzo/desktop-brand-config';
import { BrandMark } from '@hanzo/desktop-logo';
import { Text, YStack } from '@hanzo/gui';
import { PrimaryButton } from '@hanzo/ui/product';
import { ArrowRight } from '@hanzogui/lucide-icons-2';

// What a signed-out window shows: the brand, one line, and sign-in. Sign-in
// opens the brand's page in the system browser, where the terms are agreed to
// and every factor works, and comes back on the brand's deep link (host.tsx).
export function Welcome({
  busy,
  error,
  onSignIn,
}: {
  busy: boolean;
  error: Error | null;
  onSignIn: () => void;
}) {
  const { brand, name, productName } = getBrand();

  return (
    <YStack flex={1} height="100dvh" items="center" justify="center" p="$6" bg="$background">
      <YStack width="100%" maxW={420} gap="$6">
        <YStack gap="$4">
          <BrandMark brand={brand} size={30} />
          <YStack gap="$2">
            <Text fontSize={20} lineHeight={26} fontWeight="600" letterSpacing={-0.4} color="$color">
              Welcome to {productName}
            </Text>
            <Text fontSize="$3" lineHeight={20} color="$color11">
              Chat and Dev, the same as on the web. Sign in with your {name} account; it opens in your browser.
            </Text>
          </YStack>
        </YStack>

        <PrimaryButton
          size="$2"
          rounded={10}
          disabled={busy}
          iconAfter={<ArrowRight size={15} />}
          onPress={onSignIn}
        >
          {busy ? 'Finish signing in in your browser…' : `Sign in with ${name}`}
        </PrimaryButton>

        {error ? (
          <Text fontSize="$2" color="$color" fontWeight="600">
            {error.message}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
}
