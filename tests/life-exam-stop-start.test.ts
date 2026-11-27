import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, newGame, reachable } from '../src/life/engine.ts';
import type { GameState } from '../src/life/types.ts';

// A student on A-o27 with roulettes 5 + 5 passes the start tile A-o0 and the exam site A-o8, and lands on A-o9.
function viaStart(money: number, ready: (state: GameState) => void): GameState {
  const state = choose(newGame(1), 'start:school').state;
  state.turn = 20; state.board.pos = 'A-o27'; state.board.step = 'pick'; state.board.dice = [5, 5]; state.s.car = 0;
  state.s.theory = 90; state.s.skill = 90; state.s.stamina = 100; state.s.money = money;
  ready(state);
  return state;
}
const toA9 = (state: GameState) => reachable(state).find(move => move.node === 'A-o9')!;
const noAllowance = (state: GameState) => { state.board.lapAt.A = state.turn; };

test('the start tile settlement passed on the way is applied before deciding the exam stop', () => {
  const ready = viaStart(600, s => { noAllowance(s); s.board.ledger = { test: 0 }; });
  assert.deepEqual(toA9(ready).path.slice(0, 9), ['A-o0', 'A-o1', 'A-o2', 'A-o3', 'A-o4', 'A-o5', 'A-o6', 'A-o7', 'A-o8']);
  assert.equal(toA9(ready).stopReason, 'exam', 'an empty ledger leaves the exam fee in hand');
  const short = viaStart(600, s => { noAllowance(s); s.board.ledger = { test: -1 }; });
  assert.equal(toA9(short).stop, undefined, 'the start tile settlement leaves too little for the exam');
  // The real move agrees: settled at A-o0, then no exam stop, so the pawn reaches A-o9.
  const moved = choose(short, 'go:A-o9').state;
  assert.equal(moved.board.pos, 'A-o9'); assert.equal(moved.s.money, 599);
});

test('the start tile allowance passed on the way can bring the exam fee within reach', () => {
  const stale = (s: GameState) => { s.board.lapAt.A = 0; s.board.ledger = {}; };
  const lifted = viaStart(590, stale);
  assert.equal(toA9(lifted).stop, 'A-o8'); assert.equal(toA9(lifted).stopReason, 'exam');
  const moved = choose(lifted, 'go:A-o9');
  assert.equal(moved.state.board.pos, 'A-o8'); assert.equal(moved.result.move?.stopReason, 'exam');
  assert.equal(moved.state.s.money, 620);
  assert.equal(toA9(viaStart(560, stale)).stop, undefined, 'the allowance alone does not cover the exam fee');
});
