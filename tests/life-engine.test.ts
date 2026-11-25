import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTEST_EVENTS, RULES, STAGES } from '../src/game/data.ts';
import { creditLimit, netWorth, upkeepLines } from '../src/life/economy.ts';
import { ACTIONS, EVENTS } from '../src/life/compat.ts';
import { choose, currentEvent, derived, forecast, HOOKS, lifeEvent, met, newGame, options, reachable, restore,
  yearEnd } from '../src/life/engine.ts';
import { LIFE_RULES, SPACE_MENU, STATS } from '../src/life/life-data.ts';
import { randInt, rollDice } from '../src/life/move.ts';
import { JOB_RULES } from '../src/life/tracks.ts';
import { WORLD } from '../src/life/world.ts';
import type { GameState, StatMap, WorldNode } from '../src/life/types.ts';

// Independent chooser: never consumes the game's RNG or uses Math.random.
function chooser(seed: number) {
  let value = seed >>> 0;
  return (count: number) => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return Math.floor(value / 4294967296 * count);
  };
}
function allIntegers(value: unknown, path = 'state'): void {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value), `${path}: ${value}`);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) allIntegers(child, `${path}.${key}`);
  }
}
function freezeDeep(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(freezeDeep);
  Object.freeze(value);
}
function at(pos: string, step: GameState['board']['step'] = 'space', stats: StatMap = {}): GameState {
  const state = newGame(1);
  state.board.pos = pos; state.board.step = step;
  state.board.dice = step === 'spin' ? [] : [1, 1];
  Object.assign(state.s, stats);
  return state;
}
function withNode(id: string, patch: Partial<WorldNode>, run: () => void): void {
  const node = WORLD.find(node => node.id === id)!, before = { ...node };
  Object.assign(node, patch);
  try { run(); } finally {
    Object.assign(node, before);
    if (!before.cross) delete node.cross;
  }
}
function passive(state: GameState): string {
  const offered = options(state).filter(option => option.enabled);
  return (offered.find(option => option.id === 'skip' || option.id === 'end') ?? offered[0]).id;
}

test('newGame starts a complete integer v2 state at the actual map A start', () => {
  const state = newGame(42);
  assert.equal(WORLD.find(node => node.id === state.board.pos)?.kind, 'start');
  assert.equal(state.board.pos, 'A-o0');
  assert.deepEqual([state.v, state.turn, state.status, state.track, state.phase], [2, 0, 'student', null, 'action']);
  assert.deepEqual(state.board.lapAt, { A: -1, B: -1, C: -1, D: -1, E: -1, F: -1 });
  assert.equal(state.board.visited, 1);
  assert.deepEqual(Object.keys(state.s).sort(), [...STATS].sort());
  for (const [stat, value] of Object.entries({ ...LIFE_RULES.start, money: JOB_RULES.startMoney })) {
    assert.equal(state.s[stat as keyof StatMap], value);
  }
  assert.deepEqual(options(state).map(option => option.id), ['start:school', 'start:work', 'start:self']);
  assert.deepEqual(restore(JSON.parse(JSON.stringify(state))), state);
  assert.equal(newGame(0).seed, 1); assert.equal(newGame(-1).seed, 4294967295);
  assert.equal(newGame(12.9).seed, 12); assert.equal(newGame(NaN).seed, 1);
  state.family.kids.push({ born: 0, pts: 0, stage: 0 });
  assert.deepEqual(newGame(42).family.kids, []);
  allIntegers(state);
});

