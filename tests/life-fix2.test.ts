import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, forecast, newGame, options, restore } from '../src/life/engine.ts';
import { advanceCareer, canPromote, hire, quit, retirementView } from '../src/life/jobs.ts';
import { CAREER_KEYS as K, careerIncome, careerSalary } from '../src/life/career2.ts';
import { JOB_RULES, TRACKS } from '../src/life/tracks.ts';
import { WORLD } from '../src/life/world.ts';
import type { GameState, SpaceKind, TrackId } from '../src/life/types.ts';

function tile(state: GameState, kind: SpaceKind): void {
  const maps = TRACKS.find(track => track.id === state.track)?.maps ?? 'any';
  state.board.pos = WORLD.find(node => node.kind === kind && (maps === 'any' || maps.includes(node.map)))!.id;
  state.board.step = 'space'; state.board.dice = [1, 1];
}
function worker(track: TrackId, seed = 1): GameState {
  const state = choose(newGame(seed), 'start:self').state;
  state.turn = 8; state.status = 'working'; state.track = track;
  state.job = { rank: 0, perf: 50, tenure: 0, total: 13, warn: 0, changedAt: 0, tracks: [track] };
  tile(state, 'job');
  return state;
}
function age(state: GameState, years: number, season = 0): void {
  state.turn = (years - 19) * 4 + season;
  state.s.capStamina = years >= 60 ? 80 : years >= 50 ? 90 : 100;
  state.s.stamina = state.s.capStamina;
}
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

for (const track of TRACKS) {
  test(`${track.id}: every job/train tile offers a free duty/training action even without money or equipment`, () => {
    const state = worker(track.id);
    Object.assign(state.s, { money: 0, stamina: 0, drone: 0, gear: 0, car: 0 });
    for (const node of WORLD.filter(node => node.kind === 'job' || node.kind === 'train')) {
      state.board.pos = node.id;
      const actions = options(frozen(structuredClone(state))).filter(option => option.id.startsWith('act:'));
      const first = actions[0];
      assert.equal(first.id, `act:${node.kind === 'job' ? 'work' : 'train'}_${track.id}`, node.id);
      assert.ok(first.enabled); assert.equal(first.cost, 0); assert.equal(first.tire, 0);
      if (node.kind === 'job') assert.equal(first.title, '근무');
      assert.ok(options(state).some(option => option.id === 'skip' && option.enabled));
    }
    tile(state, 'train');
    const id = `act:train_${track.id}`, before = structuredClone(state);
    const preview = forecast(frozen(state), id), next = choose(state, id);
    assert.deepEqual(next.result.deltas, preview.branches[0].deltas);
    assert.ok(Object.values(next.result.deltas).some(delta => delta! > 0));
    assert.equal(next.state.board.step, 'bonus'); assert.equal(next.state.turn, state.turn);
    assert.equal(next.state.job.perf, state.job.perf); assert.deepEqual(state, before);
  });

  test(`${track.id}: a locked rankup tile offers useful preparation and consumes just its tile action`, () => {
    const state = worker(track.id); tile(state, 'rankup');
    assert.equal(canPromote(state), false);
    const id = `act:prep_${track.id}`;
    assert.ok(options(state).some(option => option.id === id && option.enabled && option.cost === 0));
    const preview = forecast(frozen(state), id), next = choose(state, id);
    assert.deepEqual(next.result.deltas, preview.branches[0].deltas);
    assert.ok(Object.values(next.result.deltas).some(delta => delta! > 0));
    assert.equal(next.state.job.rank, 0); assert.equal(next.state.board.step, 'bonus');
    assert.equal(next.state.turn, state.turn); assert.equal(next.state.s.acts, 1);
    assert.ok(!options(next.state).some(option => option.id === id));
    assert.throws(() => choose(next.state, id), /not available/);
  });

  test(`${track.id}: always-work bots retain their job for 24 seasons across three seeds`, () => {
    for (const seed of [1, 7, 42]) {
      let state = worker(track.id, seed);
      const start = state.turn;
      for (let season = 0; season < 24; season++) {
        while (options(state).some(option => option.id === 'job:none')) state = choose(state, 'job:none').state;
        tile(state, 'job');
        const before = state.job.perf, id = `act:work_${track.id}`, option = options(state).find(o => o.id === id)!;
        const next = choose(state, id);
        assert.equal(next.result.roll!.chance, option.roll!.chance);
        assert.equal(next.state.job.perf, Math.max(0, Math.min(100, before + (next.result.roll!.success ? 8 : -4))));
        state = choose(next.state, 'end').state;
        assert.equal(state.status, 'working'); assert.equal(state.track, track.id);
        assert.equal(state.timers[K.idle], 0); assert.equal(state.job.warn, 0);
      }
      assert.equal(state.turn, start + 24); saved(state);
    }
  });
}

