import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARDS } from '../src/life/cards.ts';
import { ITEMS } from '../src/life/data.ts';
import { assetChoices, drawLuck, fundYearEnd, shopIncome, shortcutMoves } from '../src/life/assets.ts';
import { CAREER_KEYS } from '../src/life/career2.ts';
import { choose, derived, forecast, newGame, options, reachable, restore } from '../src/life/engine.ts';
import { ASSET_KEYS as K, FUNDS, LUCK, SHOPS } from '../src/life/life-data.ts';
import { randInt, reachable as baseReachable, rollDice } from '../src/life/move.ts';
import { JOB_RULES } from '../src/life/tracks.ts';
import { WORLD } from '../src/life/world.ts';
import type { GameState, MapId } from '../src/life/types.ts';

function at(pos = 'A-o1', step: GameState['board']['step'] = 'space'): GameState {
  const state = newGame(1);
  state.status = 'jobless'; state.flags.push(JOB_RULES.started);
  state.board.pos = pos; state.board.step = step; state.board.dice = step === 'spin' ? [] : [1, 1];
  Object.assign(state.s, { money: 100000, stamina: 50, rep: 20, net: 20 });
  return state;
}
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
}
function saved(state: GameState): GameState {
  const restored = restore(JSON.parse(JSON.stringify(state)));
  assert.ok(restored); assert.deepEqual(restored, state);
  return restored;
}
function rollSeed(value: number, range: number): number {
  for (let seed = 1; seed < 100000; seed++) {
    const state = newGame(seed);
    if (randInt(state, range) === value) return seed;
  }
  throw new Error('test seed missing');
}
function cardState(id: string, prepare?: (state: GameState) => void) {
  const state = at('A-o11', 'pick');
  state.rng = rollSeed(LUCK.findIndex(card => card.id === id), LUCK.length);
  prepare?.(state);
  const before = structuredClone(state); freeze(state);
  const next = choose(state, 'go:A-o12');
  assert.equal(next.result.luck?.id, id); assert.equal(next.state.turn, state.turn);
  assert.deepEqual(state, before); assert.deepEqual(choose(saved(state), 'go:A-o12'), next);
  saved(next.state);
  if (CARDS.some(card => card.id === id)) {
    assert.deepEqual(next.state.hand, [{ id, at: state.turn }]);
    // This helper tests activation separately from the luck-tile storage transaction.
    next.state.board.step = id === 'triple' ? 'spin' : 'space';
    if (id === 'triple') next.state.board.dice = [];
    return { before: state, ...choose(next.state, `card:use:${id}`) };
  }
  return { before: state, ...next };
}
function action(state: GameState, id: string, menu: 'board' | 'phone' = 'board') {
  const before = structuredClone(state), preview = forecast(state, id, menu);
  const result = choose(state, id, menu);
  const branch = result.result.roll ? result.result.roll.success ? 'success' : 'fail' : 'sure';
  assert.deepEqual(result.result.deltas, preview.branches.find(row => row.id === branch)!.deltas);
  assert.deepEqual(choose(saved(state), id, menu), result); assert.deepEqual(state, before);
  saved(result.state);
  return result;
}
const shopNode = (id: string) => {
  const shop = SHOPS.find(row => row.id === id)!;
  return WORLD.find(node => node.kind === 'biz' && node.map === shop.map && node.place === shop.place)!.id;
};

