/**
 * Brand-keyed logo assets.
 *
 * Two access modes:
 *   1. `getLogoDataUrl(brand)` — base64 PNG inline. Works anywhere (HTML email,
 *      `<img src>`, CSS `url()`) without a bundler.
 *   2. `getLogoAssetPath(brand)` — relative path under `libs/hanzo-logo/assets/<brand>/`
 *      that vite/tauri can resolve via the workspace, for callers that prefer
 *      streaming the SVG.
 *
 * Adding a new brand: drop assets under `assets/<brand>/`, add an entry to
 * the maps below, and update the `BrandKey` type.
 */
import { zooLogoDataUrl } from '../assets/zoo/zoo-logo-data-url';

export type BrandKey = 'hanzo' | 'zoo';

const DATA_URLS: Record<BrandKey, string> = {
  // Hanzo currently reuses the zoo data URL until the design drops a hanzo PNG.
  // Replace with a hanzo-specific data URL when ready — call sites do not change.
  hanzo: zooLogoDataUrl,
  zoo: zooLogoDataUrl,
};

const ASSET_PATHS: Record<BrandKey, { logo: string; icon: string }> = {
  hanzo: {
    logo: 'assets/hanzo/hanzo-logo.svg',
    icon: 'assets/hanzo/hanzo-icon.svg',
  },
  zoo: {
    logo: 'assets/zoo/zoo-logo.svg',
    icon: 'assets/zoo/zoo-icon.svg',
  },
};

export function getLogoDataUrl(brand: BrandKey): string {
  return DATA_URLS[brand];
}

export function getLogoAssetPath(brand: BrandKey): { logo: string; icon: string } {
  return ASSET_PATHS[brand];
}

export { zooLogoDataUrl };
