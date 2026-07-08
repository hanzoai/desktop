// Per-app binding — THE ONLY file that differs between brand apps. Points the
// shared fixture + flows at this app's built dist and brand metadata.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { makeApp } from './app-fixture';

const here = dirname(fileURLToPath(import.meta.url));
const distPath = resolve(here, '../../../dist'); // apps/hanzo-desktop/dist

export const appTest = makeApp({
  distPath,
  brand: 'Hanzo',
  engineLabel: 'Hanzo Engine',
  titleRe: /Hanzo/i,
  foreign: [], // Hanzo is the upstream brand — no foreign-brand constraint
});