const expectedShops = [
  ['drone_cafe', 1200, [35, 35, 35, 35]], ['drone_shop', 3000, [80, 80, 80, 80]],
  ['farm', 2500, [110, 110, 30, 30]], ['waterfront_cafe', 2000, [60, 60, 60, 60]],
  ['franchise', 5000, [130, 130, 130, 130]], ['building', 25000, [600, 600, 600, 600]],
  ['pension', 4000, [70, 180, 70, 70]],
] as const;
for (const [id, price, income] of expectedShops) test(`shop ${id}: purchase, four-season income, two 60% upgrades, +50% income and 70% sale`, () => {
  const initial = at(shopNode(id));
  const bought = action(initial, `biz:buy:${id}`);
  let state = bought.state;
  assert.equal(state.s.money, initial.s.money - price);
  assert.deepEqual(state.holdings, [{ id, level: 1, paid: price }]);
  assert.equal(state.board.step, 'bonus'); assert.equal(state.turn, 0);
  for (const level of [1, 2, 3]) {
    for (let season = 0; season < 4; season++) {
      state.turn = (level - 1) * 4 + season;
      const expected = Math.floor(income[season] * (100 + (level - 1) * 50) / 100);
      assert.equal(shopIncome(state, id), expected);
      assert.equal(derived(state).upkeep.lines.find(row => row.label === '가게 수입')?.amount, expected);
      const ended = action(state, 'end');
      assert.equal(ended.state.board.ledger['가게 수입'], expected);
      assert.equal(ended.result.season?.accrual.find(row => row.label === '가게 수입')?.amount, expected);
    }
    state.board.step = 'space'; state.s.acts = 0;
    assert.ok(!options(state).some(row => row.id === `biz:buy:${id}`));
    if (level < 3) {
      const before = state.s.money;
      state = action(state, `biz:up:${id}`).state;
      assert.equal(before - state.s.money, Math.floor(price * 60 / 100));
    }
  }
  assert.equal(options(state).find(row => row.id === `biz:up:${id}`)?.enabled, false);
  assert.throws(() => choose(state, `biz:up:${id}`), /disabled/);
  const paid = price + 2 * Math.floor(price * 60 / 100);
  assert.equal(state.holdings[0].paid, paid);
  const bare = structuredClone(state); bare.holdings = [];
  assert.equal(derived(state).netWorth - derived(bare).netWorth, Math.floor(paid * 70 / 100));
  const checked = action(state, `biz:check:${id}`);
  assert.equal(checked.state.s.money - state.s.money, shopIncome(state, id));
  assert.equal(choose(checked.state, 'end').state.board.ledger['가게 수입'], shopIncome(state, id));
  assert.throws(() => choose(checked.state, `biz:check:${id}`), /not available/);
  const sold = action(state, `biz:sell:${id}`).state;
  assert.equal(sold.s.money - state.s.money, Math.floor(paid * 70 / 100));
  assert.deepEqual(sold.holdings, []);
  assert.ok(!derived(sold).upkeep.lines.some(row => row.label === '가게 수입'));
  assert.equal(choose(sold, 'end').state.board.ledger['가게 수입'], undefined);
});

test('shop location, job independence, four-holding limit, insufficient cash and free exits', () => {
  for (const status of ['student', 'jobless', 'working', 'retired'] as const) {
    const state = at(shopNode('farm')); state.status = status;
    if (status === 'working') state.track = 'service';
    assert.ok(options(state).find(row => row.id === 'biz:buy:farm')?.enabled);
  }
  const state = at(shopNode('farm'));
  assert.ok(!options(state).some(row => row.id === 'biz:buy:pension'));
  assert.ok(!options(state, 'phone').some(row => row.id.startsWith('biz:')));
  state.s.money = 2499;
  assert.throws(() => choose(state, 'biz:buy:farm'), /disabled/);
  state.s.money = 10000;
  state.holdings = SHOPS.slice(0, 4).map(shop => ({ id: shop.id, level: 1, paid: shop.price }));
  state.board.pos = shopNode('pension');
  assert.match(options(state).find(row => row.id === 'biz:buy:pension')!.locks.join(), /4/);
  assert.throws(() => choose(state, 'biz:buy:pension'), /disabled/);
  assert.equal(choose(state, 'skip').state.board.step, 'bonus');
});

test('building index affects price and income, while resale and net worth remain 70% of actual investment', () => {
  const state = at(shopNode('building')); state.s.homeIndex = 125;
  const bought = action(state, 'biz:buy:building').state;
  assert.equal(state.s.money - bought.s.money, 31250); assert.equal(shopIncome(bought, 'building'), 750);
  bought.board.step = 'space'; bought.s.homeIndex = 80;
  assert.equal(shopIncome(bought, 'building'), 480);
  const sold = action(bought, 'biz:sell:building').state;
  assert.equal(sold.s.money - bought.s.money, 21875);
});

