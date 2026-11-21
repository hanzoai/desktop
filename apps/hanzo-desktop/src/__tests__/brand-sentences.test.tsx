import { describe, expect, it, vi } from 'vitest';

// A VITE_BRAND=zoo build: the brand table answers Zoo.
vi.mock('@hanzo/desktop-brand-config', async (actual) => {
  const real = await actual<typeof import('@hanzo/desktop-brand-config')>();
  return { ...real, getBrand: () => real.getBrandFromHostname('zoo.ngo') };
});

import { localModelsStatus } from '../desktop-shortcuts';

describe('the Local AI sentences under another brand', () => {
  it("name the brand's cloud, and keep the engine Hanzo's", () => {
    expect(localModelsStatus(1, 'Zen Nano', true, true).detail).toBe(
      'The Hanzo engine is running Zen Nano. You are signed in, so chat uses Zoo’s cloud models.',
    );
  });
});
