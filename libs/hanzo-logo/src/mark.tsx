/**
 * THE brand mark. One component, three canonical glyphs, keyed by brand.
 *
 * Why this is not `<BrandMark/>` from `@hanzo/ui/product`: that component
 * white-labels only the wordmark TEXT — its glyph is always `HanzoMark`. Painting
 * the Hanzo block-H on a Zoo or Lux build is exactly the white-label violation
 * this repo must never ship, so the glyph itself has to be brand-keyed.
 *
 * Geometry is the canonical mark of each org, byte-identical to the assets in
 * `../assets/<brand>/<brand>-icon.svg` (hanzo: the block-H; zoo: the three
 * intersecting rings clipped to a circle, from `zoo/logo`; lux: the triangle,
 * from `lux/logo` `svg/lux-icon-white.svg`). Everything draws in `currentColor`
 * so one mark works on both themes and inherits the surrounding text color —
 * the shipped SVG assets hardcode white/brand fills and cannot.
 */
import type { SVGProps } from 'react';

export type BrandKey = 'hanzo' | 'zoo' | 'lux';

const LABEL: Record<BrandKey, string> = {
  hanzo: 'Hanzo',
  zoo: 'Zoo',
  lux: 'Lux',
};

const VIEW_BOX: Record<BrandKey, string> = {
  hanzo: '0 0 67 67',
  zoo: '0 0 1024 1024',
  lux: '0 0 100 100',
};

const GLYPH: Record<BrandKey, SVGProps<SVGSVGElement>['children']> = {
  hanzo: (
    <>
      <path d="M22.21 67V44.6369H0V67H22.21Z" fill="currentColor" />
      <path d="M0 44.6369L22.21 46.8285V44.6369H0Z" fill="currentColor" opacity="0.8" />
      <path
        d="M66.7038 22.3184H22.2534L0.0878906 44.6367H44.4634L66.7038 22.3184Z"
        fill="currentColor"
      />
      <path d="M22.21 0H0V22.3184H22.21V0Z" fill="currentColor" />
      <path d="M66.7198 0H44.5098V22.3184H66.7198V0Z" fill="currentColor" />
      <path
        d="M66.6753 22.3185L44.5098 20.0822V22.3185H66.6753Z"
        fill="currentColor"
        opacity="0.8"
      />
      <path d="M66.7198 67V44.6369H44.5098V67H66.7198Z" fill="currentColor" />
    </>
  ),
  zoo: (
    <>
      <defs>
        <clipPath id="brand-mark-zoo-clip">
          <circle cx="508" cy="510" r="283" />
        </clipPath>
      </defs>
      <g clipPath="url(#brand-mark-zoo-clip)" stroke="currentColor" fill="none">
        <circle cx="513" cy="369" r="234" strokeWidth="33" />
        <circle cx="365" cy="595" r="234" strokeWidth="33" />
        <circle cx="643" cy="595" r="234" strokeWidth="33" />
        <circle cx="508" cy="510" r="265" strokeWidth="36" />
      </g>
    </>
  ),
  lux: <path d="M50 85 L15 25 L85 25 Z" fill="currentColor" />,
};

/**
 * `data-brand` is the machine-readable assertion point: a headless test reads it
 * to prove which mark a build actually painted, without pixel diffing.
 */
export function BrandMark({
  brand,
  size = 20,
  className,
}: {
  brand: BrandKey;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-label={LABEL[brand]}
      className={className}
      data-brand={brand}
      height={size}
      role="img"
      viewBox={VIEW_BOX[brand]}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {GLYPH[brand]}
    </svg>
  );
}
