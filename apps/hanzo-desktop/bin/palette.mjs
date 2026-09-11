#!/usr/bin/env node
/**
 * THE PALETTE GATE — is every colour on this surface the design system's?
 *
 * The brand is monochrome, and `libs/hanzo-ui/src/styles/styles.css` says so in
 * the one place that can: `--color-brand` is `hsla(0, 0%, 100%)`, the gray ramp
 * is pure neutral, and the cyan, green, amber and red scales are commented out.
 *
 * That intent was not enforceable, which is the whole reason this exists.
 * Tailwind 4's `@import 'tailwindcss'` brings its own theme, and an `@theme`
 * block OVERRIDES tokens rather than replacing the set — so commenting a scale
 * out leaves Tailwind's default in place. Measured in the shipped bundle:
 * `--color-cyan-400:#00d2ef` is defined and `.text-cyan-400{color:var(--color-cyan-400)}`
 * is emitted. The theme said monochrome and the build painted cyan.
 *
 * So this reads the SOURCE and reports every colour a component names for
 * itself. Two kinds, and they are different findings:
 *
 *   chromatic   a hue the brand does not have — cyan, emerald, purple, amber.
 *               Every one is a defect: the mark in the sidebar was drawn
 *               `text-cyan-400`, which is the green H nobody ordered.
 *
 *   literal     a hex, rgb or hsl written into a component — `bg-[#0a0c10]`.
 *               Not a hue question: a value with no name cannot be themed, so
 *               a literal defeats @hanzo/appearance whatever colour it is.
 *
 * Neutral utilities (`text-white/40`, `bg-black`) are NOT reported. They are
 * achromatic, so they cannot break the monochrome intent — but they are not
 * themeable either, so they are counted separately and shown, without failing
 * the gate. Naming them as defects alongside a cyan gradient would bury the
 * finding that matters in four hundred that do not.
 *
 * The gate is a RATCHET, not a threshold: `palette.json` records what was here,
 * and the run fails when a number goes UP. A repo with 466 findings cannot be
 * gated at zero without turning the gate off, and a gate nobody can satisfy is
 * a gate nobody runs.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const BUDGET = join(ROOT, 'bin', 'palette.json');

/** The hues the brand does not have. `gray`, `neutral`, `zinc`, `stone`, `slate`
 *  and `white`/`black` are absent on purpose — those are the ramp. */
const CHROMATIC = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal',
  'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose',
];

/** Where a colour can be named in a utility class. */
const SLOTS = [
  'text', 'bg', 'border', 'from', 'via', 'to', 'ring', 'shadow', 'fill',
  'stroke', 'decoration', 'outline', 'accent', 'caret', 'divide', 'placeholder',
];

const chromatic = new RegExp(
  `\\b(?:${SLOTS.join('|')})-(?:${CHROMATIC.join('|')})-\\d{2,3}\\b`,
  'g',
);
/** A colour value written out: `#0a0c10`, `rgb(…)`, `rgba(…)`, `hsl(…)`. */
const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;
/** Achromatic and unthemeable: counted, never failed. */
const achromatic = new RegExp(
  `\\b(?:${SLOTS.join('|')})-(?:white|black|gray|neutral|zinc|stone|slate)(?:-\\d{2,3})?(?:/\\d{1,3})?\\b`,
  'g',
);

/**
 * The code, with its comments taken out.
 *
 * A colour NAMED IN PROSE is not a colour a component paints. Explaining that
 * `--color-brand` is `hsla(0, 0%, 100%)` is exactly the note a reader of this
 * palette wants, and counting it as a defect makes the gate argue against
 * documenting the thing it is enforcing — which it did, on its own first run,
 * against a comment written to explain a conversion.
 *
 * `//` is only a comment when it is not the `//` in a url, so a `:` before it
 * disqualifies it.
 */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(path);
  }
  return out;
}

const found = { chromatic: {}, literal: {}, achromatic: {} };
const hues = {};

for (const path of sources(SRC)) {
  const name = relative(ROOT, path);
  const text = code(readFileSync(path, 'utf8'));
  for (const [kind, pattern] of [
    ['chromatic', chromatic],
    ['literal', literal],
    ['achromatic', achromatic],
  ]) {
    const hits = text.match(pattern);
    if (!hits) continue;
    found[kind][name] = hits.length;
    if (kind === 'chromatic') {
      for (const hit of hits) {
        const hue = CHROMATIC.find((h) => hit.includes(`-${h}-`));
        if (hue) hues[hue] = (hues[hue] ?? 0) + 1;
      }
    }
  }
}

const total = (kind) => Object.values(found[kind]).reduce((a, b) => a + b, 0);
const now = {
  chromatic: total('chromatic'),
  literal: total('literal'),
  achromatic: total('achromatic'),
};

const write = process.argv.includes('--write');
const was = existsSync(BUDGET) ? JSON.parse(readFileSync(BUDGET, 'utf8')) : null;

console.log('PALETTE — every colour on this surface, and where it came from\n');
for (const kind of ['chromatic', 'literal']) {
  const worst = Object.entries(found[kind]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const before = was?.[kind];
  const move = before === undefined ? '' : now[kind] === before ? ' (unchanged)'
    : now[kind] < before ? ` (was ${before}, −${before - now[kind]})`
    : ` (was ${before}, +${now[kind] - before})`;
  console.log(`${kind.padEnd(11)} ${String(now[kind]).padStart(4)}${move}`);
  for (const [file, count] of worst) console.log(`            ${String(count).padStart(4)}  ${file}`);
  console.log();
}
console.log(`achromatic  ${String(now.achromatic).padStart(4)}  — neutral, so it cannot break the brand; unthemeable, so it is not the answer either`);
console.log(`\nby hue      ${Object.entries(hues).sort((a, b) => b[1] - a[1]).map(([h, n]) => `${h} ${n}`).join('  ')}`);

if (write) {
  writeFileSync(BUDGET, JSON.stringify(now, null, 2) + '\n');
  console.log(`\nrecorded ${relative(ROOT, BUDGET)}`);
  process.exit(0);
}

if (!was) {
  console.log('\nno budget recorded — run with --write to set the ratchet');
  process.exit(0);
}

const risen = ['chromatic', 'literal'].filter((k) => now[k] > was[k]);
if (risen.length) {
  console.log(`\nFAIL — ${risen.map((k) => `${k} rose to ${now[k]} from ${was[k]}`).join('; ')}`);
  console.log('A colour written into a component cannot be themed. Name a token instead:');
  console.log('  text-text-default  text-text-secondary  text-brand');
  console.log('  bg-bg-default  bg-bg-secondary  bg-bg-tertiary');
  console.log('  border-divider  border-border  border-border-input');
  process.exit(1);
}
const fell = ['chromatic', 'literal'].filter((k) => now[k] < was[k]);
console.log(fell.length ? '\nPASS — and it fell. Run with --write to lower the ratchet.' : '\nPASS');
