import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POLICIES, botRandom, pick } from '../src/game/bots.ts';
import { ACTIONS, ENDINGS, EVENTS, PLACES, RULES, STAGES } from '../src/game/data.ts';
import { choose, creditLimit, derived, newGame, options, restore } from '../src/game/engine.ts';
import type { GameState, Stage, StatMap } from '../src/game/types.ts';

/** A fresh run moved to a stage with some stats set, as plain data (the state is JSON all the way down). */
function at(stage: Stage, stats: StatMap = {}, flags: string[] = [], seed = 7): GameState {
  const state = newGame(seed);
  state.stage = stage;
  Object.assign(state.s, stats);
  state.flags = flags;
  return state;
}
const option = (state: GameState, id: string) => {
  const o = options(state).find((x) => x.id === id);
  assert.ok(o, `option ${id} is offered`);
  return o;
};
function botRun(policy: string, seed: number): GameState {
  let state = newGame(seed);
  const rand = botRandom(seed);
  for (let i = 0; i < 3000 && state.phase !== 'ended'; i++) state = choose(state, pick(POLICIES[policy], state, rand)).state;
  return state;
}

test('a new run starts as a 20-year-old student with integer stats', () => {
  const state = newGame(1);
  assert.equal(state.stage, 'student');
  assert.equal(state.phase, 'action');
  assert.equal(derived(state).age, RULES.startAge);
  for (const v of Object.values(state.s)) assert.ok(Number.isInteger(v));
});

test('the same seed and the same choices replay the same run', () => {
  const a = botRun('ceo', 42);
  const b = botRun('ceo', 42);
  assert.deepEqual(a, b);
  assert.notDeepEqual(botRun('ceo', 43).log, a.log);
});

test('choose does not change the state it was given', () => {
  const state = newGame(3);
  const before = structuredClone(state);
  choose(state, 'st_theory');
  assert.deepEqual(state, before);
});

test('the wind-turbine job shows its odds and pays +200 / -150', () => {
  const state = at('pilot', { drone: 3, gear: 2, car: 2, xp: 150 }, ['licensed']);
  const wind = option(state, 'job_wind');
  assert.equal(wind.enabled, true);
  assert.equal(wind.roll?.success.add.money, 200);
  assert.equal(wind.roll?.fail.add.money, -150);
  assert.ok(wind.roll!.chance >= RULES.chanceMin && wind.roll!.chance <= RULES.chanceMax);
  assert.equal(wind.roll?.crashPct, RULES.flight.crashPct);
  assert.match(wind.roll!.success.summary, /\+200만원/);
  assert.match(wind.roll!.fail.summary, /-150만원/);
});

test('the shown chance is the chance that is rolled', () => {
  const state = at('pilot', { drone: 3, gear: 2, car: 2, money: 500 }, ['licensed']);
  const shown = option(state, 'job_wind').roll!.chance;
  let wins = 0;
  const n = 2000;
  for (let seed = 1; seed <= n; seed++) {
    const { result } = choose({ ...state, rng: seed * 2654435761 >>> 0 }, 'job_wind');
    assert.equal(result.roll!.chance, shown);
    assert.equal(result.roll!.success, result.roll!.value < shown);
    if (result.roll!.success) wins++;
  }
  assert.ok(Math.abs((wins * 100) / n - shown) < 4, `${wins}/${n} against ${shown}%`);
});

test('a locked or unaffordable option is shown disabled with a reason and cannot be played', () => {
  const state = newGame(5);
  const exam = option(state, 'st_exam');
  assert.equal(exam.enabled, false);
  assert.ok(exam.locks.length >= 2, 'both the XP requirement and the fee are listed');
  assert.throws(() => choose(state, 'st_exam'), /disabled/);
  assert.throws(() => choose(state, 'no_such_option'), /not available/);
});

test('the licence is paid for with a loan and opens the pilot stage', () => {
  let state = newGame(11);
  state.s.xp = 150;
  state = choose(state, 'loan:500').state;
  assert.equal(state.turn, 0, 'a loan does not spend the quarter');
  assert.equal(state.s.debt, 500);
  for (let seed = 1; state.stage === 'student' && seed < 50; seed++) {
    const tried = choose({ ...state, rng: seed }, 'st_exam');
    if (tried.result.roll!.success && tried.state.phase === 'action') state = tried.state;
  }
  assert.equal(state.stage, 'pilot');
  assert.ok(state.flags.includes('licensed'));
  assert.ok(options(state).some((o) => o.id === 'buy:drone'));
});

test('better equipment opens better jobs', () => {
  const ids = (s: GameState) => options(s).filter((o) => o.kind === 'job' && o.enabled).map((o) => o.id);
  const basic = ids(at('pilot', { drone: 1 }, ['licensed']));
  const full = ids(at('pilot', { drone: 4, gear: 3, car: 2, rep: 50 }, ['licensed']));
  assert.deepEqual(basic, ['job_event']);
  assert.ok(full.includes('job_film') && full.includes('job_wind') && full.length > basic.length + 4);
});

test('a failed flight can wreck the drone, and a worn drone flies worse', () => {
  const state = at('pilot', { drone: 3, gear: 2, car: 2, money: 500 }, ['licensed']);
  let crashed = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const { state: next, result } = choose({ ...state, rng: seed * 40503 }, 'job_wind');
    if (!result.crashed) continue;
    crashed++;
    assert.equal(result.roll!.success, false);
    assert.equal(next.s.drone, 2);
    assert.equal(next.s.crashes, 1);
  }
  assert.ok(crashed > 5, `${crashed} crashes in 400 flights`);
  const worn = at('pilot', { drone: 3, gear: 2, car: 2, cond: 20 }, ['licensed']);
  assert.ok(option(worn, 'job_wind').roll!.chance < option(state, 'job_wind').roll!.chance);
  assert.ok(option(worn, 'job_wind').roll!.crashPct! > RULES.flight.crashPct);
});