test('calendar, period boundaries, remaining seasons and age stamina caps match section 2', () => {
  const expected = [
    [0, 19, '봄', '청년기', 100], [4, 20, '봄', '청년기', 100],
    [64, 35, '봄', '중년기', 100], [124, 50, '봄', '중년기', 90],
    [144, 55, '봄', '장년기', 90], [164, 60, '봄', '장년기', 80],
    [203, 69, '겨울', '장년기', 80],
  ] as const;
  for (const [turn, age, season, period, cap] of expected) {
    const state = newGame(7); state.turn = turn;
    const d = derived(state);
    assert.deepEqual([d.age, d.seasonName, d.period, d.capStamina], [age, season, period, cap]);
    assert.equal(d.season, turn % 4); assert.equal(d.remainingSeasons, 204 - turn);
    assert.equal(d.dateLabel, `${age}세 · ${season}`);
  }
  const counts: Record<string, number> = {};
  for (let turn = 0; turn < 204; turn++) {
    const state = newGame(1); state.turn = turn;
    const period = derived(state).period; counts[period] = (counts[period] ?? 0) + 1;
  }
  assert.deepEqual(counts, { 청년기: 64, 중년기: 80, 장년기: 60 });
  for (const [turn, cap] of [[123, 90], [163, 80]]) {
    const state = at('A-o1', 'bonus'); state.turn = turn;
    state.s.capStamina = turn === 123 ? 100 : 90; state.s.stamina = state.s.capStamina;
    const next = choose(state, 'end').state;
    assert.equal(next.s.capStamina, cap); assert.equal(next.s.stamina, cap);
    assert.deepEqual(next.board.dice, []); assert.equal(next.board.step, 'spin');
  }
});

test('yearEnd fires at turns 4..204 by 4; lifeEvent at 4..204 by 8, after winter close', () => {
  const years: number[] = [], lives: number[] = [], old = { ...HOOKS };
  assert.equal(yearEnd(newGame(1)).turn, 0); assert.equal(lifeEvent(newGame(1)).turn, 0);
  HOOKS.yearEnd = state => {
    years.push(state.turn);
    assert.ok(Object.keys(state.board.ledger).length > 0, 'season ledger is accrued before hooks');
    return { ...state, timers: { ...state.timers, years: (state.timers.years ?? 0) + 1 } };
  };
  HOOKS.lifeEvent = state => {
    lives.push(state.turn); assert.equal(years.at(-1), state.turn);
    return { ...state, timers: { ...state.timers, lives: (state.timers.lives ?? 0) + 1 } };
  };
  try {
    const preview = at('A-o1', 'bonus'); preview.turn = 3;
    forecast(preview, 'end'); assert.deepEqual(years, []);
    let state = newGame(22);
    while (state.phase !== 'ended') state = choose(state, passive(state)).state;
    assert.deepEqual(years, Array.from({ length: 51 }, (_, index) => (index + 1) * 4));
    assert.deepEqual(lives, Array.from({ length: 26 }, (_, index) => 4 + index * 8));
    assert.equal(state.timers.years, 51); assert.equal(state.timers.lives, 26);
    assert.equal(state.turn, 204);
  } finally { Object.assign(HOOKS, old); }
});

test('spin delegates two dice to T02 and automatically travels only for a single destination', () => {
  const cases = new Set<number>();
  for (let seed = 1; seed <= 100; seed++) {
    const state = choose(newGame(seed), 'start:school').state, preview = structuredClone(state);
    rollDice(preview); const moves = reachable(preview);
    const actual = choose(state, 'spin');
    assert.deepEqual(actual.state.board.dice, preview.board.dice);
    if (moves.length === 1) {
      cases.add(1); assert.equal(actual.state.board.pos, moves[0].node);
      assert.notEqual(actual.state.board.step, 'pick');
      assert.deepEqual(actual.result.move, moves[0]);
    } else {
      cases.add(2); assert.equal(actual.state.board.step, 'pick');
      assert.deepEqual(options(actual.state).map(option => option.id), moves.map(move => `go:${move.node}`));
      assert.ok(options(actual.state).every(option => option.enabled));
    }
    assert.equal(actual.state.turn, 0);
  }
  assert.deepEqual([...cases].sort(), [1, 2]);
});

test('empty movement, jobfair and unimplemented tile kinds always offer a way forward', () => {
  withNode('A-o0', { next: [] }, () => {
    const result = choose(choose(newGame(3), 'start:school').state, 'spin');
    assert.equal(result.state.board.pos, 'A-o0');
    assert.ok(options(result.state).length > 0);
    const picking = at('A-o0', 'pick');
    assert.deepEqual(options(picking).map(option => option.id), ['skip']);
    assert.equal(choose(picking, 'skip').state.board.step, 'bonus');
  });
  for (const kind of ['rankup', 'jobfair', 'shop', 'estate', 'life', 'biz', 'luck', 'station', 'invest']) {
    const node = WORLD.find(node => node.kind === kind)!;
    const state = at(node.id);
    const exit = kind === 'jobfair' ? 'job:none' : 'skip';
    if (['jobfair', 'shop', 'life', 'estate', 'biz', 'invest', 'station'].includes(kind)) {
      assert.ok(options(state).some(option => option.id === exit && option.enabled && !option.cost && !option.tire));
    } else assert.deepEqual(options(state).map(option => option.id), ['skip'], kind);
    const next = choose(state, exit).state;
    assert.equal(next.board.step, 'bonus'); assert.ok(options(next).some(option => option.id === 'end'));
  }
});

