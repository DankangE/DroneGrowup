// npm run check:board -- keys|timed [390x844]
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPS } from '../src/life/world.ts';
import { MODEL_SECONDS, SEASONS, SIZES } from './life-check-data.mjs';
import { browserDriver, mapFixture, playSeasons, readState, withLifeBrowser } from './life-ui-driver.mjs';

export function timingLine(map, size, times) {
  assert.ok(Object.hasOwn(MAPS, map), 'known map');
  assert.equal(times.length, SEASONS, 'exactly twelve completed seasons per map');
  assert.ok(times.every(seconds => Number.isFinite(seconds) && seconds > 0), 'positive finite measurements');
  const total = times.reduce((sum, seconds) => sum + seconds, 0), average = total / SEASONS;
  return `timed ${map} ${MAPS[map].name} ${size}: ${SEASONS} seasons, ${total.toFixed(2)} s, `
    + `${average.toFixed(2)} s/season; model ${MODEL_SECONDS.toFixed(1)}, delta ${(average - MODEL_SECONDS).toFixed(2)} s/season`;
}

export function argumentsFor(args) {
  const [mode = 'keys', size = '390x844'] = args;
  assert.ok(['keys', 'timed'].includes(mode) && args.length <= 2, 'usage: board-life-check.mjs keys|timed [WIDTHxHEIGHT]');
  assert.match(size, /^\d+x\d+$/, 'viewport must be WIDTHxHEIGHT');
  const viewport = size.split('x').map(Number);
  assert.ok(viewport.every(value => Number.isSafeInteger(value) && value > 0), 'positive viewport dimensions');
  return { mode, viewport };
}

export async function main(args = process.argv.slice(2)) {
  const { mode, viewport } = argumentsFor(args);
  await withLifeBrowser(async open => {
    if (mode === 'keys') {
      for (const size of SIZES) {
        const page = await open(size);
        try {
          const run = await playSeasons(browserDriver(page, { keyboard: true }));
          console.log(`board:life keys ${size.join('x')}: ${run.seasonTimes.length} seasons, ${run.choices} choices; mouse fallbacks 0`);
        } finally { await page.context().close(); }
      }
    } else {
      for (const map of Object.keys(MAPS)) {
        const page = await open(viewport, 11, 'no-preference');
        try {
          const fixture = mapFixture(map);
          await page.evaluate(state => window.__life.load(state), fixture);
          assert.deepEqual(await readState(page), fixture, 'map fixture loaded once before timing');
          const run = await playSeasons(browserDriver(page, { timed: true, auditPages: false }), { stayMap: map });
          console.log(timingLine(map, viewport.join('x'), run.seasonTimes));
          console.log(`  per season: ${run.seasonTimes.map(seconds => seconds.toFixed(2)).join(' ')}`);
        } finally { await page.context().close(); }
      }
    }
  });
  console.log(`board:life ${mode} OK`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
