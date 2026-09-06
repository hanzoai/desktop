/**
 * Canonical IAM OIDC paths (HIP-0111).
 *
 * Byte-for-byte the `OIDC_PATHS` of `@hanzo/iam` (mirrored here rather than
 * pulling the full SDK into the desktop bundle, same as `@hanzo/ai`'s
 * `app/lib/iam-oidc.ts`). There is no `/api/` prefix, and no legacy `/oauth/*`
 * or `/login/oauth/*` — the desktop shipped `/login/oauth/authorize`, which is
 * not an endpoint any brand's IAM serves at the canonical version.
 *
 * These are relative to the brand's `iam.baseUrl`, never to a hardcoded host.
 */
export const IAM_OIDC_PATHS = {
  authorize: '/v1/iam/oauth/authorize',
  token: '/v1/iam/oauth/token',
  userinfo: '/v1/iam/oauth/userinfo',
  jwks: '/v1/iam/.well-known/jwks',
  logout: '/v1/iam/oauth/logout',
} as const;

const trim = (s: string): string => s.replace(/\/+$/, '');

/** Absolute IAM endpoint URL from a brand origin and a path key. */
export function iamUrl(baseUrl: string, key: keyof typeof IAM_OIDC_PATHS): string {
  return `${trim(baseUrl)}${IAM_OIDC_PATHS[key]}`;
}