test('pay/start settlement on passing or arrival clears the ledger exactly once and tracks start visits', () => {
  for (const [origin, destination, steps] of [['A-o10', 'A-o11', 1], ['A-o27', 'A-o0', 1],
    ['A-o10', 'A-o12', 2], ['A-o27', 'A-o1', 2]] as const) {
    // Fix the accounting balance independently of the starting bankroll.
    const state = at(origin, 'pick', { money: 60 }); state.board.dice = [steps, steps];
    state.board.ledger = { 급여: 95, 생활비: -25 };
    const { state: next, result } = choose(state, `go:${destination}`);
    assert.equal(next.s.money, 130); assert.deepEqual(next.board.ledger, {});
    assert.equal(result.upkeep?.total, 70); assert.equal(result.upkeep?.lines.length, 2);
    assert.equal(result.settle?.deltas.money, 70);
    assert.equal(next.board.lapAt.A, origin === 'A-o27' ? state.turn : -1);
    assert.equal(next.board.step, ['A-o11', 'A-o0', 'A-o12'].includes(destination) ? 'bonus' : 'space');
    assert.deepEqual(state.board.ledger, { 급여: 95, 생활비: -25 });
  }
  const shortfall = at('A-o10', 'pick', { money: 3, debt: 4 });
  shortfall.board.ledger = { 생활비: -25 };
  const next = choose(shortfall, 'go:A-o11').state;
  assert.equal(next.s.money, 0); assert.equal(next.s.debt, 26);
});

test('transfer options reflect filtered fares, and applyMove charges the selected fare', () => {
  const state = at('A-o13', 'pick', { money: 10 });
  const move = reachable(state).find(move => move.fare > 0)!;
  assert.ok(move);
  const option = options(state).find(option => option.id === `go:${move.node}`)!;
  assert.equal(option.enabled, true); assert.ok(option.desc.includes(`${move.fare}`));
  const next = choose(state, option.id).state;
  assert.equal(next.s.money, state.s.money - move.fare);
  assert.notEqual(next.board.visited, state.board.visited);
  state.s.money = 0;
  assert.ok(reachable(state).every(move => move.fare === 0));
  assert.ok(options(state).every(option => option.enabled));
});

test('rest is automatic once, gains 60, and respects the age cap', () => {
  for (const [turn, stamina, cap, gain] of [[0, 10, 100, 60], [164, 35, 80, 45], [164, 80, 80, 0]]) {
    const state = at('A-o2', 'pick', { stamina, capStamina: cap }); state.turn = turn;
    const { state: next, result } = choose(state, 'go:A-o3');
    assert.equal(result.restGain, gain); assert.equal(next.s.stamina, stamina + gain);
    assert.equal(next.board.step, 'bonus'); assert.equal(next.turn, turn);
    const closed = choose(next, 'end').state;
    assert.equal(closed.s.stamina, Math.min(cap, stamina + gain + RULES.seasonRefill));
  }
});

test('tile menus preserve v1 kind/when filters; extra actions use place, when and stamina', () => {
  for (const nodeId of ['A-o1', 'A-o2', 'A-o6', 'A-o10']) {
    const state = at(nodeId, 'space', { stamina: 0 });
    const node = WORLD.find(node => node.id === nodeId)!;
    assert.deepEqual(options(state).filter(option => option.id.startsWith('act:')).map(option => option.id),
      ACTIONS.filter(action => SPACE_MENU[node.kind]?.includes(action.id) && met(state, action.when)).map(action => `act:${action.id}`));
    assert.ok(options(state).every(option => option.tire === 0));
    state.board.step = 'bonus';
    assert.deepEqual(options(state).map(option => option.id), ['end']);
    state.s.stamina = 100;
    assert.deepEqual(options(state).filter(option => option.id.startsWith('act:')).map(option => option.id),
      ACTIONS.filter(action => action.place === node.place && met(state, action.when) && (action.tire ?? 0) <= 100).map(action => `act:${action.id}`));
  }
  const state = at('A-o1');
  const tile = choose(state, 'act:st_theory').state;
  assert.equal(tile.s.acts, 1); assert.equal(tile.board.step, 'bonus'); assert.equal(tile.turn, 0);
  const extra = choose(tile, 'act:st_theory');
  assert.equal(extra.state.turn, 1); assert.equal(extra.state.board.step, 'spin'); assert.equal(extra.state.s.acts, 0);
  assert.equal(extra.result.season?.refill, 15);
  assert.throws(() => choose(extra.state, 'act:st_theory'), /not available/);
  assert.throws(() => choose(state, 'end'), /not available/);
  const locked = at('A-o1', 'space', { money: 0 });
  assert.equal(options(locked).find(option => option.id === 'act:st_sim')?.enabled, false);
  assert.throws(() => choose(locked, 'act:st_sim'), /disabled/);
});