test('income accrues regardless of current map and liquidation leaves no stale shop income', () => {
  for (const map of ['A', 'B', 'C', 'D', 'E', 'F'] as MapId[]) {
    const state = at(`${map}-o0`, 'bonus');
    state.holdings = [{ id: 'farm', level: 2, paid: 4000 }, { id: 'pension', level: 1, paid: 4000 }];
    assert.equal(choose(state, 'end').state.board.ledger['가게 수입'], 235);
  }
  const state = at('A-o1', 'bonus'); state.s.money = 0; state.s.debt = 50000; state.s.overdue = 3;
  state.holdings = [{ id: 'farm', level: 1, paid: 2500 }];
  const next = choose(state, 'end').state;
  assert.deepEqual(next.holdings, []);
  assert.ok(!derived(next).upkeep.lines.some(row => row.label === '가게 수입'));
});

test('drone shop gives 10% on drone and equipment, combines with street prices, never discounts cars', () => {
  const state = at('A-o21'); state.holdings = [{ id: 'drone_shop', level: 1, paid: 3000 }];
  for (const kind of ['drone', 'gear', 'car'] as const) {
    const base = ITEMS[kind].levels[0].price, street = Math.floor(base * 85 / 100);
    const cost = kind === 'car' ? street : Math.floor(street * 90 / 100);
    assert.equal(options(state).find(row => row.id === `buy:${kind}`)!.cost, cost);
    assert.equal(state.s.money - action(state, `buy:${kind}`).state.s.money, cost);
  }
  state.board.pos = 'A-o1'; state.board.step = 'spin'; state.board.dice = [];
  assert.equal(action(state, 'buy:drone', 'phone').result.deltas.money, -Math.floor(ITEMS.drone.levels[0].price * 90 / 100));
});

for (const [kind, boundaries] of [[0, [[0, 4]]], [1, [[59, 14], [60, -8]]], [2, [[44, 35], [45, -20]]]] as const) {
  test(`fund ${kind}: exact year-end branches, integer floors, deterministic RNG and once-per-year settlement`, () => {
    for (const [roll, rate] of boundaries) {
      const state = at(); state.turn = 4; state.fund = { kind, amount: 1001 }; state.rng = rollSeed(roll, 100);
      const before = structuredClone(state), expected = structuredClone(state);
      if (kind) randInt(expected, 100);
      freeze(state);
      const next = fundYearEnd(state);
      assert.equal(next.fund.amount, 1001 + Math.floor(1001 * rate / 100));
      assert.equal(next.rng, expected.rng); assert.deepEqual(state, before);
      assert.deepEqual(fundYearEnd(next), next); assert.deepEqual(fundYearEnd(saved(state)), next);
      saved(next);
    }
  });
}

test('fund returns happen only after winter, including the terminal winter; empty balances consume no RNG', () => {
  for (const turn of [0, 1, 2, 3, 203]) {
    const state = at('A-o1', 'bonus'); state.turn = turn; state.fund = { kind: 0, amount: 1001 };
    if (turn === 203) { state.s.capStamina = 80; state.s.stamina = 50; }
    const next = action(state, 'end').state;
    assert.equal(next.fund.amount, turn === 3 || turn === 203 ? 1041 : 1001);
    assert.equal(next.phase, turn === 203 ? 'ended' : turn === 3 ? 'event' : 'action');
  }
  const state = at(); state.turn = 4; state.fund.kind = 2;
  assert.equal(fundYearEnd(state).rng, state.rng);
  state.turn = 0; state.fund.amount = 1000; assert.deepEqual(fundYearEnd(state), state);
});

test('investment tile deposits, withdrawals and type changes are free of fees and use one tile action', () => {
  let state = at('E-o3');
  const paid = action(state, 'fund:in:2000').state;
  assert.equal(paid.s.money, state.s.money - 2000); assert.equal(paid.fund.amount, 2000);
  assert.equal(paid.board.step, 'bonus'); assert.equal(paid.turn, state.turn);
  state = paid; state.board.step = 'space'; state.s.acts = 0;
  const kind = action(state, 'fund:kind:2').state;
  assert.deepEqual(kind.fund, { kind: 2, amount: 2000 }); assert.equal(kind.s.money, state.s.money);
  state = kind; state.board.step = 'space'; state.s.acts = 0;
  const out = action(state, 'fund:out:500').state;
  assert.equal(out.fund.amount, 1500); assert.equal(out.s.money - state.s.money, 500);
  assert.throws(() => choose({ ...state, fund: { kind: 2, amount: 499 } }, 'fund:out:500'), /disabled/);
  assert.throws(() => choose(state, 'fund:in:-1'), /not available/);
  assert.throws(() => choose(state, 'fund:kind:3'), /not available/);
  assert.throws(() => choose(state, 'fund:in:0.5'), /not available/);
  assert.equal(choose(state, 'skip').state.board.step, 'bonus');
});

