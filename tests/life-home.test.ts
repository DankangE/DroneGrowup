import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accrue, creditLimit, homeValue, liquidate, netWorth, upkeepLines } from '../src/life/economy.ts';
import { choose, estateOffers, forecast, newGame, options, restore } from '../src/life/engine.ts';
import { homeRecovery, rentalIncome, yearEndHome } from '../src/life/home.ts';
import { HOMES, HOME_RULES } from '../src/life/life-data.ts';
import { randInt } from '../src/life/move.ts';
import { JOB_RULES } from '../src/life/tracks.ts';
import { MAPS, WORLD } from '../src/life/world.ts';
import type { GameState, MapId } from '../src/life/types.ts';

function at(map: MapId = 'B'): GameState {
  const state = newGame(42);
  state.flags.push(JOB_RULES.started); state.status = 'retired'; state.s.money = 500000;
  state.board.pos = WORLD.find(node => node.map === map && node.kind === 'estate')?.id ?? `${map}-o0`;
  state.board.step = 'space'; state.board.dice = [1, 1];
  return state;
}
function trade(state: GameState, id: string): GameState {
  return choose({ ...state, board: { ...state.board, step: 'space' } }, id).state;
}
const lines = (state: GameState) => Object.fromEntries(upkeepLines(state).map(line => [line.label, line.amount]));
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
}
function integers(value: unknown): void {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value), String(value));
  else if (value && typeof value === 'object') Object.values(value).forEach(integers);
}

test('§8.1 HOMES preserves all prices, costs, recovery, happiness and family capacities', () => {
  assert.deepEqual(HOMES.map(h => [h.price, h.upkeep, h.rest, h.recovery, h.happy, h.adults, h.kids]), [
    [0, 0, 60, 20, 0, 1, 0], [0, 25, 60, 20, 0, 1, 0], [1500, 5, 65, 22, 1, 2, 0],
    [6000, 10, 70, 24, 2, 2, 1], [15000, 20, 75, 26, 3, 2, 3],
    [32000, 35, 80, 28, 5, 2, 3], [60000, 60, 85, 30, 7, 2, 3],
  ]);
  assert.equal(newGame(1).s.homeIndex, 100);
});

for (const map of ['A', 'B', 'C', 'E', 'F'] as const) {
  test(`§8.1 ${map}: every owned tier buys, sells and values at the current map/index price`, () => {
    for (const tier of [3, 4, 5, 6]) for (const index of [60, 99, 100, 137, 200]) {
      if (tier === 6 && map !== 'E') continue;
      const state = at(map); state.s.homeIndex = index;
      const base = map === 'F' && tier === 5 ? 12000 : [0, 0, 1500, 6000, 15000, 32000, 60000][tier];
      const expected = Math.floor(base * MAPS[map].homePct * index / 10000);
      assert.equal(homeValue(state, { map, tier }), expected);
      const offer = estateOffers(state).find(o => o.id === `home:buy:${tier}`)!;
      assert.equal(offer.price, expected); assert.equal(offer.choice.cost, expected + 80);
      const bought = choose(state, offer.id).state;
      assert.deepEqual(bought.home, { map, tier, deposit: 0 });
      assert.equal(bought.s.money, state.s.money - expected - 80);
      assert.equal(netWorth(bought), netWorth(state) - 80);
      bought.s.homeIndex = index === 200 ? 60 : 200;
      const value = Math.floor(base * MAPS[map].homePct * bought.s.homeIndex / 10000);
      assert.equal(netWorth(bought), bought.s.money + value);
      assert.equal(creditLimit(bought), 1000 + Math.floor(value / 2));
      const sold = trade(bought, `home:sell:${tier}`);
      assert.equal(sold.home, null); assert.equal(sold.s.money, bought.s.money + value);
    }
  });
}

test('specialist zone has no housing; penthouses only appear in E and country homes use the F price', () => {
  assert.deepEqual(estateOffers(at('D')), []);
  for (const map of ['A', 'B', 'C', 'E', 'F'] as const) {
    const offers = estateOffers(at(map));
    assert.equal(offers.some(o => o.tier === 6), map === 'E');
    if (map === 'F') {
      const country = offers.find(o => o.id === 'home:buy:5')!;
      assert.equal(country.price, 9600); assert.match(country.choice.title, /전원주택/);
    }
  }
});

