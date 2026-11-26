import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, derived, forecast, newGame, options, restore } from '../src/life/engine.ts';
import { CAREER_KEYS, careerIncome, promotionView, specialView } from '../src/life/career2.ts';
import { advanceCareer, yearEndReview } from '../src/life/jobs.ts';
import { endingFor } from '../src/life/ending.ts';
import { upkeepLines } from '../src/life/economy.ts';
import { ASSET_KEYS } from '../src/life/life-data.ts';
import type { GameState, TrackId } from '../src/life/types.ts';
import { WORLD } from '../src/life/world.ts';

function worker(track: TrackId, rank = 0): GameState {
  const state = choose(newGame(1), 'start:self').state;
  state.turn = 8; state.status = 'working'; state.track = track;
  state.job = { rank, perf: 50, tenure: 0, total: 0, warn: 0, changedAt: 0, tracks: [track] };
  Object.assign(state.s, { rank, money: 10000, support: 100 });
  state.board.pos = WORLD.find(node => node.place === 'assoc')!.id;
  state.board.step = 'bonus'; state.board.dice = [1, 1];
  return state;
}
function close(prev: GameState): GameState {
  // Put the fixture at a quiet tile; choose still performs the real seasonal accounting.
  const state = structuredClone(prev);
  state.phase = 'action'; state.eventId = null;
  state.board.pos = 'A-o1'; state.board.step = 'bonus'; state.board.dice = [1, 1];
  while (options(state).some(option => option.id === 'job:none')) {
    Object.assign(state, choose(state, 'job:none').state);
  }
  return choose(state, 'end').state;
}
function election(state: GameState, action = 'dir_chair', success = true) {
  for (let rng = 1; rng <= 100; rng++) {
    const before = { ...state, rng }, outcome = choose(before, `act:${action}`);
    if (outcome.result.roll!.success === success) return { before, ...outcome };
  }
  assert.fail('seeded election branch must exist');
}
const lines = (state: GameState) => Object.fromEntries(upkeepLines(state).map(line => [line.label, line.amount]));

test('P2.1: phone purchases on a pending shop tile cost full price and preserve its discounted action', () => {
  const state = worker('service');
  state.board.pos = WORLD.find(node => node.kind === 'shop')!.id; state.board.step = 'space';
  assert.equal(forecast(state, 'buy:drone', 'phone').cost, 200);
  assert.equal(forecast(state, 'buy:drone').cost, 170);
  const bought = choose(state, 'buy:drone', 'phone').state;
  assert.equal(bought.s.money, state.s.money - 200);
  assert.equal(bought.s.acts, state.s.acts); assert.equal(bought.turn, state.turn);
  assert.equal(bought.board.step, 'space');
  assert.ok(options(bought).some(option => option.id === 'buy:gear' && option.enabled));
  const street = choose(bought, 'buy:gear').state;
  assert.equal(street.s.money, bought.s.money - 85); assert.equal(street.board.step, 'bonus');
  assert.equal(street.s.acts, bought.s.acts + 1);
  assert.equal(forecast(bought, 'sell:drone', 'phone').branches[0].deltas.money, 100);
  assert.equal(forecast(bought, 'sell:drone').branches[0].deltas.money, 120);
});

test('P2.1: phone purchases also preserve the tile coupon, while keeping the owned-shop benefit', () => {
  const state = worker('service');
  state.board.pos = WORLD.find(node => node.kind === 'shop')!.id; state.board.step = 'space';
  state.flags.push(ASSET_KEYS.coupon);
  assert.equal(forecast(state, 'buy:drone', 'phone').cost, 200);
  const phone = choose(state, 'buy:drone', 'phone').state;
  assert.ok(phone.flags.includes(ASSET_KEYS.coupon)); assert.equal(phone.board.step, 'space');
  assert.equal(forecast(phone, 'buy:gear').cost, 68);
  assert.ok(!choose(phone, 'buy:gear').state.flags.includes(ASSET_KEYS.coupon));
  state.holdings = [{ id: 'drone_shop', level: 1, paid: 3000 }];
  assert.equal(forecast(state, 'buy:drone', 'phone').cost, 180, '§8.5 ownership discount also applies to the phone');
});

test('P2.2: support eligibility cannot elect a director through annual review, a rank tile or special promotion', () => {
  for (const rank of [0, 1]) {
    const state = worker('director', rank); state.s.support = 75;
    assert.equal(yearEndReview(state).job.rank, rank);
    const tile = WORLD.find(node => node.kind === 'rankup')!;
    assert.equal(promotionView(state, tile).enabled, false);
    assert.equal(specialView(state).enabled, false);
    if (!rank) assert.ok(!options(state).some(option => option.id === 'act:dir_chair'));
  }
});

