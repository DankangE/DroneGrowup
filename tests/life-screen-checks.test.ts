import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { choose, newGame, options, reachable, restore } from '../src/life/engine.ts';
import type { GameState } from '../src/life/types.ts';
import { MAPS, WORLD } from '../src/life/world.ts';
import { POPUP_DEFINITIONS, POPUP_GROUPS } from '../src/ui2/popups/data.ts';

// CLI entry guards make these imports safe in npm test: no build, browser or server.
const { mapFixture, mapOf, pickLifeOption, playSeasons } = await import(new URL('../scripts/life-ui-driver.mjs', import.meta.url).href);
const { argumentsFor, timingLine } = await import(new URL('../scripts/board-life-check.mjs', import.meta.url).href);
const { main: playtestMain } = await import(new URL('../scripts/playtest-life.mjs', import.meta.url).href);
const { assertPopupCoverage } = await import(new URL('../scripts/layout-check-life.mjs', import.meta.url).href);

function engineDriver(initial: GameState) {
  let state = initial, elapsed = 0;
  const ids: string[] = [];
  return {
    state: async () => state,
    take: async (before: GameState, id: string) => {
      assert.deepEqual(before, state);
      assert.ok(options(state).some(option => option.id === id && option.enabled));
      ids.push(id); elapsed += 100;
      state = choose(state, id).state;
      return state;
    },
    now: () => elapsed, ids,
  };
}

for (const seed of [1, 11]) {
  test(`screen policy seed ${seed}: starts fresh and reaches promotion or three years without fixtures`, async () => {
    const driver = engineDriver(newGame(seed));
    const run = await playSeasons(driver, { stopAtRankup: true, now: driver.now });
    assert.equal(driver.ids[0], 'start:work');
    assert.ok(driver.ids.some(id => id.startsWith('job:') && id !== 'job:none'));
    assert.ok(driver.ids.some(id => id.startsWith('go:')));
    assert.ok(driver.ids.some(id => id.startsWith('act:')));
    assert.ok(run.promotions > 0 || run.state.turn === 12);
    assert.equal(run.seasonTimes.length, run.state.turn);
    assert.equal(run.choices, driver.ids.length);
    assert.deepEqual(restore(run.state), run.state);
  });
}

for (const map of Object.keys(MAPS)) {
  test(`timed map ${map}: exactly 12 seasons remain local and include the final result interval`, async () => {
    const initial = mapFixture(map);
    // This measures 12 local, single-season intervals. Event relocations and abroad are
    // tested separately; T12 cannot change the T20 browser policy/runner scripts.
    for (const id of ['posting', 'hq_call', 'invite_d', 'field_call', 'abroad', 'expo_e', 'holiday', 'hometown']) {
      initial.seen[id] = initial.turn;
    }
    assert.deepEqual(restore(initial), initial, 'debug loader accepts this map fixture');
    const driver = engineDriver(initial);
    const run = await playSeasons(driver, { stayMap: map, now: driver.now });
    assert.equal(mapOf(run.state), map);
    assert.equal(run.state.turn - initial.turn, 12);
    assert.equal(run.seasonTimes.length, 12);
    assert.ok(Math.abs(run.seasonTimes.reduce((sum: number, seconds: number) => sum + seconds, 0) - driver.now() / 1000) < 1e-8,
      'all elapsed action/result time, including the twelfth season, is counted');
    assert.match(timingLine(map, '390x844', run.seasonTimes), /12 seasons, .* s\/season; model 14\.9, delta/);
    assert.deepEqual(restore(run.state), run.state);
  });
}

test('policy uses enabled choices without mutating state and avoids locked promotions', () => {
  const state = mapFixture('A'); state.board.pos = 'A-o0';
  const before = structuredClone(state);
  assert.ok(options(state).find(option => option.id === pickLifeOption(state))?.enabled);
  assert.deepEqual(state, before);
  const review = structuredClone(state);
  review.board.pos = WORLD.find(node => node.map === 'A' && node.kind === 'rankup')!.id;
  review.board.step = 'space'; review.board.dice = [1, 1];
  const id = pickLifeOption(review);
  assert.notEqual(id, 'promo'); assert.ok(options(review).find(option => option.id === id)?.enabled);
});

test('timed policy excludes cross-map routes even when a transfer is reachable', () => {
  const state = mapFixture('A');
  state.board.pos = 'A-o11'; state.board.step = 'pick'; state.board.dice = [4, 4];
  assert.ok(reachable(state).some(move => move.path.some(id => id.startsWith('B-'))));
  const id = pickLifeOption(state, { stayMap: 'A' });
  const selected = reachable(state).find(move => id === `go:${move.node}`)!;
  assert.ok(selected.path.every(node => node.startsWith('A-')));
});

