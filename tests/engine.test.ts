import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POLICIES, botRandom, pick } from '../src/game/bots.ts';
import { ACTIONS, BOARD, BOARD_PLACES, CONTEST_EVENTS, SPACE_MENU, ENDINGS, EVENTS, PLACES, RULES, STAGES, STAT_MAX } from '../src/game/data.ts';
import { actionViews, boardView, choose, creditLimit, dateLabel, derived, finalRank, forecast, newGame, options, restore, staminaBand } from '../src/game/engine.ts';
import type { GameState, Stage, StatMap } from '../src/game/types.ts';

/** A fresh run moved to a stage with some stats set, as plain data (the state is JSON all the way down). */
function at(stage: Stage, stats: StatMap = {}, flags: string[] = [], seed = 7): GameState {
  const state = newGame(seed);
  state.stage = stage;
  Object.assign(state.s, stats);
  state.flags = flags;
  return state;
}
function space(state: GameState, pos: number) {
  Object.assign(state.board, { pos, step: 'space', roll: 1 });
  return state;
}
function bonus(state: GameState, pos = 0) {
  Object.assign(state.board, { pos, step: 'bonus', roll: 1 });
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
    assert.ok(options(state).some(o => o.enabled && !o.free));
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
  choose(state, 'spin');
  assert.deepEqual(state, before);
});

test('the wind-turbine job shows its odds and pays +250 / -150', () => {
  const state = at('pilot', { drone: 3, gear: 2, car: 2, xp: 150 }, ['licensed']);
  space(state, 2);
  const wind = option(state, 'job_wind');
  assert.equal(wind.enabled, true);
  assert.equal(wind.roll?.success.add.money, 250);
  assert.equal(wind.roll?.fail.add.money, -150);
  assert.ok(wind.roll!.chance >= RULES.chanceMin && wind.roll!.chance <= RULES.chanceMax);
  assert.equal(wind.roll?.crashPct, RULES.flight.crashPct);
  const [success, fail, crash] = forecast(state, wind.id).branches;
  assert.deepEqual([success.id, fail.id, crash.id], ['success', 'fail', 'crash']);
  assert.deepEqual([success.deltas.cond, fail.deltas.cond, crash.deltas.cond], [-12, -27, -30]);
  assert.equal(crash.deltas.drone, -1);
  assert.equal(success.deltas.money, 250);
  assert.deepEqual([fail.deltas.money, fail.deltas.debt], [-60, 90]);
});