test('P2.2: winning the vice and chairman elections updates authoritative rank, while a loss does not', () => {
  const vice = election(worker('director'), 'dir_vice').state;
  assert.equal(vice.job.rank, 1); assert.equal(vice.s.rank, 1);
  vice.board.step = 'bonus'; vice.board.dice = [1, 1]; vice.s.stamina = 100;
  const win = election(vice);
  assert.equal(win.state.job.rank, 2); assert.equal(win.state.s.rank, 2);
  assert.equal(win.state.timers[CAREER_KEYS.chairStarted], win.before.turn);
  assert.ok(win.state.flags.includes('elected')); assert.ok(win.state.feats.includes('chairman'));
  assert.equal(win.state.job.perf, 50); assert.equal(win.state.ending, null);
  assert.deepEqual(choose(restore(JSON.parse(JSON.stringify(win.before)))!, 'act:dir_chair').state, win.state);
  const loss = election(vice, 'dir_chair', false).state;
  assert.equal(loss.job.rank, 1); assert.ok(!loss.flags.includes('elected'));
});

test('P2.3: listed companies compound value by an integer 3% each season in addition to contract growth', () => {
  const base = worker('company'); Object.assign(base.s, { value: 10001, contracts: 2, staff: 1 });
  assert.equal(close(base).s.value, 10041);
  base.flags.push('listed');
  const next = close(base); assert.equal(next.s.value, 10341);
  assert.equal(close(next).s.value, 10691);
  assert.deepEqual(close(restore(JSON.parse(JSON.stringify(base)))!), next);
  const other = worker('solo'); other.s.value = 10001; other.flags.push('listed');
  assert.equal(close(other).s.value, 10001);
});

test('P2.4: accredited academies receive 150% of seated tuition, with unchanged staff/campus costs', () => {
  const base = worker('academy'); Object.assign(base.s, { students: 30, staff: 1, level: 2 });
  assert.equal(lines(base)['수강료 수입'], 352);
  const accredited = structuredClone(base); accredited.flags.push('accredited');
  assert.equal(lines(accredited)['수강료 수입'], 528);
  for (const label of ['교관 급여', '실습장 운영비']) assert.equal(lines(accredited)[label], lines(base)[label]);
  assert.equal(close(accredited).board.ledger['수강료 수입'], 528);
});

test('P2.5: a chairman serves 16 seasons, then retires as honorary chairman with 120 pension each season', () => {
  const won = election(worker('director', 1)); const started = won.before.turn;
  let state = won.state;
  while (state.turn < started + 16) {
    assert.equal(state.status, 'working'); assert.equal(state.job.rank, 2);
    assert.equal(careerIncome(state).pension, 0); state = close(state);
    state = restore(JSON.parse(JSON.stringify(state)))!; assert.ok(state);
  }
  assert.equal(state.turn, started + 16); assert.equal(state.status, 'retired'); assert.equal(state.track, null);
  assert.equal(derived(state).stageName, '명예회장'); assert.equal(careerIncome(state).pension, 120);
  assert.equal(state.board.ledger['연금'] ?? 0, 0, 'the final working season pays salary, not a second pension');
  assert.equal(state.board.ledger['급여'], 440 + 15 * 360, 'one season in B (110%), fifteen in A (90%)');
  assert.equal(endingFor(state).id, 'chairman'); assert.ok(options(state).some(option => option.enabled));
  const first = close(state); assert.equal(first.board.ledger['연금'], 120);
  assert.deepEqual(advanceCareer(first), first, 'repeated career close cannot double-post');
  assert.equal(close(first).board.ledger['연금'], 240);
});

test('P2.5: old elected saves without a term timer restore and start a full term at their saved season', () => {
  const old = worker('director', 2); old.flags.push('elected'); old.turn = 40;
  const snapshot = structuredClone(old); let state = restore(old)!; assert.ok(state);
  assert.equal(state.timers[CAREER_KEYS.chairStarted], old.turn);
  assert.deepEqual(old, snapshot, 'migration never mutates the source save');
  for (let i = 0; i < 16; i++) { assert.equal(state.status, 'working'); state = close(state); }
  assert.equal(state.status, 'retired'); assert.equal(careerIncome(state).pension, 120);
  const former = worker('director'); former.flags.push('elected');
  assert.deepEqual(restore(former), former, 'a previous election feat alone does not start another term');
});

test('P2.6: only working, licensed delivery drivers earn the flat 30 allowance each season', () => {
  const state = worker('delivery');
  assert.equal(lines(state)['드론 배송 수당'] ?? 0, 0);
  state.flags.push('licensed');
  assert.equal(lines(state)['드론 배송 수당'], 30);
  assert.equal(close(state).board.ledger['드론 배송 수당'], 30);
  state.board.pos = 'E-o1'; assert.equal(lines(state)['드론 배송 수당'], 30);
  state.track = 'mechanic'; assert.equal(lines(state)['드론 배송 수당'] ?? 0, 0);
  state.track = 'delivery'; state.status = 'retired'; assert.equal(lines(state)['드론 배송 수당'] ?? 0, 0);
});
