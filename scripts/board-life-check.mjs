// npm run check:board -- keys|timed [390x844]
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAPS } from '../src/life/world.ts';
import { MODEL_SECONDS, SEASONS, SIZES } from './life-check-data.mjs';
import { TIMING_FINGERPRINT, TIMING_REPORT, calibration } from './life-time-calibration.ts';
import { TIMING_SAMPLE } from './life-time-data.ts';
import { LIFE_RULES } from '../src/life/life-data.ts';
import { browserDriver, mapFixture, playSeasons, readState, withLifeBrowser } from './life-ui-driver.mjs';
import { audit, toggleTilt } from './layout-check-life.mjs';

export function timingLine(map, size, times) {
  assert.ok(Object.hasOwn(MAPS, map), 'known map');
  assert.equal(times.length, SEASONS, 'exactly twelve completed seasons per map');
  assert.ok(times.every(seconds => Number.isFinite(seconds) && seconds > 0), 'positive finite measurements');
  const total = times.reduce((sum, seconds) => sum + seconds, 0), average = total / SEASONS;
  return `timed ${map} ${MAPS[map].name} ${size}: ${SEASONS} seasons, ${total.toFixed(2)} s, `
    + `${average.toFixed(2)} s/season; model ${MODEL_SECONDS === null ? 'uncalibrated' : MODEL_SECONDS.toFixed(2)}`
    + (MODEL_SECONDS === null ? '' : `, delta ${(average - MODEL_SECONDS).toFixed(2)} s/season`);
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
  const samples = [];
  await withLifeBrowser(async open => {
    if (mode === 'keys') {
      for (const size of SIZES) {
        const page = await open(size);
        try {
          const run = await playSeasons(browserDriver(page, { keyboard: true }));
          console.log(`board:life keys ${size.join('x')}: ${run.seasonTimes.length} seasons, ${run.choices} choices; mouse fallbacks 0`);
          await toggleTilt(page, async name => assert.deepEqual(await page.evaluate(audit), [], name), true);
          const tilted = await playSeasons(browserDriver(page, { keyboard: true }));
          console.log(`board:life keys tilt ${size.join('x')}: ${tilted.seasonTimes.length} seasons, ${tilted.choices} choices; mouse fallbacks 0`);
        } finally { await page.context().close(); }
      }
    } else {
      for (const map of Object.keys(MAPS)) {
        const page = await open(viewport, TIMING_SAMPLE.seed, 'no-preference');
        try {
          const fixture = mapFixture(map);
          await page.evaluate(state => window.__life.load(state), fixture);
          assert.deepEqual(await readState(page), fixture, 'map fixture loaded once before timing');
          const run = await playSeasons(browserDriver(page, { timed: true, auditPages: false }), { stayMap: map });
          console.log(timingLine(map, viewport.join('x'), run.seasonTimes));
          console.log(`  per season: ${run.seasonTimes.map(seconds => seconds.toFixed(2)).join(' ')}`);
          console.log(`  pure model: ${run.modeledTimes.map(seconds => seconds.toFixed(2)).join(' ')}`);
          samples.push({ map, measured: run.seasonTimes, modeled: run.modeledTimes });
        } finally { await page.context().close(); }
      }
    }
  });
  if (mode === 'timed') {
    const measurement = { fingerprint: TIMING_FINGERPRINT, measuredAt: new Date().toISOString(),
      viewport: viewport.join('x'), seed: TIMING_SAMPLE.seed, samples };
    const result = calibration(measurement);
    if (result.factor !== null) {
      writeFileSync(TIMING_REPORT, JSON.stringify(measurement, null, 2) + '\n');
      const minutes = result.secondsPerSeason * LIFE_RULES.maxTurns / 60;
      console.log(`timed all: ${result.secondsPerSeason.toFixed(2)} s/season; ${minutes.toFixed(2)} min/204 seasons; ${minutes >= 45 && minutes <= 55 ? 'PASS' : 'FAIL'} [45..55]; ${TIMING_REPORT}`);
      if (minutes < 45 || minutes > 55) process.exitCode = 1;
    } else console.log(`timed diagnostic only: calibration requires ${TIMING_SAMPLE.viewport}`);
  }
  console.log(`board:life ${mode} ${process.exitCode ? 'FAIL' : 'OK'}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