test('events use weighted cooldown selection, contest preference and normal fallback', () => {
  const state = at('A-o7', 'pick');
  let pool = EVENTS.filter(event => met(state, event.when) && CONTEST_EVENTS.includes(event.id));
  const expected = structuredClone(state);
  let weight = randInt(expected, pool.reduce((sum, event) => sum + event.weight, 0));
  const event = pool.find(event => { weight -= event.weight; return weight < 0; })!;
  const next = choose(state, 'go:A-o8').state;
  assert.equal(next.phase, 'event'); assert.equal(next.board.step, 'space');
  assert.equal(next.eventId, event.id); assert.equal(next.rng, expected.rng);
  assert.equal(next.seen[event.id], state.turn);
  assert.ok(options(next).some(option => option.id === 'skip' && option.enabled));
  assert.ok(currentEvent(next)?.choices.some(choice => !choice.cost && !choice.need));
  const answered = choose(next, 'ev:1').state;
  assert.equal(answered.phase, 'action'); assert.equal(answered.board.step, 'bonus'); assert.equal(answered.eventId, null);
  assert.throws(() => choose(answered, 'ev:1'), /not available/);
  const skipped = choose(next, 'skip').state;
  assert.equal(skipped.board.step, 'bonus'); assert.equal(skipped.eventId, null);
  state.turn = 7;
  for (const event of EVENTS) state.seen[event.id] = 0;
  const exhausted = choose(state, 'go:A-o8').state;
  assert.equal(exhausted.phase, 'action'); assert.deepEqual(options(exhausted).map(option => option.id), ['skip']);
  state.turn = 8;
  assert.equal(choose(state, 'go:A-o8').state.phase, 'event', 'cooldown boundary is inclusive');
  state.seen = Object.fromEntries(pool.map(event => [event.id, state.turn]));
  const fallback = choose(state, 'go:A-o8').state;
  assert.equal(fallback.phase, 'event'); assert.ok(!CONTEST_EVENTS.includes(fallback.eventId!));
  // The ordinary event tile uses the full pool, with the same weighted RNG procedure.
  state.board.pos = 'A-o4'; state.seen = {};
  pool = EVENTS.filter(event => met(state, event.when));
  const normalPreview = structuredClone(state);
  weight = randInt(normalPreview, pool.reduce((sum, event) => sum + event.weight, 0));
  const normal = pool.find(event => { weight -= event.weight; return weight < 0; })!;
  assert.equal(choose(state, 'go:A-o5').state.eventId, normal.id);
});

test('condition gates retain mixed status/track OR, bounds and flags', () => {
  const state = newGame(1);
  assert.ok(met(state, { any: [{ status: ['student'] }, { track: ['employee'] }] }));
  assert.ok(!met(state, { any: [] }));
  assert.ok(!met(state, { any: [{ status: ['student'] }], min: { skill: 45 } }));
  state.status = 'working'; state.track = 'employee'; state.flags = ['licensed']; state.s.skill = 45;
  assert.ok(met(state, { track: ['employee'], min: { skill: 45 }, flags: ['licensed'] }));
  assert.ok(!met(state, { status: ['student'] }));
  assert.ok(!met(state, { max: { skill: 44 } }));
  assert.ok(!met(state, { notFlags: ['licensed'] }));
});

