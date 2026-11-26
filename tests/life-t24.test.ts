import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, newGame, options } from '../src/life/flow.ts';
import { POLICY_IDS } from '../src/life/bots.ts';
import { MAP_IDS } from '../src/life/life-data.ts';
import { loadLifeSettings, saveLifeSettings } from '../src/save.ts';
import { mountLife } from '../src/ui2/app.ts';
import { TILT, TILT_STYLE, uprightTile } from '../src/ui2/board.ts';
import { SPIN_MS } from '../src/ui2/wheel.ts';
import { STEP_MS } from '../src/ui2/move.ts';
import { THINK_MS } from '../scripts/life-time-data.ts';
import { TIME_MODEL, choiceTiming, readingStep } from '../scripts/life-time-model.ts';
import { calibration, TIMING_FINGERPRINT } from '../scripts/life-time-calibration.ts';
import type { TimingMeasurement } from '../scripts/life-time-calibration.ts';
import { evaluateCriteria, runLife } from '../scripts/simulate-life.ts';
import { action, dom, TestNode, withDOM } from './life-popup2-dom-helper.ts';

const { THINK_MS: driverThink } = await import(new URL('../scripts/life-check-data.mjs', import.meta.url).href);
const { mapFixture, playSeasons } = await import(new URL('../scripts/life-ui-driver.mjs', import.meta.url).href);

test('T24: driver and simulation share all human pauses; animation durations come from the UI', () => {
  assert.equal(driverThink, THINK_MS);
  assert.deepEqual(THINK_MS, { spin: 800, pick: 3000, space: 4000, bonus: 3500, event: 6000, result: 2400, large: 8000 });
  for (const [id, ms] of Object.entries(THINK_MS)) assert.equal(TIME_MODEL.find(row => row.id === id)!.seconds, ms / 1000);
  assert.equal(TIME_MODEL.find(row => row.id === 'wheel')!.seconds, SPIN_MS / 1000);
  assert.equal(TIME_MODEL.find(row => row.id === 'move')!.seconds, STEP_MS / 1000);
  const s = newGame(1);
  assert.equal(readingStep(s, 'job'), 'large');
  assert.equal(readingStep({ ...s, phase: 'event' }, 'event'), 'event');
  assert.equal(readingStep(s), 'spin');
});

test('T24: movement charges actual steps and F5 auto-close has one acknowledgement and no bonus reading', () => {
  const before = choose(newGame(11), 'start:self').state;
  before.board.pos = 'A-o10'; before.board.step = 'pick'; before.board.dice = [1, 1];
  const outcome = choose(before, 'go:A-o12'), model = choiceTiming(before, outcome.state, outcome.result);
  assert.equal(outcome.state.turn, 1);
  assert.equal(model.counts.pick, 1); assert.equal(model.counts.move, 2);
  assert.equal(model.counts.result, 1); assert.equal(model.counts.callout, 1);
  assert.equal(model.counts.bonus, 0); assert.equal(model.counts.wheel, 0);
  assert.equal(model.seconds, 3 + 2 * .25 + 2.4 + .6 + .18);
});

test('T24: six-map pure replay records model intervals including the final acknowledgement', async () => {
  for (const map of MAP_IDS) {
    let state = mapFixture(map), milliseconds = 0;
    const run = await playSeasons({ state: async () => state, take: async (before: typeof state, id: string) => {
      const next = choose(before, id);
      milliseconds += choiceTiming(before, next.state, next.result).seconds * 1000;
      state = next.state; return state;
    } }, { stayMap: map, now: () => milliseconds });
    assert.equal(run.modeledTimes.length, 12);
    run.modeledTimes.forEach((seconds: number, i: number) => assert.ok(Math.abs(seconds - run.seasonTimes[i]) < 1e-8));
  }
});

