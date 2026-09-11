import { useState } from 'react';
import { getBrand } from '@hanzo/desktop-brand-config';
import { BrandMark } from '@hanzo/desktop-logo';
import { Button, Text, XStack, YStack } from '@hanzo/gui';
import { Checkbox, Label } from '@hanzo/ui';
import { PrimaryButton } from '@hanzo/ui/product';
import { ArrowRight } from '@hanzogui/lucide-icons-2';

import { useIamLogin } from '../hooks/iam-auth';
import { CONTROL_RADIUS, CONTROL_SIZE } from './theme';

// Onboarding / welcome — the converged Tamagui version of the old
// /terms-conditions surface (title, one-line pitch, terms gate, sign-in, local
// path). Monochrome, dark-first, tight register. The node registration flow
// stays in the app's node-state layer; this surface owns the look, the terms
// gate, and the entry point into the brand's IAM.
export function Welcome({
  productName,
  onGetStarted,
}: {
  productName: string;
  onGetStarted: () => void;
}) {
  const { brand, name } = getBrand();
  const [accepted, setAccepted] = useState(false);
  const { startLogin, isLoading, error } = useIamLogin();

  return (
    <YStack flex={1} items="center" justify="center" p="$6" bg="$background">
      <YStack width="100%" maxW={420} gap="$6">
        <YStack gap="$4">
          <BrandMark brand={brand} size={30} />
          <YStack gap="$2">
            <Text
              fontSize={20}
              lineHeight={26}
              fontWeight="600"
              letterSpacing={-0.4}
              color="$color"
            >
              Welcome to {productName}
            </Text>
            <Text fontSize="$3" lineHeight={20} color="$color11">
              Your private AI workspace. Run models, agents and tools locally —
              your data never leaves your machine.
            </Text>
          </YStack>
        </YStack>

        {/* The real Checkbox, not a pressable box with a tick drawn in it.
            This control gates BOTH buttons below, so a hand-rolled one locks
            keyboard and screen-reader users out of the app at its first
            screen: a div carries no checkbox role, no checked state and no
            focus. The id/htmlFor pairing is what keeps the caption clickable
            without a press handler wrapping the row. */}
        <XStack gap="$3" items="center">
          <Checkbox
            id="terms"
            checked={accepted}
            onCheckedChange={(next) => setAccepted(next === true)}
          />
          <Label htmlFor="terms" fontSize="$3" color="$color11" flex={1}>
            I agree to the Terms of Service and Privacy Policy
          </Label>
        </XStack>

        <YStack gap="$2.5">
          {/* Cloud sign-in against THIS brand's IAM (hanzo.id / lux.id /
              zoolabs.id). Host, client and redirect all come from the brand
              table — nothing on this surface is Hanzo-specific. */}
          <PrimaryButton
            size={CONTROL_SIZE}
            rounded={CONTROL_RADIUS}
            disabled={!accepted || isLoading}
            opacity={accepted ? 1 : 0.5}
            iconAfter={<ArrowRight size={15} />}
            onPress={startLogin}
          >
            {isLoading ? `Signing in to ${name}…` : `Sign in with ${name}`}
          </PrimaryButton>
          <Button
            size={CONTROL_SIZE}
            rounded={CONTROL_RADIUS}
            chromeless
            disabled={!accepted}
            opacity={accepted ? 1 : 0.5}
            onPress={onGetStarted}
          >
            Continue without an account
          </Button>
        </YStack>

        {error ? (
          /* `status.ts`: inline text has no fill to invert, and a monochrome
             palette cannot make one sentence redder than another — so the
             brightest step plus weight, and the wording carries the rest. */
          <Text fontSize="$2" color="$color" fontWeight="600">
            {error.message}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
}
