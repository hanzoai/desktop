// Playwright's takes -> the two masters the web hero consumes.
//
// Playwright writes VP8 webm, which Safari does not play and `@hanzo/frame`
// does not ask for. This is the one conversion step, kept out of the spec so a
// take can be re-encoded without re-recording it.
//
//     pnpm film && pnpm film:masters
//
// This directory is scratch and stays gitignored. The take you CHOOSE gets
// copied to `assets/hero.mp4` (+ `-portrait`) and committed — at ~190 KB for a
// mostly-static dark UI that is cheap, and it keeps the README's demo pinned to
// the same commit as the app it shows. Re-encode rather than re-download: the
// videos this replaced were 6 MB each and somebody else's.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TAKES = path.join(HERE, '.film');
const OUT = path.join(HERE, '.film', 'masters');

/** The take a project recorded: one webm, somewhere under the output dir. */
const takeFor = (project) => {
  const hit = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.webm') && p.includes(project)) hit.push(p);
    }
  };
  if (fs.existsSync(TAKES)) walk(TAKES);
  // Newest wins: re-running `pnpm film` leaves the previous take on disk.
  return hit.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
};

/**
 * The first ffmpeg on PATH that actually RUNS on this machine.
 *
 * Not paranoia: this box had an x86-64 ffmpeg parked in ~/.local/bin ahead of
 * the working arm64 one. `execvp` gets ENOEXEC on it and hands the ELF to
 * /bin/sh, which reports a SYNTAX ERROR — so the failure names a shell and a
 * paren and says nothing about architecture. An interactive shell hides it by
 * caching the good path, so it reproduces only from a script.
 */
const ffmpeg = (() => {
  const seen = new Set();
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const cand = path.join(dir, 'ffmpeg');
    if (!dir || seen.has(cand)) continue;
    seen.add(cand);
    try {
      execFileSync(cand, ['-version'], { stdio: 'ignore' });
      return cand;
    } catch {
      /* wrong arch, not executable, or absent — keep walking */
    }
  }
  console.error('  no runnable ffmpeg on PATH');
  process.exit(1);
})();

const encode = (src, dest, w, h) => {
  // -an: a hero film is muted by policy — it autoplays, and an autoplaying
  // sound is a reason to close the tab. faststart puts the moov atom first so
  // it starts on the first bytes instead of the last.
  execFileSync(ffmpeg, [
    '-y', '-loglevel', 'error', '-i', src,
    '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', dest,
  ], { stdio: 'inherit' });
};

fs.mkdirSync(OUT, { recursive: true });
let wrote = 0;
for (const [project, name, w, h] of [
  ['film-landscape', 'hero.mp4', 1920, 1080],
  ['film-portrait', 'hero-portrait.mp4', 1080, 1920],
]) {
  const take = takeFor(project);
  if (!take) {
    console.error(`  ${project}: no take on disk — run \`pnpm film\` first`);
    continue;
  }
  const dest = path.join(OUT, name);
  encode(take, dest, w, h);
  console.log(`  ${name}  ${(fs.statSync(dest).size / 1e6).toFixed(1)} MB  <- ${path.basename(take)}`);
  wrote++;
}
// Two masters or none: `@hanzo/frame` picks by orientation, so shipping one
// leaves every caller on the other orientation showing the middle of a crop.
if (wrote !== 2) process.exit(1);
