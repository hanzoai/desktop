/** @type {import('tailwindcss').Config} */
const tailwindAnimate = require('tailwindcss-animate');

module.exports = {
  content: [],
  darkMode: ['class'],
  theme: {
    extend: {
      // TIGHT app-first type scale — the compact developer-app register
      // (linear.app / vercel / Codex-desktop look) that Hanzo aligns on across
      // chat / app / desktop. Mirrors @hanzo/design tokens/typography.css and
      // @hanzo/brand: base 14px, sm 13px, xs 11px, display sizes tightened.
      fontSize: {
        xs: ['0.6875rem', { lineHeight: '1rem' }], // 11px
        sm: ['0.8125rem', { lineHeight: '1.15rem' }], // 13px
        base: ['0.875rem', { lineHeight: '1.35rem' }], // 14px (was 16px)
        lg: ['0.9375rem', { lineHeight: '1.4rem' }], // 15px
        xl: ['1.0625rem', { lineHeight: '1.55rem' }], // 17px
        '2xl': ['1.3125rem', { lineHeight: '1.7rem' }], // 21px
        '3xl': ['1.625rem', { lineHeight: '1.95rem' }], // 26px
        '4xl': ['2rem', { lineHeight: '2.25rem' }], // 32px
        '5xl': ['2.5rem', { lineHeight: '1.05' }], // 40px
        '6xl': ['3.25rem', { lineHeight: '1' }], // 52px
        '7xl': ['4rem', { lineHeight: '1' }], // 64px
      },
    },
  },
  plugins: [tailwindAnimate],
};