function measuredFixture(): TimingMeasurement {
  return { fingerprint: TIMING_FINGERPRINT, measuredAt: '2026-11-26T00:00:00.000Z', viewport: '1366x768', seed: 11,
    samples: MAP_IDS.map(map => ({ map, measured: Array(12).fill(15), modeled: Array(12).fill(15) })) };
}
test('T24: calibration requires current sources and every positive season on all six maps', () => {
  assert.equal(calibration(null).factor, null);
  const sample = measuredFixture();
  assert.equal(calibration(sample).factor, 1); assert.equal(calibration(sample).secondsPerSeason, 15);
  for (const mutate of [
    (m: TimingMeasurement) => { m.fingerprint = 'pre-F5'; },
    (m: TimingMeasurement) => { m.viewport = '360x740'; },
    (m: TimingMeasurement) => { m.viewport = '390x844'; },
    (m: TimingMeasurement) => { m.seed = 1; },
    (m: TimingMeasurement) => { m.samples.pop(); },
    (m: TimingMeasurement) => { m.samples[1].map = 'A'; },
    (m: TimingMeasurement) => { m.samples[0].measured.pop(); },
    (m: TimingMeasurement) => { m.samples[0].measured[0] = 0; },
    (m: TimingMeasurement) => { m.samples[0].modeled[0] = NaN; },
  ]) { const invalid = structuredClone(sample); mutate(invalid); assert.equal(calibration(invalid).factor, null); }
});

test('T24: all twenty time gates fail without measurement, use measured correction, and retain exact bounds', () => {
  const report = runLife('service_frugal', 1).report;
  const base = POLICY_IDS.map(policy => ({ ...report, policy, seconds: [16 * 60, 20 * 60, 14 * 60] }));
  const out = { base, single: base, noBank: base, noCards: base, failures: [] };
  const time = (data: ReturnType<typeof calibration>) => evaluateCriteria(out, 1, data).filter(c => c.id.startsWith('time:'));
  assert.equal(time(calibration(null)).length, 20);
  assert.ok(time(calibration(null)).every(c => c.status === 'FAIL' && Number.isNaN(c.value)));
  const measured = measuredFixture(), valid = time(calibration(measured));
  assert.ok(valid.every(c => c.status === 'PASS'));
  assert.deepEqual(valid.map(c => [c.min, c.max]), [[45,55], ...POLICY_IDS.map(() => [40,60]), [12,20], [16,24], [10,18]]);
  measured.samples.forEach(row => row.measured.fill(18));
  const slow = time(calibration(measured));
  assert.equal(slow[0].value, 60); assert.equal(slow[0].status, 'FAIL');
  for (const minutes of [45, 55, 44.999, 55.001]) {
    base.forEach(row => { row.seconds = [minutes * 60, 0, 0]; });
    assert.equal(time(calibration(measuredFixture()))[0].status, minutes >= 45 && minutes <= 55 ? 'PASS' : 'FAIL');
  }
});

function storage(run: (entries: Map<string, string>) => void) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  } });
  try { run(entries); } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
