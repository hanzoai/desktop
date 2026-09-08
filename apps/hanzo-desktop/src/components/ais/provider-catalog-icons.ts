// Inlines the provider SVGs shipped by @hanzo/usage (assets/providers/*.svg)
// as raw markup keyed by provider id (the filename stem). The SVGs mix
// `fill="currentColor"` and white fills, so they are rendered on a chip that
// forces a white foreground — see ProviderCatalogSection in pages/ais.tsx.
const rawSvgModules = import.meta.glob(
  '../../../../../node_modules/@hanzo/usage/assets/providers/*.svg',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

export const providerIconSvgs: Record<string, string> = Object.fromEntries(
  Object.entries(rawSvgModules).map(([path, svg]) => [
    path
      .split('/')
      .pop()!
      .replace(/\.svg$/, ''),
    svg,
  ]),
);