test('renting charges moving cost and a fixed deposit; leaving refunds exactly that deposit', () => {
  for (const map of ['A', 'B', 'C', 'E', 'F'] as const) {
    const state = at(map); state.s.homeIndex = 137; state.s.money = 1580;
    let next = choose(state, 'home:rent:2').state;
    assert.deepEqual(next.home, { map, tier: 2, deposit: 1500 }); assert.equal(next.s.money, 0);
    assert.equal(lines(next)['주거비'], -5); assert.equal(netWorth(next), 1500);
    next.s.homeIndex = 200;
    next = trade(next, 'home:sell:2'); assert.equal(next.s.money, 1500); assert.equal(next.home, null);
    const monthly = trade(next, 'home:rent:1');
    assert.equal(monthly.s.money, 1420); assert.equal(monthly.home!.deposit, 0);
    assert.equal(lines(monthly)['주거비'], -25);
    assert.equal(trade(monthly, 'home:sell:1').s.money, monthly.s.money);
  }
});

test('deposit offsets the required cash when changing rental or buying a residence', () => {
  const state = at(); state.s.money = 80; state.home = { map: 'A', tier: 2, deposit: 1500 };
  assert.ok(options(state).find(o => o.id === 'home:rent:2')!.enabled);
  const moved = choose(state, 'home:rent:2').state;
  assert.equal(moved.s.money, 0); assert.deepEqual(moved.home, { map: 'B', tier: 2, deposit: 1500 });
  const cheaper = choose(state, 'home:rent:1').state;
  assert.equal(cheaper.s.money, 1500); assert.equal(cheaper.home!.deposit, 0);
  state.s.money = 4580;
  assert.equal(options(state).find(o => o.id === 'home:buy:3')!.cost, 4580);
  const bought = choose(state, 'home:buy:3').state;
  assert.equal(bought.s.money, 0); assert.equal(bought.home!.deposit, 0);
});

test('mortgage is an explicit 50% option, includes moving cost, accrues interest and preserves net worth', () => {
  const state = at(); state.s.money = 3080;
  const cash = options(state).find(o => o.id === 'home:buy:3')!;
  const loan = options(state).find(o => o.id === 'home:buy:3:mortgage')!;
  assert.equal(cash.enabled, false); assert.equal(loan.enabled, true);
  assert.equal(loan.cost, 3080); assert.equal(loan.sure!.add.debt, 3000);
  const preview = forecast(state, loan.id), result = choose(state, loan.id);
  assert.deepEqual(preview.branches[0].deltas, result.result.deltas);
  assert.equal(result.state.s.money, 0); assert.equal(result.state.s.debt, 3000);
  assert.equal(netWorth(result.state), netWorth(state) - 80); assert.equal(lines(result.state)['대출 이자'], -30);
  assert.equal(trade(result.state, 'home:sell:3').s.debt, 3000, 'sale does not erase outstanding debt');
  const rich = at(); assert.equal(choose(rich, 'home:buy:3').state.s.debt, 0);
  state.s.money--; assert.throws(() => choose(state, loan.id), /disabled/);
  assert.throws(() => choose(state, 'home:buy:3:mortgage:100'), /not available/);
});

test('four homes maximum; additional purchases are rentals, unique IDs sell duplicate tiers in order', () => {
  let state = at();
  for (let count = 1; count <= 4; count++) {
    state = trade(state, 'home:buy:3');
    assert.equal(state.home!.tier, 3); assert.equal(state.estates.length, count - 1);
    assert.equal(state.s.money, 500000 - count * 6000 - 80);
  }
  state.board.step = 'space';
  const offered = estateOffers(state);
  assert.equal(new Set(offered.map(o => o.id)).size, offered.length);
  assert.ok(offered.filter(o => o.action === 'buy').every(o => o.locked.length));
  assert.throws(() => choose(state, 'home:buy:4'), /disabled/);
  assert.throws(() => choose(state, 'home:buy:3:mortgage'), /disabled/);
  assert.throws(() => choose(state, 'home:rent:1'), /disabled/, 'rental array remains at most three');
  state.estates[0].paid = 1234;
  const sold = choose(state, 'home:sell:3').state;
  assert.equal(sold.estates.length, 2); assert.equal(sold.estates[0].paid, 6000);
  assert.deepEqual(sold.home, state.home); assert.equal(sold.s.money, state.s.money + 6000);
  assert.equal(trade(sold, 'home:buy:4').estates.length, 3);
});

test('moving into an investment swaps the residence; renting out the former home retains its map', () => {
  const state = at(); state.home = { map: 'A', tier: 3, deposit: 0 };
  const rented = choose(state, 'home:rent:2').state;
  assert.deepEqual(rented.estates, [{ map: 'A', tier: 3, paid: 4200 }]);
  assert.deepEqual(rented.home, { map: 'B', tier: 2, deposit: 1500 });
  rented.board.pos = at('A').board.pos;
  const moved = trade(rented, 'home:move:3');
  assert.equal(moved.estates.length, 0); assert.equal(moved.s.money, rented.s.money + 1500 - 80);
  assert.deepEqual(moved.home, { map: 'A', tier: 3, deposit: 0 });
  let owner = at(); owner.home = { map: 'E', tier: 6, deposit: 0 };
  owner.estates = [{ map: 'B', tier: 3, paid: 6000 }, { map: 'C', tier: 4, paid: 10500 }, { map: 'F', tier: 5, paid: 9600 }];
  owner = trade(owner, 'home:move:3');
  assert.deepEqual(owner.home, { map: 'B', tier: 3, deposit: 0 });
  assert.equal(owner.estates.length, 3); assert.deepEqual(owner.estates.at(-1), { map: 'E', tier: 6, paid: 78000 });
});

