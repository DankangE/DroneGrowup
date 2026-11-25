import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cashflows, CASHFLOW_LIVES, runLife } from '../scripts/life-cashflow.ts';
import { CAREER_KEYS as C } from '../src/life/career2.ts';
import { accrue, applyEconomyChoice, assetValue, checkCredit, creditLimit, ECONOMY_KEYS as K, flightPay, homeValue,
  liquidate, netWorth, passStart, salary, settle, upkeepLines } from '../src/life/economy.ts';
import { choose, derived, forecast, newGame, options, restore } from '../src/life/engine.ts';
import { JOB_RULES } from '../src/life/tracks.ts';
import { WORLD } from '../src/life/world.ts';
import type { GameState, MapId, TrackId } from '../src/life/types.ts';

function stateAt(map: MapId = 'A', track: TrackId | null = null, rank = 0): GameState {
  const state = newGame(42);
  state.flags.push(JOB_RULES.started);
  state.board.pos = `${map}-o1`; state.board.step = 'bonus'; state.board.dice = [1, 1];
  if (track) { state.status = 'working'; state.track = track; state.job.rank = rank; }
  return state;
}
const lines = (state: GameState) => Object.fromEntries(upkeepLines(state).map(line => [line.label, line.amount]));
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}
function integerTree(value: unknown): void {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value), String(value));
  else if (value && typeof value === 'object') Object.values(value).forEach(integerTree);
}
function tile(state: GameState, kind: 'shop' | 'life', map: MapId = 'B') {
  state.board.pos = WORLD.find(node => node.map === map && node.kind === kind)!.id;
  state.board.step = 'space'; state.board.dice = [1, 1];
}

for (const [map, expected] of [['B', 275], ['E', 325], ['F', 200]] as const) {
  test(`§6.6 employee manager in ${map}: 250 → ${expected}`, () => {
    const state = stateAt(map, 'employee', 2);
    assert.equal(salary(state), expected); assert.equal(lines(state)['급여'], expected);
    assert.equal(choose(state, 'end').state.board.ledger['급여'], expected);
  });
}
test('§6.6 engineer principal in the specialist zone: 390 → 585', () => {
  const state = stateAt('D', 'engineer', 2);
  assert.equal(salary(state), 585); assert.equal(accrue(state).board.ledger['급여'], 585);
});
test('§6.6 pilot master bridge flight floors once to 534 in card, forecast and successful roll', () => {
  const state = stateAt('C', 'pilot', 4);
  state.board.pos = WORLD.find(node => node.map === 'C' && node.place === 'bridge')!.id;
  Object.assign(state.s, { drone: 3, gear: 2, car: 1, skill: 330 });
  assert.equal(flightPay(state, 235), 534);
  const option = options(state).find(option => option.id === 'act:job_bridge')!;
  assert.equal(option.roll!.success.add.money, 534); assert.equal(option.roll!.fail.add.money, -100);
  assert.equal(forecast(state, option.id).branches.find(branch => branch.id === 'success')!.deltas.money, 534);
  let won = false;
  for (let seed = 1; seed <= 50; seed++) {
    const next = choose({ ...state, rng: seed }, option.id);
    if (next.result.roll!.success) { assert.equal(next.result.deltas.money, 534); won = true; break; }
  }
  assert.ok(won);
});
test('conditional map pay, rehire pay and flight rank multipliers use the current v2 rank', () => {
  assert.equal(salary(stateAt('D', 'clerk', 2)), 230);
  assert.equal(salary(stateAt('E', 'service', 1)), 110);
  assert.equal(salary(stateAt('A', 'service', 0)), 63);
  const rehire = stateAt('E', 'employee', 2); rehire.flags.push(C.rehire);
  assert.equal(salary(rehire), 195);
  assert.deepEqual([0, 1, 2, 3, 4].map(rank => flightPay(stateAt('C', 'pilot', rank), 235)), [305, 351, 397, 458, 534]);
});

