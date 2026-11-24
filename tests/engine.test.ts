import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POLICIES, botRandom, pick } from '../src/game/bots.ts';
import { ACTIONS, ENDINGS, EVENTS, PLACES, RULES, STAGES, STAT_MAX } from '../src/game/data.ts';
import { choose, creditLimit, dateLabel, derived, newGame, options, restore, staminaBand } from '../src/game/engine.ts';
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
  for (let i = 0; i < 20000 && state.phase !== 'ended'; i++) {
    if (state.phase === 'action') assert.equal(option(state, 'rest').enabled, true);
    state = choose(state, pick(POLICIES[policy], state, rand)).state;
  }
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

test('the wind-turbine job shows its odds and pays +250 / -150', () => {
  const state = at('pilot', { drone: 3, gear: 2, car: 2, xp: 150 }, ['licensed']);
  const wind = option(state, 'job_wind');
  assert.equal(wind.enabled, true);
  assert.equal(wind.roll?.success.add.money, 250);
  assert.equal(wind.roll?.fail.add.money, -150);
  assert.ok(wind.roll!.chance >= RULES.chanceMin && wind.roll!.chance <= RULES.chanceMax);
  assert.equal(wind.roll?.crashPct, RULES.flight.crashPct);
  assert.match(wind.roll!.success.summary, /\+250만원/);
  assert.match(wind.roll!.fail.summary, /-150만원/);
});

test('stamina costs are paid before outcomes and rest recovers up to the cap', () => {
  const tire = ACTIONS.find((a) => a.id === 'st_flight')!.tire!;
  const gain = ACTIONS.find((a) => a.id === 'rest')!.effect!.add!.stamina!;
  const state = at('student', { stamina: tire });
  const flight = option(state, 'st_flight');
  assert.equal(flight.tire, tire);
  const { state: next, result } = choose(state, flight.id);
  assert.equal(result.deltas.stamina, -tire);
  assert.equal(next.s.stamina, RULES.rest.light + RULES.seasonRefill);
  state.s.stamina = 0;
  const locked = option(state, flight.id);
  assert.equal(locked.enabled, false);
  assert.deepEqual(locked.missing, [{ stat: 'stamina', need: tire }]);
  assert.deepEqual(locked.locks, [`체력 부족 (${tire} 필요, 현재 0)`]);
  assert.throws(() => choose(state, flight.id), /disabled/);
  assert.ok(option(state, 'rest').enabled);
  assert.equal(option(state, 'rest').tire, 0);
  assert.equal(choose(state, 'rest').result.deltas.stamina, gain);
  state.s.stamina = 80;
  assert.equal(choose(state, 'rest').state.s.stamina, 100);
});

test('action and event cards use the pre-payment stamina band and roll their displayed odds', () => {
  const bands = [[90, 'fresh', RULES.stamina.freshBonus], [60, 'normal', 0],
    [30, 'tired', -RULES.stamina.tiredPenalty], [10, 'exhausted', -RULES.stamina.exhaustedPenalty]] as const;
  for (const [stamina, band, adjustment] of bands) {
    const pilot = at('pilot', { stamina, drone: 1 }, ['licensed']);
    const student = at('student', { stamina });
    student.phase = 'event';
    student.eventId = 'scholarship';
    for (const [state, id, base] of [[pilot, 'job_event', 90], [student, 'ev:0', 35]] as const) {
      assert.equal(staminaBand(state), band);
      const shown = option(state, id).roll!;
      assert.equal(shown.staminaPct, adjustment);
      assert.equal(shown.chance, base + adjustment);
      if (!option(state, id).enabled) {
        assert.throws(() => choose(state, id), /disabled/);
        continue;
      }
      let wins = 0;
      for (let seed = 1; seed <= 1000; seed++) {
        const { result } = choose({ ...state, rng: seed * 2654435761 >>> 0 }, id);
        assert.equal(result.roll!.chance, shown.chance);
        assert.equal(result.roll!.success, result.roll!.value < shown.chance);
        if (result.roll!.success) wins++;
      }
      assert.ok(Math.abs(wins / 10 - shown.chance) < 5);
    }
  }
});

test('failed flight crash frequency tracks the displayed risk across skill, condition and exhaustion', () => {
  const f = RULES.flight;
  for (const [skill, cond, stamina, risk] of [
    [0, 100, 60, f.crashPct], [205, 100, 60, f.crashPct - f.skillCrashCap],
    [45, 35, 30, f.crashPct + f.crashLowCondPct - Math.floor(45 / f.skillPer)],
    [45, 35, 10, f.crashPct + f.crashLowCondPct - Math.floor(45 / f.skillPer) + RULES.stamina.exhaustedCrashPct],
  ]) {
    const state = at('pilot', { stamina, skill, cond, drone: 1 }, ['licensed']);
    const shown = option(state, 'job_event').roll!.crashPct;
    assert.equal(shown, risk);
    if (stamina < option(state, 'job_event').tire) {
      assert.throws(() => choose(state, 'job_event'), /disabled/);
      continue;
    }
    let crashes = 0, failures = 0;
    for (let seed = 1; seed <= 8000; seed++) {
      const { result } = choose({ ...state, rng: seed * 2654435761 >>> 0 }, 'job_event');
      if (!result.roll!.success) failures++;
      if (result.crashed) {
        assert.equal(result.roll!.success, false);
        crashes++;
      }
    }
    assert.ok(Math.abs(crashes * 100 / failures - risk) < 5, `${crashes}/${failures} at ${shown}%`);
  }
});

