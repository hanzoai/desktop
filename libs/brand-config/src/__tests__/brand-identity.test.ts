import { describe, expect, it } from 'vitest';
import {
  getBrand,
  getBrandFromHostname,
  isMachinesEnabled,
  type Brand,
} from '../index';

describe('@hanzo/desktop-brand-config', () => {
  const cases: Array<[Brand, string, string, number]> = [
    ['hanzo', 'hanzo.ai', 'ai.hanzo.desktop', 36963],
    ['zoo', 'zoo.ngo', 'com.zoo.desktop', 200200],
    ['lux', 'lux.network', 'com.lux.desktop', 96369],
  ];

  it.each(cases)(
    'resolves canonical brand %s from hostname %s',
    (expectedBrand, host, expectedId, expectedChainId) => {
      const cfg = getBrandFromHostname(host);
      expect(cfg.brand).toBe(expectedBrand);
      expect(cfg.identifier).toBe(expectedId);
      expect(cfg.network.chainId).toBe(expectedChainId);
      expect(cfg.iam.clientId).toBe(`${expectedBrand}-app`);
    },
  );

  it('matches subdomains case-insensitively and falls back to hanzo for unknown hosts', () => {
    expect(getBrandFromHostname('APP.ZOO.CLOUD').brand).toBe('zoo');
    expect(getBrandFromHostname('console.lux.ai').brand).toBe('lux');
    expect(getBrandFromHostname('localhost').brand).toBe('hanzo');
    expect(getBrandFromHostname('example.org').brand).toBe('hanzo');
  });

  it('uses public OAuth PKCE clients with loopback or brand deep-link redirects', () => {
    expect(getBrandFromHostname('hanzo.ai').iam.redirectUri).toBe(
      'http://127.0.0.1/callback',
    );
    expect(getBrandFromHostname('zoo.ngo').iam.redirectUri).toBe(
      'zoo://oauth/zoo',
    );
    expect(getBrandFromHostname('lux.network').iam.redirectUri).toBe(
      'lux://oauth/lux',
    );
  });

  it('enables machine capabilities for built-in brands and returns a default brand', () => {
    const current = getBrand();
    expect(['hanzo', 'zoo', 'lux']).toContain(current.brand);
    expect(isMachinesEnabled(current)).toBe(true);
  });
});