test('phone charges 2% for deposits, withdrawals and conversions without consuming a season or pending popup', () => {
  let state = at('E-o3'); state.timers[K.popup] = K.shortcut;
  state.s.money = 1020;
  const paid = action(state, 'fund:in:1000', 'phone').state;
  assert.equal(paid.s.money, 0); assert.equal(paid.fund.amount, 1000);
  assert.equal(paid.board.step, state.board.step); assert.equal(paid.turn, state.turn);
  assert.equal(paid.timers[K.popup], K.shortcut);
  state = paid;
  assert.throws(() => choose(state, 'fund:kind:1', 'phone'), /disabled/);
  const out = action(state, 'fund:out:500', 'phone').state;
  assert.equal(out.s.money, 490); assert.equal(out.fund.amount, 500);
  const switched = action(out, 'fund:kind:1', 'phone').state;
  assert.equal(switched.s.money, 480); assert.deepEqual(switched.fund, { kind: 1, amount: 500 });
  const floor = at('A-o1', 'spin'); floor.s.money = 101; floor.fund.amount = 51;
  assert.ok(options(floor, 'phone').some(row => row.id === 'fund:in:100' && !row.enabled));
  assert.equal(action(floor, 'fund:out:51', 'phone').state.s.money, 151);
});

const instant = [
  ['prize', { money: 300 }], ['refund', { money: 150 }], ['parking', { money: -80 }],
  ['wedding_gift', { money: -100, net: 5 }], ['tonic', { stamina: 30 }],
  ['cold', { stamina: -20 }], ['rumor', { rep: -8 }],
] as const;
for (const [id, changes] of instant) test(`luck ${id}: applies the specified effect automatically on landing`, () => {
  const next = cardState(id);
  for (const [stat, delta] of Object.entries(changes)) {
    const key = stat as keyof GameState['s'];
    assert.equal(next.state.s[key] - next.before.s[key], delta);
    assert.equal(next.result.settle?.deltas[key], delta);
  }
  assert.equal(next.state.board.step, 'bonus');
});

test('luck again: a second movement in this season, then exactly one seasonal accrual', () => {
  const { state } = cardState('again');
  assert.equal(state.board.step, 'spin'); assert.deepEqual(state.board.dice, []);
  assert.ok(options(state).some(row => row.id === 'spin'));
  let next = choose(state, 'spin').state;
  if (next.board.step === 'pick') next = choose(next, options(next).find(row => row.id.startsWith('go:'))!.id).state;
  while (next.turn === state.turn) {
    const opts = options(next);
    const exit = opts.find(row => row.id === 'skip' || row.id === 'end' || row.id === 'job:none') ?? opts.find(row => row.enabled)!;
    next = choose(next, exit.id).state;
  }
  assert.equal(next.turn, state.turn + 1);
});

test('luck triple: next spin rolls three seeded dice and the third die offers reachable destinations', () => {
  const { state } = cardState('triple');
  assert.ok(state.flags.includes(K.triple));
  const ready = state, rng = structuredClone(ready);
  const dice = rollDice(rng), third = randInt(rng, 6) + 1;
  const next = choose(ready, 'spin').state;
  assert.deepEqual(next.board.dice, [...dice, third]); assert.equal(next.rng, rng.rng);
  assert.ok(!next.flags.includes(K.triple)); saved(next);
  const pick = at('A-o0', 'pick'); pick.board.dice = [1, 1, 6];
  assert.ok(reachable(pick).some(row => row.node === 'A-o6'));
  assert.ok(!baseReachable(pick).some(row => row.node === 'A-o6'));
  assert.equal(choose(pick, 'go:A-o6').state.board.pos, 'A-o6');
  for (let car = 0; car <= 3; car++) {
    pick.s.car = car;
    const expected: Set<string> = new Set(pick.board.dice.flatMap(die => baseReachable({ ...pick, board: { ...pick.board, dice: [die, die] } }).map(row => row.node)));
    assert.deepEqual(new Set(reachable(pick).map(row => row.node)), expected);
  }
});