test('a locked or unaffordable option is shown disabled with a reason and cannot be played', () => {
  const state = newGame(5);
  const exam = option(state, 'st_exam');
  assert.equal(exam.enabled, false);
  assert.deepEqual(exam.missing, [{ stat: 'theory', need: 30 }, { stat: 'skill', need: 30 }, { stat: 'money', need: 300 }]);
  assert.throws(() => choose(state, 'st_exam'), /disabled/);
  assert.throws(() => choose(state, 'no_such_option'), /not available/);
});

test('the licence is paid for with a loan and opens the pilot stage', () => {
  let state = newGame(11);
  state.s.theory = 30;
  state.s.skill = 30;
  state = choose(state, 'loan:500').state;
  assert.equal(state.turn, 0, 'a loan does not spend the season');
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

test('debt over the limit for three seasons in a row ends the run as 빚쟁이', () => {
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

test('a run that reaches the last season ends with the ending of its career', () => {
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
    assert.equal(state.turn, 120);
    assert.equal(derived(state).age, 50);
    assert.equal(state.ending, ending, stage);
    assert.equal(options(state).length, 0);
    assert.ok(Number.isInteger(state.score) && state.score >= 0);
  }
});

test('planners rest before tired rolls and for stamina-locked prerequisites', () => {
  const student = at('student', { money: 500, theory: 90, skill: 90, stamina: 30 });
  const decide = (name: string) => pick(POLICIES[name], student, botRandom(1));
  assert.equal(decide('ceo'), 'rest');
  assert.equal(decide('gambler'), 'st_exam');
  student.s.stamina = 15;
  assert.equal(decide('gambler'), 'rest');
  student.s.theory = 0;
  student.s.stamina = 5;
  assert.equal(decide('ceo'), 'rest');
  student.s.stamina = 20;
  assert.equal(decide('ceo'), 'st_theory');
  student.s.theory = 90;
  student.s.stamina = 14;
  assert.equal(decide('ceo'), 'rest');
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
  for (const a of ACTIONS) {
    assert.ok(a.place in PLACES, a.id);
    if (a.id !== 'rest') assert.ok((a.tire ?? 0) > 0, a.id);
  }
  for (const e of EVENTS) {
    assert.ok(e.place in PLACES, e.id);
    assert.ok(e.choices.length >= 2, e.id);
    assert.ok(e.choices.every(c => c.tire === undefined), e.id);
    assert.ok(e.choices.some((c) => !c.cost && !c.need), `${e.id} has a choice that is always open`);
    assert.ok(e.choices.some((c) => c.roll) || e.choices.length >= 2);
  }
  assert.ok(ACTIONS.some((a) => a.id === 'rest' && !a.tire && !a.need && !a.cost && Object.keys(a.when).length === 0), 'resting is always possible');
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

test('v1 saves migrate only absent stats and validate every supplied value', () => {
  for (const [stage, xp, training] of [['student', 35, 17], ['pilot', 35, 30], ['employee', 8000, STAT_MAX.skill]] as const) {
    const raw = JSON.parse(JSON.stringify(at(stage, { xp, stamina: 12, skill: 9, theory: 3 })));
    assert.deepEqual(restore(raw), raw);
    for (const stat of ['stamina', 'theory', 'skill']) delete raw.s[stat];
    const back = restore(raw)!;
    assert.equal(back.v, 1);
    assert.equal(back.s.stamina, RULES.start.stamina);
    assert.equal(back.s.theory, training);
    assert.equal(back.s.skill, training);
    raw.s.skill = 0;
    assert.equal(restore(raw)!.s.skill, 0);
    assert.equal(restore(raw)!.s.theory, training);
    for (const stat of ['stamina', 'theory', 'skill']) {
      assert.equal(restore({ ...raw, s: { ...raw.s, [stat]: 2.5 } }), null);
    }
  }
});


test('two actions and a bank visit stay in spring until a light rest settles it once', () => {
  let state = newGame(42);
  for (const [id, acts] of [['st_theory', 1], ['loan:100', 1], ['st_sim', 2]] as const) {
    const next = choose(state, id);
    assert.equal(next.state.turn, 0);
    assert.equal(next.state.s.acts, acts);
    assert.equal(next.state.rng, state.rng);
    assert.equal(next.result.upkeep, undefined);
    assert.equal(next.result.season, undefined);
    state = next.state;
  }
  assert.equal(state.s.money, 150);
  assert.equal(state.s.stamina, 65);
  const rest = option(state, 'rest');
  assert.equal(rest.title, '쉬고 계절 넘기기');
  assert.equal(rest.sure!.add.stamina, 20);
  assert.equal(rest.sure!.summary, '체력 +20');
  const next = choose(state, rest.id);
  assert.equal(next.state.turn, 1);
  assert.equal(next.state.s.acts, 0);
  assert.equal(next.result.deltas.stamina, 20);
  assert.equal(next.state.s.stamina, 100);
  assert.deepEqual(next.result.season, { from: '20세 · 봄', to: '20세 · 여름', rest: 20, refill: 15, auto: false });
  assert.equal(next.result.upkeep!.total, -22);
  assert.equal(next.state.s.money, 128);
});

test('first-action rest gives full rest followed by a capped season refill', () => {
  for (const [initial, refill] of [[0, 30], [30, 10], [80, 0]]) {
    const state = at('student', { stamina: initial });
    const rest = option(state, 'rest');
    assert.equal(rest.title, '푹 쉰다');
    assert.equal(rest.sure!.add.stamina, 60);
    assert.equal(rest.sure!.summary, '체력 +60');
    const next = choose(state, rest.id);
    assert.equal(next.state.turn, 1);
    assert.equal(next.state.s.acts, 0);
    assert.deepEqual(next.result.season, { from: dateLabel(0), to: dateLabel(1), rest: 60, refill, auto: false });
    assert.equal(next.state.s.stamina, Math.min(100, initial + 60 + refill));
  }
});

test('wind-down checks offered actions after stage changes, ignoring their other locks', () => {
  const pilot = at('pilot', { stamina: 30, money: 0 }, ['licensed']);
  const first = choose(pilot, 'self_study');
  assert.equal(first.state.s.stamina, 15);
  assert.equal(first.result.season, undefined);
  const next = choose(first.state, 'self_study');
  assert.deepEqual(next.result.season, { from: dateLabel(0), to: dateLabel(1), rest: 20, refill: 30, auto: true });
  assert.equal(next.state.s.stamina, 50);
  assert.equal(next.state.turn, 1);
  assert.equal(next.state.s.acts, 0);
  assert.ok(next.result.notes.some(note => note.includes('체력이 바닥났다')));

  const instructor = at('instructor', { stamina: 20 }, ['licensed', 'member']);
  // After quitting, the pilot no longer has the 10-stamina quit action available.
  assert.equal(choose(instructor, 'inst_quit').result.season?.auto, true);
  // At 10 stamina the only affordable tire belongs to a choice locked by its fee.
  const broke = at('pilot', { stamina: 25, money: 0 }, ['licensed']);
  assert.equal(choose(broke, 'self_study').result.season, undefined);
});

test('event responses leave a fresh season available for a full rest', () => {
  const state = newGame(3);
  state.phase = 'event';
  state.eventId = 'scholarship';
  const next = choose(state, 'ev:1');
  assert.equal(next.state.phase, 'action');
  assert.equal(next.state.turn, 0);
  assert.equal(next.state.s.acts, 0);
  assert.equal(next.result.upkeep, undefined);
  assert.equal(next.result.season, undefined);
  assert.equal(option(next.state, 'rest').sure!.add.stamina, 60);
});

test('v1 quarter saves keep their calendar position and resume with a fresh action count', () => {
  assert.equal(derived(newGame(1)).dateLabel, '20세 · 봄');
  for (const oldTraining of [true, false]) {
    const raw = JSON.parse(JSON.stringify(at('pilot', { stamina: 54, xp: 80, skill: 7, theory: 8 })));
    raw.turn = 17;
    delete raw.s.acts;
    if (oldTraining) for (const key of ['stamina', 'theory', 'skill']) delete raw.s[key];
    const state = restore(raw)!;
    assert.equal(state.turn, 17);
    assert.equal(state.s.acts, 0);
    assert.equal(state.s.stamina, oldTraining ? 100 : 54);
    assert.equal(state.s.skill, oldTraining ? 40 : 7);
    assert.equal(state.s.theory, oldTraining ? 40 : 8);
    const { age, season, seasonName, dateLabel: label } = derived(state);
    assert.deepEqual([age, season, seasonName, label], [24, 1, '여름', '24세 · 여름']);
    assert.equal(choose(state, 'self_study').state.s.acts, 1);
  }
});


test('a career-winning action keeps its early score bonus and skips season settlement', () => {
  const state = at('director', { rank: 1, support: 100, money: 1000, stamina: 35, acts: 2 });
  state.turn = 17;
  for (let rng = 1; rng <= 50; rng++) {
    const next = choose({ ...state, rng }, 'dir_chair');
    if (!next.result.roll!.success) continue;
    assert.equal(next.result.ended, 'chairman');
    assert.equal(next.state.turn, 18);
    assert.equal(next.result.season, undefined);
    assert.equal(next.result.upkeep, undefined);
    assert.equal(next.state.s.stamina, 0);
    assert.equal(next.state.score, 550 + 8000 + (120 - 18) * 50);
    return;
  }
  assert.fail('expected a winning seed');
});