test('v2 accounting replaces compatibility amounts while preserving business close effects', () => {
  for (const track of Object.keys(STAGES).filter(stage => stage !== 'student')) {
    const state = at('A-o1', 'bonus', { money: 100, debt: 101, rank: 1, staff: 2, students: 20, contracts: 3, value: 500 });
    state.status = 'working'; state.track = track as GameState['track']; state.flags = ['examiner'];
    assert.deepEqual(derived(state).upkeep.lines, upkeepLines(state), track);
    assert.equal(derived(state).creditLimit, creditLimit(state));
    assert.equal(derived(state).netWorth, netWorth(state));
    const next = choose(state, 'end').state;
    assert.deepEqual(next.board.ledger, Object.fromEntries(derived(state).upkeep.lines.map(line => [line.label, line.amount])));
    assert.equal(next.board.ledger['대출 이자'], -1);
    if (track === 'academy') assert.equal(next.s.students, 18);
    if (track === 'company') assert.equal(next.s.value, 560);
  }
  let state = at('A-o1', 'bonus', { debt: 50000 });
  for (let count = 1; count <= RULES.overdueStrikes + 2; count++) {
    state.board.step = 'bonus';
    state = choose(state, 'end').state;
    assert.equal(state.s.overdue, count % 4); assert.equal(state.phase, 'action'); assert.equal(state.ending, null);
  }
  state.s.debt = 0; state.board.ledger = {}; state.board.step = 'bonus';
  assert.equal(choose(state, 'end').state.s.overdue, 0);
});

test('timeout settles the last ledger, selects debtor/worker, scores net worth and ends at 204', () => {
  for (const debt of [0, 10000]) {
    const state = at('A-o1', 'bonus', { money: 4000, debt, stamina: 80, capStamina: 80 });
    state.turn = 203; state.board.ledger = { 급여: 200 };
    const next = choose(state, 'end').state;
    assert.equal(next.turn, 204); assert.equal(next.phase, 'ended');
    assert.deepEqual(next.board.ledger, {}); assert.deepEqual(options(next), []);
    assert.equal(next.ending, debt ? 'debtor' : 'worker');
    assert.equal(next.score, debt ? 0 : derived(next).netWorth);
    assert.equal(derived(next).remainingSeasons, 0);
    assert.deepEqual(restore(JSON.parse(JSON.stringify(next))), next);
    assert.throws(() => choose(next, 'spin'), /not available/);
  }
});

test('imported achievement effects also cannot end T03 early', () => {
  const state = at('B-o24', 'bonus', { money: 5000, support: 100, rank: 1, stamina: 100 });
  state.board.pos = WORLD.find(node => node.place === 'assoc')!.id;
  state.status = 'working'; state.track = 'director';
  let success = false;
  for (let seed = 1; seed <= 50; seed++) {
    state.rng = seed;
    const result = choose(state, 'act:dir_chair');
    if (!result.result.roll?.success) continue;
    success = true;
    assert.equal(result.state.turn, 1); assert.equal(result.state.phase, 'action'); assert.equal(result.state.ending, null);
    assert.ok(forecast(state, 'act:dir_chair').branches.every(branch => !branch.end));
    break;
  }
  assert.ok(success);
});

test('forecasts match actual action/event/flight branches and displayed chances, without mutation', () => {
  const branches = new Set<string>();
  for (const mode of ['tile', 'bonus', 'event', 'flight'] as const) {
    for (let seed = 1; seed <= 80; seed++) {
      const state = at(mode === 'flight' ? 'A-o2' : 'A-o6', mode === 'tile' ? 'space' : 'bonus',
        { money: 200, stamina: mode === 'flight' ? 20 : 80 });
      state.rng = seed;
      let id = 'act:st_flight';
      if (mode === 'event') { state.phase = 'event'; state.board.step = 'space'; state.eventId = 'club'; id = 'ev:0'; }
      if (mode === 'flight') {
        state.status = 'working'; state.track = 'pilot'; state.s.drone = 1; state.s.cond = 10; id = 'act:job_event';
      }
      const before = structuredClone(state); freezeDeep(state);
      const preview = forecast(state, id), offered = options(state).find(option => option.id === id)!;
      const actual = choose(state, id);
      assert.deepEqual(state, before);
      assert.equal(actual.result.roll?.chance, offered.roll?.chance); assert.equal(preview.chance, offered.roll?.chance);
      assert.ok(preview.chance! >= 5 && preview.chance! <= 95);
      const branchId = actual.result.crashed ? 'crash' : actual.result.roll?.success ? 'success' : 'fail';
      branches.add(branchId);
      const branch = preview.branches.find(branch => branch.id === branchId)!;
      assert.deepEqual(actual.result.deltas, branch.deltas);
      assert.equal(branch.endsSeason, !!actual.result.season);
      assert.equal(actual.result.roll?.success, actual.result.roll!.value < preview.chance!);
      allIntegers(actual.state);
    }
  }
  assert.deepEqual([...branches].sort(), ['crash', 'fail', 'success']);
  const locked = at('A-o1', 'bonus', { money: 0 });
  assert.equal(forecast(locked, 'act:st_sim').branches[0].deltas.money, -25);
  assert.equal(locked.s.debt, 0);
});