test('all four lifestyles and six map living multipliers floor integer costs', () => {
  const multipliers = { A: 100, B: 130, C: 90, D: 180, E: 160, F: 120 };
  for (const map of Object.keys(multipliers) as MapId[]) for (const life of [0, 1, 2, 3] as const) {
    const state = stateAt(map); state.life = life;
    assert.equal(lines(state)['생활비'], -Math.floor([25, 45, 90, 200][life] * multipliers[map] / 100));
  }
});
test('parental housing is free through 29 only in A; rent/upkeep and away lodging are separate', () => {
  const state = stateAt(); state.turn = (29 - 19) * 4;
  assert.equal(lines(state)['숙박비'], undefined);
  state.turn += 4; assert.equal(lines(state)['숙박비'], -20);
  for (const [tier, cost] of [0, 25, 5, 10, 20, 35, 60].entries()) {
    state.home = { map: 'A', tier, deposit: 0 };
    assert.equal(lines(state)['주거비'] ?? 0, 0 - cost);
    assert.equal(lines(state)['숙박비'], tier ? undefined : -20);
    state.board.pos = 'B-o1'; assert.equal(lines(state)['숙박비'], -20);
    assert.equal(lines(state)['주거비'] ?? 0, 0 - cost); state.board.pos = 'A-o1';
  }
  assert.equal(lines(stateAt('B'))['숙박비'], -20);
});
test('vehicle upkeep, eight student tuition seasons, allowance and six graduate seasons', () => {
  const state = stateAt(); state.timers[JOB_RULES.schoolUntil] = 8;
  for (let turn = 0; turn <= 8; turn++) {
    state.turn = turn;
    assert.equal(lines(state)['등록금'] ?? 0, turn < 8 ? -50 : 0);
    assert.equal(lines(state)['용돈'], 80);
  }
  state.status = 'jobless'; assert.equal(lines(state)['등록금'], undefined); assert.equal(lines(state)['용돈'], undefined);
  for (let car = 0; car <= 3; car++) { state.s.car = car; assert.equal(lines(state)['차량 유지비'] ?? 0, 0 - [0, 5, 15, 30][car]); }
  state.timers[K.graduateUntil] = 26;
  for (let turn = 19; turn <= 26; turn++) {
    state.turn = turn; assert.equal(lines(state)['대학원 등록금'] ?? 0, turn >= 20 && turn < 26 ? -150 : 0);
  }
});
test('existing family containers supply spouse, capped dual income, children and an education cost slot', () => {
  const state = stateAt(); state.family.marriedAt = 0; state.family.dual = true;
  state.family.kids = [{ born: 0, pts: 0, stage: 0 }, { born: 4, pts: 0, stage: 0 }];
  for (const [turn, income] of [[0, 80], [19, 80], [20, 90], [160, 160], [180, 160]]) {
    state.turn = turn; assert.equal(lines(state)['맞벌이 수입'], income); assert.equal(lines(state)['배우자 생활비'], -20);
  }
  state.turn = 79; assert.equal(lines(state)['양육비'], -70);
  state.turn = 80; assert.equal(lines(state)['양육비'], -35);
  state.turn = 84; assert.equal(lines(state)['양육비'], undefined);
  state.family.dual = false; assert.equal(lines(state)['맞벌이 수입'], undefined);
  state.timers[K.education] = 60; assert.equal(lines(state)['자녀 교육비'], -60);
});
test('pension, benefit, rent and shop income are unscaled and T05 posts career income once', () => {
  const state = stateAt('F'); state.status = 'retired'; state.timers[C.pension] = 123;
  state.timers[K.rentIncome] = 72; state.timers[K.shopIncome] = 80;
  assert.equal(lines(state)['연금'], 123); assert.equal(lines(state)['임대 수입'], 72); assert.equal(lines(state)['가게 수입'], 80);
  assert.deepEqual(choose(state, 'end').state.board.ledger, accrue(state).board.ledger);
  state.status = 'jobless'; state.timers[C.benefitUntil] = 4;
  for (let turn = 0; turn <= 4; turn++) {
    state.turn = turn; assert.equal(lines(state)['실업 급여'] ?? 0, turn < 4 ? 60 : 0);
    if (turn < 4) assert.equal(choose(state, 'end').state.board.ledger['실업 급여'], 60);
  }
});
test('business operations retain v1 contract, payroll and academy formulas without an extra instructor allowance', () => {
  const state = stateAt('E', 'company'); state.s.contracts = 5; state.s.staff = 2;
  assert.equal(lines(state)['계약 매출'], 360); assert.equal(lines(state)['직원 급여'], -150); assert.equal(lines(state)['사옥 운영비'], -90);
  state.track = 'solo'; assert.equal(lines(state)['고정 계약 수입'], 300);
  state.track = 'academy'; state.s.students = 30; state.s.level = 1;
  assert.equal(lines(state)['수강료 수입'], 528); assert.equal(lines(state)['교관 급여'], -140); assert.equal(lines(state)['실습장 운영비'], -90);
  state.track = 'instructor'; state.job.rank = 1; state.flags.push('examiner');
  assert.equal(lines(state)['급여'], 180); assert.equal(lines(state)['평가관 수당'], undefined);
});
test('accrual defers cash; settlement preserves net worth, clears once and borrows exactly the shortfall', () => {
  const state = stateAt('B', 'employee', 2), before = structuredClone(state);
  const accrued = accrue(frozen(state));
  assert.equal(accrued.s.money, 500); assert.equal(accrued.board.ledger['급여'], 275);
  assert.deepEqual(state, before); assert.equal(netWorth(settle(accrued)), netWorth(accrued));
  assert.deepEqual(settle(settle(accrued)), settle(accrued));
  const poor = stateAt(); poor.s.money = 3; poor.s.debt = 4; poor.board.ledger = { expense: -25 };
  const paid = settle(poor); assert.equal(paid.s.money, 0); assert.equal(paid.s.debt, 26); assert.deepEqual(paid.board.ledger, {});
  poor.s.debt = 199; assert.equal(lines(poor)['대출 이자'], -1);
});