test('rent is floor(current value × 12 / 1000) per investment, unscaled by the player map, accrued once', () => {
  const state = at('F'); state.s.homeIndex = 99; state.home = { map: 'F', tier: 5, deposit: 0 };
  state.estates = [{ map: 'A', tier: 3, paid: 1 }, { map: 'B', tier: 4, paid: 2 }, { map: 'E', tier: 3, paid: 3 }];
  // Independent values: 4158, 14850, 7722; round each stream down before adding.
  assert.equal(rentalIncome(state), 49 + 178 + 92);
  assert.equal(lines(state)['임대 수입'], 319);
  assert.equal(accrue(state).board.ledger['임대 수입'], 319);
  state.board.step = 'bonus';
  assert.equal(choose(state, 'end').state.board.ledger['임대 수입'], 319);
  state.s.homeIndex = 200; assert.equal(rentalIncome(state), 100 + 360 + 187);
  state.board.pos = 'D-o0'; assert.equal(rentalIncome(state), 647);
  state.s.debt = 900000;
  const cleared = liquidate(state);
  assert.equal(cleared.estates.length, 0); assert.equal(rentalIncome(cleared), 0);
  assert.deepEqual(cleared.home, state.home);
});

test('start arrival transfers only rented housing, costs 80, preserves deposit, then offers the extra action', () => {
  for (const tier of [1, 2]) {
    const state = at('A'); state.board.pos = 'A-o27'; state.board.step = 'pick';
    state.home = { map: 'B', tier, deposit: tier === 2 ? 1500 : 0 };
    state.board.ledger = { income: 123 };
    const arrived = choose(state, 'go:A-o0').state;
    assert.equal(arrived.s.money, state.s.money + 123); assert.equal(arrived.board.step, 'space');
    assert.deepEqual(arrived.board.ledger, {});
    assert.deepEqual(options(arrived).map(o => o.id), [`home:move:${tier}`, 'skip']);
    const moved = choose(arrived, `home:move:${tier}`).state;
    assert.deepEqual(moved.home, { ...state.home, map: 'A' });
    assert.equal(moved.s.money, arrived.s.money - 80); assert.equal(moved.board.step, 'bonus');
    assert.equal(moved.turn, state.turn); assert.equal(choose(arrived, 'skip').state.board.step, 'bonus');
    assert.throws(() => choose(moved, `home:move:${tier}`), /not available/);
    state.board.dice = [2, 2];
    assert.ok(!options(choose(state, 'go:A-o1').state).some(o => o.id.startsWith('home:')));
  }
  const state = at('D'); state.home = { map: 'B', tier: 2, deposit: 1500 };
  assert.deepEqual(estateOffers(state), []);
  state.board.pos = 'A-o0'; state.home.tier = 3; assert.deepEqual(estateOffers(state), []);
});

test('start job popup resumes the relocation tile instead of losing it', () => {
  const state = at('A'); state.status = 'jobless'; state.board.pos = 'A-o27'; state.board.step = 'pick';
  state.home = { map: 'B', tier: 2, deposit: 1500 };
  const arrived = choose(state, 'go:A-o0').state;
  assert.ok(options(arrived).some(o => o.id === 'job:none'));
  const resumed = choose(arrived, 'job:none').state;
  assert.ok(options(resumed).some(o => o.id === 'home:move:2'));
});

test('all tiers grant rest and seasonal recovery only on the residence map, with age/health caps', () => {
  for (const [tier, rest, recovery] of [[0, 60, 20], [1, 60, 20], [2, 65, 22], [3, 70, 24], [4, 75, 26], [5, 80, 28], [6, 85, 30]]) {
    for (const local of [true, false]) {
      const state = at('A'); state.board.pos = 'A-o2'; state.board.step = 'pick'; state.s.stamina = 0;
      state.home = { map: local ? 'A' : 'B', tier, deposit: 0 };
      state.estates = [{ map: 'A', tier: 6, paid: 78000 }];
      const landed = choose(state, 'go:A-o3');
      assert.equal(landed.result.restGain, local ? rest : 60);
      landed.state.s.stamina = 0;
      assert.equal(choose(landed.state, 'end').result.season!.refill, local ? recovery : 20);
      assert.equal(lines(state)['숙박비'] ?? 0, !local && tier > 0 ? -20 : 0);
    }
  }
  for (const [turn, cap] of [[0, 60], [164, 80]]) {
    const state = at('A'); state.turn = turn; state.s.capStamina = cap; state.s.stamina = 0;
    state.home = { map: 'A', tier: 6, deposit: 0 }; state.board.pos = 'A-o2'; state.board.step = 'pick';
    const landed = choose(state, 'go:A-o3'); assert.equal(landed.result.restGain, cap);
    assert.equal(choose(landed.state, 'end').state.s.stamina, cap);
  }
});

