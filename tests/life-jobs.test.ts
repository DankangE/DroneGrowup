import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRADE_STEPS } from '../src/game/data.ts';
import { choose, forecast, newGame, options, restore } from '../src/life/engine.ts';
import { afterStartPass, entryChance, hire, jobOffers, openJobOffers, quit } from '../src/life/jobs.ts';
import { JOB_RULES, TRACKS } from '../src/life/tracks.ts';
import { WORLD } from '../src/life/world.ts';
import type { Cond, GameState, MapId, Stat, StatMap, TrackId } from '../src/life/types.ts';

function at(map: MapId = 'F', stats: StatMap = {}, flags: string[] = []): GameState {
  const state = choose(newGame(1), 'start:self').state;
  state.turn = 8; state.board.step = 'space'; state.board.dice = [1, 1];
  state.board.pos = WORLD.find(node => node.map === map && node.kind === 'jobfair')!.id;
  Object.assign(state.s, stats); state.flags.push(...flags);
  return state;
}
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
function integers(value: unknown): void {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value), `${value}`);
  else if (value && typeof value === 'object') Object.values(value).forEach(integers);
}
const offer = (state: GameState, id: TrackId) => jobOffers(state).find(row => row.track.id === id);
type Fixture = { id: TrackId; map: MapId; stats?: StatMap; flags?: string[]; short?: Stat | string };
// Independent boundary fixtures: remove one actual entry requirement, then add a hiring-wait violation.
// service has no entry requirement, so its one-short case uses the shared retired-status gate.
const FIXTURES: Fixture[] = [
  { id: 'service', map: 'F' },
  { id: 'delivery', map: 'C', stats: { car: 1 }, short: 'car' },
  { id: 'mechanic', map: 'A', stats: { theory: 30 }, short: 'theory' },
  { id: 'clerk', map: 'B', stats: { theory: 60 }, short: 'theory' },
  { id: 'pilot', map: 'F', flags: ['licensed'], short: 'licensed' },
  { id: 'employee', map: 'B', stats: { xp: 270, theory: 60 }, flags: ['licensed'], short: 'xp' },
  { id: 'instructor', map: 'A', stats: { xp: 270, theory: 90 }, flags: ['licensed'], short: 'xp' },
  { id: 'public', map: 'B', stats: { theory: 150 }, short: 'theory' },
  { id: 'rescue', map: 'C', stats: { skill: 150 }, flags: ['licensed'], short: 'skill' },
  { id: 'creator', map: 'F', stats: { drone: 1, gear: 1 }, short: 'gear' },
  { id: 'engineer', map: 'D', stats: { theory: 180 }, flags: ['degree'], short: 'theory' },
  { id: 'inspector', map: 'D', stats: { skill: 225, drone: 3, gear: 2 }, flags: ['licensed'], short: 'skill' },
  { id: 'film', map: 'D', stats: { skill: 225, rep: 105, drone: 4 }, flags: ['licensed'], short: 'skill' },
  { id: 'atc', map: 'D', stats: { theory: 180 }, flags: ['licensed'], short: 'theory' },
  { id: 'racer', map: 'D', stats: { skill: 270 }, short: 'skill' },
  { id: 'solo', map: 'F', stats: { rep: 15, drone: 2, car: 1, gear: 1 }, flags: ['licensed'], short: 'rep' },
  { id: 'company', map: 'F', stats: { biz: 60, rep: 60, drone: 3, gear: 2, money: 1500, car: 1 },
    flags: ['licensed'], short: 'biz' },
  { id: 'academy', map: 'F', stats: { teach: 150, rep: 75, money: 2800 }, flags: ['examiner'], short: 'teach' },
  { id: 'director', map: 'F', stats: { net: 100, rep: 75 }, flags: ['member'], short: 'net' },
];
function fixture(row: Fixture, shortages: number): GameState {
  const state = at(row.map, row.stats, row.flags);
  if (shortages > 0) {
    if (!row.short) state.status = 'retired';
    else if (row.short in state.s) state.s[row.short as Stat]--;
    else state.flags = state.flags.filter(flag => flag !== row.short);
  }
  if (shortages > 1) state.job.changedAt = state.turn;
  return state;
}
for (const row of FIXTURES) {
  test(`${row.id}: conditions met = candidate (management = guidance)`, () => {
    const state = frozen(fixture(row, 0)), found = offer(state, row.id);
    assert.ok(found, row.id); assert.deepEqual(found.locked, []);
    assert.equal(found.guidance, ['solo', 'company', 'academy', 'director'].includes(row.id));
    integers(found);
  });
  test(`${row.id}: one condition short = locked with a reason`, () => {
    const found = offer(frozen(fixture(row, 1)), row.id);
    assert.ok(found, row.id); assert.equal(found.locked.length, 1);
    assert.ok(found.locked[0].length > 0);
  });
  test(`${row.id}: two conditions short = absent`, () => {
    assert.equal(offer(frozen(fixture(row, 2)), row.id), undefined);
  });
}

