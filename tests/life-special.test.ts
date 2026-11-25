import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, derived, forecast, newGame, options, restore } from '../src/life/engine.ts';
import { advanceCareer, advanceStudies, canPromote, contestPrize, creatorIncome, entryChance,
  hire, promote, quit, startingAction, yearEndReview } from '../src/life/jobs.ts';
import { CAREER_KEYS, careerSalary } from '../src/life/career2.ts';
import { ECONOMY_KEYS, upkeepLines } from '../src/life/economy.ts';
import { randInt } from '../src/life/move.ts';
import { CREATOR_VIDEO, SPECIAL_RULES, SPECIAL_TEXT, TRACKS } from '../src/life/tracks.ts';
import { MAPS, WORLD } from '../src/life/world.ts';
import type { ActionDef, GameState, MapId, SpaceKind, TrackId } from '../src/life/types.ts';

function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
function saved(state: GameState): GameState {
  const integers = (value: unknown): void => {
    if (typeof value === 'number') assert.ok(Number.isSafeInteger(value));
    else if (value && typeof value === 'object') Object.values(value).forEach(integers);
  };
  integers(state);
  const next = restore(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(next, state);
  return next!;
}
function tile(state: GameState, map: MapId, kind: SpaceKind): void {
  state.board.pos = WORLD.find(node => node.map === map && node.kind === kind)!.id;
  state.board.step = 'space'; state.board.dice = [1, 1];
}
function worker(track: TrackId, map: MapId = 'D', rank = 0, seed = 7): GameState {
  const state = choose(newGame(seed), 'start:self').state;
  state.turn = 8; state.status = 'working'; state.track = track;
  state.job = { rank, perf: 50, tenure: 0, total: 0, warn: 0, changedAt: 0, tracks: [track] };
  state.s.rank = Math.min(rank, 3);
  tile(state, map, 'job');
  return state;
}
function close(prev: GameState): GameState {
  let state = structuredClone(prev);
  while (state.phase === 'event' || options(state).some(row => row.id === 'job:none'))
    state = choose(state, options(state).some(o => o.id === 'job:none') ? 'job:none' : 'skip').state;
  state.board.step = 'bonus'; state.board.dice = [1, 1];
  return choose(state, 'end').state;
}
function option(state: GameState, id: string) {
  const found = options(frozen(structuredClone(state))).find(row => row.id === id);
  assert.ok(found, id); return found;
}

for (const track of TRACKS.filter(row => row.tier === 3)) {
  test(`${track.id}: only district seasons double promotion tenure; real employment and saves stay integral`, () => {
    for (const [map, expected] of [['D', 2], ['B', 1]] as const) {
      const state = worker(track.id, map); state.turn++;
      const next = advanceCareer(frozen(state));
      assert.equal(next.job.tenure, expected); assert.equal(next.job.total, 1);
      assert.deepEqual(advanceCareer(saved(next)), next);
      assert.equal(state.job.tenure, 0);
    }
    const state = worker(track.id); tile(state, 'D', 'rankup');
    const away = structuredClone(state); tile(away, 'B', 'rankup');
    assert.equal(canPromote(away), false, 'specialist reviews still require D');
  });
}

test('district acceleration excludes ordinary jobs and nonworking characters', () => {
  for (const track of TRACKS.filter(row => row.tier !== 3)) {
    const state = worker(track.id); state.turn++;
    assert.equal(advanceCareer(state).job.tenure, 1, track.id);
  }
  for (const status of ['student', 'jobless', 'retired'] as const) {
    const state = worker('engineer'); state.status = status; state.turn++;
    assert.equal(advanceCareer(state).job.tenure, 0);
  }
});

// §13.2 compares specialist and ordinary tracks at the same rank number. Keep all ability
// requirements satisfied, and offer the review as soon as tenure permits, with the same seed.
for (const specialist of ['inspector', 'film', 'atc'] as const) {
  test(`${specialist}: matched-stat promotions take 55–70% of ordinary clerk seasons at ranks 1–3`, t => {
    const durations: number[][] = [];
    for (let rank = 0; rank < 3; rank++) {
      const elapsed = (track: TrackId, map: MapId) => {
        let state = worker(track, map, rank);
        Object.assign(state.s, { theory: 320, skill: 330, xp: 870, rep: 180, net: 320, biz: 320, gear: 3 });
        state.flags.push('licensed', 'degree', 'master'); state.job.perf = 90;
        tile(state, map, 'rankup');
        const began = state.turn;
        while (!canPromote(state)) {
          assert.ok(state.turn - began < 20);
          state.turn++; state = advanceCareer(state);
        }
        const promoted = promote(frozen(state));
        assert.equal(promoted.job.rank, rank + 1);
        assert.equal(promoted.job.tenure, 0); assert.equal(promoted.job.total, state.turn - began);
        saved(promoted);
        return state.turn - began;
      };
      const district = elapsed(specialist, 'D'), ordinary = elapsed('clerk', 'B');
      assert.ok(district * 100 >= ordinary * 55 && district * 100 <= ordinary * 70);
      durations.push([district, ordinary]);
    }
    assert.deepEqual(durations, [[4, 6], [6, 10], [8, 14]]);
    t.diagnostic(`${specialist}/clerk: 4/6, 6/10, 8/14 seasons (66.7%, 60%, 57.1%); total 18/30 (60%)`);
  });
}

test('district training scales positive graded gains by 150%, flooring each; other rewards and bonus actions stay unchanged', () => {
  const state = worker('mechanic'); tile(state, 'D', 'train');
  const id = 'act:train_mechanic', preview = forecast(frozen(state), id), next = choose(state, id);
  assert.deepEqual(option(state, id).sure!.add, { skill: 7, theory: 7, xp: 3 });
  assert.equal(next.state.s.skill - state.s.skill, 7);
  assert.deepEqual(next.result.deltas, preview.branches[0].deltas);
  assert.equal(next.state.board.step, 'bonus'); assert.equal(next.state.turn, state.turn);
  assert.deepEqual(choose(saved(state), id), next);
  const sample: ActionDef = { id: 'sample', place: 'lab', when: {}, title: '', desc: '', cost: 3, tire: 9,
    roll: { base: 50, success: { text: '', add: { theory: 3, skill: 5, xp: 1, teach: 7, rep: 9,
      biz: 11, net: 13, money: 7, stamina: -5, fans: 5 } }, fail: { text: '', add: { theory: -3, xp: 3 } } } };
  const scaled = startingAction(state, frozen(sample), true);
  assert.deepEqual(scaled.roll!.success.add, { theory: 4, skill: 7, xp: 1, teach: 10, rep: 13,
    biz: 16, net: 19, money: 7, stamina: -5, fans: 5 });
  assert.deepEqual(scaled.roll!.fail.add, { theory: -3, xp: 4 });
  assert.equal(scaled.cost, 3); assert.equal(scaled.tire, 9); assert.equal(scaled.roll!.base, 50);
  assert.deepEqual(startingAction(state, sample, false), sample);
  const outside = structuredClone(state); tile(outside, 'B', 'train');
  assert.deepEqual(startingAction(outside, sample, true), sample);
  const student = choose(newGame(7), 'start:school').state; tile(student, 'D', 'train');
  const district = option(student, 'act:st_theory').sure!.add;
  const village = structuredClone(student); tile(village, 'A', 'train');
  assert.deepEqual(district, option(village, 'act:st_theory').sure!.add, 'school and district bonuses do not stack');
});

test('graduate enrollment requires a degree and the district graduate school; active/master states cannot re-enroll', () => {
  const state = worker('engineer'); state.board.pos = 'D-o4';
  assert.equal(option(state, 'graduate:enroll').enabled, false);
  assert.ok(option(state, 'skip').enabled);
  const qualified = structuredClone(state); qualified.flags.push('degree');
  assert.ok(option(qualified, 'graduate:enroll').enabled);
  const next = choose(qualified, 'graduate:enroll');
  assert.equal(next.state.board.step, 'bonus'); assert.equal(next.state.s.acts, 1);
  assert.equal(next.state.turn, qualified.turn); assert.equal(next.state.track, qualified.track);
  assert.deepEqual(next.result.deltas, forecast(qualified, 'graduate:enroll').branches[0].deltas);
  const enrolled = structuredClone(next.state); enrolled.board.step = 'space';
  assert.equal(option(enrolled, 'graduate:enroll').enabled, false);
  assert.throws(() => choose(enrolled, 'graduate:enroll'), /disabled/);
  const mastered = structuredClone(qualified); mastered.flags.push('master');
  assert.equal(option(mastered, 'graduate:enroll').enabled, false);
  for (const pos of ['D-o1', 'E-o8', 'B-o0']) {
    const elsewhere = structuredClone(qualified); elsewhere.board.pos = pos;
    assert.ok(!options(elsewhere).some(row => row.id === 'graduate:enroll'));
  }
});

test('graduate study charges exactly 150 × 6 seasons, survives quitting/travel/save, and grants master once', () => {
  let state = worker('engineer'); state.board.pos = 'D-o4'; state.flags.push('degree');
  state = choose(state, 'graduate:enroll').state;
  assert.equal(state.timers[ECONOMY_KEYS.graduateUntil], 14);
  assert.equal(state.s.money, 800, 'tuition accrues seasonally, without an extra enrollment charge');
  for (let season = 1; season <= 7; season++) {
    if (season === 3) { state = quit(state); tile(state, 'B', 'train'); }
    state = close(saved(state));
    assert.equal(state.board.ledger['대학원 등록금'], -150 * Math.min(season, 6));
    assert.equal(state.flags.includes('master'), season >= 6);
  }
  assert.equal(state.flags.filter(flag => flag === 'master').length, 1);
  assert.equal(state.timers[ECONOMY_KEYS.graduateUntil], undefined);
  assert.deepEqual(advanceStudies(frozen(state)), state);
  const engineer = worker('engineer', 'D', 1);
  Object.assign(engineer.s, { theory: 320, xp: 480 }); engineer.job.tenure = 12;
  tile(engineer, 'D', 'rankup'); assert.equal(canPromote(engineer), false);
  engineer.flags = [...state.flags]; assert.ok(canPromote(engineer), 'degree alone cannot unlock rank 2');
});

test('racer entry keeps the 35-year age gate and 40% + one point per five skill (cap 30), with seeded outcomes', () => {
  const track = TRACKS.find(row => row.id === 'racer')!;
  for (const [skill, chance] of [[270, 40], [274, 40], [275, 41], [330, 52], [420, 70], [500, 70]]) {
    const state = worker('service'); tile(state, 'D', 'jobfair'); state.s.skill = skill;
    assert.equal(entryChance(state, track), chance);
    assert.equal(option(state, 'job:racer').roll!.chance, chance);
  }
  const results = new Set<boolean>();
  for (let seed = 1; seed <= 30; seed++) {
    const state = worker('service', 'D', 0, seed); tile(state, 'D', 'jobfair'); state.s.skill = 270;
    state.turn = (35 - 19) * 4 + 3;
    const next = choose(frozen(state), 'job:racer');
    results.add(next.result.roll!.success);
    assert.equal(next.result.roll!.success, next.result.roll!.value < 40);
    assert.equal(next.state.track, next.result.roll!.success ? 'racer' : 'service');
    assert.equal(next.state.board.contests, 0); assert.equal(next.state.s.wins, state.s.wins);
    assert.equal(hire(state, 'racer').track, next.state.track);
    assert.deepEqual(choose(saved(state), 'job:racer'), next);
    const tooOld = structuredClone(state); tooOld.turn++;
    assert.equal(option(tooOld, 'job:racer').enabled, false);
  }
  assert.deepEqual([...results].sort(), [false, true]);
});

for (const [rank, pct] of [[0, 100], [1, 150], [2, 200], [3, 300]]) {
  test(`racer rank ${rank}: a playable contest uses ${pct}% prize, unchanged losses and exact forecasts`, () => {
    const outcomes = new Set<boolean>();
    for (let seed = 1; seed <= 30; seed++) {
      const state = worker('racer', 'D', rank, seed); state.s.skill = 330;
      const contest = WORLD.find(node => node.map === 'D' && node.kind === 'contest')!;
      state.board.pos = WORLD.find(node => node.next.includes(contest.id))!.id;
      state.board.step = 'pick'; state.board.dice = [1, 1];
      const landed = choose(state, `go:${contest.id}`).state;
      assert.equal(landed.eventId, 'club', 'reuse the existing racing event on racer contest tiles');
      const card = option(landed, 'ev:0'), preview = forecast(landed, 'ev:0');
      assert.equal(card.roll!.success.add.money, Math.floor(40 * pct / 100));
      assert.equal(card.roll!.fail.add.money, -30);
      const next = choose(landed, 'ev:0'), won = next.result.roll!.success; outcomes.add(won);
      assert.equal(next.result.roll!.chance, card.roll!.chance);
      assert.equal(next.state.s.money - landed.s.money, won ? Math.floor(40 * pct / 100) : -30);
      assert.equal(next.state.board.contests, won ? 1 : 0);
      assert.deepEqual(next.result.deltas, preview.branches.find(branch => branch.id === (won ? 'success' : 'fail'))!.deltas);
      assert.deepEqual(choose(saved(landed), 'ev:0'), next);
      const ordinaryEvent = structuredClone(landed); tile(ordinaryEvent, 'D', 'event');
      assert.equal(option(ordinaryEvent, 'ev:0').roll!.success.add.money, 40);
    }
    assert.deepEqual([...outcomes].sort(), [false, true]);
    const state = worker('racer', 'C', rank);
    assert.equal(contestPrize(state, 41), Math.floor(41 * pct / 100), 'one integer floor, no map multiplier');
    assert.equal(careerSalary(state), [100, 220, 450, 800][rank]);
  });
}

test('creator income is floor(fans × 100/120/150/200 ÷ 100), once per season on every map and in forecasts', () => {
  for (const map of Object.keys(MAPS) as MapId[]) for (let rank = 0; rank < 4; rank++) {
    for (const fans of [0, 1, 99, 100, 101, 299, 300, 301, 599, 600, 999]) {
      const state = worker('creator', map, rank); state.s.fans = fans; state.board.step = 'bonus';
      const expected = Math.floor(fans * [100, 120, 150, 200][rank] / 100);
      assert.equal(creatorIncome(frozen(state)), expected);
      const view = derived(state), base = upkeepLines(state).reduce((sum, row) => sum + row.amount, 0);
      assert.equal(view.upkeep.total, base + expected);
      assert.equal(view.upkeep.lines.find(row => row.label === '구독자 광고 수입')?.amount ?? 0, expected);
      const next = choose(state, 'end');
      assert.equal(next.state.board.ledger['구독자 광고 수입'] ?? 0, expected);
      assert.deepEqual(next.result.season!.accrual, view.upkeep.lines);
      assert.deepEqual(forecast(state, 'end').branches[0].accrual, view.upkeep.lines);
      saved(next.state);
    }
  }
  const state = worker('creator'); state.s.fans = 999;
  assert.equal(creatorIncome(quit(state)), 0);
  state.status = 'retired'; assert.equal(creatorIncome(state), 0);
});

test('video success adds seeded 8–20 fans, failure adds none; shown growth, forecast and saved replay agree', () => {
  const outcomes = new Set<boolean>(), gains = new Set<number>();
  for (let seed = 1; seed <= 150; seed++) {
    const state = worker('creator', 'B', 0, seed); state.s.fans = 100;
    const id = `act:${CREATOR_VIDEO.id}`, card = option(state, id), preview = forecast(state, id);
    const next = choose(state, id), won = next.result.roll!.success;
    outcomes.add(won);
    const rng = structuredClone(state); randInt(rng, 100);
    const gain = won ? 8 + randInt(rng, 13) : 0;
    if (won) gains.add(gain);
    assert.equal(next.state.rng, rng.rng);
    assert.equal(next.state.s.fans - state.s.fans, gain);
    assert.equal(next.state.job.perf, won ? 58 : 46);
    assert.equal(next.state.board.contests, 0); assert.equal(next.state.board.step, 'bonus');
    assert.equal(next.state.s.acts, 1); assert.equal(next.state.turn, state.turn);
    if (won) assert.equal(card.roll!.success.add.fans, gain);
    assert.deepEqual(next.result.deltas, preview.branches.find(row => row.id === (won ? 'success' : 'fail'))!.deltas);
    assert.deepEqual(choose(saved(state), id), next);
    assert.ok(!options(next.state).some(row => row.id === id), 'recording is a job-tile action');
  }
  assert.deepEqual([...outcomes].sort(), [false, true]);
  assert.equal(Math.min(...gains), 8); assert.equal(Math.max(...gains), 20);
  const capped = worker('creator'); capped.s.fans = 998;
  const next = choose(capped, `act:${CREATOR_VIDEO.id}`);
  assert.ok(next.result.roll!.success); assert.equal(next.state.s.fans, 999); saved(next.state);
  const other = worker('racer'); assert.ok(!options(other).some(row => row.id === `act:${CREATOR_VIDEO.id}`));
});

test('creator fans decay by 3% once each winter before rank review, after that season advertising accrues', () => {
  let state = worker('creator', 'B', 1); state.turn = 11; state.s.fans = 100;
  state = close(frozen(state));
  assert.equal(state.s.fans, 97); assert.equal(state.board.ledger['구독자 광고 수입'], 120);
  assert.equal(state.job.warn, 1); assert.equal(state.job.rank, 1);
  assert.deepEqual(yearEndReview(saved(state)), state);
  for (let season = 0; season < 4; season++) state = close(saved(state));
  assert.equal(state.s.fans, 94); assert.equal(state.job.rank, 0);
  const ordinary = worker('pilot'); ordinary.turn = 12; ordinary.s.fans = 100;
  assert.equal(yearEndReview(ordinary).s.fans, 100);
  const zero = worker('creator'); zero.turn = 12; zero.s.fans = 0;
  assert.equal(yearEndReview(zero).s.fans, 0);
});

test('all nine stations offer six express starts for 150, enforce district gates and funds, and retain skip', () => {
  for (const station of WORLD.filter(node => node.kind === 'station')) {
    const state = worker('service', station.map); state.board.pos = station.id; state.s.money = 150;
    const offers = options(frozen(state)).filter(row => row.id.startsWith('express:'));
    assert.equal(offers.length, 6);
    for (const offer of offers) {
      assert.equal(offer.cost, 150); assert.equal(offer.tire, 0);
      assert.equal(offer.enabled, offer.id !== 'express:D-o0');
    }
    assert.ok(option(state, 'skip').enabled);
    const short = structuredClone(state); short.s.money = 149;
    assert.equal(option(short, 'express:A-o0').enabled, false);
    assert.throws(() => choose(short, 'express:A-o0'), /disabled/);
    assert.equal(choose(short, 'skip').state.board.step, 'bonus');
  }
  const state = worker('service', 'B'); tile(state, 'B', 'station');
  state.flags.push('licensed'); state.s.theory = 149;
  assert.equal(option(state, 'express:D-o0').enabled, false);
  const qualified = structuredClone(state); qualified.s.theory = 150;
  assert.ok(option(qualified, 'express:D-o0').enabled);
  const away = structuredClone(qualified); tile(away, 'B', 'train');
  assert.ok(!options(away).some(row => row.id.startsWith('express:')));
  assert.throws(() => choose(away, 'express:D-o0'), /not available/);
});

test('express consumes one invitation, settles arrival once, marks visitation and leaves only the destination bonus', () => {
  const state = worker('public', 'A'); tile(state, 'A', 'station');
  state.flags.push('invite'); state.s.money = 150; state.board.ledger = { 급여: 77 };
  const next = choose(frozen(state), 'express:D-o0');
  assert.equal(next.state.s.money, 77, 'fixed express fare, without the ordinary 300 toll');
  assert.deepEqual(next.state.board.ledger, {}); assert.equal(next.result.upkeep!.total, 77);
  assert.equal(next.state.board.pos, 'D-o0'); assert.equal(next.state.board.step, 'bonus');
  assert.equal(next.state.turn, state.turn); assert.equal(next.state.s.acts, 1);
  assert.equal(next.state.board.visited, state.board.visited | (1 << 3));
  assert.equal(next.state.board.lapAt.D, state.turn);
  assert.ok(!next.state.flags.includes('invite'));
  assert.deepEqual(next.result.move!.passed.start, ['D-o0']);
  assert.deepEqual(next.result.deltas, forecast(state, 'express:D-o0').branches[0].deltas);
  assert.deepEqual(choose(saved(state), 'express:D-o0'), next); saved(next.state);
  const city = choose(state, 'express:B-o0').state;
  assert.ok(city.flags.includes('invite'), 'ordinary destinations do not consume invitations');
  assert.ok(option(city, 'act:train_public').enabled, 'extra action uses city hall');
  assert.equal(choose(city, 'act:train_public').state.turn, state.turn + 1);
  assert.ok(!options(city).some(row => row.id.startsWith('home:') || row.id.startsWith('express:')));
});

test('express start allowance and job overlay cannot duplicate settlement or reopen a tile action', () => {
  const state = worker('service', 'B'); tile(state, 'B', 'station'); state.turn = 9;
  const jobless = quit(state); jobless.board.ledger = { pending: 123 };
  const next = choose(jobless, 'express:A-o0');
  assert.equal(next.state.s.money, jobless.s.money - 150 + 123 + 30);
  assert.ok(options(next.state).some(row => row.id === 'job:none'));
  const dismissed = choose(next.state, 'job:none').state;
  assert.equal(dismissed.board.step, 'bonus'); assert.deepEqual(dismissed.board.ledger, {});
  assert.equal(dismissed.s.money, next.state.s.money); saved(dismissed);
  assert.ok(!options(dismissed).some(row => row.id.startsWith('express:')));
});

test('new tables and transitions preserve read-only views and contain no fractional state', () => {
  const state = worker('creator'); state.s.fans = 999;
  const before = structuredClone(state);
  options(frozen(state)); derived(state); forecast(state, `act:${SPECIAL_RULES.videoId}`);
  assert.deepEqual(state, before);
  const next = close(state); saved(next);
  assert.equal(next.board.ledger[SPECIAL_TEXT.creatorIncome], 999);
  assert.equal(next.timers[CAREER_KEYS.season], next.turn);
});