test('credit uses eight current-map salaries plus half of held assets, excluding cash and pending salary', () => {
  const state = stateAt('B', 'employee', 2); state.s.drone = 1; state.fund.amount = 1000;
  assert.equal(assetValue(state), 1100); assert.equal(creditLimit(state), 1000 + 275 * 8 + 550);
  state.s.money = 10000; state.board.ledger = { 급여: 500 };
  assert.equal(creditLimit(state), 3750); assert.equal(netWorth(state), 11600);
});
test('asset valuation includes deposits, indexed homes, extra estates, businesses and organization value once', () => {
  const state = stateAt('B'); state.home = { map: 'B', tier: 2, deposit: 1500 };
  assert.equal(assetValue(state), 1500);
  state.home = { map: 'E', tier: 4, deposit: 0 }; state.s.homeIndex = 110;
  assert.equal(homeValue(state, state.home), 21450);
  state.estates = [{ map: 'A', tier: 3, paid: 4200 }]; state.holdings = [{ id: 'shop', level: 1, paid: 1200 }];
  state.fund.amount = 100; state.track = 'company'; state.s.value = 12345;
  assert.equal(assetValue(state), 21450 + 4620 + 840 + 100 + 1234);
});

function assets(): GameState {
  const state = stateAt(); state.status = 'jobless'; state.s.money = 0;
  state.holdings = [{ id: 'first', level: 1, paid: 1000 }, { id: 'second', level: 1, paid: 2000 }];
  state.fund.amount = 1000; state.estates = [{ map: 'B', tier: 3, paid: 6000 }];
  Object.assign(state.s, { drone: 1, gear: 1, car: 1 });
  return state;
}
test('forced liquidation order is shops → fund → extra houses → equipment at 70%, leaving the residence', () => {
  const state = assets(); state.s.debt = 50000; state.home = { map: 'B', tier: 4, deposit: 0 };
  const next = liquidate(frozen(state));
  assert.equal(next.s.debt, 50000 - 2100 - 700 - 4200 - 420);
  assert.deepEqual(next.holdings, []); assert.equal(next.fund.amount, 0); assert.deepEqual(next.estates, []);
  assert.deepEqual([next.s.drone, next.s.gear, next.s.car, next.s.cond], [0, 0, 0, 0]);
  assert.deepEqual(next.home, state.home); assert.equal(next.phase, 'action');
});
test('liquidation stops at the recalculated limit without selling later categories', () => {
  const state = assets();
  state.s.debt = creditLimit(state) + 1;
  const next = liquidate(state);
  assert.deepEqual(next.holdings.map(row => row.id), ['second']);
  assert.equal(next.fund.amount, 1000); assert.equal(next.estates.length, 1); assert.equal(next.s.drone, 1);
  assert.equal(next.s.debt, state.s.debt - 700); assert.ok(next.s.debt <= creditLimit(next));
});
test('selling the fund can restore credit before any extra house is sold', () => {
  const state = assets(); state.holdings = []; state.s.debt = creditLimit(state) + 1;
  const next = liquidate(state);
  assert.equal(next.fund.amount, 0); assert.equal(next.estates.length, 1); assert.equal(next.s.drone, 1);
  assert.equal(next.s.debt, state.s.debt - 700);
});
test('an extra house is liquidated before equipment, and surplus proceeds become cash', () => {
  const state = assets(); state.holdings = []; state.fund.amount = 0;
  state.s.debt = creditLimit(state) + 1;
  const next = liquidate(state);
  assert.equal(next.estates.length, 0); assert.equal(next.s.drone, 1); assert.equal(next.s.debt, 0);
  assert.equal(next.s.money, 4200 - state.s.debt);
});
test('only strictly above 120% for four consecutive seasons triggers liquidation; interruption resets it', () => {
  let state = stateAt(); state.status = 'jobless'; state.s.money = 0; state.s.debt = 1200;
  assert.equal(checkCredit(state).s.overdue, 0);
  state.s.debt++;
  for (let i = 1; i <= 3; i++) { state = checkCredit(state); assert.equal(state.s.overdue, i); }
  const recovered = structuredClone(state); recovered.s.debt = 1200;
  assert.equal(checkCredit(recovered).s.overdue, 0);
  state = checkCredit(state); assert.equal(state.s.overdue, 0); assert.equal(state.phase, 'action'); assert.equal(state.ending, null);
  assert.equal(state.log.at(-1)!.text, '자산을 정리해 빚을 갚았다.');
});
test('season close triggers liquidation and counts only the ledger shortfall not covered by cash', () => {
  const state = stateAt(); state.status = 'jobless'; state.s.debt = 1200; state.board.ledger = { expense: -500 };
  assert.equal(checkCredit(state).s.overdue, 0);
  state.s.money = 0; assert.equal(checkCredit(state).s.overdue, 1);
  state.s.overdue = 3; state.s.debt = 2000; state.fund.amount = 100;
  const next = choose(state, 'end').state;
  assert.equal(next.s.overdue, 0); assert.equal(next.fund.amount, 0); assert.equal(next.turn, 1); assert.equal(next.phase, 'action');
});