test('all 19 salary ladders, review maps and minimum tenures match section 6.1', () => {
  const expected = [
    ['service', ['A', 'B', 'F'], [70, 110, 160, 230], [0, 4, 8, 12]],
    ['delivery', ['A', 'C', 'E'], [90, 130, 185, 270], [0, 4, 8, 12]],
    ['mechanic', ['A', 'C'], [100, 150, 210, 290, 400], [0, 4, 8, 12, 16]],
    ['clerk', ['B', 'E'], [110, 160, 230, 330, 480], [0, 6, 10, 14, 16]],
    ['pilot', 'any', [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
    ['employee', ['B', 'E'], [130, 180, 250, 340, 460, 620], [0, 6, 10, 14, 16, 16]],
    ['instructor', ['A', 'B'], [120, 180, 260, 350], [0, 6, 12, 16]],
    ['public', ['B'], [115, 150, 200, 270, 360], [0, 10, 14, 16, 16]],
    ['rescue', ['C'], [140, 190, 260, 360], [0, 8, 12, 16]],
    ['creator', 'any', [0, 0, 0, 0], [0, 0, 0, 0]],
    ['engineer', ['D'], [200, 280, 390, 540, 760], [0, 8, 12, 12, 16]],
    ['inspector', ['D'], [190, 270, 380, 520], [0, 8, 12, 16]],
    ['film', ['D'], [180, 270, 400, 600], [0, 8, 12, 16]],
    ['atc', ['D'], [170, 240, 330, 450], [0, 8, 12, 16]],
    ['racer', ['D'], [100, 220, 450, 800], [0, 0, 0, 0]],
    ['solo', 'any', [0, 0, 0], [0, 0, 0]], ['company', 'any', [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
    ['academy', 'any', [0, 0, 0, 0], [0, 0, 0, 0]], ['director', 'any', [80, 140, 400], [0, 0, 0]],
  ];
  assert.deepEqual(TRACKS.map(track => [track.id, track.maps, track.ranks.map(row => row.salary),
    track.ranks.map(row => row.tenure)]), expected);
  const check = (cond: Cond) => {
    for (const [stat, value] of Object.entries(cond.min ?? {})) {
      const grades = GRADE_STEPS[stat as keyof typeof GRADE_STEPS];
      if (grades) assert.ok(grades.includes(value), `${stat}=${value}`);
    }
    cond.any?.forEach(check);
  };
  for (const track of TRACKS) { check(track.entry); track.ranks.forEach(row => check(row.need)); }
  assert.equal(TRACKS.find(track => track.id === 'public')!.pensionPct, 50);
  assert.equal(TRACKS.find(track => track.id === 'public')!.warnBelow, 20);
  assert.deepEqual(TRACKS.find(track => track.id === 'pilot')!.ranks.map(row => row.jobPct), [100, 115, 130, 150, 175]);
  assert.deepEqual(TRACKS.find(track => track.id === 'racer')!.ranks.map(row => row.jobPct), [100, 150, 200, 300]);
});

test('offer lists are deterministic, salary sorted and bounded at six candidates plus two locks on every map', () => {
  let hitSix = false, hitTwo = false;
  for (const map of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
    for (const rich of [false, true]) {
      const state = at(map, rich ? { money: 10000, theory: 320, skill: 330, xp: 870, rep: 180,
        teach: 300, net: 260, biz: 260, car: 3, drone: 5, gear: 3, flights: 250, fans: 600 } : {},
      rich ? ['licensed', 'degree', 'examiner', 'member'] : []);
      const before = structuredClone(state), list = jobOffers(frozen(state));
      const ready = list.filter(row => !row.locked.length), locked = list.filter(row => row.locked.length);
      assert.ok(ready.length <= 6); assert.ok(locked.length <= 2);
      hitSix ||= ready.length === 6; hitTwo ||= locked.length === 2;
      for (const group of [ready, locked]) {
        const salary = group.map(row => row.track.ranks[row.rank].salary);
        assert.deepEqual(salary, [...salary].sort((a, b) => b - a));
      }
      assert.deepEqual(jobOffers(state), list); assert.deepEqual(state, before);
    }
  }
  assert.ok(hitSix); assert.ok(hitTwo);
});

test('clerk entry accepts either a degree or theory E; lacking both counts as one missing condition', () => {
  for (const [theory, flags, count] of [[59, [], 1], [60, [], 0], [0, ['degree'], 0]] as const) {
    assert.equal(offer(at('B', { theory }, [...flags]), 'clerk')!.locked.length, count);
  }
});

test('review maps filter offers and specialist entry requires the district jobfair unless an event opens it', () => {
  const state = at('D', { theory: 180 }, ['degree']);
  assert.ok(offer(state, 'engineer')); assert.equal(offer(state, 'service'), undefined);
  assert.equal(offer(state, 'clerk'), undefined);
  state.board.pos = 'D-o0';
  assert.equal(offer(state, 'engineer'), undefined);
  assert.throws(() => hire(state, 'engineer'), /job not available/);
  assert.ok(jobOffers(openJobOffers(state)).some(row => row.track.id === 'engineer'));
  state.board.pos = 'A-o18';
  assert.equal(offer(state, 'engineer'), undefined);
});

test('entry pay is integer map-adjusted salary and cards contain the ladder and next requirements', () => {
  assert.equal(offer(at('A'), 'service')!.pay, 63);
  assert.equal(offer(at('B', { theory: 60 }), 'clerk')!.pay, 121);
  assert.equal(offer(at('E', { theory: 60 }), 'clerk')!.pay, 143);
  assert.equal(offer(at('E', { car: 1 }), 'delivery')!.pay, 90);
  assert.equal(offer(at('D', { theory: 180 }, ['degree']), 'engineer')!.pay, 300);
  const option = options(at('A')).find(row => row.id === 'job:service')!;
  for (const text of ['알바', '정직원', '매니저', '점장', '70만원', '63만원', '경험치', '재직 4계절']) {
    assert.ok(option.desc.includes(text), text);
  }
});

test('hire resets job-local counters, keeps history and assets, and mirrors the accepted rank', () => {
  const state = at('A', { money: 700, xp: 100 });
  state.status = 'working'; state.track = 'pilot';
  state.job = { rank: 3, perf: 90, tenure: 20, total: 70, warn: 1, changedAt: 4, tracks: ['pilot'] };
  state.home = { map: 'A', tier: 1, deposit: 100 };
  const before = structuredClone(state), next = hire(frozen(state), 'service');
  assert.deepEqual(state, before); assert.equal(next.status, 'working'); assert.equal(next.track, 'service');
  assert.deepEqual(next.job, { rank: 1, perf: 50, tenure: 0, total: 0, warn: 0, changedAt: 8, tracks: ['pilot', 'service'] });
  assert.equal(next.s.rank, 1); assert.equal(next.s.money, 700); assert.deepEqual(next.home, state.home);
  assert.equal(next.rng, state.rng); assert.equal(next.turn, state.turn);
  assert.equal(offer(next, 'service'), undefined); assert.throws(() => hire(next, 'service'));
  integers(next); assert.deepEqual(restore(JSON.parse(JSON.stringify(next))), next);
});

test('career recognition ignores tenure, starts at zero below the boundary and caps ordinary entry at one', () => {
  for (const [xp, rank] of [[99, 0], [100, 1], [999, 1]]) {
    const state = at('A', { xp, net: 260, biz: 260 });
    assert.equal(offer(state, 'service')!.rank, rank);
    assert.equal(hire(state, 'service').job.rank, rank);
  }
  const state = at('A', { theory: 60, skill: 44 });
  assert.equal(hire(state, 'mechanic').job.rank, 0);
  state.s.skill = 45; assert.equal(hire(state, 'mechanic').job.rank, 1);
});

test('headhunter accepts the highest qualified rank up to the old rank and bypasses only the wait', () => {
  const state = at('B', { xp: 480, net: 150, biz: 105, theory: 60 });
  state.status = 'working'; state.track = 'service'; state.job.rank = 3; state.job.changedAt = state.turn;
  assert.equal(jobOffers(state, 'headhunter').find(row => row.track.id === 'clerk')!.rank, 3);
  assert.equal(hire(state, 'clerk', 'headhunter').job.rank, 3);
  state.s.biz = 104;
  assert.equal(hire(state, 'clerk', 'headhunter').job.rank, 2);
  state.s.theory = 59;
  assert.throws(() => hire(state, 'clerk', 'headhunter'), /job not available/);
  state.s.theory = 60; state.job.rank = 0;
  assert.equal(hire(state, 'clerk', 'headhunter').job.rank, 0);
});

test('recognised instructor qualification and high headhunter ranks survive save/restore', () => {
  const candidate = at('A', { xp: 270, theory: 180, teach: 105 }, ['licensed']);
  const instructor = hire(candidate, 'instructor');
  assert.equal(instructor.job.rank, 1); assert.ok(instructor.flags.includes('examiner'));
  assert.equal(forecast(candidate, 'job:instructor').branches[0].flag, 'examiner');
  assert.equal(choose(candidate, 'job:instructor').result.flag, 'examiner');
  const state = at('B', { theory: 60, xp: 870, net: 260, biz: 200 });
  state.status = 'working'; state.track = 'employee'; state.job.rank = 5;
  const clerk = hire(state, 'clerk', 'headhunter');
  assert.equal(clerk.job.rank, 4); assert.equal(clerk.s.rank, 3, 'legacy rank alias stays inside its old save bound');
  assert.deepEqual(restore(JSON.parse(JSON.stringify(clerk))), clerk);
});

test('racer recognition uses contest wins, never generic action/test successes', () => {
  const state = at('D', { skill: 330, wins: 999 });
  assert.equal(offer(state, 'racer')!.rank, 0);
  state.board.contests = 5;
  assert.equal(offer(state, 'racer')!.rank, 1);
});

test('four-season wait locks at 0..3, unlocks at 4, survives quitting, and events can bypass it', () => {
  const base = hire(at('A', { car: 1 }), 'service');
  for (let elapsed = 0; elapsed <= 4; elapsed++) {
    const state = structuredClone(base); state.turn += elapsed;
    assert.equal(offer(state, 'delivery')!.locked.length, elapsed < 4 ? 1 : 0);
    if (elapsed < 4) assert.throws(() => hire(state, 'delivery'));
    else assert.equal(hire(state, 'delivery').track, 'delivery');
    const left = quit(frozen(state));
    assert.equal(left.job.changedAt, base.turn);
    assert.equal(offer(left, 'delivery')!.locked.length, elapsed < 4 ? 1 : 0);
  }
  assert.equal(hire(base, 'delivery', 'event').track, 'delivery');
  const event = openJobOffers(base);
  assert.equal(options(event).find(row => row.id === 'job:delivery')!.enabled, true);
  assert.equal(choose(event, 'job:delivery').state.track, 'delivery');
});

test('quit is always enabled on jobfair and review tiles, preserves assets and leaves a way out', () => {
  for (const kind of ['jobfair', 'rankup'] as const) {
    const state = hire(at('A'), 'service');
    state.board.pos = WORLD.find(node => node.map === 'A' && node.kind === kind)!.id;
    const before = structuredClone(state), option = options(frozen(state)).find(row => row.id === 'quit')!;
    assert.ok(option.enabled); assert.equal(option.cost, 0); assert.equal(option.tire, 0);
    const next = choose(state, 'quit').state;
    assert.deepEqual(state, before); assert.equal(next.status, 'jobless'); assert.equal(next.track, null);
    assert.equal(next.job.rank, 0); assert.equal(next.job.perf, 0); assert.equal(next.job.tenure, 0);
    assert.equal(next.job.total, 0); assert.equal(next.job.warn, 0); assert.equal(next.s.money, state.s.money);
    assert.equal(next.job.changedAt, state.turn); assert.deepEqual(next.job.tracks, ['service']);
    assert.equal(next.board.step, 'bonus'); assert.ok(options(next).some(row => row.id === 'end'));
    assert.equal(next.turn, state.turn);
  }
});

test('management cards only provide guidance; hire and choose cannot bypass place actions', () => {
  for (const row of FIXTURES.slice(-4)) {
    const state = fixture(row, 0), option = options(state).find(option => option.id === `job:${row.id}`)!;
    assert.ok(option.title.includes('창업 안내')); assert.equal(option.enabled, false);
    assert.ok(option.locks.some(lock => lock.includes('해당 장소')));
    assert.throws(() => hire(state, row.id)); assert.throws(() => choose(state, option.id), /disabled/);
    assert.ok(options(state).find(option => option.id === 'job:none')!.enabled);
  }
});

test('start choices happen once, cost no season, use 500 initial money and preserve seeded RNG', () => {
  const state = frozen(newGame(12));
  assert.deepEqual(options(state).map(row => row.id), ['start:school', 'start:work', 'start:self']);
  assert.equal(state.s.money, 500); assert.deepEqual(restore(JSON.parse(JSON.stringify(state))), state);
  for (const id of ['school', 'work', 'self'] as const) {
    const next = choose(state, `start:${id}`).state;
    assert.equal(next.turn, 0); assert.equal(next.rng, state.rng); assert.equal(next.s.acts, 0);
    assert.equal(next.s.money, id === 'self' ? 800 : 500);
    assert.equal(next.status, id === 'school' ? 'student' : 'jobless');
    assert.ok(options(next).every(row => !row.id.startsWith('start:')));
    assert.throws(() => choose(next, `start:${id}`));
    assert.deepEqual(restore(JSON.parse(JSON.stringify(next))), next);
    if (id === 'work') {
      const cards = options(next);
      assert.equal(cards.find(row => row.id === 'job:service')!.enabled, true);
      assert.equal(cards.find(row => row.id === 'job:delivery')!.enabled, false);
      assert.equal(cards.find(row => row.id === 'job:mechanic')!.enabled, false);
      for (const choice of ['job:none', 'job:service']) {
        const after = choose(next, choice).state;
        assert.deepEqual(options(after).map(row => row.id), ['spin']);
        assert.equal(after.turn, 0); assert.equal(after.s.acts, 0);
      }
    } else assert.deepEqual(options(next).map(row => row.id), ['spin']);
  }
});

test('school grants the degree after eight seasons; its village learning boost is integer and expires', () => {
  let state = choose(newGame(1), 'start:school').state;
  state.board.pos = 'A-o1'; state.board.step = 'space'; state.board.dice = [1, 1];
  const boosted = options(state).find(row => row.id === 'act:st_theory')!.sure!.add.theory!;
  const plain = structuredClone(state); plain.timers = {};
  const normal = options(plain).find(row => row.id === 'act:st_theory')!.sure!.add.theory!;
  assert.equal(boosted, Math.floor(normal * 150 / 100));
  for (let turn = 1; turn <= 8; turn++) {
    state.board.step = 'bonus'; state = choose(state, 'end').state;
    assert.equal(state.flags.includes('degree'), turn === 8);
  }
  state.board.step = 'space'; state.board.dice = [1, 1];
  assert.equal(options(state).find(row => row.id === 'act:st_theory')!.sure!.add.theory, normal);
  assert.deepEqual(restore(JSON.parse(JSON.stringify(state))), state);
});

test('self-study unlocks jobless part-time work and grants 120% pay for exactly eight seasons', () => {
  const state = choose(newGame(1), 'start:self').state;
  state.board.pos = 'A-o2'; state.board.step = 'space'; state.board.dice = [1, 1];
  const boosted = options(state).find(row => row.id === 'act:st_parttime')!;
  assert.ok(boosted.enabled);
  state.turn = 7;
  assert.deepEqual(options(state).find(row => row.id === boosted.id)!.sure, boosted.sure);
  state.turn = 8;
  const plain = options(state).find(row => row.id === boosted.id)!;
  assert.equal(boosted.sure!.add.money, Math.floor(plain.sure!.add.money! * 120 / 100));
  assert.ok(plain.enabled);
  state.board.pos = 'A-o1';
  assert.ok(options(state).some(row => row.id === 'act:st_theory' && row.enabled));
});

test('start crossings offer jobs after movement only to jobless or graduated students and resume the landing', () => {
  for (const [status, degree, show] of [['jobless', false, true], ['student', false, false],
    ['student', true, true], ['working', true, false], ['retired', true, false]] as const) {
    for (const [steps, destination] of [[1, 'A-o0'], [2, 'A-o1'], [6, 'A-o5']] as const) {
      const state = at('A', {}, degree ? ['degree'] : []);
      state.status = status; if (status === 'working') state.track = 'service';
      state.board.pos = 'A-o27'; state.board.step = 'pick'; state.board.dice = [steps, steps];
      state.board.ledger = { 급여: 70 };
      const { state: next, result } = choose(state, `go:${destination}`);
      assert.equal(next.board.pos, destination); assert.equal(next.s.money, state.s.money + 70);
      assert.deepEqual(next.board.ledger, {}); assert.equal(result.upkeep!.total, 70);
      assert.equal(options(next).some(row => row.id === 'job:none'), show);
      assert.deepEqual(restore(JSON.parse(JSON.stringify(next))), next);
      if (show) {
        const skipped = choose(next, 'job:none').state;
        assert.equal(skipped.turn, state.turn); assert.equal(skipped.board.step, next.board.step);
        assert.equal(skipped.eventId, next.eventId); assert.equal(skipped.phase, next.phase);
        assert.ok(!options(skipped).some(row => row.id === 'job:none'));
        assert.deepEqual(restore(JSON.parse(JSON.stringify(skipped))), skipped);
      }
    }
  }
});

test('entry exams use inclusive age gates, exact displayed odds, deterministic RNG and fees on both outcomes', () => {
  for (const [id, map, stat, threshold, maxAge, base, fee] of [
    ['public', 'B', 'theory', 150, 40, 45, 50], ['racer', 'D', 'skill', 270, 35, 40, 0],
  ] as const) {
    const track = TRACKS.find(row => row.id === id)!, state = at(map, { [stat]: threshold });
    state.turn = (maxAge - 19) * 4 + 3;
    assert.equal(offer(state, id)!.locked.length, 0);
    state.turn++; assert.ok(offer(state, id)!.locked.some(text => text.includes(`${maxAge}세`)));
    state.turn = 8;
    for (const [gain, bonus] of [[0, 0], [4, 0], [5, 1], [150, 30], [200, 30]]) {
      state.s[stat] = threshold + gain;
      assert.equal(entryChance(state, track), base + bonus);
      assert.equal(options(state).find(row => row.id === `job:${id}`)!.roll!.chance, base + bonus);
    }
    state.s[stat] = threshold;
    const outcomes = new Set<boolean>();
    for (let seed = 1; seed <= 30; seed++) {
      state.rng = seed; state.s.stamina = seed;
      const before = structuredClone(state), preview = forecast(state, `job:${id}`);
      const next = choose(state, `job:${id}`), success = next.result.roll!.success;
      outcomes.add(success);
      assert.equal(next.result.roll!.chance, base); assert.equal(success, next.result.roll!.value < base);
      assert.equal(next.state.s.money, state.s.money - fee);
      assert.equal(next.state.track, success ? id : null);
      assert.equal(next.state.job.changedAt, success ? state.turn : -1);
      assert.equal(next.state.s.wins, state.s.wins); assert.equal(next.state.board.contests, state.board.contests);
      const branch = preview.branches.find(row => row.id === (success ? 'success' : 'fail'))!;
      assert.deepEqual(next.result.deltas, branch.deltas); assert.equal(branch.endsSeason, false);
      assert.deepEqual(state, before); integers(next.state);
      assert.deepEqual(choose(restore(JSON.parse(JSON.stringify(state)))!, `job:${id}`), next);
      assert.equal(hire(state, id).track, next.state.track);
      assert.equal(hire(state, id).rng, next.state.rng);
    }
    assert.deepEqual([...outcomes].sort(), [false, true]);
  }
  const tooPoor = at('B', { theory: 150, money: 49 });
  assert.equal(offer(tooPoor, 'public')!.locked.length, 1);
  assert.throws(() => choose(tooPoor, 'job:public'), /disabled/);
  const tooOld = at('C', { skill: 150 }, ['licensed']); tooOld.turn = 88;
  assert.ok(offer(tooOld, 'rescue')!.locked.some(text => text.includes('40세')));
});

test('jobfair choices and forecasts preserve the season and additional action slot', () => {
  for (const id of ['job:none', 'job:service']) {
    const state = frozen(at('A')), preview = forecast(state, id), next = choose(state, id);
    assert.deepEqual(preview.branches[0].deltas, next.result.deltas);
    assert.equal(preview.branches[0].endsSeason, false);
    assert.equal(next.state.board.step, 'bonus'); assert.equal(next.state.turn, state.turn);
    assert.equal(next.state.s.acts, state.s.acts);
    assert.ok(options(next.state).some(row => row.id === 'end'));
    assert.equal(choose(next.state, 'end').state.turn, state.turn + 1);
  }
  assert.ok(JOB_RULES.wait === 4);
  const state = afterStartPass(at('A'));
  assert.equal(state.timers[JOB_RULES.popup], undefined, 'jobfair landing already supplies the popup');
  assert.equal(choose(state, 'job:none').state.board.step, 'bonus');
});

test('failed paid entry preserves the existing job and cannot roll again on the same jobfair tile', () => {
  const state = hire(at('B', { theory: 150 }), 'service'); state.turn += 4;
  const oldJob = structuredClone(state.job);
  let failure = false;
  for (let seed = 1; seed <= 30; seed++) {
    state.rng = seed;
    const next = choose(state, 'job:public');
    if (next.result.roll!.success) continue;
    failure = true;
    assert.equal(next.state.track, 'service'); assert.equal(next.state.status, 'working');
    assert.deepEqual(next.state.job, oldJob); assert.equal(next.state.s.money, state.s.money - 50);
    assert.equal(next.state.board.step, 'bonus');
    assert.throws(() => choose(next.state, 'job:public'), /not available/);
    break;
  }
  assert.ok(failure);
});

test('200 seeded T04 runs finish 204 seasons with luck-only extra spins, integer states and replayable job choices', t => {
  const ids = new Set<string>();
  for (let seed = 1; seed <= 200; seed++) {
    let random = seed, state = newGame(seed), steps = 0;
    const spins = Array<number>(204).fill(0);
    const extraSpins = Array<number>(204).fill(0);
    while (state.phase !== 'ended') {
      assert.ok(steps++ < 204 * 6 + 2, `seed ${seed}: stuck`);
      const enabled = options(state).filter(row => row.enabled);
      assert.ok(enabled.length > 0);
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const picked = enabled[random % enabled.length];
      if (picked.id === 'spin') spins[state.turn]++;
      const isJob = /^(start:|job:|quit$)/.test(picked.id);
      if (isJob) ids.add(picked.id);
      const before = seed <= 20 ? structuredClone(state) : null;
      const next = choose(state, picked.id);
      if (next.result.luck?.id === 'again') extraSpins[state.turn]++;
      if (before) { assert.deepEqual(state, before); integers(next.state); }
      if (isJob) {
        assert.equal(next.state.turn, state.turn);
        const restored = restore(JSON.parse(JSON.stringify(state)));
        assert.ok(restored, `seed ${seed}: ${picked.id}`);
        assert.deepEqual(choose(restored, picked.id), next);
      }
      state = next.state;
    }
    assert.equal(state.turn, 204); assert.ok(spins.every((count, turn) => count === 1 + extraSpins[turn]));
    integers(state); assert.deepEqual(restore(JSON.parse(JSON.stringify(state))), state);
  }
  for (const id of ['start:school', 'start:work', 'start:self', 'job:none', 'job:service', 'quit']) assert.ok(ids.has(id), id);
  t.diagnostic('200/200 T04 runs: 204 seasons, 204 spins + luck rerolls; integer states; job/start/quit save replay');
});