test('action and event cards use the pre-payment stamina band and roll their displayed odds', () => {
  const bands = [[90, 'fresh', RULES.stamina.freshBonus], [60, 'normal', 0],
    [30, 'tired', -RULES.stamina.tiredPenalty], [10, 'exhausted', -RULES.stamina.exhaustedPenalty]] as const;
  for (const [stamina, band, adjustment] of bands) {
    const pilot = at('pilot', { stamina, drone: 1 }, ['licensed']);
    space(pilot, 2);
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

test('failed flight crash frequency tracks the displayed risk across skill and condition; an exhausted pilot is shown the risk but cannot fly', () => {
  const f = RULES.flight;
  for (const [skill, cond, stamina, risk] of [
    [0, 100, 60, f.crashPct], [205, 100, 60, f.crashPct - f.skillCrashCap],
    [45, 35, 30, f.crashPct + f.crashLowCondPct - Math.floor(45 / f.skillPer)],
    [45, 35, 10, f.crashPct + f.crashLowCondPct - Math.floor(45 / f.skillPer) + RULES.stamina.exhaustedCrashPct],
  ]) {
    const state = at('pilot', { stamina, skill, cond, drone: 1 }, ['licensed']);
    bonus(state, BOARD_PLACES.pilot.indexOf('town'));
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
  space(state, 7);
  const exam = option(state, 'st_exam');
  assert.equal(exam.enabled, false);
  assert.deepEqual(exam.missing, [{ stat: 'theory', need: 90 }, { stat: 'skill', need: 90 }, { stat: 'money', need: 600 }]);
  assert.throws(() => choose(state, 'st_exam'), /disabled/);
  assert.throws(() => choose(state, 'no_such_option'), /not available/);
});

test('the licence is paid for with a loan and opens the pilot stage', () => {
  let state = newGame(11);
  space(state, 7);
  state.s.theory = 90;
  state.s.skill = 90; state.s.money = 300;
  state = choose(state, 'loan:500').state;
  assert.equal(state.turn, 0, 'a loan does not spend the season');
  assert.equal(state.s.debt, 500);
  for (let seed = 1; state.stage === 'student' && seed < 50; seed++) {
    const tried = choose({ ...state, rng: seed }, 'st_exam');
    if (tried.result.roll!.success && tried.state.phase === 'action') state = tried.state;
  }
  assert.equal(state.stage, 'pilot');
  assert.ok(state.flags.includes('licensed'));
  assert.equal(state.board.rankups, 1);
  assert.ok(options(state).some((o) => o.id === 'buy:drone'));
});

test('better equipment opens better jobs', () => {
  const ids = (s: GameState) => actionViews(s).filter((o) => o.kind === 'job' && o.enabled).map((o) => o.id);
  const basic = ids(at('pilot', { drone: 1 }, ['licensed']));
  const full = ids(at('pilot', { drone: 4, gear: 3, car: 2, rep: 105 }, ['licensed']));
  assert.deepEqual(basic, ['job_event']);
  assert.ok(full.includes('job_film') && full.includes('job_wind') && full.length > basic.length + 4);
});

test('a failed flight can wreck the drone, and a worn drone flies worse', () => {
  const state = at('pilot', { drone: 3, gear: 2, car: 2, money: 500 }, ['licensed']);
  space(state, 2);
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
  space(worn, 2);
  assert.ok(option(worn, 'job_wind').roll!.chance < option(state, 'job_wind').roll!.chance);
  assert.ok(option(worn, 'job_wind').roll!.crashPct! > RULES.flight.crashPct);
});

test('three seasons of overdue debt including unpaid expenses close the ledger, even with assets', () => {
  const state = at('company', { money: 10000, staff: 12 });
  state.s.debt = creditLimit(state);
  state.board.ledger = { '직원 급여': -2000 };
  let next = state;
  for (let i = 1; i <= RULES.overdueStrikes; i++) {
    next = choose(bonus(next), 'end').state;
    assert.equal(next.s.overdue, i);
  }
  assert.equal(next.ending, 'debtor');
  assert.equal(next.score, 0);
  assert.deepEqual(next.board.ledger, {});
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
    state = choose(bonus(state), 'end').state;
    assert.equal(state.phase, 'ended', stage);
    assert.equal(state.turn, 120);
    assert.equal(derived(state).age, 50);
    assert.equal(state.ending, ending, stage);
    assert.equal(options(state).length, 0);
    assert.ok(Number.isInteger(state.score) && state.score >= 0);
  }
});

test('a planner saves stamina before a tiring rolled bonus, even with its goal available', () => {
  const state = bonus(at('student', { money: 1000, theory: 130, skill: 130, stamina: 60 }), 7);
  assert.equal(pick(POLICIES.ceo, state, botRandom(1)), 'end');
  assert.equal(pick(POLICIES.gambler, state, botRandom(1)), 'st_exam');
  space(state, 7);
  assert.equal(pick(POLICIES.ceo, state, botRandom(1)), 'st_exam');
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
    assert.ok((a.tire ?? 0) > 0, a.id);
  }
  for (const e of EVENTS) {
    assert.ok(e.place in PLACES, e.id);
    assert.ok(e.choices.length >= 2, e.id);
    assert.ok(e.choices.every(c => c.tire === undefined), e.id);
    assert.ok(e.choices.some((c) => !c.cost && !c.need), `${e.id} has a choice that is always open`);
    assert.ok(e.choices.some((c) => c.roll) || e.choices.length >= 2);
  }
  assert.deepEqual(Object.values(SPACE_MENU).flat().sort(), ids.sort());
  for (const stage of Object.keys(STAGES) as Stage[]) {
    const places = BOARD_PLACES[stage];
    assert.equal(places.length, 22);
    for (const a of ACTIONS.filter(a => !a.when.stage || a.when.stage.includes(stage))) assert.ok(places.includes(a.place), stage + ' ' + a.id);
    for (const node of BOARD.nodes.filter(n => n.kind === 'rest')) assert.equal(places[node.id], 'home');
  }
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
    assert.equal(state.board.step, 'spin');
  }
});


test('a career-winning action keeps its early score bonus and skips season settlement', () => {
  const state = at('director', { rank: 1, support: 100, money: 2000, stamina: 35, acts: 1 });
  bonus(state, 7);
  state.board.ledger = { '급여': 50 };
  state.turn = 17;
  for (let rng = 1; rng <= 50; rng++) {
    const next = choose({ ...state, rng }, 'dir_chair');
    if (!next.result.roll!.success) continue;
    assert.equal(next.result.ended, 'chairman');
    assert.equal(next.state.turn, 18);
    assert.equal(next.result.season, undefined);
    assert.equal(next.result.upkeep?.total, 50);
    assert.equal(next.state.s.stamina, 0);
    assert.equal(next.state.score, 925 + 8000 + (120 - 18) * 50);
    return;
  }
  assert.fail('expected a winning seed');
});


test('cram enrolment pays on both branches and clamps the failed stamina loss', () => {
  const state = at('student', { stamina: 4, money: 60, theory: 998 });
  state.phase = 'event';
  state.eventId = 'cram';
  const before = structuredClone(state);
  const [success, fail] = forecast(state, 'ev:0').branches;
  assert.equal(success.deltas.money, -60);
  assert.equal(success.deltas.theory, 1);
  assert.deepEqual(fail.deltas, { money: -60, stamina: -4, losses: 1, acts: 1 });
  assert.deepEqual(state, before);
  state.s.money = 5;
  assert.equal(option(state, 'ev:0').enabled, false);
  // Locked for lack of money: previewed as if the price were in hand, never as a loan.
  assert.deepEqual(forecast(state, 'ev:0').branches[1].deltas, { money: -60, stamina: -4, losses: 1, acts: 1 });
});

test('forecasts resolve sets against current values and keep bonus settlement private', () => {
  const state = at('employee', { money: 375, stamina: 30, rank: 2, support: 5, net: 150, rep: 120 }, ['licensed', 'member']);
  bonus(state, BOARD_PLACES.employee.indexOf('assoc'));
  const before = structuredClone(state);
  const success = forecast(state, 'assoc_run').branches[0];
  assert.deepEqual([success.stage, success.deltas.rank, success.deltas.support, success.endsSeason], ['director', -2, 15, true]);
  assert.deepEqual(state, before);
  state.phase = 'event';
  state.eventId = 'restructure';
  assert.equal(forecast(state, 'ev:0').branches[1].deltas.rank, -2);
});

test('a held flag is only announced on its first acquisition', () => {
  const state = at('company', { money: 1500 });
  space(state, 2);
  assert.equal(forecast(state, 'co_rnd').branches[0].flag, 'tech');
  state.flags.push('tech');
  assert.equal(forecast(state, 'co_rnd').branches[0].flag, undefined);
});

test('seeded movement follows next, pauses at the fork and resumes with the unused steps', () => {
  const state = newGame(4);
  const first = choose(state, 'spin');
  assert.deepEqual(first.result.move, { roll: 6, path: [1, 2, 3], landed: 3, stop: 'fork' });
  assert.equal(first.state.board.left, 3);
  assert.deepEqual(options(first.state).map(o => o.id), ['route:0', 'route:1']);
  for (const [route, path] of [[0, [4, 5, 6]], [1, [16, 17, 18]]] as const) {
    const next = choose(first.state, 'route:' + route);
    assert.deepEqual(next.result.move?.path, path);
    let previous = 0;
    for (const at of [...first.result.move!.path, ...path]) {
      assert.ok(BOARD.nodes[previous].next.includes(at));
      previous = at;
    }
    assert.equal(next.state.board.route, -1);
    assert.equal(next.state.board.left, 0);
    if (route === 1) {
      assert.equal(next.state.phase, 'event');
      assert.ok(CONTEST_EVENTS.includes(next.state.eventId!));
      assert.equal(next.state.board.contest, true);
    }
  }
  assert.deepEqual(boardView(state).reachable[6], [6,18]);
});

test('landing on a fork stores the route through the bonus and consumes it on the next spin', () => {
  const landed = choose(newGame(14), 'spin');
  assert.equal(landed.state.board.step, 'space');
  const picked = choose(landed.state, 'route:1').state;
  assert.deepEqual([picked.board.step, picked.board.route, picked.board.left], ['bonus', 1, 0]);
  const ready = choose(picked, 'end').state;
  assert.deepEqual(restore(JSON.parse(JSON.stringify(ready))), ready);
  assert.deepEqual(boardView(ready).reachable[1], [16]);
  const moving = choose(ready, 'spin');
  assert.equal(moving.result.move?.path[0], 16);
  assert.equal(moving.state.board.route, -1);
});

test('space waives tire, bonus offers only its place, and one bonus ends the season', () => {
  const state = space(at('student', { stamina: 20 }), 1);
  assert.equal(option(state, 'st_flight').tire, 0);
  const first = choose(state, 'st_flight');
  assert.equal(first.state.board.step, 'bonus');
  assert.equal(first.state.s.stamina, 20);
  assert.equal(first.state.s.acts, 1);
  assert.deepEqual(options(first.state).filter(o => o.kind === 'action').map(o => o.id), ['st_theory','st_sim']);
  const second = choose(first.state, 'st_sim');
  assert.equal(second.result.deltas.stamina, -20);
  assert.equal(second.state.turn, 1);
  assert.equal(second.state.board.step, 'spin');
  assert.equal(second.state.s.stamina, 30);
  assert.equal(second.state.s.acts, 0);
  assert.throws(() => choose(second.state, 'st_sim'), /not available/);
  first.state.s.stamina = 15;
  assert.equal(option(first.state, 'st_sim').enabled, false);
  assert.throws(() => choose(first.state, 'st_sim'), /disabled/);
  assert.equal(option(first.state, 'st_theory').enabled, true);
});

test('rest landing and season refill apply separately and respect the cap', () => {
  const state = at('student', { stamina: 0 }, [], 7);
  state.board.pos = 4;
  const next = choose(state, 'spin');
  assert.equal(next.result.restGain, 60);
  assert.deepEqual(next.result.season, { from: dateLabel(0), to: dateLabel(1), refill: 30, accrual: [{ label: '생활비', amount: -25 }] });
  assert.equal(next.state.s.stamina, 90);
  state.s.stamina = 85;
  assert.equal(choose(state, 'spin').result.restGain, 15);
});

test('unpaid seasons keep their individual lines until a pay space is crossed', () => {
  let state = at('employee', { money: 0, debt: 100, rank: 1 });
  for (let i = 0; i < 2; i++) {
    const next = choose(bonus(state), 'end');
    assert.equal(next.result.upkeep, undefined);
    assert.equal(next.state.s.money, 0);
    assert.equal(next.state.s.debt, 100);
    state = next.state;
  }
  assert.deepEqual(state.board.ledger, { '급여': 260, '생활비': -50, '대출 이자': -4 });
  const worth = derived(state).netWorth;
  state.board.pos = 9;
  const next = choose({ ...state, rng: 9 }, 'spin');
  assert.deepEqual(next.result.move?.path, [10, 11]);
  assert.equal(next.result.season, undefined);
  assert.equal(next.result.upkeep?.total, 206);
  assert.equal(next.state.s.money, 206);
  assert.equal(derived(next.state).netWorth, worth);
  assert.deepEqual(next.state.board.ledger, {});
  state.board.ledger = { '생활비': -55 };
  const loss = choose({ ...state, rng: 9 }, 'spin');
  assert.equal(loss.state.s.debt, 155);
  assert.equal(loss.state.s.money, 0);
});

test('passing a join counts a fork, stopping for an eligible rank ignores cash and stamina', () => {
  const state = at('student', { theory: 90, skill: 90, stamina: 0, money: 0 }, [], 4);
  state.board.pos = 18;
  const next = choose(state, 'spin');
  assert.deepEqual(next.result.move, { roll: 6, path: [7], landed: 7, stop: 'rankup' });
  assert.equal(next.state.board.forks, 1);
  assert.equal(next.state.board.step, 'space');
  assert.deepEqual(option(next.state, 'st_exam').missing, [{ stat: 'money', need: 600 }]);
  assert.ok(option(next.state, 'loan:500').enabled);
  state.s.theory = 0;
  assert.equal(choose(state, 'spin').result.move?.stop, 'fork');
});

test('contest wins count only rolled successes from contest spaces', () => {
  const state = newGame(1);
  state.phase = 'event';
  state.eventId = 'scholarship';
  Object.assign(state.board, { pos: 18, contest: true });
  for (const rng of [1, 7]) {
    const next = choose({ ...state, rng }, 'ev:0');
    assert.equal(next.state.board.contests, Number(next.result.roll!.success));
    assert.equal(next.state.board.contest, false);
    assert.equal(next.state.board.step, 'bonus');
    assert.equal(next.state.s.acts, 1);
  }
  assert.equal(choose(state, 'ev:1').state.board.contests, 0);
  state.board.contest = false;
  assert.equal(choose({ ...state, rng: 7 }, 'ev:0').state.board.contests, 0);
});

test('finalRank includes the final accrual, caps combined bonuses and awards a display grade', () => {
  const state = bonus(at('employee', { money: 600 }));
  state.turn = 119;
  Object.assign(state.board, { forks: 100, contests: 35, rankups: 12, ledger: { '생활비': -200 } });
  const next = choose(state, 'end').state;
  const r = finalRank(next);
  assert.deepEqual(r.achievements, { forks: 100, contests: 35, rankups: 12, points: 11850 });
  assert.deepEqual([r.netWorth, r.endingBonus, r.bonus, r.early, r.total], [470, 1200, 10000, 0, 10470]);
  assert.equal(next.score, r.total);
  assert.ok(r.gradeTitle && /^[SABCD]$/.test(r.grade));
  assert.deepEqual(next.board.ledger, {});
});

test('restore migrates a stripped board and sanitizes malformed board fields', () => {
  const raw = JSON.parse(JSON.stringify(newGame(3)));
  delete raw.board;
  raw.s.acts = 6;
  assert.deepEqual(restore(raw)!.board, newGame(3).board);
  assert.equal(restore(raw)!.s.acts, 0);
  raw.board = { pos: 77, step: 'fork', left: -4, roll: 9, route: 2, contest: 'true', forks: -2, rankups: 2.5,
    contests: 3, ledger: { '급여': 10, '생활비': -1.5, '가짜': 200 } };
  assert.deepEqual(restore(raw)!.board, { ...newGame(1).board, contests: 3, ledger: { '급여': 10 } });
});

test('every step of 300 random runs offers an enabled non-free choice', () => {
  for (let seed = 1; seed <= 300; seed++) assert.equal(botRun('random', seed * 7919).phase, 'ended');
});

test('auto-advance skips locked spaces and retains a money-only bonus for a bank visit', () => {
  const state = newGame(7); // One step onto rank-up, with no exam prerequisites.
  state.board.pos = 6;
  const next = choose(state, 'spin');
  assert.equal(next.result.move?.landed, 7);
  assert.equal(next.state.turn, 1);
  assert.equal(next.state.board.step, 'spin');
  assert.equal(next.state.s.money, state.s.money);

  const broke = space(at('student', { theory: 90, skill: 90, money: 0 }), 7);
  const skipped = choose(broke, 'skip');
  assert.equal(skipped.state.board.step, 'bonus');
  assert.equal(option(skipped.state, 'st_exam').enabled, false);
  const withLoan = choose(choose(skipped.state, 'loan:500').state, 'loan:100').state;
  const preview = forecast(withLoan, 'st_exam');
  const played = choose(withLoan, 'st_exam');
  const branch = preview.branches.find(b => b.id === (played.result.roll!.success ? 'success' : 'fail'))!;
  assert.equal(preview.tire, 30);
  assert.equal(branch.endsSeason, true);
  assert.deepEqual(branch.accrual, played.result.season?.accrual);
  assert.equal(played.result.upkeep, undefined);
});

test('a contest uses the regular pool on cooldown, then advances if all events are cooling down', () => {
  const state = newGame(7);
  state.board.pos = 17;
  for (const id of CONTEST_EVENTS) state.seen[id] = state.turn;
  const fallback = choose(state, 'spin').state;
  assert.equal(fallback.board.contest, true);
  assert.equal(fallback.phase, 'event');
  assert.ok(!CONTEST_EVENTS.includes(fallback.eventId!));
  for (const event of EVENTS) state.seen[event.id] = state.turn;
  const empty = choose(state, 'spin').state;
  assert.equal(empty.board.step, 'bonus');
  assert.equal(empty.board.contest, false);
  assert.equal(empty.phase, 'action');
});