test('T24: tilt defaults off, persists strict booleans, and tolerates corrupt or unavailable storage', () => storage(entries => {
  const key = 'pilot-growup:settings:v2';
  assert.deepEqual(loadLifeSettings(), { tilt: false });
  entries.set('pilot-growup:run:v2', 'unchanged');
  assert.equal(saveLifeSettings({ tilt: true }), true); assert.deepEqual(loadLifeSettings(), { tilt: true });
  assert.equal(entries.get('pilot-growup:run:v2'), 'unchanged');
  saveLifeSettings({ tilt: false }); assert.deepEqual(loadLifeSettings(), { tilt: false });
  for (const raw of ['bad JSON', 'null', '[]', '{"tilt":"true"}', '{"tilt":1}']) {
    entries.set(key, raw); assert.deepEqual(loadLifeSettings(), { tilt: false });
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  assert.deepEqual(loadLifeSettings(), { tilt: false }); assert.equal(saveLifeSettings({ tilt: true }), false);
}));

for (const reduced of [true, false]) test(`T24: live settings toggle and reload preserve state and focus (reduced=${reduced})`, () => storage(() => withDOM(() => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const browser = { matchMedia: () => ({ matches: reduced, addEventListener() {} }) } as unknown as Window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
  try {
    const root = new TestNode('main'); mountLife(root.element(), 11, true);
    const state = browser.__life!.state();
    assert.equal(root.querySelector('.life2-board-tilted'), undefined);
    root.querySelector('[data-nav=life]')!.fire('click'); root.querySelector('[data-tab=settings]')!.fire('click');
    assert.equal(action(root, 'toggle-tilt').attributes['aria-checked'], 'false');
    action(root, 'toggle-tilt').fire('click');
    assert.equal(action(root, 'toggle-tilt').attributes['aria-checked'], 'true');
    assert.equal(dom.activeElement, action(root, 'toggle-tilt')); assert.ok(root.querySelector('.life2-board-tilted'));
    assert.deepEqual(browser.__life!.state(), state);
    action(root, 'popup-close').fire('click'); browser.__life!.load(state);
    assert.ok(root.querySelector('.life2-board-tilted'));
    const reload = new TestNode('main'); mountLife(reload.element(), 11, true);
    assert.ok(reload.querySelector('.life2-board-tilted'));
    reload.querySelector('[data-nav=life]')!.fire('click'); reload.querySelector('[data-tab=settings]')!.fire('click');
    action(reload, 'toggle-tilt').fire('click'); assert.equal(reload.querySelector('.life2-board-tilted'), undefined);
    assert.deepEqual(loadLifeSettings(), { tilt: false }); assert.deepEqual(browser.__life!.state(), state);
    assert.deepEqual(browser.__life!.options(), options(state));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');
  }
})));

test('T24: lifted upright corners stay above the board and keep square 44px targets at every grid center', () => {
  const angle = TILT.degrees * Math.PI / 180;
  const sin = Math.sin(angle), cos = Math.cos(angle);
  // Forward-transform all four corners through the tile and board matrices,
  // checking depth before perspective; 2D projection alone misses occlusion.
  // Include the fractional cell size from the Chromium hit-test regression.
  // Browser layout/hit-testing remains a separate Playwright gate.
  for (const cell of [44, 48, 50.5625, 72]) for (let row = -4; row <= 4; row++) for (let col = -3; col <= 3; col++) {
    const x = col * (cell + 2), y = row * (cell + 2), { dx, dy, dz, scale } = uprightTile(x, y, cell);
    for (const cornerX of [-cell / 2, cell / 2]) for (const cornerY of [-cell / 2, cell / 2]) {
      const planeX = x + dx + cornerX * scale;
      const planeY = y + dy + cornerY * scale * cos;
      const planeZ = dz - cornerY * scale * sin;
      assert.ok(planeZ >= 0, `cell=${cell}, row=${row}, col=${col}: corner stays in front of board`);
      if (cornerY > 0) assert.ok(Math.abs(planeZ - TILT.clearance * scale) < 1e-9, 'bottom corners retain clearance');
      const worldY = planeY * cos - planeZ * sin;
      const worldZ = planeY * sin + planeZ * cos;
      const projection = 1 / (1 - worldZ / TILT.perspective);
      assert.ok(Math.abs(planeX * projection - (x + cornerX)) < 1e-9);
      assert.ok(Math.abs(worldY * projection - (y + cornerY)) < 1e-9);
    }
  }
  assert.ok(TILT_STYLE.includes(`perspective(${TILT.perspective}px) rotateX(${TILT.degrees}deg)`));
  assert.ok(TILT_STYLE.includes(`translate3d(var(--upright-x,0px),var(--upright-y,0px),var(--upright-z,0px)) rotateX(-${TILT.degrees}deg) scale(var(--upright-scale,1))`));
  assert.match(TILT_STYLE, /transform-style:flat/);
  assert.match(TILT_STYLE, /:active/); assert.match(TILT_STYLE, /prefers-reduced-motion:reduce/);
});