test('money never goes negative: a shortfall turns into debt', () => {
  const state = at('company', { money: 0, staff: 3, contracts: 0, value: 1000 }, ['licensed']);
  const { state: next, result } = choose(state, 'rest');
  assert.ok(result.upkeep!.total < 0);
  assert.equal(next.s.money, 0);
  assert.equal(next.s.debt, -result.upkeep!.total);
});

test('debt over the limit for three quarters in a row ends the run as 빚쟁이', () => {
  let state = at('pilot', {}, ['licensed']);
  state.s.debt = creditLimit(state) * 2;
  for (let i = 0; i < RULES.overdueStrikes && state.phase !== 'ended'; i++) {
    if (state.phase === 'event') state = choose(state, options(state).find((o) => o.enabled)!.id).state;
    else state = choose(state, 'rest').state;
    if (state.phase === 'event') state = choose(state, options(state).find((o) => o.enabled)!.id).state;
  }
  assert.equal(state.ending, 'debtor');
  assert.equal(state.score, 0);
});

test('빚쟁이 scores zero even with assets left', () => {
  let state = at('pilot', { money: 5000 }, ['licensed']);
  state.s.debt = creditLimit(state) * 2;
  for (let i = 0; i < RULES.overdueStrikes * 2 && state.phase !== 'ended'; i++) {
    state = choose(state, state.phase === 'event' ? options(state).find((o) => o.enabled)!.id : 'rest').state;
  }
  assert.equal(state.ending, 'debtor');
  assert.equal(state.score, 0);
});

test('a run that reaches the last quarter ends with the ending of its career', () => {
  const cases: [Stage, StatMap, string][] = [
    ['student', {}, 'student'], ['pilot', {}, 'pilot'], ['employee', {}, 'employee'], ['instructor', {}, 'instructor'],
    ['solo', {}, 'solo'], ['director', {}, 'director'], ['company', { staff: 1, contracts: 2 }, 'smallbiz'],
    ['academy', { level: 3, staff: 1, students: 16 }, 'academy'], ['academy', { level: 1, staff: 1, students: 16 }, 'instructor'],
    ['pilot', { debt: 4000 }, 'debtor'],
  ];
  for (const [stage, stats, ending] of cases) {
    let state = at(stage, { money: 500, ...stats }, ['licensed']);
    state.turn = RULES.maxTurns - 1;
    state = choose(state, 'rest').state;
    assert.equal(state.phase, 'ended', stage);
    assert.equal(state.ending, ending, stage);
    assert.equal(options(state).length, 0);
    assert.ok(Number.isInteger(state.score) && state.score >= 0);
  }
});

test('every bot policy finishes within the turn limit with a known ending', () => {
  const known = new Set(ENDINGS.map((e) => e.id));
  for (const policy of Object.keys(POLICIES)) {
    for (let seed = 1; seed <= 5; seed++) {
      const end = botRun(policy, seed * 131);
      assert.equal(end.phase, 'ended', `${policy} ${seed}`);
      assert.ok(known.has(end.ending!));
      assert.ok(end.turn <= RULES.maxTurns);
      assert.ok(end.s.money >= 0 && end.s.debt >= 0);
      for (const v of Object.values(end.s)) assert.ok(Number.isInteger(v));
    }
  }
});

test('the tables are consistent and no event can trap the player', () => {
  const ids = ACTIONS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'action ids are unique');
  assert.equal(new Set(EVENTS.map((e) => e.id)).size, EVENTS.length, 'event ids are unique');
  for (const a of ACTIONS) assert.ok(a.place in PLACES, a.id);
  for (const e of EVENTS) {
    assert.ok(e.place in PLACES, e.id);
    assert.ok(e.choices.length >= 2, e.id);
    assert.ok(e.choices.some((c) => !c.cost && !c.need), `${e.id} has a choice that is always open`);
    assert.ok(e.choices.some((c) => c.roll) || e.choices.length >= 2);
  }
  assert.ok(ACTIONS.some((a) => a.id === 'rest' && !a.need && !a.cost && Object.keys(a.when).length === 0), 'resting is always possible');
  for (const stage of Object.values(STAGES)) assert.ok(ENDINGS.some((e) => e.id === stage.timeout));
  assert.equal(ENDINGS.filter((e) => e.main).length, 5);
});

test('a save survives a JSON round trip, mid-event too', () => {
  let state = newGame(9);
  const rand = botRandom(9);
  for (let i = 0; i < 400 && state.phase !== 'event'; i++) state = choose(state, pick(POLICIES.pilot, state, rand)).state;
  assert.equal(state.phase, 'event');
  const back = restore(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(back, state);
  assert.deepEqual(options(back!).map((o) => o.id), options(state).map((o) => o.id));
});

test('restore rejects junk and clamps tampered numbers', () => {
  for (const junk of [null, 42, 'x', [], {}, { v: 2 }, { ...newGame(1), stage: 'king' }, { ...newGame(1), s: { money: 'lots' } }]) {
    assert.equal(restore(junk), null);
  }
  const hacked = JSON.parse(JSON.stringify(newGame(1)));
  hacked.s.money = 1e15;
  hacked.s.drone = 99;
  hacked.turn = 9999;
  hacked.flags = ['licensed', 'god-mode', 7];
  const back = restore(hacked)!;
  assert.equal(back.s.money, 9_000_000);
  assert.equal(back.s.drone, 5);
  assert.equal(back.turn, RULES.maxTurns);
  assert.deepEqual(back.flags, ['licensed']);
});
