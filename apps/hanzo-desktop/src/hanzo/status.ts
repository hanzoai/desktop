/**
 * How a state is drawn on a register that has no hues.
 *
 * `theme.ts` next door records the decision for the chrome — "There is no
 * accent constant… the purple that used to live here was a literal on a
 * register documented as monochrome." This is the same decision for STATE,
 * which is where the hues actually survived: nine files each mapped state to
 * colour on their own, in green, amber, orange, yellow, cyan and red, and on
 * this palette every one of those resolves to one grey. Four hues that render
 * as one value is an indicator that says nothing.
 *
 * So two things carry it, and both are things the ramp can express.
 *
 * LUMINANCE CARRIES DEGREE. Settled is brightest, in-motion is the middle, at
 * rest is dimmest. That is the order a person scans a list in, and every one of
 * these indicators sits beside the state's own name — so the shade reinforces a
 * word rather than replacing one.
 *
 * INVERSION CARRIES ATTENTION, AND IT IS SPENT ONCE. `act` is for a state a
 * person has something to do about, and it takes the loudest thing a monochrome
 * palette has: the brand as a fill, with the ink that reads on it. Spending it
 * on anything else is what made a healthy machine the brightest thing on the
 * screen.
 *
 * Each step names the three shapes an indicator actually takes, so a caller
 * composes rather than choosing colours: `ink` for text, `panel` for a filled
 * block with a border, `dot` for the small round one.
 */
export interface Step {
  /** Text at this step. */
  ink: string;
  /** A filled block and its border — a badge, a callout, a row. */
  panel: string;
  /** The small round indicator. */
  dot: string;
}

export const status: Record<'up' | 'moving' | 'quiet' | 'act', Step> = {
  /** Settled, and what you wanted. Running, connected, ready, succeeded. */
  up: {
    ink: 'text-text-default',
    panel: 'bg-bg-quaternary border-border',
    dot: 'bg-brand',
  },
  /** On its way somewhere. Starting, stopping, creating, pulling, streaming. */
  moving: {
    ink: 'text-text-secondary',
    panel: 'bg-bg-tertiary border-divider',
    dot: 'bg-text-secondary',
  },
  /** Not running, and nothing is wrong with that. Stopped, idle, absent. */
  quiet: {
    ink: 'text-text-tertiary',
    panel: 'bg-transparent border-divider',
    dot: 'border border-text-tertiary bg-transparent',
  },
  /**
   * Needs a person. Failed, errored, blocked.
   *
   * `ink` is the brightest step plus weight, because inline text has no fill to
   * invert and a monochrome palette cannot make one sentence redder than
   * another. What carries the rest is the icon and the wording already beside
   * it — which is the honest version of what `text-red-500` was doing on a
   * palette where red is grey.
   */
  act: {
    ink: 'text-text-default font-medium',
    panel: 'bg-brand border-brand text-primary-foreground',
    dot: 'bg-brand',
  },
};