test('luck transfer: first transfer is free at zero cash, special-zone gates still apply, and local travel preserves it', () => {
  const { state } = cardState('transfer');
  state.board.pos = 'B-o21'; state.board.step = 'pick'; state.board.dice = [1, 1]; state.s.money = 0;
  assert.ok(!reachable(state).some(row => row.node === 'D-o1'));
  assert.equal(reachable(state).find(row => row.node === 'F-o1')?.fare, 0);
  assert.ok(choose(state, 'go:B-o22').state.flags.includes(K.transfer));
  state.flags.push('licensed'); state.s.theory = 150;
  const before = structuredClone(state); freeze(state);
  const optionsBefore = options(state); forecast(state, 'go:D-o1');
  assert.deepEqual(state, before); assert.deepEqual(options(state), optionsBefore);
  const next = choose(saved(state), 'go:D-o1');
  assert.equal(next.state.s.money, 0); assert.equal(next.result.move?.fare, 0);
  assert.ok(!next.state.flags.includes(K.transfer));
});

test('luck shortcut: nearest directed tile of every kind on the current map, reusable landing effects and exit', () => {
  const { state } = cardState('shortcut');
  assert.equal(state.timers[K.popup], K.shortcut);
  assert.ok(options(state).find(row => row.id === 'luck:shortcut:station')?.enabled);
  assert.deepEqual(shortcutMoves(state).find(row => row.node === 'A-o13')?.path, ['A-o13']);
  const next = action(state, 'luck:shortcut:rest');
  assert.equal(next.state.board.pos, 'A-o17'); assert.equal(next.result.restGain, 50);
  assert.equal(next.state.timers[K.popup], undefined); assert.equal(next.state.board.step, 'bonus');
  assert.equal(choose(state, 'skip').state.timers[K.popup], undefined);
  for (const map of ['A', 'B', 'C', 'D', 'E', 'F'] as MapId[]) {
    const source = at(`${map}-o0`), moves = shortcutMoves(source);
    const distances = new Map<string, number>(), queue = [...WORLD.find(row => row.id === source.board.pos)!.next];
    for (const id of queue) distances.set(id, 1);
    for (let i = 0; i < queue.length; i++) for (const id of WORLD.find(row => row.id === queue[i])!.next) {
      if (!distances.has(id)) { distances.set(id, distances.get(queue[i])! + 1); queue.push(id); }
    }
    for (const move of moves) {
      const node = WORLD.find(row => row.id === move.node)!;
      assert.equal(node.map, map);
      const candidates = WORLD.filter(row => row.map === map && row.kind === node.kind);
      assert.equal(move.steps, Math.min(...candidates.map(row => distances.get(row.id) ?? Infinity)));
    }
  }
});

test('transfer pass survives a promotion stop before the transfer and pays only the first of two transfers', () => {
  const stopped = at('A-o7', 'pick'); stopped.flags.push(K.transfer);
  stopped.status = 'working'; stopped.track = 'service'; stopped.job.tenure = 4;
  stopped.job.perf = 50; stopped.s.xp = 100; stopped.s.car = 2; stopped.s.money = 0;
  stopped.board.dice = [6, 6];
  const candidate = reachable(stopped).find(row => row.node === 'B-o1')!;
  assert.equal(candidate.stop, 'A-o9'); assert.equal(candidate.fare, 0);
  const halted = choose(saved(stopped), 'go:B-o1').state;
  assert.equal(halted.board.pos, 'A-o9'); assert.ok(halted.flags.includes(K.transfer));
  const node = WORLD.find(row => row.id === 'B-o1')!, original = node.next;
  node.next = ['B-o7'];
  try {
    const state = at('A-o13', 'pick'); state.flags.push(K.transfer); state.s.money = 10; state.board.dice = [3, 3];
    const move = reachable(state).find(row => row.node === 'C-o1')!;
    assert.equal(move.fare, 10); assert.deepEqual(move.tolls, [0, 0, 10]);
    const next = choose(state, 'go:C-o1').state;
    assert.equal(next.s.money, 0); assert.ok(!next.flags.includes(K.transfer));
    state.s.money = 9;
    assert.ok(!reachable(state).some(row => row.node === 'C-o1'));
  } finally { node.next = original; }
});