test('restore fills absent optional v2 fields and detaches every nested container', () => {
  const raw = JSON.parse(JSON.stringify(newGame(9)));
  for (const key of ['job', 'home', 'estates', 'holdings', 'family', 'fund', 'life', 'timers', 'feats']) delete raw[key];
  for (const stat of ['happy', 'fans', 'homeIndex', 'capStamina']) delete raw.s[stat];
  delete raw.board.lapAt;
  assert.deepEqual(restore(raw), newGame(9));
  const saved = newGame(7);
  saved.family.kids.push({ born: 0, pts: 2, stage: 0 }); saved.timers.future = 8; saved.feats.push('future');
  saved.flags.push('future_flag'); saved.home = { map: 'A', tier: 1, deposit: 100 };
  saved.estates.push({ map: 'B', tier: 1, paid: 300 }); saved.holdings.push({ id: 'future_shop', level: 1, paid: 50 });
  const restored = restore(JSON.parse(JSON.stringify(saved)))!;
  assert.deepEqual(restored, saved);
  restored.family.kids[0].pts++; restored.home!.deposit++; restored.estates[0].paid++;
  assert.equal(saved.family.kids[0].pts, 2); assert.equal(saved.home.deposit, 100); assert.equal(saved.estates[0].paid, 300);
});

test('restore rejects floats anywhere, invalid enums, malformed nested shapes and impossible lifecycle fields', () => {
  const mutations: ((raw: ReturnType<typeof JSON.parse>) => void)[] = [
    raw => { raw.v = 1; }, raw => { raw.turn = 1.5; }, raw => { raw.rng = -1; }, raw => { raw.seed = 0; },
    raw => { raw.s.money = 1.5; }, raw => { raw.s.happy = 2.5; }, raw => { raw.s.car = 4; },
    raw => { raw.board.dice = [1, 1.5]; }, raw => { raw.board.dice = [1]; },
    raw => { raw.board.step = 'pick'; }, raw => { raw.board.pos = 'missing'; }, raw => { raw.board.step = 'fork'; },
    raw => { raw.board.ledger.salary = 3.5; }, raw => { raw.board.lapAt.A = 0.5; },
    raw => { raw.status = 'pilot'; }, raw => { raw.track = 'unknown'; }, raw => { raw.job = []; },
    raw => { raw.job.perf = 2.5; }, raw => { raw.job.tracks = ['unknown']; }, raw => { raw.family = null; },
    raw => { raw.family.kids = [{ born: 0, pts: 2.5, stage: 0 }]; },
    raw => { raw.home = { map: 'Z', tier: 1, deposit: 1 }; }, raw => { raw.holdings = [null]; },
    raw => { raw.fund.amount = 2.5; }, raw => { raw.life = 4; }, raw => { raw.timers.a = 2.5; },
    raw => { raw.flags = [1]; }, raw => { raw.feats = null; }, raw => { raw.seen.a = 1.5; },
    raw => { raw.log = [{ turn: 0, text: 'x', tone: 'unknown' }]; }, raw => { raw.extra = { a: 1.5 }; },
    raw => { raw.phase = 'ended'; raw.ending = 'worker'; }, raw => { raw.turn = 204; },
    raw => { raw.phase = 'event'; raw.eventId = 'missing'; }, raw => { raw.eventId = 'club'; },
    raw => { raw.s.stamina = Infinity; }, raw => { raw.timers = new Map(); },
  ];
  for (const [index, mutate] of mutations.entries()) {
    const raw = JSON.parse(JSON.stringify(newGame(1))); mutate(raw);
    assert.equal(restore(raw), null, `invalid shape ${index}`);
  }
  for (const raw of [null, [], 'save', 2, undefined]) assert.equal(restore(raw), null);
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  assert.equal(restore(cyclic), null);
});

