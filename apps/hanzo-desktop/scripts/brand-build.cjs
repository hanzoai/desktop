#!/usr/bin/env node
// Build a brand-variant Tauri bundle by deep-merging the brand overlay into
// tauri.conf.json before invoking `tauri build`. Tauri 2.x's `-c <file>` flag
// merges the runtime config but does NOT propagate compile-time fields like
// `identifier` into `tauri::generate_context!()` — so we swap the base config
// for the duration of the build, then restore it.
//
// Usage: node ./scripts/brand-build.cjs <hanzo|zoo>
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const brand = process.argv[2];
if (!brand || (brand !== 'hanzo' && brand !== 'zoo')) {
  console.error('usage: brand-build.cjs <hanzo|zoo>');
  process.exit(2);
}

const tauriDir = path.join(__dirname, '..', 'src-tauri');
const baseConfigPath = path.join(tauriDir, 'tauri.conf.json');
const overlayPath = path.join(tauriDir, `tauri.conf.${brand}.json`);
const backupPath = path.join(tauriDir, `tauri.conf.json.brand-build-backup`);
const infoPlistPath = path.join(tauriDir, 'Info.plist');
const infoPlistBackupPath = path.join(tauriDir, 'Info.plist.brand-build-backup');

// Deep-merge with per-position recursion for arrays. Overlay extending past
// base length is appended; base entries past overlay length are preserved.
// This matters for app.windows[] where the overlay typically only patches
// the first window's title and must not erase the others.
const deepMerge = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) {
    const out = [];
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) out.push(deepMerge(a[i], b[i]));
    return out;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out = { ...a };
    for (const k of Object.keys(b)) out[k] = deepMerge(a[k], b[k]);
    return out;
  }
  return b === undefined ? a : b;
};

const base = JSON.parse(fs.readFileSync(baseConfigPath, 'utf8'));
const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
const merged = deepMerge(base, overlay);

fs.copyFileSync(baseConfigPath, backupPath);
fs.writeFileSync(baseConfigPath, JSON.stringify(merged, null, 2) + '\n');

// Info.plist override: tauri-bundler merges this *over* the generated plist,
// so any keys here win regardless of tauri.conf.json. Patch CFBundleIdentifier
// to match the merged identifier so the bundle's identity is consistent.
let infoPlistPatched = false;
if (fs.existsSync(infoPlistPath) && merged.identifier) {
  const original = fs.readFileSync(infoPlistPath, 'utf8');
  const patched = original.replace(
    /(<key>CFBundleIdentifier<\/key>\s*<string>)[^<]*(<\/string>)/,
    `$1${merged.identifier}$2`,
  );
  if (patched !== original) {
    fs.copyFileSync(infoPlistPath, infoPlistBackupPath);
    fs.writeFileSync(infoPlistPath, patched);
    infoPlistPatched = true;
  }
}

const restore = () => {
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, baseConfigPath);
    fs.unlinkSync(backupPath);
  }
  if (infoPlistPatched && fs.existsSync(infoPlistBackupPath)) {
    fs.copyFileSync(infoPlistBackupPath, infoPlistPath);
    fs.unlinkSync(infoPlistBackupPath);
  }
};
process.on('SIGINT', () => { restore(); process.exit(130); });
process.on('SIGTERM', () => { restore(); process.exit(143); });

const env = { ...process.env, VITE_BRAND: brand, BRAND: brand };
const result = spawnSync('tauri', ['build'], { stdio: 'inherit', env });

restore();
process.exit(result.status ?? 1);