test('preparation appears for cooldown, wrong-map and top-rank locks, but not an available promotion', () => {
  const state = worker('service'); tile(state, 'rankup'); state.job.tenure = 4; state.s.xp = 100;
  assert.ok(canPromote(state)); assert.ok(!options(state).some(option => option.id === 'act:prep_service'));
  const cooling = structuredClone(state); cooling.timers[K.retry] = cooling.turn + 4;
  const elsewhere = structuredClone(state); elsewhere.board.pos = WORLD.find(n => n.kind === 'rankup' && n.map === 'C')!.id;
  const top = structuredClone(state); top.job.rank = 3; top.s.rank = 3;
  for (const locked of [cooling, elsewhere, top]) {
    assert.ok(!canPromote(locked)); assert.ok(options(locked).some(o => o.id === 'act:prep_service' && o.enabled));
  }
});

test('work failure resets inactivity; work as an extra action grants only +5 and closes the season', () => {
  let sawSuccess = false, sawFailure = false;
  for (let seed = 1; seed <= 50; seed++) {
    const state = worker('service', seed); state.timers[K.idle] = 3;
    const id = 'act:work_service', option = options(state).find(o => o.id === id)!;
    const preview = forecast(frozen(state), id), next = choose(state, id);
    assert.deepEqual(choose(saved(state), id), next);
    const success = next.result.roll!.success;
    sawSuccess ||= success; sawFailure ||= !success;
    assert.equal(success, next.result.roll!.value < option.roll!.chance);
    assert.deepEqual(next.result.deltas, preview.branches.find(branch => branch.id === (success ? 'success' : 'fail'))!.deltas);
    const closed = choose(next.state, 'end').state;
    assert.equal(closed.timers[K.idle], 0); assert.equal(closed.job.perf, success ? 58 : 46);
  }
  assert.ok(sawSuccess && sawFailure);
  const extra = worker('service'); extra.board.pos = WORLD.find(n => n.place === 'town')!.id; extra.board.step = 'bonus';
  const next = choose(extra, 'act:work_service');
  assert.equal(next.state.job.perf, 55); assert.equal(next.state.turn, extra.turn + 1);
});