test('the existing timed runner explicitly rejects a relocating event response', async () => {
  const state = mapFixture('A'); state.phase = 'event'; state.eventId = 'hq_call';
  state.board.step = 'space'; state.board.dice = [1, 1];
  const driver = engineDriver(state);
  await assert.rejects(playSeasons(driver, { stayMap: 'A', now: driver.now }), /never transfers/);
  assert.deepEqual(driver.ids, ['ev:0']);
});

test('promotion completes the playtest target immediately, but entering a job does not', async () => {
  let state = choose(newGame(1), 'start:work').state;
  state = choose(state, 'job:service').state;
  state.board.pos = WORLD.find(node => node.map === 'A' && node.kind === 'rankup')!.id;
  state.board.step = 'space'; state.board.dice = [1, 1];
  state.job.tenure = 4; state.job.perf = 100; state.s.xp = 100; state.rng = 1;
  const driver = engineDriver(state);
  const run = await playSeasons(driver, { stopAtRankup: true, now: driver.now });
  assert.deepEqual(driver.ids, ['promo']);
  assert.equal(run.promotions, 1); assert.equal(run.state.turn, state.turn);
  assert.deepEqual(run.seasonTimes, [], 'a partial season is never included in timing');
});

test('timing formatter rejects incomplete, empty and invalid measurements', () => {
  assert.match(timingLine('A', '390x844', Array(12).fill(14.9)), /178\.80 s, 14\.90 s\/season; model 14\.9, delta 0\.00/);
  for (const times of [[], Array(11).fill(1), Array(13).fill(1), Array(12).fill(NaN), Array(12).fill(0), Array(12).fill(-1)]) {
    assert.throws(() => timingLine('A', '390x844', times));
  }
  assert.throws(() => timingLine('Z', '390x844', Array(12).fill(1)), /known map/);
});

test('policy runner fails on no-op, early ending, skipped seasons and unexpected transfer', async () => {
  const state = mapFixture('A');
  await assert.rejects(playSeasons({ state: async () => state, take: async () => structuredClone(state) }), /advance state/);
  await assert.rejects(playSeasons({ state: async () => ({ ...state, phase: 'ended' }) }), /before its acceptance target/);
  await assert.rejects(playSeasons({ state: async () => state, take: async () => ({ ...state, turn: state.turn + 2 }) }), /exactly one season/);
  await assert.rejects(playSeasons({ state: async () => state,
    take: async () => ({ ...state, board: { ...state.board, pos: 'B-o0' } }) }, { stayMap: 'A' }), /never transfers/);
});

test('policy runner bounds choices when state keeps changing without completing a season', async () => {
  const state = mapFixture('A');
  await assert.rejects(playSeasons({ state: async () => state,
    take: async (before: GameState) => ({ ...before, rng: before.rng + 1 }) }, { seasons: 1 }), /choice limit/);
});

test('board command accepts keys and timed and rejects invalid arguments before opening a server', () => {
  assert.deepEqual(argumentsFor([]), { mode: 'keys', viewport: [390, 844] });
  assert.deepEqual(argumentsFor(['timed', '1366x768']), { mode: 'timed', viewport: [1366, 768] });
  for (const args of [['typo'], ['timed', 'wide'], ['timed', '0x844'], ['keys', '390x844', 'extra']]) {
    assert.throws(() => argumentsFor(args));
  }
});

test('layout requires all twenty spec groups, including both promotion and demotion fixtures', () => {
  const kinds = Object.keys(POPUP_DEFINITIONS);
  assert.equal(POPUP_GROUPS.length, 20);
  assertPopupCoverage(kinds);
  for (const missing of POPUP_GROUPS.flat()) {
    assert.throws(() => assertPopupCoverage(kinds.filter(kind => kind !== missing)), /missing popup fixture/);
  }
});

test('all three v2 commands are real entry points in verify; timed remains opt-in', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(typeof playtestMain, 'function');
  assert.equal(scripts['playtest:life'], 'node scripts/playtest-life.mjs');
  assert.equal(scripts['layout:life'], 'node scripts/layout-check-life.mjs');
  assert.equal(scripts['check:board'], 'node scripts/board-life-check.mjs');
  const steps = scripts.verify.split(' && ');
  for (const command of ['npm run layout:life', 'npm run playtest:life', 'npm run check:board -- keys']) assert.ok(steps.includes(command));
  assert.ok(!scripts.verify.includes('timed'));
});
