import type { ReactNode } from 'react';
import { Button, type GuiElement } from '@hanzo/gui';

import { CHROME_CONTROL, CHROME_RADIUS, FOCUS_RING } from './theme';

/**
 * ONE chrome square, and every square control in the window chrome IS this
 * component — the cluster at the right of the chrome row, the dock strip's `+`
 * and `×`, and a dock tab's `×`.
 *
 * It exists so a row of buttons cannot end up with a 40 beside a 44, and so
 * they cannot end up painting two different focus indicators: a control that
 * hand-rolls its own box does not lose its focus ring, it falls back to the
 * user agent's, which looks nothing like ours and is how one row acquires two.
 * `size` and `bleed` are the only things a caller varies.
 *
 * Built on the gui `Button` rather than a pressable `XStack`: the Button is the
 * shared primitive, it is focusable and activates on Enter AND Space without
 * being told to, and it types the aria attributes. (`tag` is NOT typed on gui's
 * primitives in 8.x, so a hand-rolled `<XStack tag="button">` costs a cast at
 * every site — another reason there is one site.)
 */
export function ChromeButton({
  label,
  icon,
  onPress,
  size = CHROME_CONTROL,
  bleed = 0,
  radius = CHROME_RADIUS,
  active = false,
  expanded,
  hasPopup,
  buttonRef,
  testId,
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  /** Edge of the square. Defaults to the chrome's 44px pointer-target floor. */
  size?: number;
  /**
   * Negative margin, in px, given back to whatever the button sits in. It is a
   * BLEED, not spacing: it lets the box grow to a target the pointer can hit
   * without the strip around it growing too, so the button's margin box stays
   * the size the layout budgeted for it.
   */
  bleed?: number;
  radius?: number;
  /** Painted while the thing this button controls is open. */
  active?: boolean;
  /** Set on toggles, so the control states which way it goes. */
  expanded?: boolean;
  hasPopup?: 'menu';
  buttonRef?: React.Ref<GuiElement>;
  testId?: string;
}) {
  return (
    <Button
      ref={buttonRef}
      data-testid={testId}
      aria-label={label}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      width={size}
      height={size}
      m={bleed ? -bleed : undefined}
      p={0}
      shrink={0}
      items="center"
      justify="center"
      rounded={radius}
      borderWidth={0}
      cursor="pointer"
      bg={active ? '$color3' : 'transparent'}
      hoverStyle={{ bg: active ? '$color3' : '$color2' }}
      pressStyle={{ bg: '$color4' }}
      focusVisibleStyle={FOCUS_RING}
      onPress={onPress}
    >
      {icon}
    </Button>
  );
}
