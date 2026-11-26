import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, newGame, options, reachable } from '../src/life/engine.ts';
import type { Move } from '../src/life/move.ts';
import type { GameState } from '../src/life/types.ts';
import { destinationDetails } from '../src/ui2/pick.ts';

// A working adult with a partner, no home and cash for map A's tier-3 home (4,200 + 80 moving),
// about to pass the estate tile A-o24 on the way from A-o22 to A-o25.
function picking(ready: (state: GameState) => void = () => {}): GameState {
  const state = choose(newGame(1), 'start:school').state;
  state.board.pos = 'A-o22'; state.board.step = 'pick'; state.board.dice = [1, 2]; state.s.car = 0;
  state.status = 'working'; state.turn = 40; state.family.partnerAt = 30; state.s.money = 5000; state.home = null;
  ready(state);
  return state;
}
const toLifeTile = (state: GameState) => reachable(state).find(move => move.node === 'A-o25')!;

test('with a partner and an enabled tier-3 residence purchase, the token stops at map A\'s estate tile', () => {
  const state = picking();
  const move = toLifeTile(state);
  assert.equal(move.stop, 'A-o24'); assert.equal(move.stopReason, 'estate');
  const next = choose(state, 'go:A-o25');
  assert.equal(next.state.board.pos, 'A-o24'); assert.equal(next.state.board.step, 'space');
  assert.equal(next.result.move?.stopReason, 'estate');
  assert.ok(options(next.state).find(o => o.id === 'home:buy:3')!.enabled);
  // The mortgage purchase alone is enough to stop.
  const loanOnly = picking(s => { s.s.money = 2180; });
  assert.equal(toLifeTile(loanOnly).stopReason, 'estate');
  assert.equal(destinationDetails({ ...move, stop: 'A-o24', stopReason: 'estate' } as Move), '3걸음 · 부동산 정차');
});

test('no estate stop while single, with a tier-3 home already, without the money, or on the tile itself', () => {
  assert.equal(toLifeTile(picking(s => { s.family.partnerAt = null; })).stop, undefined);
  assert.equal(toLifeTile(picking(s => { s.home = { map: 'A', tier: 3, deposit: 0 }; })).stop, undefined);
  const poor = picking(s => { s.s.money = 2179; });
  assert.equal(toLifeTile(poor).stop, undefined);
  const onTile = picking(s => { s.board.dice = [1, 1]; });
  assert.equal(reachable(onTile).find(move => move.node === 'A-o24')!.stop, undefined);
});

test('the payday passed on the way is settled before deciding the estate stop', () => {
  // A-o21 + 4 passes the payday A-o22, then the estate tile A-o24, and lands on A-o25.
  const via = (money: number, ledger: number) => picking(s => {
    s.board.pos = 'A-o21'; s.board.dice = [2, 2]; s.s.money = money; s.board.ledger = { test: ledger };
  });
  assert.equal(toLifeTile(via(2180, -1)).stop, undefined, 'the payday leaves too little for the mortgage purchase');
  const paid = via(2179, 1);
  assert.equal(toLifeTile(paid).stopReason, 'estate', 'the payday brings the mortgage purchase within reach');
  const stopped = choose(paid, 'go:A-o25').state;
  assert.equal(stopped.board.pos, 'A-o24');
  assert.ok(options(stopped).find(o => o.id === 'home:buy:3:mortgage')!.enabled);
});

test('declining the purchase keeps money and home, ends the season, and the next pass stops again', () => {
  const stopped = choose(picking(), 'go:A-o25').state;
  const declined = choose(stopped, 'skip').state;
  assert.equal(declined.home, null); assert.equal(declined.s.money, stopped.s.money);
  assert.equal(declined.board.step, 'bonus');
  const after = choose(declined, 'end').state;
  assert.equal(after.turn, stopped.turn + 1);
  // The condition still holds, so passing the tile again stops there again.
  after.board.pos = 'A-o22'; after.board.step = 'pick'; after.board.dice = [1, 2]; after.phase = 'action';
  assert.equal(toLifeTile(after).stopReason, 'estate');
});
