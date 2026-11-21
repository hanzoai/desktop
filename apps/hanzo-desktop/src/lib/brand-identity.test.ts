/**
 * The bundle identifier is ONE value per brand, and it is load-bearing.
 *
 * `secure_storage.rs` derives the OS-keychain service name from the RUNNING
 * bundle's `app.config().identifier`. So if `tauri.conf.json` and
 * `tauri.conf.<brand>.json` disagree, two builds of the SAME brand file their
 * secrets under different keychain services and a user's saved tokens vanish
 * when they switch build variants. That is exactly what happened while the
 * default config said `ai.hanzo.desktop` and everything else said
 * `ai.hanzo.desktop`.
 *
 * These assertions pin the identifier and the deep-link scheme to
 * `libs/brand-config` — the one brand table — and keep the identifier out of
 * the macOS Info.plist, so the next drift fails here instead of in a person's
 * data folder.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { getBrandFromHostname } from '@hanzo/desktop-brand-config';

const TAURI_DIR = join(__dirname, '..', '..', 'src-tauri');

const readConf = (name: string) =>
  JSON.parse(readFileSync(join(TAURI_DIR, name), 'utf8')) as Record<
    string,
    unknown
  >;

const base = readConf('tauri.conf.json');

// A brand's canonical host resolves its row in the brand table; using the
// public resolver (rather than re-exporting the constants) keeps this test
// honest about what the app itself would pick.
const BRAND_HOST = {
  hanzo: 'hanzo.ai',
  zoo: 'zoo.ngo',
  lux: 'lux.network',
} as const;

const brands = Object.entries(BRAND_HOST) as [
  keyof typeof BRAND_HOST,
  string,
][];

const schemesOf = (conf: Record<string, unknown>): string[] | undefined => {
  const plugins = conf.plugins as {
    'deep-link'?: { desktop?: { schemes?: string[] } };
  };
  return plugins?.['deep-link']?.desktop?.schemes;
};

describe('brand identity', () => {
  it.each(brands)(
    '%s: tauri identifier matches the brand table',
    (brand, host) => {
      const overlay = readConf(`tauri.conf.${brand}.json`);
      expect(overlay.identifier).toBe(getBrandFromHostname(host).identifier);
    },
  );

  it.each(brands)(
    '%s: tauri productName matches the brand table',
    (brand, host) => {
      // Drives the .app name, the log file name (see commands/logs.rs) and the
      // notification title (`getBrand().productName`) — one value, or the app
      // announces itself under two names.
      const overlay = readConf(`tauri.conf.${brand}.json`);
      expect(overlay.productName).toBe(getBrandFromHostname(host).productName);
    },
  );

  it.each(brands)(
    '%s: deep-link scheme matches the IAM redirect URI',
    (brand, host) => {
      const overlay = readConf(`tauri.conf.${brand}.json`);
      // `brand-build.cjs` merges the overlay over the base, so an overlay that
      // omits the scheme inherits the base one.
      const [scheme] = schemesOf(overlay) ?? schemesOf(base) ?? [];
      const { redirectUri } = getBrandFromHostname(host).iam;
      // Hanzo's callback is the loopback listener (src-tauri/src/loopback.rs, a port per sign-in):
      // `hanzo://` is also claimed by Hanzo Dev, so the browser could open it.
      expect(redirectUri).toBe(
        brand === 'hanzo'
          ? 'http://127.0.0.1/callback'
          : `${scheme}://oauth/${brand}`,
      );
    },
  );

  it('the default build is the hanzo build', () => {
    // Plain `tauri dev` / `tauri build` use the base config with no overlay.
    // It must therefore carry hanzo's identity, or the unbranded binary gets a
    // keychain, log file and .app name of its own.
    const hanzo = readConf('tauri.conf.hanzo.json');
    expect(base.identifier).toBe(hanzo.identifier);
    expect(base.productName).toBe(hanzo.productName);
    expect(base.mainBinaryName).toBe(hanzo.mainBinaryName);
  });

  it('Info.plist carries no CFBundleIdentifier, so the config is the one source', () => {
    // tauri-bundler writes CFBundleIdentifier from the config, then merges
    // Info.plist OVER that plist key by key (bundle/macos/app.rs). An identifier
    // here replaces the config's wherever nothing patches it: the .local and
    // .dev builds and plain `tauri dev` were all ai.hanzo.desktop to macOS.
    const plist = readFileSync(join(TAURI_DIR, 'Info.plist'), 'utf8');
    expect(plist).not.toMatch(/<key>CFBundleIdentifier<\/key>/);
  });

  it.each(['development', 'local'] as const)(
    '%s variant namespaces under the hanzo identifier',
    (variant) => {
      // Side-by-side installs need their OWN identifier (and therefore their
      // own keychain + app data), but they must stay in hanzo's namespace.
      const conf = readConf(`tauri.conf.${variant}.json`);
      expect(conf.identifier).toBe(
        `${base.identifier}.${variant === 'development' ? 'dev' : 'local'}`,
      );
    },
  );
});
