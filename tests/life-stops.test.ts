import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD_KEYS } from '../src/life/cards.ts';
import { choose, newGame, reachable } from '../src/life/engine.ts';
import type { Move } from '../src/life/move.ts';
import type { GameState } from '../src/life/types.ts';
import { destinationDetails, stopLabel } from '../src/ui2/pick.ts';

// A season ready to pick a destination on map A with the given roulettes.
function picking(pos: string, dice: [number, number], ready: (state: GameState) => void): GameState {
  const state = choose(newGame(1), 'start:school').state;
  state.board.pos = pos; state.board.step = 'pick'; state.board.dice = dice; state.s.car = 0;
  ready(state);
  return state;
}
const examReady = (state: GameState) => { state.s.theory = 90; state.s.skill = 90; state.s.money = 600; state.s.stamina = 100; };
const proposalReady = (state: GameState) => {
  state.status = 'working'; state.turn = 40; state.family.partnerAt = 30;
  state.home = { map: 'A', tier: 2, deposit: 1500 };
};
const target = (state: GameState, node: string) => reachable(state).find(move => move.node === node)!;

test('a student ready for the licence exam stops at the exam site on the way', () => {
  const state = picking('A-o6', [2, 3], examReady);
  assert.equal(state.status, 'student');
  const move = target(state, 'A-o11');
  assert.equal(move.stop, 'A-o8'); assert.equal(move.stopReason, 'exam');
  const next = choose(state, 'go:A-o11');
  assert.equal(next.state.board.pos, 'A-o8'); assert.equal(next.result.move?.stopReason, 'exam');
  // The exam site as the destination itself, or an unready student, never forces a stop.
  assert.equal(target(picking('A-o6', [1, 1], examReady), 'A-o8').stop, undefined);
  for (const lack of [(s: GameState) => { s.s.theory = 89; }, (s: GameState) => { s.s.money = 599; }]) {
    assert.equal(target(picking('A-o6', [2, 3], s => { examReady(s); lack(s); }), 'A-o11').stop, undefined);
  }
});

test('an open marriage or birth step stops at map A\'s local life tile', () => {
  const state = picking('A-o22', [2, 3], proposalReady);
  const move = target(state, 'A-o27');
  assert.equal(move.stop, 'A-o25'); assert.equal(move.stopReason, 'life');
  assert.equal(choose(state, 'go:A-o27').state.board.pos, 'A-o25');
  const married = picking('A-o22', [2, 3], s => { proposalReady(s); s.family.marriedAt = 36; s.home!.tier = 3; });
  assert.equal(target(married, 'A-o27').stopReason, 'life', 'a birth step also stops');
  // Without the home the proposal needs, or with only a blind date open, the token passes.
  assert.equal(target(picking('A-o22', [2, 3], s => { proposalReady(s); s.home = null; }), 'A-o27').stop, undefined);
  assert.equal(target(picking('A-o22', [2, 3], s => { s.status = 'working'; s.turn = 40; }), 'A-o27').stop, undefined);
});

test('forced stops count fares paid on the way and skip the extra-move card\'s tile-less first move', () => {
  const fare = (money: number) => target(picking('B-o7', [5, 5], s => { examReady(s); s.s.money = money; }), 'A-o10');
  assert.ok(fare(610).fare > 0); assert.equal(fare(610).stop, 'A-o8');
  assert.equal(fare(600).stop, undefined, 'the transfer fare leaves too little for the exam');
  const again = picking('A-o22', [2, 3], s => { proposalReady(s); s.timers[CARD_KEYS.again] = s.turn; });
  assert.equal(target(again, 'A-o27').stop, undefined);
});

test('destination labels name the reason for a stop; moves without a reason are review stops', () => {
  const base = { node: 'A-o11', steps: 5, path: [], tolls: [], fare: 0, via: null, passed: { pay: [], start: [] } };
  assert.equal(destinationDetails({ ...base, stop: 'A-o8', stopReason: 'exam' } as Move), '5걸음 · 시험장 정차');
  assert.equal(destinationDetails({ ...base, stop: 'A-o25', stopReason: 'life' } as Move), '5걸음 · 결혼·출산 정차');
  assert.equal(stopLabel({ stop: 'A-o9' }), '심사 정차');
  assert.equal(stopLabel({}), '');
});
