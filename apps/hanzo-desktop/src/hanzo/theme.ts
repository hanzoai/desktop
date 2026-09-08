import { colors } from '@hanzo/brand';

// The ONE control spec for the whole desktop app (CTO mandate: compact, rounded,
// consistent). Every Button / Input / Select shares this @hanzo/gui size token so
// height and font size are identical across the UI — no bespoke roomy controls.
// size="$2" is the console's proven compact idiom (~28px tall, ~13px label).
export const CONTROL_SIZE = '$2' as const;

// Hanzo v2 semantic radii (@hanzo/brand@1.4.4) — IDENTICAL corner rounding across
// hanzo.app / hanzo.chat / hanzo.desktop. The compact size token defaults radius
// to ~5px, so controls set `rounded={CONTROL_RADIUS}` explicitly to decouple
// height (size) from radius (10). Cards = 8, panels = 12.
export const CONTROL_RADIUS = 10;
export const CARD_RADIUS = 8;
export const PANEL_RADIUS = 12;

// The ONE accent (Hanzo v2, from @hanzo/brand): purple for links / active /
// focus / selection only. Primary actions stay white. No other hue.
export const ACCENT = colors.purple.DEFAULT;
export const ACCENT_SOFT = colors.purple.soft;

// Sidebar width — one source of truth for the shell chrome.
export const SIDEBAR_WIDTH = 232;

// The right-hand controls panel, when open.
export const RIGHT_PANEL_WIDTH = 300;

// WINDOW CHROME — a different spec from CONTROL_SIZE, deliberately.
//
// CONTROL_SIZE (~28px) is for controls the pointer is already inside a form to
// reach. A chrome control is hit by a pointer travelling from anywhere on
// screen, so it gets the pointer-target floor instead: 44px (Apple HIG 44pt,
// WCAG 2.5.5). Every square in the chrome row is THIS square — a row of four
// buttons where one is 40 reads as a mistake, and is one.
export const CHROME_CONTROL = 44;

/** The chrome row itself. 52 leaves a 4px margin around CHROME_CONTROL. */
export const CHROME_ROW = 52;

/** Corner rounding for chrome squares and menu rows. */
export const CHROME_RADIUS = 10;

// ONE focus indicator for the whole chrome: cluster buttons, menu rows, dock
// tabs, the strip's buttons. Every one of them spreads this object into
// `focusVisibleStyle`. A control that omits it does not lose its ring — it
// falls back to the user agent's, which is how a single row of buttons ends up
// painting two different focus indicators.
export const FOCUS_RING = {
  outlineColor: '$outlineColor',
  outlineStyle: 'solid',
  outlineWidth: 2,
  outlineOffset: 2,
} as const;

/**
 * macOS paints the traffic lights OVER the webview — `titleBarStyle: "Overlay"`
 * with `hiddenTitle: true` in `src-tauri/tauri.conf.json`. So whatever the app
 * puts in the window's top-left corner sits UNDERNEATH them, and the corner has
 * to be reserved rather than used.
 *
 * On Windows and Linux the main window keeps its native decorations, which sit
 * ABOVE the webview and take their own space — nothing overlaps, so the reserve
 * is 0 and the chrome starts at the corner.
 *
 * Sniffed off the UA rather than `@tauri-apps/plugin-os`, because this has to
 * be a synchronous constant (it is layout, read during render) and it has to be
 * right in the Vite dev browser too, where there is no Tauri to ask.
 */
export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Width to keep clear at the top-left; height of the strip they occupy. */
export const TRAFFIC_LIGHTS = {
  width: IS_MAC ? 78 : 0,
  height: IS_MAC ? 28 : 0,
};

export type ThemeMode = 'dark' | 'light';
