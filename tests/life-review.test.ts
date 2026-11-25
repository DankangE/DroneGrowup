import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, forecast, newGame, options, reachable as engineReachable, restore } from '../src/life/engine.ts';
import { advanceCareer, canPromote, demote, hire, performance, promote, quit, retire, review,
  special, yearEndReview } from '../src/life/jobs.ts';
import { CAREER_KEYS as K, careerIncome, careerSalary, promotionView, rankChange,
  retirementView, reviewNotice, specialView } from '../src/life/career2.ts';
import { applyMove, randInt, reachable } from '../src/life/move.ts';
import { TRACKS } from '../src/life/tracks.ts';
import { WORLD } from '../src/life/world.ts';
import type { GameState, MapId, StatMap, TrackId } from '../src/life/types.ts';

function worker(track: TrackId = 'service', rank = 0, stats: StatMap = {}): GameState {
  const state = choose(newGame(1), 'start:self').state;
  state.turn = 8; state.status = 'working'; state.track = track;
  state.job = { rank, perf: 50, tenure: 20, total: 32, warn: 0, changedAt: 0, tracks: [track] };
  Object.assign(state.s, { rank: Math.min(rank, 3), stamina: 100 }, stats);
  const maps = TRACKS.find(row => row.id === track)!.maps;
  tile(state, maps === 'any' ? 'A' : maps[0]);
  return state;
}
function tile(state: GameState, map: MapId, kind: 'rankup' | 'jobfair' = 'rankup'): void {
  state.board.pos = WORLD.find(node => node.map === map && node.kind === kind)!.id;
  state.board.step = 'space'; state.board.dice = [1, 1];
}
function age(state: GameState, years: number, season = 0): void {
  state.turn = (years - 19) * 4 + season;
  state.s.capStamina = years >= 60 ? 80 : years >= 50 ? 90 : 100;
  state.s.stamina = Math.min(state.s.stamina, state.s.capStamina);
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
function integers(value: unknown): void {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value), `${value}`);
  else if (value && typeof value === 'object') Object.values(value).forEach(integers);
}
function saved(state: GameState): GameState {
  integers(state);
  const loaded = restore(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(loaded, state); return loaded!;
}
function close(prev: GameState): GameState {
  const state = structuredClone(prev); state.turn++;
  return advanceCareer(state);
}

for (const [outcome, rank, perf, warn, expectedRank, expectedStatus] of [
  ['excellent', 1, 80, 0, 1, 'working'], ['normal', 1, 50, 1, 1, 'working'],
  ['warning', 1, 29, 0, 1, 'working'], ['demotion', 1, 29, 1, 0, 'working'],
  ['dismissal', 0, 29, 1, 0, 'jobless'],
] as const) {
  test(`review table: ${outcome}`, () => {
    const state = worker('service', rank, { xp: 100 }); state.job.perf = perf; state.job.warn = warn;
    const before = structuredClone(state), card = review(frozen(state)), next = yearEndReview(state);
    assert.equal(card.outcome, outcome); assert.equal(next.job.rank, expectedRank);
    assert.equal(next.status, expectedStatus); assert.equal(next.rng, state.rng);
    assert.equal(next.job.warn, outcome === 'warning' ? 1 : 0);
    assert.equal(next.s.money - state.s.money, outcome === 'excellent' ? 110 : 0);
    if (outcome === 'excellent') assert.equal(next.timers[K.bonus], 10);
    if (outcome === 'demotion') assert.equal(next.job.perf, 50);
    if (outcome === 'dismissal') {
      assert.equal(next.track, null); assert.equal(next.timers[K.benefitUntil], state.turn + 4);
    }
    assert.deepEqual(state, before); saved(next);
  });
}

test('warning thresholds, normal 30..79, and warning clearance at 50 have exact boundaries', () => {
  for (const [id, threshold] of [['service', 30], ['public', 20]] as const) {
    for (const [perf, outcome] of [[threshold - 1, 'warning'], [threshold, 'normal'], [79, 'normal'], [80, 'excellent']] as const) {
      const state = worker(id); state.job.perf = perf;
      assert.equal(review(state).outcome, outcome);
    }
    for (const perf of [threshold, 49, 50, 80]) {
      const state = worker(id); state.job.warn = 1; state.job.perf = perf;
      assert.equal(yearEndReview(state).job.warn, perf < 50 ? 1 : 0);
    }
  }
});

test('special promotion ignores requirements and two consecutive yearly misses demote', () => {
  const state = worker(); state.job.tenure = 0;
  const card = specialView(frozen(state));
  assert.ok(card.enabled); assert.ok(card.maintenance.includes('미달')); assert.ok(card.locks.some(row => row.includes('경험치')));
  let next = special(state);
  assert.equal(next.job.rank, 1); assert.equal(next.job.perf, 50); assert.equal(next.job.tenure, 0);
  assert.equal(next.job.total, 32); assert.equal(next.board.rankups, 1);
  next.turn = 12; next = yearEndReview(next);
  assert.equal(next.job.warn, 1); assert.equal(next.job.rank, 1);
  assert.deepEqual(yearEndReview(next), next, 'same winter cannot count as a second miss');
  next.turn = 16; const demoted = yearEndReview(saved(next));
  assert.equal(demoted.job.rank, 0); assert.equal(demoted.job.warn, 0); assert.equal(demoted.job.perf, 50);
  assert.equal(demoted.job.total, 32); assert.equal(rankChange(next, demoted)!.kind, 'demotion');
});

test('meeting maintenance after special promotion clears the warning and tenure is excluded', () => {
  let state = special(worker()); state.turn = 12; state = yearEndReview(state);
  state.s.xp = 100; state.turn = 16; state.job.tenure = 0;
  assert.equal(review(state).outcome, 'normal');
  const next = yearEndReview(state); assert.equal(next.job.rank, 1); assert.equal(next.job.warn, 0);
  next.turn = 20; next.s.xp = 99;
  assert.equal(yearEndReview(next).job.warn, 1, 'a later miss starts a new warning');
});

test('missing equipment, reputation and flags override excellent performance', () => {
  for (const [track, rank, stats, missing] of [
    ['inspector', 2, { skill: 330, xp: 630, gear: 2 }, '장비'],
    ['film', 1, { skill: 270, rep: 119 }, '평판'],
    ['engineer', 2, { theory: 320, xp: 480 }, '석사'],
  ] as const) {
    const state = worker(track, rank, stats); state.job.perf = 100;
    assert.equal(review(state).outcome, 'warning'); assert.ok(review(state).locks.some(row => row.includes(missing)));
    assert.equal(yearEndReview(state).s.money, state.s.money);
  }
});

test('bottom-rank dismissal pays exactly 60 for four following seasons, with no fifth accrual', () => {
  let state = worker(); state.job.warn = 1; state.job.perf = 0;
  state = yearEndReview(state); const dismissedAt = state.turn;
  for (let elapsed = 0; elapsed < 5; elapsed++) {
    assert.equal(careerIncome(state).unemployment, elapsed < 4 ? 60 : 0);
    state = close(saved(state));
    assert.equal(state.board.ledger['실업 급여'], Math.min(elapsed + 1, 4) * 60);
    assert.equal(state.turn, dismissedAt + elapsed + 1);
  }
  assert.equal(state.status, 'jobless'); assert.equal(state.timers[K.benefitUntil], undefined);
});

test('quitting grants no benefits; getting a new job ends remaining unemployment benefits', () => {
  assert.equal(careerIncome(quit(worker())).unemployment, 0);
  let state = demote(worker()); tile(state, 'A', 'jobfair');
  state = hire(state, 'service');
  assert.equal(state.timers[K.benefitUntil], undefined); assert.equal(careerIncome(state).unemployment, 0);
});

test('promotion gates include stats, equipment, tenure, map, tile, ceiling and employment', () => {
  const state = worker('inspector', 1, { skill: 330, xp: 630, gear: 3 }); state.job.tenure = 12;
  assert.ok(canPromote(state));
  for (const stat of ['skill', 'xp', 'gear'] as const) {
    const low = structuredClone(state); low.s[stat]--; assert.equal(canPromote(low), false);
  }
  const short = structuredClone(state); short.job.tenure = 11; assert.equal(canPromote(short), false);
  tile(short, 'A'); short.job.tenure = 12; assert.equal(canPromote(short), false);
  tile(short, 'D', 'jobfair'); assert.equal(canPromote(short), false);
  assert.equal(canPromote(worker('service', 3)), false); assert.equal(canPromote(quit(state)), false);
  assert.throws(() => promote(short), /promotion not available/);
  assert.ok(options(worker()).some(row => row.id === 'skip' && row.enabled));
  assert.ok(options(worker()).some(row => row.id === 'quit' && row.enabled));
});

test('movement stop callback checks the passed review node, not the origin map or tile', () => {
  const state = worker('service', 0, { xp: 100 });
  const rankup = WORLD.find(node => node.map === 'A' && node.kind === 'rankup')!;
  state.board.pos = WORLD.find(node => node.map === 'A' && node.next.includes(rankup.id))!.id;
  state.board.step = 'pick'; state.board.dice = [6, 6];
  assert.equal(canPromote(state), false); assert.ok(canPromote(state, rankup));
  const path = reachable(state, { canPromote }).find(move => move.stop === rankup.id)!;
  assert.ok(path); assert.equal(applyMove(state, path.node, { canPromote }).state.board.pos, rankup.id);
});

test('displayed, forecast and rolled promotion odds match at every clamp boundary, regardless of stamina', () => {
  for (const perf of [0, 29, 30, 50, 80, 95, 100]) {
    for (const stamina of [0, 19, 100]) {
      const outcomes = new Set<boolean>();
      for (let seed = 1; seed <= 20; seed++) {
        const state = worker('service', 0, { xp: 100, stamina }); state.rng = seed; state.job.perf = perf;
        const expected = Math.max(30, Math.min(95, perf)), before = structuredClone(state);
        const option = options(frozen(state)).find(row => row.id === 'promo')!, preview = forecast(state, 'promo');
        assert.equal(option.roll!.chance, expected); assert.equal(option.roll!.staminaPct, 0);
        assert.equal(preview.chance, expected); assert.equal(option.cost, 0); assert.equal(option.tire, 0);
        const rng = structuredClone(state), rolled = randInt(rng, 100), next = choose(state, 'promo');
        const success = rolled < expected; outcomes.add(success);
        assert.equal(next.result.roll!.success, success); assert.equal(next.result.roll!.value, rolled);
        assert.equal(next.state.rng, rng.rng); assert.equal(next.state.job.rank, success ? 1 : 0);
        assert.equal(next.state.job.perf, success ? 50 : Math.max(0, perf - 10));
        assert.equal(next.state.turn, state.turn); assert.equal(next.state.s.money, state.s.money);
        assert.equal(next.state.s.wins, state.s.wins); assert.equal(next.state.s.losses, state.s.losses);
        assert.equal(next.state.board.step, 'bonus'); assert.equal(next.state.job.total, 32);
        assert.deepEqual(promote(state).job, next.state.job); assert.equal(promote(state).rng, next.state.rng);
        assert.deepEqual(choose(saved(state), 'promo'), next); assert.deepEqual(state, before); saved(next.state);
        assert.deepEqual(next.result.deltas, preview.branches.find(row => row.id === (success ? 'success' : 'fail'))!.deltas);
        assert.throws(() => choose(next.state, 'promo'), /not available/);
      }
      if (perf === 50) assert.equal(outcomes.size, 2);
    }
  }
});

test('failed promotion blocks exactly four seasons; one-use excellent bonus is consumed by either outcome', () => {
  for (const seed of [1, 7]) {
    let state = worker('service', 0, { xp: 100 }); state.job.perf = 80;
    state = yearEndReview(state); state.job.perf = 50; state.rng = seed;
    assert.equal(promotionView(state).chance, 60);
    const next = promote(state); assert.equal(next.timers[K.bonus], undefined);
    if (next.job.rank !== 0) continue;
    assert.equal(next.job.perf, 40); assert.equal(next.timers[K.retry], state.turn + 4);
    for (let elapsed = 0; elapsed <= 4; elapsed++) {
      const later = structuredClone(next); later.turn += elapsed;
      assert.equal(canPromote(saved(later)), elapsed === 4);
    }
  }
  let state = worker('service', 0, { xp: 100 }); state.job.perf = 100;
  state = yearEndReview(state); assert.equal(promotionView(state).chance, 95);
  assert.deepEqual(yearEndReview(state), state, 'no duplicate bonus or cash at one winter');
});

test('rank changes reset performance/tenure/warning, preserve total tenure and mirror capped legacy rank', () => {
  const state = worker('employee', 3); state.job.perf = 99; state.job.warn = 1;
  const up = special(frozen(state));
  assert.equal(up.job.rank, 4); assert.equal(up.s.rank, 3); assert.equal(up.job.tenure, 0);
  assert.equal(up.job.total, 32); assert.equal(up.job.perf, 50); assert.equal(up.job.warn, 0);
  const down = demote(up); assert.equal(down.job.rank, 3); assert.equal(down.job.total, 32);
  assert.equal(rankChange(state, up)!.salaryDelta, 120); assert.equal(rankChange(up, down)!.salaryDelta, -120);
  assert.equal(rankChange(down, saved(down)), null);
  const top = worker('service', 3); assert.deepEqual(special(top), top);
  assert.ok(special(worker('instructor')).flags.includes('examiner'));
});

test('work, extra actions, contests and event changes use integral clamped performance', () => {
  const state = frozen(worker());
  for (const [source, expected] of [['workSuccess', 58], ['workFailure', 46], ['extra', 55], ['contest', 56]] as const) {
    const next = performance(state, source); assert.equal(next.job.perf, expected); saved(next);
  }
  assert.equal(performance(state, 999).job.perf, 100); assert.equal(performance(state, -999).job.perf, 0);
  for (const delta of [1.5, NaN, Infinity]) assert.throws(() => performance(state, delta), /integer/);
  const jobless = quit(state); assert.deepEqual(performance(jobless, 'workSuccess'), jobless);
});

test('choose applies work success/failure and extra-duty performance without rewarding study or skipping', () => {
  const outcomes = new Set<boolean>();
  for (let seed = 1; seed <= 30; seed++) {
    const state = worker('pilot', 0, { drone: 1, cond: 10 });
    state.rng = seed; state.board.pos = 'A-o2'; state.timers[K.idle] = 3;
    const next = choose(frozen(state), 'act:job_event');
    const success = next.result.roll!.success; outcomes.add(success);
    assert.equal(next.state.job.perf, success ? 58 : 46);
    assert.equal(next.state.timers[K.worked], state.turn + 1);
    assert.equal(next.state.timers[K.idle], 0);
    assert.equal(choose(next.state, 'end').state.job.perf, next.state.job.perf);
    assert.equal(choose(state, 'skip').state.job.perf, 50);
  }
  assert.deepEqual([...outcomes].sort(), [false, true]);
  const employee = worker('employee'); employee.board.pos = 'A-o2';
  assert.equal(choose(employee, 'act:emp_work').state.job.perf, 58, 'guaranteed work counts as success');
  employee.board.pos = WORLD.find(node => node.place === 'hq')!.id; employee.board.step = 'bonus';
  const extra = choose(employee, 'act:emp_work').state;
  assert.equal(extra.job.perf, 55); assert.equal(extra.turn, employee.turn + 1);
  assert.equal(extra.timers[K.worked], undefined); assert.equal(extra.timers[K.idle], 1);
  employee.board.pos = 'A-o3';
  assert.equal(choose(employee, 'act:self_study').state.job.perf, 50, 'unrelated extra action earns no performance');
});

test('choose awards contest performance only for a winning roll on a contest tile', () => {
  const outcomes = new Set<boolean>();
  for (let seed = 1; seed <= 20; seed++) {
    for (const node of ['A-o8', 'A-o5']) {
      const state = worker('pilot'); state.rng = seed;
      state.board.pos = node; state.phase = 'event'; state.eventId = 'grant';
      const next = choose(frozen(state), 'ev:0'), won = next.result.roll!.success;
      outcomes.add(won);
      const contest = node === 'A-o8' && won;
      assert.equal(next.state.job.perf, contest ? 56 : 50);
      assert.equal(next.state.board.contests, contest ? 1 : 0);
      assert.equal(next.state.timers[K.worked], undefined);
      assert.equal(choose(state, 'skip').state.job.perf, 50);
      assert.equal(choose(state, 'ev:1').state.job.perf, 50, 'a guaranteed event effect is not a victory');
    }
  }
  assert.deepEqual([...outcomes].sort(), [false, true]);
});

test('choose stops at the eligible review tile and returns its assessment without applying a yearly award', () => {
  for (const dice of [[1, 1], [6, 6]] as const) {
    const state = worker('service', 0, { xp: 100 }); state.job.perf = 80;
    state.board.pos = 'A-o8'; state.board.step = 'pick'; state.board.dice = [...dice];
    const move = engineReachable(state)[0];
    assert.ok(options(state).some(row => row.id === `go:${move.node}`));
    const next = choose(frozen(state), `go:${move.node}`);
    assert.equal(next.state.board.pos, 'A-o9');
    assert.equal(next.result.move?.stop, dice[0] === 6 ? 'A-o9' : undefined);
    assert.deepEqual(next.result.review, review(state));
    assert.ok(next.result.notes.includes('우수'));
    assert.equal(next.state.s.money, state.s.money, 'arrival does not pay the year-end bonus');
    assert.equal(next.state.timers[K.reviewed], undefined);
    assert.ok(options(next.state).some(row => row.id === 'promo' && row.enabled));
    assert.equal(choose(next.state, 'promo').state.board.step, 'bonus');
  }
});

test('four consecutive unworked seasons start -3 each season; failed work resets the streak', () => {
  let state = worker(); state.turn = 8;
  for (const perf of [50, 50, 50, 47, 44]) { state = close(state); assert.equal(state.job.perf, perf); }
  state = performance(state, 'workFailure'); assert.equal(state.job.perf, 40);
  state = close(state); assert.equal(state.job.perf, 40); assert.equal(state.timers[K.idle], 0);
  state = performance(state, 'extra');
  for (const perf of [45, 45, 45, 42]) { state = close(state); assert.equal(state.job.perf, perf); }
  assert.equal(state.job.total, 42); assert.equal(state.job.tenure, 30);
  assert.deepEqual(advanceCareer(state), state, 'one accrual per completed season');
});

test('exhaustion is checked below 20 before refill and can stack with inactivity', () => {
  for (const [stamina, expected] of [[19, 47], [20, 50]]) {
    const state = worker('service', 0, { stamina }); state.board.step = 'bonus';
    const next = choose(state, 'end').state;
    assert.equal(next.job.perf, expected); assert.equal(next.job.total, 33);
    assert.equal(next.s.stamina, stamina + 20);
  }
  const state = worker('service', 0, { stamina: 19 }); state.timers[K.idle] = 3;
  assert.equal(close(state).job.perf, 44);
});

test('year-end review runs at the winter/spring boundary only and is idempotent', () => {
  for (const turn of [0, 1, 2, 3, 5]) {
    const state = worker(); state.turn = turn; state.job.perf = 80;
    assert.deepEqual(yearEndReview(state), state);
  }
  const state = worker('service', 0); state.turn = 11; state.job.perf = 80; state.board.step = 'bonus';
  const next = choose(state, 'end').state;
  assert.equal(next.turn, 12); assert.equal(next.s.money, state.s.money + 70);
  assert.equal(next.timers[K.bonus], 10); assert.deepEqual(yearEndReview(next), next);
});

for (const [track, rank, stats] of [
  ['pilot', 2, { rep: 105, flights: 80 }], ['creator', 2, { fans: 300 }],
  ['racer', 1, { skill: 330 }], ['solo', 1, { contracts: 6, rep: 105 }],
  ['company', 1, { round: 1 }], ['academy', 1, { students: 16 }], ['director', 1, { support: 60 }],
] as const) {
  test(`${track}: no salary evaluation, annual rank recomputation and one year grace`, () => {
    let state = worker(track, 0, stats); state.board.contests = track === 'racer' ? 5 : 0; state.job.perf = 0;
    assert.equal(review(state).outcome, 'promotion');
    state = yearEndReview(state); assert.equal(state.job.rank, rank); assert.equal(state.s.money, 800);
    for (const key of Object.keys(stats)) state.s[key as keyof StatMap] = 0;
    state.board.contests = 0; state.turn += 4;
    state = yearEndReview(state); assert.equal(state.job.rank, rank); assert.equal(state.job.warn, 1);
    state.turn += 4; state = yearEndReview(state);
    assert.equal(state.job.rank, 0); assert.equal(state.status, 'working'); assert.equal(state.job.warn, 0);
    assert.equal(careerIncome(state).unemployment, 0); saved(state);
  });
}

test('independent careers clear the grace warning on recovery regardless of performance', () => {
  let state = worker('creator', 2, { fans: 299 }); state = yearEndReview(state);
  assert.equal(state.job.warn, 1); state.turn += 4; state.s.fans = 300; state.job.perf = 0;
  assert.equal(yearEndReview(state).job.warn, 0);
  const racer = worker('racer', 0, { wins: 999, skill: 330 });
  assert.equal(review(racer).outcome, 'normal'); assert.equal(yearEndReview(racer).job.rank, 0);
});

test('60-year spring offers pension, rehire and switch; salaried retirement never ends the run', () => {
  const state = worker('service', 3); age(state, 59, 3);
  assert.equal(retirementView(state).due, false); assert.throws(() => retire(state), /not available/);
  state.board.step = 'bonus'; const next = choose(state, 'end').state;
  assert.equal(retirementView(next).due, true);
  assert.deepEqual(options(next).map(row => row.id), ['retire:pension', 'retire:rehire', 'retire:switch', 'job:none']);
  for (const mode of ['pension', 'rehire', 'switch'] as const) {
    const result = choose(frozen(next), `retire:${mode}`), preview = forecast(next, `retire:${mode}`);
    assert.equal(result.state.turn, next.turn); assert.equal(result.state.phase, 'action');
    assert.equal(result.state.ending, null); assert.equal(result.state.rng, next.rng);
    assert.deepEqual(result.result.deltas, preview.branches[0].deltas);
    assert.deepEqual(choose(saved(next), `retire:${mode}`), result); saved(result.state);
  }
});

test('review popups report missing maintenance and have a free exit that preserves the current board step', () => {
  const state = special(worker()); state.turn = 12;
  const next = yearEndReview(state), notice = reviewNotice(frozen(next))!;
  assert.equal(notice.title, '경고'); assert.ok(notice.text.includes('경험치'));
  const offered = options(next); assert.deepEqual(offered.map(row => row.id), ['job:none']);
  assert.equal(offered[0].title, '그냥 지나간다'); assert.ok(offered[0].enabled); assert.equal(offered[0].cost, 0);
  const closed = choose(saved(next), 'job:none').state;
  assert.equal(reviewNotice(closed), null); assert.equal(closed.turn, next.turn);
  assert.equal(closed.board.step, next.board.step); assert.equal(closed.rng, next.rng); saved(closed);
});

test('retirement popup permits one season of deferral then automatically grants a pension', () => {
  const state = worker(); age(state, 60);
  const next = choose(frozen(state), 'job:none').state;
  assert.equal(next.track, state.track); assert.equal(next.s.money, state.s.money);
  assert.equal(next.turn, state.turn); assert.ok(options(next).some(row => row.id === 'skip' && row.enabled));
  const later = close(next);
  assert.equal(later.status, 'retired'); assert.equal(careerIncome(later).pension, 21);
  assert.ok(options(later).every(row => !row.id.startsWith('retire:'))); saved(next);
});

test('severance uses base salary times total seasons divided by eight, floored; pension uses track percentage', () => {
  for (const [track, rank, salary, severance, pension] of [
    ['service', 3, 230, 373, 69], ['public', 0, 115, 186, 57],
  ] as const) {
    const state = worker(track, rank); age(state, 60); state.job.total = 13; state.job.tenure = 1;
    const view = retirementView(frozen(state));
    assert.equal(view.salary, salary); assert.equal(view.severance, severance); assert.equal(view.pension, pension);
    const next = retire(state); assert.equal(next.s.money, state.s.money + severance);
    assert.equal(next.status, 'retired'); assert.equal(next.track, null);
    assert.equal(careerIncome(next).pension, pension); assert.equal(close(next).board.ledger['연금'], pension);
    assert.throws(() => retire(next), /not available/); saved(next);
  }
});

test('rehire pays 60%, prevents both promotion paths, defers severance and ends at 65', () => {
  const state = worker('service', 1, { xp: 210, net: 30 }); age(state, 60); state.job.total = 13;
  const next = retire(state, 'rehire');
  assert.equal(next.s.money, state.s.money); assert.equal(careerSalary(next), 66);
  assert.equal(canPromote(next), false); assert.deepEqual(special(next), next);
  assert.equal(retirementView(next).due, false);
  age(next, 64, 3); next.board.step = 'bonus';
  const ended = choose(next, 'end').state;
  assert.equal(ended.status, 'retired'); assert.equal(ended.turn, (65 - 19) * 4);
  assert.equal(ended.s.money, next.s.money + Math.floor(110 * 14 / 8));
  assert.equal(careerIncome(ended).pension, 33); saved(ended);
  const old = worker(); age(old, 65); assert.throws(() => retire(old, 'rehire'), /not available/);
});

test('switch pays severance, opens job offers and allows store work without repeating retirement', () => {
  const state = worker(); age(state, 60); state.job.total = 8;
  let next = choose(state, 'retire:switch').state;
  assert.equal(next.s.money, state.s.money + 70); assert.equal(next.status, 'jobless');
  assert.equal(careerIncome(next).pension, 0); assert.ok(options(next).some(row => row.id === 'job:none'));
  next = choose(next, 'job:service').state;
  assert.equal(next.status, 'working'); assert.equal(retirementView(next).due, false);
  assert.ok(options(next).every(row => !row.id.startsWith('retire:'))); saved(next);
});

test('independent tracks have no age-60 retirement even when sponsorship or director pay is positive', () => {
  for (const track of ['pilot', 'creator', 'solo', 'company', 'academy', 'director'] as const) {
    const state = worker(track); age(state, 60);
    assert.equal(retirementView(state).due, false); assert.throws(() => retire(state), /not available/);
  }
});

test('racer loses 15 after each completed year aged 40+, retires at 45 and can enter instructor rank one', () => {
  const state = worker('racer'); age(state, 40); assert.equal(yearEndReview(state).job.perf, 50);
  age(state, 41); assert.equal(yearEndReview(state).job.perf, 35);
  age(state, 44, 3); assert.equal(retirementView(state).due, false);
  state.board.step = 'bonus'; const retired = choose(state, 'end').state;
  assert.equal(retired.status, 'retired'); assert.ok(retired.flags.includes(K.coach));
  assert.equal(retired.s.money, state.s.money); assert.equal(careerIncome(retired).pension, 0);
  tile(retired, 'A', 'jobfair'); const coach = hire(saved(retired), 'instructor');
  assert.equal(coach.track, 'instructor'); assert.equal(coach.job.rank, 1); assert.equal(coach.job.perf, 50);
  assert.ok(coach.flags.includes('examiner')); saved(coach);
});

test('job changes clear old promotion waits, bonuses, absence and rehire rate', () => {
  const state = worker('service', 1); state.timers[K.retry] = state.turn + 4;
  state.timers[K.bonus] = 10; state.timers[K.idle] = 9; state.flags.push(K.rehire);
  state.s.theory = 30; tile(state, 'A', 'jobfair');
  const next = hire(state, 'mechanic');
  for (const key of [K.retry, K.bonus, K.idle]) assert.equal(next.timers[key], undefined);
  assert.equal(next.flags.includes(K.rehire), false); assert.equal(careerSalary(next), 100);
});

test('career views are detached, pure and restore/replay retains all job-local counters', () => {
  const state = worker('service', 1, { xp: 100 }); state.job.warn = 1; state.job.perf = 29;
  const before = structuredClone(state), next = yearEndReview(frozen(state));
  const card = rankChange(state, frozen(next))!;
  assert.equal(card.kind, 'demotion'); assert.equal(card.from.title, '정직원'); assert.equal(card.to.title, '알바');
  card.from.title = 'changed'; card.maintenance.push('changed');
  assert.deepEqual(state, before); assert.deepEqual(yearEndReview(saved(before)), next);
  assert.equal(rankChange(state, next)!.from.title, '정직원'); saved(next);
});

const nodes = new Map(WORLD.map(node => [node.id, node]));
function districtDistance(from: string): number {
  const queue: [string, number][] = [[from, 0]], seen = new Set<string>();
  for (const [id, distance] of queue) {
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.get(id)!;
    if (node.map === 'D' && node.kind === 'jobfair') return distance;
    for (const next of [...node.next, ...(node.cross ?? []).map(row => row.to)]) queue.push([next, distance + 1]);
  }
  return WORLD.length;
}

// A player policy: inspect legal options/routes, train, apply, work, and accept retirement.
// All state transitions below go through choose; no fixture ages, stats, dice, or job mutations.
function careerChoice(state: GameState, career: 'instructor' | 'racer'): string {
  const enabled = options(state).filter(row => row.enabled);
  const trained = state.s.xp >= 270 && (career === 'instructor' || state.s.skill >= 270);
  const priority = state.status === 'student'
    ? ['start:school', ...(trained ? ['act:st_exam'] : []), ...(state.s.theory < 180 ? ['act:st_theory'] : []),
      'act:st_flight', 'act:st_assist', 'act:st_parttime', 'act:st_sim']
    : ['retire:pension', `job:${career}`, 'promo', 'act:inst_teach', 'act:pi_assist', 'act:pi_repair_gig'];
  const preferred = priority.find(id => enabled.some(row => row.id === id));
  if (preferred) return preferred;
  if (state.board.step === 'pick') {
    const district = career === 'racer' && state.status !== 'student';
    const moves = engineReachable(state).filter(move => district || nodes.get(move.stop ?? move.node)!.map === 'A');
    const score = (move: (typeof moves)[number]) => {
      const node = nodes.get(move.stop ?? move.node)!;
      if (district) return -districtDistance(node.id);
      if (move.stop) return 20;
      if (state.track === 'instructor') return node.kind === 'job' ? 15 : node.kind === 'train' ? 12 : node.kind === 'rankup' ? 10 : 0;
      if (state.track === 'pilot') return node.kind === 'jobfair' ? 20 : node.kind === 'job' ? 10 : 0;
      if (state.status === 'student') {
        if (trained && state.s.skill >= 90 && state.s.theory >= 90 && state.s.money >= 600 && node.place === 'exam') return 20;
        return node.kind === 'train' ? 15 : node.kind === 'job' ? 10 : 0;
      }
      return 0;
    };
    moves.sort((a, b) => score(b) - score(a));
    if (moves.length) return `go:${moves[0].node}`;
  }
  return (enabled.find(row => ['job:none', 'skip', 'end', 'spin'].includes(row.id)) ?? enabled[0]).id;
}

for (const career of ['instructor', 'racer'] as const) {
  test(`seed 1 reaches ${career} review and retirement through choose alone and finishes 204 seasons`, t => {
    let state = newGame(1), picks = 0, promotions = 0, stops = 0, bonuses = 0, years = 0;
    let retiredAt: number | undefined;
    while (state.phase !== 'ended') {
      assert.ok(picks++ < 204 * 7, 'career run must keep progressing');
      const id = careerChoice(state, career);
      if (id === 'retire:pension') {
        assert.equal(state.turn, 164, 'age 60 spring is reachable in play');
        assert.deepEqual(options(state).map(row => row.id), ['retire:pension', 'retire:rehire', 'retire:switch', 'job:none']);
        const rehire = choose(state, 'retire:rehire').state, switched = choose(state, 'retire:switch').state;
        assert.equal(rehire.status, 'working'); assert.ok(rehire.flags.includes(K.rehire));
        assert.equal(rehire.s.money, state.s.money);
        assert.equal(switched.status, 'jobless'); assert.ok(switched.flags.includes(K.switched));
        assert.equal(switched.s.money - state.s.money, Math.floor(careerSalary(state) * state.job.total / 8));
      }
      const next = choose(state, id);
      integers(next.state);
      if (next.result.move?.stop) {
        stops++;
        assert.equal(next.state.board.pos, next.result.move.stop);
        assert.ok(next.result.review);
        assert.ok(options(next.state).some(row => row.id === 'promo' && row.enabled));
      }
      if (id === 'promo') {
        assert.equal(next.result.roll!.chance, options(state).find(row => row.id === id)!.roll!.chance);
        if (next.result.roll!.success) { promotions++; assert.equal(next.state.job.rank, state.job.rank + 1); }
      }
      if (next.state.turn !== state.turn && next.state.turn % 4 === 0) {
        years++;
        assert.equal(next.state.timers[K.reviewed], next.state.turn);
        if (state.track === 'instructor' && next.state.job.perf >= 80 && next.state.turn < 204) {
          bonuses++;
          assert.equal(next.state.s.money - state.s.money, careerSalary(state));
          assert.equal(next.state.timers[K.bonus], 10);
        }
      }
      if (state.status !== 'retired' && next.state.status === 'retired') {
        retiredAt = next.state.turn;
        if (career === 'racer') assert.ok(next.state.flags.includes(K.coach));
        else assert.equal(next.state.timers[K.pension], Math.floor(careerSalary(state) * 30 / 100));
      }
      if (id === 'promo' || id.startsWith('retire:') || next.result.move?.stop) {
        assert.deepEqual(choose(saved(state), id), next, 'save/replay preserves career transitions');
      }
      state = next.state;
    }
    assert.equal(state.turn, 204); assert.equal(state.status, 'retired'); assert.equal(years, 51);
    assert.ok(state.job.tracks.includes(career));
    assert.equal(retiredAt, career === 'instructor' ? 164 : 104);
    if (career === 'instructor') assert.ok(promotions > 0 && stops > 0 && bonuses > 0);
    t.diagnostic(`${career}: ${promotions} promotions, ${stops} review stops, ${bonuses} excellent bonuses, ${years} year-end reviews; retirement turn ${retiredAt}; 204 seasons`);
  });
}