test('discount waits through an unaffordable purchase and upgrades; a shortcut chain keeps valid action slots', () => {
  const poor = at(shopNode('farm')); poor.flags.push(K.coupon); poor.s.money = 1999;
  assert.throws(() => choose(poor, 'biz:buy:farm'), /disabled/); assert.ok(poor.flags.includes(K.coupon));
  poor.s.money = 1500; poor.holdings = [{ id: 'farm', level: 1, paid: 2500 }];
  const upgraded = action(poor, 'biz:up:farm').state;
  assert.equal(upgraded.s.money, 0); assert.ok(upgraded.flags.includes(K.coupon));
  const { state } = cardState('shortcut');
  assert.ok(options(state).some(row => row.id === 'luck:shortcut:luck'));
  state.s.acts = 0;
  const trained = action(state, 'luck:shortcut:train').state;
  assert.equal(trained.s.acts, 0);
  const tile = options(trained).find(row => row.id.startsWith('act:') && row.enabled)!;
  const afterTile = choose(trained, tile.id).state;
  assert.equal(afterTile.s.acts, 1); saved(afterTile);
  const ended = choose(afterTile, 'end').state;
  assert.equal(ended.turn, state.turn + 1); saved(ended);
});

test('luck promotion: salary worker gets the special-promotion choice with maintenance preview; others gain reputation', () => {
  const independent = cardState('promotion'); assert.equal(independent.state.s.rep, 28);
  const { state } = cardState('promotion', state => { state.status = 'working'; state.track = 'service'; });
  const choice = options(state).find(row => row.id === 'luck:promote')!;
  assert.equal(choice.enabled, true); assert.match(choice.desc, /미달/);
  const next = action(state, 'luck:promote').state;
  assert.equal(next.job.rank, 1); assert.equal(next.job.perf, 60); assert.equal(next.board.step, 'bonus');
  assert.equal(next.timers[K.popup], undefined);
  const waited = action(state, 'luck:wait').state;
  assert.equal(waited.job.rank, 0); assert.equal(waited.job.perf, state.job.perf + 10); assert.equal(waited.s.rep, 23);
  const skipped = choose(state, 'skip').state; assert.equal(skipped.job.rank, 0); assert.equal(skipped.board.step, 'bonus');
  const top = cardState('promotion', state => { state.status = 'working'; state.track = 'service'; state.job.rank = 3; });
  assert.equal(options(top.state).find(row => row.id === 'luck:promote')?.enabled, false);
  assert.ok(options(top.state).find(row => row.id === 'skip')?.enabled);
});

test('luck demotion: salary workers lose 15 performance with a zero floor; others lose 5 reputation', () => {
  assert.equal(cardState('demotion').state.s.rep, 15);
  for (const perf of [10, 50]) {
    const { state } = cardState('demotion', state => { state.status = 'working'; state.track = 'service'; state.job.perf = perf; });
    assert.equal(state.job.perf, Math.max(0, perf - 15)); assert.equal(state.s.rep, 20);
  }
});

test('luck benefactor: +10 network and next promotion +10pp, stacked with excellent review, consumed on either result', () => {
  const { state } = cardState('benefactor'); assert.equal(state.s.net, 30);
  state.board.pos = 'A-o9'; state.board.step = 'space'; state.status = 'working'; state.track = 'service';
  state.job.tenure = 4; state.s.xp = 100; state.job.perf = 50; state.timers[CAREER_KEYS.bonus] = 10;
  assert.equal(options(state).find(row => row.id === 'promo')?.roll?.chance, 70);
  assert.match(options(state).find(row => row.id === 'promo')!.desc, /70%/);
  for (const roll of [69, 70]) {
    state.rng = rollSeed(roll, 100);
    const next = action(state, 'promo');
    assert.equal(next.result.roll?.success, roll < 70); assert.equal(next.result.roll?.chance, 70);
    assert.ok(!next.state.flags.includes(K.benefactor));
  }
});