test('annual index uses seeded integer -4..+6 exactly once per winter and clamps to 60..200', () => {
  const changes = new Set<number>();
  for (let seed = 1; seed <= 200; seed++) {
    const state = at(); state.rng = seed; state.turn = 4;
    const expected = structuredClone(state), change = randInt(expected, 11) - 4;
    const updated = yearEndHome(state); changes.add(updated.s.homeIndex - 100);
    assert.equal(updated.s.homeIndex, 100 + change); assert.equal(updated.rng, expected.rng);
    assert.deepEqual(yearEndHome(updated), updated);
    for (const index of [60, 200]) {
      const boundary = yearEndHome({ ...state, s: { ...state.s, homeIndex: index } });
      assert.equal(boundary.s.homeIndex, Math.max(60, Math.min(200, index + change)));
    }
  }
  assert.deepEqual([...changes].sort((a, b) => a - b), [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]);
  for (const turn of [0, 1, 2, 3, 5, 6, 7]) { const state = at(); state.turn = turn; assert.deepEqual(yearEndHome(state), state); }
  const closed = at(); closed.phase = 'ended'; closed.turn = 204; assert.deepEqual(yearEndHome(closed), closed);
});

test('engine accrues winter rent before index change; spring and terminal winter close use the new value', () => {
  for (const turn of [2, 3, 7, 203]) {
    const state = at(); state.turn = turn; state.board.step = 'bonus'; state.s.capStamina = 80; state.s.stamina = 0;
    state.estates = [{ map: 'B', tier: 3, paid: 6000 }];
    const expected = yearEndHome({ ...state, turn: turn + 1 });
    const next = choose(state, 'end');
    assert.equal(next.state.s.homeIndex, expected.s.homeIndex); assert.equal(next.state.rng, expected.rng);
    assert.equal(next.result.season!.accrual.find(l => l.label === '임대 수입')!.amount, 72);
    assert.equal(rentalIncome(next.state), Math.floor(6000 * expected.s.homeIndex / 100 * 12 / 1000));
    if (turn === 203) assert.equal(next.state.phase, 'ended');
  }
});

test('offers have a free exit, reject invalid/unaffordable trades and never appear in phone or other steps', () => {
  const state = at(); state.s.money = 0;
  assert.ok(options(state).some(o => o.id === 'skip' && o.enabled && !o.cost && !o.tire));
  assert.throws(() => choose(state, 'home:rent:1'), /disabled/);
  assert.throws(() => choose(state, 'home:buy:99'), /not available/);
  assert.throws(() => choose(state, 'home:sell:3'), /not available/);
  assert.ok(!options(state, 'phone').some(o => o.id.startsWith('home:')));
  for (const step of ['spin', 'pick', 'bonus'] as const) { state.board.step = step; assert.deepEqual(estateOffers(state), []); }
  state.board.step = 'space'; state.phase = 'event'; assert.deepEqual(estateOffers(state), []);
  state.phase = 'ended'; assert.deepEqual(estateOffers(state), []);
});

test('transactions and yearly updates preserve frozen inputs, integer saves and deterministic forecasts/continuations', () => {
  let state = at('E'); state.turn = 3;
  for (const id of ['home:rent:2', 'home:buy:6:mortgage', 'home:buy:3', 'home:move:3', 'home:sell:6']) {
    state.board.step = 'space'; state.s.acts = 0;
    const before = structuredClone(state); freeze(state);
    estateOffers(state); homeRecovery(state); rentalIncome(state);
    const preview = forecast(state, id), next = choose(state, id), saved = restore(JSON.parse(JSON.stringify(state)));
    assert.ok(saved); assert.deepEqual(choose(saved, id), next);
    assert.deepEqual(next.result.deltas, preview.branches[0].deltas);
    assert.equal(next.state.board.step, 'bonus'); assert.equal(next.state.turn, state.turn);
    assert.deepEqual(state, before); integers(next.state);
    assert.deepEqual(restore(JSON.parse(JSON.stringify(next.state))), next.state);
    state = next.state;
  }
  const before = structuredClone(state); freeze(state);
  const next = choose(state, 'end').state;
  assert.deepEqual(state, before); integers(next);
  assert.equal(next.timers[HOME_RULES.indexAt], 4);
  assert.deepEqual(restore(JSON.parse(JSON.stringify(next))), next);
});