for (const track of TRACKS.filter(track => track.salaried)) {
  test(`${track.id}: one deferral auto-retires next season, grants benefits once and survives saving`, () => {
    const state = worker(track.id); age(state, 60);
    const salary = track.ranks[0].salary, pension = Math.floor(salary * track.pensionPct / 100);
    const deferred = choose(frozen(state), 'job:none').state;
    assert.equal(deferred.status, 'working'); assert.equal(careerSalary(deferred), salary);
    assert.equal(deferred.timers[JOB_RULES.retirementBase], salary);
    assert.ok(!options(deferred).some(option => option.id.startsWith('retire:')));
    const bonus = choose(saved(deferred), 'skip').state;
    const next = choose(bonus, 'end');
    assert.deepEqual(choose(saved(bonus), 'end'), next);
    assert.equal(next.state.turn, state.turn + 1); assert.equal(next.state.status, 'retired');
    assert.equal(next.state.s.money, state.s.money + Math.floor(salary * 14 / 8));
    assert.equal(careerIncome(next.state).pension, pension); assert.equal(careerSalary(next.state), 0);
    assert.deepEqual(advanceCareer(next.state), next.state);
    assert.ok(options(next.state).every(option => !option.id.startsWith('retire:')));
    const later = saved(next.state); later.board.step = 'bonus'; later.board.dice = [1, 1];
    const paid = choose(later, 'end').state;
    assert.equal(paid.board.ledger['연금'], pension); assert.equal(paid.s.money, next.state.s.money);
  });

  test(`${track.id}: rehire salary is 60%, but age-65 severance and pension retain the age-60 base`, () => {
    const state = worker(track.id); age(state, 60);
    const salary = track.ranks[0].salary, pension = Math.floor(salary * track.pensionPct / 100);
    let rehired = choose(frozen(state), 'retire:rehire').state;
    assert.equal(rehired.timers[JOB_RULES.retirementBase], salary);
    assert.equal(careerSalary(rehired), Math.floor(salary * 60 / 100));
    assert.equal(rehired.s.money, state.s.money);
    // Keep working through all twenty contract seasons, including the annual reviews.
    for (let season = 0; season < 20; season++) {
      while (options(rehired).some(option => option.id === 'job:none')) rehired = choose(rehired, 'job:none').state;
      tile(rehired, 'job'); rehired = choose(rehired, `act:work_${track.id}`).state;
      const before = rehired.s.money;
      rehired = choose(saved(rehired), 'end').state;
      if (season < 19) assert.equal(rehired.status, 'working');
      else {
        assert.equal(rehired.status, 'retired');
        const bonus = rehired.log.at(-1)?.text === '우수' ? Math.floor(salary * 60 / 100) : 0;
        assert.equal(rehired.s.money - before - bonus, Math.floor(salary * 33 / 8));
      }
    }
    assert.equal(rehired.turn, (65 - 19) * 4); assert.equal(careerIncome(rehired).pension, pension); saved(rehired);
  });
}

test('age-60 snapshot is captured at the boundary and survives later rank changes and save/load', () => {
  const state = worker('service'); age(state, 59, 3); state.job.rank = state.s.rank = 1;
  state.s.xp = 100; state.board.step = 'bonus';
  const spring = choose(state, 'end').state;
  assert.equal(spring.timers[JOB_RULES.retirementBase], 110);
  const rehired = choose(saved(spring), 'retire:rehire').state;
  rehired.job.rank = rehired.s.rank = 0; age(rehired, 65);
  const view = retirementView(frozen(rehired));
  assert.equal(view.salary, 110); assert.equal(view.pension, 33);
  const id = 'retire:pension', preview = forecast(rehired, id), next = choose(saved(rehired), id);
  assert.ok(options(rehired).find(option => option.id === id)!.desc.includes('연금 33만원'));
  assert.equal(next.state.s.money - rehired.s.money, Math.floor(110 * rehired.job.total / 8));
  assert.deepEqual(next.result.deltas, preview.branches[0].deltas);
  assert.equal(careerIncome(next.state).pension, 33);
});

test('old rehire saves use the full rank salary; stale deferrals cannot defer a second time', () => {
  const legacy = worker('public'); age(legacy, 65); legacy.flags.push(K.rehire);
  const next = choose(saved(legacy), 'retire:pension').state;
  assert.equal(next.s.money - legacy.s.money, Math.floor(115 * 13 / 8));
  assert.equal(careerIncome(next).pension, 57);
  const deferred = worker('service'); age(deferred, 61); deferred.timers[K.deferred] = deferred.turn;
  assert.equal(choose(saved(deferred), 'job:none').state.status, 'retired');
});

test('quitting and switching clear the frozen base so a later job cannot inherit it', () => {
  const state = worker('public'); age(state, 60);
  const deferred = choose(state, 'job:none').state;
  const left = quit(deferred);
  assert.equal(left.timers[JOB_RULES.retirementBase], undefined); assert.equal(left.timers[K.deferred], undefined);
  const switched = choose(state, 'retire:switch').state;
  switched.board.pos = WORLD.find(n => n.kind === 'jobfair' && n.map === 'A')!.id;
  const next = hire(switched, 'service');
  assert.equal(next.timers[JOB_RULES.retirementBase], undefined); assert.equal(retirementView(next).due, false);
});
