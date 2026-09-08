import { colors } from '@hanzo/brand';
import { createGui } from '@hanzo/gui';
import { defaultConfig } from '@hanzogui/config/v5';

// ONE GUI config for the whole desktop app (DRY), on the canonical @hanzo/gui v5
// default. The look is the shared Hanzo v2 design system, sourced from
// @hanzo/brand@1.4.4 (colors.surface / colors.purple) so hanzo.app, hanzo.chat
// and hanzo.desktop match — no hard-forked hexes:
//   • TIGHT 14px register  — default body/heading size → 14 (scale keeps 12/13/14…)
//   • Layered dark surfaces — background + color1..4 = surface 0..3 (#080808→#171717)
//   • Hairline borders      — rgba(255,255,255,.06)
//   • Purple accent (the ONE hue) — links / active / focus / selection; primary
//     actions stay WHITE (PrimaryButton). No blue/green/orange.
// Light theme keeps the calm default. No Tamagui compiler plugin: the runtime
// GuiProvider config is enough for the Tauri webview.
const HAIRLINE = 'rgba(255,255,255,0.06)';
const HAIRLINE_HOVER = 'rgba(255,255,255,0.10)';
const base = defaultConfig;
const dark = base.themes.dark;

// Keeps the incoming scale's exact type (its values are `number | Variable`,
// not `number`) and only re-points the `true` default at 14.
const size14 = <T extends Record<string | number, unknown>>(s: T) => ({ ...s, true: 14 });

export const config = createGui({
  ...base,
  fonts: {
    ...base.fonts,
    body: { ...base.fonts.body, size: size14(base.fonts.body.size) },
    heading: { ...base.fonts.heading, size: size14(base.fonts.heading.size) },
  },
  themes: {
    ...base.themes,
    dark: {
      ...dark,
      background: colors.surface[0],
      color1: colors.surface[0],
      color2: colors.surface[1],
      color3: colors.surface[2],
      color4: colors.surface[3],
      borderColor: HAIRLINE,
      borderColorHover: HAIRLINE_HOVER,
      // Purple is the accent for interactive emphasis (not primary fills).
      accentBackground: colors.purple.DEFAULT,
      accentColor: colors.purple.DEFAULT,
      outlineColor: colors.purple.DEFAULT,
    },
  },
});

export default config;

export type Conf = typeof config;

// Registers THIS config with the type system so the shorthand style props the
// app authors against (bg / px / py / items / justify / gap / rounded …) resolve
// to their concrete types. `GuiCustomConfig` is the extension point @hanzogui/web
// declares and @hanzogui/core re-declares — both have to be augmented, and this
// is the same pattern @hanzo/ui itself uses (pkg/ui/src/gui-env.d.ts). The 7.x
// `TypeOverride { conf }` form this replaced was inert in 8.x: TypeOverride no
// longer carries a `conf` member, so every style prop fell back to the generic
// config and failed to type.
declare module '@hanzogui/web' {
  interface GuiCustomConfig extends Conf {}
}

declare module '@hanzogui/core' {
  interface GuiCustomConfig extends Conf {}
}
