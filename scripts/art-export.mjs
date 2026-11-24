// Turns raw generations into the web files under public/art and the archive copies under docs/art-raw.
// Usage: node scripts/art-export.mjs <dir with raw PNGs> [name ...]
//   scene-<id>.png      -> public/art/scene-<id>.webp (1344x896, under 300 KB)
//   sheet-<name>.png    -> four public/art/<portrait>.webp (384x384, under 60 KB), one per quadrant (see SHEETS)
//   portrait-*.png / ending-*.png (single 1:1 image) -> public/art/<same name>.webp
// Needs `cwebp` (brew install webp). See docs/art-pipeline.md.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const art = join(root, 'public/art');
const raw = join(root, 'docs/art-raw');

/** Quadrant order: top-left, top-right, bottom-left, bottom-right. */
export const SHEETS = {
  'sheet-speakers1': ['portrait-mechanic', 'portrait-professor', 'portrait-broker', 'portrait-client'],
  'sheet-speakers2': ['portrait-banker', 'portrait-manager', 'portrait-engineer', 'portrait-trainee'],
  'sheet-speakers3': ['portrait-inspector', 'portrait-anchor', 'portrait-friend', 'portrait-investor'],
  'sheet-endings1': ['ending-ceo', 'ending-chairman', 'ending-academy', 'ending-solo'],
  'sheet-endings2': ['ending-debtor', 'ending-smallbiz', 'ending-director', 'ending-instructor'],
  'sheet-endings3': ['ending-employee', 'ending-pilot', 'ending-student', 'portrait-examiner'],
};

const cwebp = (args) => execFileSync('cwebp', ['-quiet', ...args]);
const size = (file) => statSync(file).size;
function pngSize(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  return [Number(/pixelWidth: (\d+)/.exec(out)[1]), Number(/pixelHeight: (\d+)/.exec(out)[1])];
}

/** Steps the quality down until the file fits the budget. */
function fit(source, target, limit, startQ, extra) {
  for (let q = startQ; q >= 50; q -= 5) {
    cwebp(['-q', String(q), ...extra, source, '-o', target]);
    if (size(target) <= limit) return q;
  }
  throw new Error(`${target} does not fit ${limit} bytes`);
}

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/art-export.mjs <dir with raw PNGs> [name ...]');
const only = process.argv.slice(3);
mkdirSync(art, { recursive: true });
mkdirSync(raw, { recursive: true });

for (const png of readdirSync(dir).filter((f) => f.endsWith('.png')).sort()) {
  const name = basename(png, '.png');
  if (only.length && !only.includes(name)) continue;
  const source = join(dir, png);
  // The archive copy keeps the full resolution; near-lossless WebP instead of PNG keeps the repo small.
  const archive = join(raw, `${name}.webp`);
  cwebp(['-q', '95', source, '-o', archive]);
  if (name.startsWith('scene-')) {
    const target = join(art, `${name}.webp`);
    const q = fit(source, target, 300_000, 80, ['-resize', '1344', '896']);
    console.log(`${name}.webp q${q} ${Math.round(size(target) / 1024)} KB`);
  } else if (SHEETS[name]) {
    const [w, h] = pngSize(source);
    const half = Math.floor(Math.min(w, h) / 2);
    // A few pixels are trimmed off every side so a neighbour's background never shows at an edge.
    const trim = 6;
    SHEETS[name].forEach((portrait, i) => {
      const x = (i % 2) * half + trim;
      const y = Math.floor(i / 2) * half + trim;
      const target = join(art, `${portrait}.webp`);
      const q = fit(source, target, 60_000, 84, ['-crop', String(x), String(y), String(half - trim * 2), String(half - trim * 2), '-resize', '384', '384']);
      console.log(`${portrait}.webp q${q} ${Math.round(size(target) / 1024)} KB (from ${name})`);
    });
  } else if (name.startsWith('portrait-') || name.startsWith('ending-')) {
    const target = join(art, `${name}.webp`);
    const q = fit(source, target, 60_000, 84, ['-resize', '384', '384']);
    console.log(`${name}.webp q${q} ${Math.round(size(target) / 1024)} KB`);
  } else if (existsSync(source)) {
    console.log(`skipped ${png} (unknown family)`);
  }
}