const finalStates: GameState[] = [];
function randomRun(seed: number, check: boolean): GameState {
  const pick = chooser(seed), midpoint = 20 + pick(100);
  let state = newGame(seed), steps = 0;
  const turns = Array.from({ length: 204 }, () => ({ spin: 0, again: 0, tile: 0, extra: 0 }));
  while (state.phase !== 'ended') {
    assert.ok(steps < 204 * 7, `seed ${seed}: stuck`);
    const offered = options(state), enabled = offered.filter(option => option.enabled);
    assert.ok(enabled.length > 0);
    assert.ok(offered.every(option => /^(spin|go:[A-F]-[a-z]\d+|act:[a-z0-9_]+|ev:\d+|start:(school|work|self)|job:[a-z]+|quit|promo|retire:(pension|rehire|switch)|(buy|sell):(drone|gear|car)|lifestyle:[0-3]|home:(rent|sell|move):[1-6]|home:buy:[3-6](:mortgage)?|biz:(buy|up|sell|check):[a-z_]+|fund:(in|out|kind):\d+|luck:(promote|wait|shortcut:[a-z]+)|graduate:enroll|express:[A-F]-o0|skip|end)$/.test(option.id)));
    const exits = enabled.filter(option => option.id === 'skip' || option.id === 'end' || option.id === 'job:none'
      || (option.id.startsWith('ev:') && !option.cost && !option.tire));
    if (state.board.step === 'spin' || state.board.step === 'pick') {
      // Before landing, start/job choices also provide a free route to the first spin.
      assert.ok(enabled.some(option => !option.cost && !option.tire));
      if (state.board.step === 'pick') assert.ok(reachable(state).some(move => move.fare === 0));
    } else assert.ok(exits.length > 0, `seed ${seed}: no free popup exit`);
    const option = enabled[pick(enabled.length)], count = turns[state.turn];
    if (option.id === 'spin') count.spin++;
    else if ((state.phase === 'event' || state.board.step === 'space')
      && /^(act:|ev:|home:|graduate:|express:|skip)/.test(option.id)) count.tile++;
    else if (state.board.step === 'bonus' && option.id.startsWith('act:')) count.extra++;
    assert.ok(count.spin <= 1 + count.again && count.tile <= 1 && count.extra <= 1);
    const before = check && seed <= 20 ? structuredClone(state) : null;
    const next = choose(state, option.id);
    if (next.result.luck?.id === 'again') count.again++;
    if (before) { assert.deepEqual(state, before); allIntegers(next.state); }
    if (check && seed <= 60 && steps >= midpoint && (steps - midpoint) % 23 === 0) {
      const restored = restore(JSON.parse(JSON.stringify(state)));
      assert.ok(restored, `seed ${seed}, step ${steps}`);
      assert.deepEqual(restored, state);
      assert.deepEqual(choose(restored, option.id), next);
    }
    state = next.state; steps++;
  }
  assert.equal(state.turn, 204); assert.equal(state.phase, 'ended');
  assert.ok(turns.every(count => count.spin === 1 + count.again && count.tile <= 1 && count.extra <= 1));
  assert.equal(turns.reduce((sum, count) => sum + count.spin - count.again, 0), 204);
  assert.deepEqual(options(state), []); allIntegers(state);
  return state;
}

test('200 seeded random runs end at 204 seasons with only luck-granted extra spins, bounded slots and integer states', t => {
  for (let seed = 1; seed <= 200; seed++) finalStates.push(randomRun(seed, true));
  t.diagnostic('200/200 runs: 204 seasons, 204 spins + luck rerolls; tile <= 1, extra <= 1; integers each step for 20 seeds and finals for 200; restore replay for 60 seeds');
});

test('same game seed and same chooser reproduce identical complete runs', () => {
  for (const seed of [1, 2, 7, 19, 42, 60, 100, 150, 200]) {
    const expected = finalStates[seed - 1] ?? randomRun(seed, true);
    assert.deepEqual(randomRun(seed, false), expected);
  }
});