test('luck discount: next street or shop purchase saves 20%, stacks with ownership and is consumed only by a purchase', () => {
  const { state } = cardState('discount');
  const phone = action(state, 'buy:drone', 'phone').state;
  assert.ok(phone.flags.includes(K.coupon));
  state.board.pos = shopNode('farm'); state.board.step = 'space';
  assert.equal(options(state).find(row => row.id === 'biz:buy:farm')?.cost, 2000);
  assert.match(options(state).find(row => row.id === 'biz:buy:farm')!.desc, /2000만원/);
  const bought = action(state, 'biz:buy:farm').state;
  assert.deepEqual(bought.holdings, [{ id: 'farm', level: 1, paid: 2000 }]);
  assert.ok(!bought.flags.includes(K.coupon));
  bought.board.step = 'space'; assert.equal(action(bought, 'biz:sell:farm').result.deltas.money, 1400);
  state.board.pos = 'A-o21'; state.holdings = [{ id: 'drone_shop', level: 1, paid: 3000 }];
  const expected = Math.floor(Math.floor(Math.floor(ITEMS.gear.levels[0].price * 85 / 100) * 90 / 100) * 80 / 100);
  assert.equal(action(state, 'buy:gear').result.deltas.money, -expected);
  assert.ok(choose(state, 'skip').state.flags.includes(K.coupon));
});

test('luck dream: next skill roll gains 20pp, displayed/forecast/rolled odds match, caps at 95 and consumes on failure', () => {
  const { state } = cardState('dream');
  state.board.pos = 'A-o1'; state.board.step = 'space'; state.status = 'student';
  const base = structuredClone(state); base.flags = base.flags.filter(flag => flag !== K.dream);
  const original = options(base).find(row => row.roll)!;
  const offered = options(state).find(row => row.id === original.id)!;
  assert.equal(offered.roll!.chance, Math.min(95, original.roll!.chance + 20));
  for (const roll of [0, 99]) {
    state.rng = rollSeed(roll, 100);
    const next = action(state, original.id);
    assert.equal(next.result.roll?.chance, offered.roll!.chance);
    assert.equal(next.result.roll?.success, roll < offered.roll!.chance);
    assert.ok(!next.state.flags.includes(K.dream));
  }
  const fund = structuredClone(state); fund.turn = 4; fund.fund = { kind: 1, amount: 1000 };
  assert.ok(fundYearEnd(fund).flags.includes(K.dream));
  const spin = at('A-o0', 'spin'); spin.flags.push(K.dream);
  assert.ok(choose(spin, 'spin').state.flags.includes(K.dream));
  state.status = 'working'; state.track = 'service'; state.board.pos = 'A-o9'; state.job.perf = 90;
  state.job.tenure = 4; state.s.xp = 100; state.flags.push(K.benefactor);
  assert.equal(options(state).find(row => row.id === 'promo')?.roll?.chance, 95);
});

test('all 16 luck cards are uniformly indexed, exclude only the previous card, and restore the last-card memory', () => {
  assert.equal(LUCK.length, 16); assert.equal(new Set(LUCK.map(row => row.id)).size, 16);
  for (let last = 0; last < LUCK.length; last++) {
    const ids = new Set<string>();
    for (let index = 0; index < LUCK.length - 1; index++) {
      const state = at(); state.timers[K.lastLuck] = last; state.rng = rollSeed(index, 15);
      const before = structuredClone(state), drawn = drawLuck(state);
      assert.deepEqual(state, before); assert.notEqual(drawn.card.id, LUCK[last].id);
      assert.deepEqual(drawLuck(saved(state)), drawn); ids.add(drawn.card.id);
    }
    assert.equal(ids.size, 15);
  }
});

test('automatic negative luck never blocks play, money shortfalls become debt and stamina respects caps', () => {
  for (const [id, debt] of [['parking', 80], ['wedding_gift', 100]] as const) {
    const next = cardState(id, state => { state.s.money = 0; });
    assert.equal(next.state.s.money, 0); assert.equal(next.state.s.debt, debt);
    assert.ok(options(next.state).find(row => row.id === 'end')?.enabled);
  }
  assert.equal(cardState('cold', state => { state.s.stamina = 10; }).state.s.stamina, 0);
  assert.equal(cardState('tonic', state => { state.turn = 164; state.s.capStamina = 80; state.s.stamina = 75; }).state.s.stamina, 80);
  const ended = at(); ended.phase = 'ended';
  assert.deepEqual(assetChoices(ended), []); assert.deepEqual(assetChoices(ended, true), []);
  assert.equal(FUNDS.length, 3); assert.equal(SHOPS.length, 7);
});
