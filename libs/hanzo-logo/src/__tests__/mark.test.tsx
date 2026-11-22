import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark, getLogoAssetPath } from '../index';

describe('@hanzo/desktop-logo', () => {
  it.each([
    ['hanzo', 'Hanzo'],
    ['zoo', 'Zoo'],
    ['lux', 'Lux'],
  ] as const)('renders %s BrandMark with accessible role and data-brand attribute', (brand, label) => {
    render(<BrandMark brand={brand} size={28} />);
    const img = screen.getByRole('img', { name: label });
    expect(img.getAttribute('data-brand')).toBe(brand);
    expect(img.getAttribute('width')).toBe('28');
    expect(img.getAttribute('height')).toBe('28');
  });

  it('returns distinct SVG asset paths per brand', () => {
    expect(getLogoAssetPath('hanzo').icon).toContain('hanzo-icon.svg');
    expect(getLogoAssetPath('zoo').icon).toContain('zoo-icon.svg');
    expect(getLogoAssetPath('lux').icon).toContain('lux-icon.svg');
  });
});