test('lap allowance is strictly after eight seasons, records every crossing and uses that map salary', () => {
  const state = stateAt('E', 'employee', 2); state.board.lapAt.B = 4;
  state.turn = 12; assert.equal(passStart(state, 'B').s.money, 500);
  state.turn = 13;
  const next = passStart(state, 'B'); assert.equal(next.s.money, 555); assert.equal(next.board.lapAt.B, 13);
  assert.equal(next.board.lapAt.E, -1); assert.equal(passStart(next, 'B').s.money, 555);
  for (const status of ['student', 'jobless'] as const) {
    state.status = status; assert.equal(passStart(state, 'B').s.money, 530);
  }
  state.status = 'retired'; assert.equal(passStart(state, 'B').s.money, 500);
});
test('first start crossing uses elapsed time since start; engine settles and pays the allowance once on passing/landing', () => {
  for (const destination of ['A-o0', 'A-o1']) {
    const state = stateAt(); state.turn = 9; state.board.pos = 'A-o27'; state.board.step = 'pick'; state.board.dice = [1, 2];
    state.board.ledger = { 급여: 100 };
    const next = choose(state, `go:${destination}`);
    assert.equal(next.state.s.money, 630); assert.equal(next.state.board.lapAt.A, 9);
    assert.deepEqual(next.state.board.ledger, {}); assert.equal(next.result.upkeep!.total, 130);
    assert.equal(next.result.upkeep!.lines.filter(line => line.label === '한 바퀴 수당').length, 1);
  }
  const early = stateAt(); early.turn = 8; assert.equal(passStart(early, 'A').s.money, 500);
});

