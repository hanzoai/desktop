/**
 * Brand-keyed logo assets.
 *
 * `BrandMark` (./mark) is the one renderable mark — a brand-keyed inline SVG in
 * `currentColor`. `getLogoAssetPath(brand)` returns the relative path under
 * `libs/hanzo-logo/assets/<brand>/` for callers that want the shipped file
 * (favicon, bundle icon) rather than a React node.
 *
 * Adding a brand: drop assets under `assets/<brand>/`, add the glyph to `./mark`,
 * add an entry to `ASSET_PATHS`, and widen `BrandKey`.
 *
 * There is deliberately no brand-keyed data-URL accessor. The one that used to
 * live here returned the *Zoo* PNG for `hanzo` — a white-label violation waiting
 * for its first caller. Brand assets are never aliased to another brand's.
 */
import type { BrandKey } from './mark';

export { BrandMark, type BrandKey } from './mark';
export { zooLogoDataUrl } from '../assets/zoo/zoo-logo-data-url';

const ASSET_PATHS: Record<BrandKey, { logo: string; icon: string }> = {
  hanzo: {
    logo: 'assets/hanzo/hanzo-logo.svg',
    icon: 'assets/hanzo/hanzo-icon.svg',
  },
  zoo: {
    logo: 'assets/zoo/zoo-logo.svg',
    icon: 'assets/zoo/zoo-icon.svg',
  },
  lux: {
    logo: 'assets/lux/lux-logo.svg',
    icon: 'assets/lux/lux-icon.svg',
  },
};

export function getLogoAssetPath(brand: BrandKey): { logo: string; icon: string } {
  return ASSET_PATHS[brand];
}