test('phone buys, sales, repair, loans and repayments do not advance the season, RNG, tile or extra action', () => {
  let state = stateAt(); state.s.money = 3000;
  const ids = ['buy:drone', 'buy:gear', 'buy:car', 'repair', 'loan:100', 'loan:500', 'loan:2000', 'repay:100', 'sell:gear'];
  for (const id of ids) {
    if (id === 'repair') state.s.cond = 20;
    if (id === 'loan:2000') { state.track = 'employee'; state.status = 'working'; state.job.rank = 2; }
    const before = structuredClone(state), option = options(state, 'phone').find(option => option.id === id)!;
    assert.ok(option.enabled, id); assert.ok(option.free, id);
    const preview = forecast(frozen(state), id), next = choose(state, id);
    assert.deepEqual(next.result.deltas, preview.branches[0].deltas); assert.equal(preview.branches[0].endsSeason, false);
    assert.equal(next.state.turn, before.turn); assert.equal(next.state.rng, before.rng); assert.equal(next.state.s.acts, before.s.acts);
    assert.equal(next.state.board.step, before.board.step); assert.deepEqual(next.state.board.ledger, before.board.ledger);
    assert.deepEqual(state, before); state = next.state;
  }
  assert.equal(state.s.gear, 0); assert.equal(state.s.cond, 100);
});
test('phone works during events and movement without dismissing them; unavailable and disabled choices reject', () => {
  const state = stateAt(); state.phase = 'event'; state.eventId = 'placeholder'; state.board.step = 'space';
  const next = choose(state, 'buy:drone').state;
  assert.equal(next.phase, 'event'); assert.equal(next.eventId, 'placeholder'); assert.equal(next.board.step, 'space');
  state.phase = 'action'; state.eventId = null; state.board.step = 'pick';
  assert.equal(choose(state, 'buy:drone').state.board.step, 'pick');
  state.s.money = 0; assert.throws(() => choose(state, 'buy:drone'), /disabled/);
  assert.throws(() => choose(state, 'loan:2000'), /disabled/); assert.throws(() => choose(state, 'loan:999'), /not available/);
  assert.throws(() => choose(state, 'sell:drone'), /not available/); assert.throws(() => choose(state, 'repair'), /not available/);
  state.phase = 'ended'; assert.deepEqual(options(state, 'phone'), []); assert.throws(() => choose(state, 'loan:100'));
});
test('phone lists regular prices, repair charges per drone level and sale removes the whole item', () => {
  const state = stateAt();
  for (const [kind, price] of [['drone', 200], ['gear', 100], ['car', 300]] as const) {
    assert.equal(options(state, 'phone').find(o => o.id === `buy:${kind}`)!.cost, price);
  }
  state.s.drone = 2; state.s.cond = 20;
  assert.equal(options(state, 'phone').find(o => o.id === 'repair')!.cost, 30);
  const repaired = choose(state, 'repair').state;
  assert.equal(repaired.s.money, 470); assert.equal(repaired.s.cond, 100);
  const sold = choose(state, 'sell:drone').state;
  assert.equal(sold.s.money, 750); assert.equal(sold.s.drone, 0); assert.equal(sold.s.cond, 0);
  state.s.drone = 5; assert.ok(!options(state, 'phone').some(o => o.id === 'buy:drone'));
});
test('street purchase is 85%, resale is 60%, phone resale 50%, and one street choice uses the tile slot', () => {
  const state = stateAt(); state.s.drone = 2; state.s.money = 3000; tile(state, 'shop');
  const offered = options(state);
  assert.equal(offered.find(o => o.id === 'buy:drone')!.cost, 956);
  assert.equal(offered.find(o => o.id === 'sell:drone')!.sure!.add.money, 300);
  const next = choose(state, 'buy:drone');
  assert.equal(next.state.s.drone, 3); assert.equal(next.state.s.money, 2044); assert.equal(next.state.s.cond, 100);
  assert.equal(next.state.board.step, 'bonus'); assert.equal(next.state.turn, 0);
  assert.equal(options(next.state, 'phone').find(o => o.id === 'sell:drone')!.sure!.add.money, 562);
  assert.ok(options(state).some(o => o.id === 'skip' && o.enabled && !o.cost));
  assert.equal(choose(state, 'skip').state.board.step, 'bonus');
});
test('bank offers 100/500/2000, clamps repayments to remaining debt and rejects unaffordable repayments', () => {
  const state = stateAt(); state.s.debt = 90; state.s.money = 50;
  assert.deepEqual(options(state, 'phone').filter(o => o.id.startsWith('loan:')).map(o => o.id), ['loan:100', 'loan:500', 'loan:2000']);
  assert.throws(() => choose(state, 'repay:90'), /disabled/);
  const next = choose(state, 'repay:50').state; assert.equal(next.s.debt, 40); assert.equal(next.s.money, 0);
});
test('lifestyle changes use a life tile choice, preserve a free exit and accrue the new cost', () => {
  for (const level of [0, 1, 2, 3] as const) {
    const state = stateAt(); tile(state, 'life');
    const next = choose(state, `lifestyle:${level}`).state;
    assert.equal(next.life, level); assert.equal(next.board.step, 'bonus'); assert.equal(next.turn, state.turn);
    assert.equal(lines(next)['생활비'], -Math.floor([25, 45, 90, 200][level] * 130 / 100));
    assert.ok(options(state).some(o => o.id === 'skip' && o.enabled));
  }
  assert.throws(() => choose(stateAt(), 'lifestyle:3'), /not available/);
});
test('economy states, views and saved continuations remain pure, integral and deterministic', () => {
  const state = stateAt('E', 'employee', 2); state.s.money = 9999;
  state.timers[K.graduateUntil] = 6; state.board.ledger = { income: 25 };
  const before = structuredClone(state); frozen(state);
  for (const fn of [accrue, settle, liquidate, checkCredit]) {
    const next = fn(state); integerTree(next); assert.deepEqual(state, before);
    assert.deepEqual(restore(JSON.parse(JSON.stringify(next))), next);
  }
  assert.equal(applyEconomyChoice(state, 'lifestyle:3').life, 3); assert.deepEqual(state, before);
  const saved = restore(JSON.parse(JSON.stringify(state)))!;
  assert.deepEqual(choose(saved, 'loan:500'), choose(state, 'loan:500'));
  assert.deepEqual(derived(state).upkeep.lines, upkeepLines(state)); integerTree(derived(state));
});

test('§7.5 fixed cashflow schedules retain all sixteen source targets and are deterministic', () => {
  assert.deepEqual(CASHFLOW_LIVES.map(life => life.targets), [[3000, 14000, 33000, 42000], [1800, 9000, 22000, 30000],
    [2500, 20000, 55000, 80000], [4000, 26000, 60000, 75000]]);
  assert.equal(cashflows().length, 16); assert.deepEqual(cashflows(), cashflows());
});
for (const life of CASHFLOW_LIVES) for (const row of runLife(life)) {
  test(`§7.5 ${row.id} age ${row.age}: ${row.actual} within ±25% of ${row.target}`, () => {
    assert.ok(Number.isSafeInteger(row.actual)); assert.ok(row.pass);
    assert.ok(Math.abs(row.actual - row.target) * 100 <= row.target * 25);
  });
}
