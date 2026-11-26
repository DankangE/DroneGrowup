import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { choose, newGame, options } from '../src/life/engine.ts';
import { reachable } from '../src/life/move.ts';
import { WORLD } from '../src/life/world.ts';
import { gridCell } from '../src/ui2/board.ts';
import { movementFrames, playback, STEP_MS } from '../src/ui2/move.ts';
import type { Frame } from '../src/ui2/move.ts';
import { destinationDetails, destinationName, pathSegments } from '../src/ui2/pick.ts';
import { SPIN_MS } from '../src/ui2/wheel.ts';
import { TRANSFER_MS } from '../src/ui2/transfer.ts';

function fixture(pos: string, dice: [number, number]) {
  const state = choose(newGame(1), 'start:school').state;
  state.board.pos = pos; state.board.dice = dice; state.board.step = 'pick';
  return state;
}
const nodeAt = (id: string) => WORLD.find(node => node.id === id)!;
function frozen<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}

test('a sum with several destinations exposes the engine destinations; a sum with one destination bypasses pick', () => {
  const multiple = choose(choose(newGame(1), 'start:school').state, 'spin');
  assert.deepEqual(multiple.state.board.dice, [4, 1]);
  assert.equal(multiple.state.board.step, 'pick');
  assert.deepEqual(movementFrames('A-o0', multiple.result, true), [{ phase: 'spin', pos: 'A-o0', ms: 700 }]);
  const single = choose(choose(newGame(7), 'start:school').state, 'spin');
  assert.deepEqual(single.state.board.dice, [1, 1]);
  assert.equal(single.state.board.step, 'space');
  assert.ok(!options(single.state).some(option => option.id.startsWith('go:')));
  const frames = movementFrames('A-o0', frozen(single.result), true);
  assert.deepEqual(frames.map(frame => frame.phase), ['spin', 'move', 'move']);
  assert.equal(frames.at(-1)!.pos, single.state.board.pos);
});

test('every die pair at every tile animates exactly the supplied path and map crossings without mutation', () => {
  for (const node of WORLD) for (let left = 1; left <= 6; left++) for (let right = 1; right <= 6; right++) {
    for (const move of reachable(fixture(node.id, [left, right]))) {
      frozen(move);
      const frames = movementFrames(node.id, { move });
      assert.deepEqual(frames.filter(frame => frame.phase === 'move').map(frame => frame.pos), move.path);
      assert.ok(frames.filter(frame => frame.phase === 'move').every(frame => frame.ms === 250));
      const route = [node.id, ...move.path];
      const crossings = route.slice(1).filter((id, index) => nodeAt(id).map !== nodeAt(route[index]).map);
      assert.deepEqual(frames.filter(frame => frame.phase === 'transfer').map(frame => frame.to), crossings.map(id => nodeAt(id).map));
    }
  }
});

test('transfer lasts 600ms before the next map tile, including a transfer on the first step', () => {
  const move = reachable(fixture('A-o11', [2, 2])).find(move => move.node === 'B-o2')!;
  assert.deepEqual(movementFrames('A-o11', { move }), [
    { phase: 'move', pos: 'A-o12', ms: 250 }, { phase: 'move', pos: 'A-o13', ms: 250 },
    { phase: 'transfer', pos: 'A-o13', from: 'A', to: 'B', ms: 600 },
    { phase: 'move', pos: 'B-o1', ms: 250 }, { phase: 'move', pos: 'B-o2', ms: 250 },
  ]);
  const first = reachable(fixture('A-o13', [1, 1])).find(move => move.node === 'B-o2')!;
  assert.equal(movementFrames('A-o13', { move: first })[0].phase, 'transfer');
  assert.equal(TRANSFER_MS, 600); assert.equal(STEP_MS, 250); assert.equal(SPIN_MS, 700);
});

test('review stops truncate travel, retain the dotted preview and do not animate unreached transfers', () => {
  const state = fixture('B-o15', [3, 3]); state.s.car = 2; state.flags = ['invite'];
  const move = reachable(state, { canPromote: () => true }).find(move => move.node === 'D-o1')!;
  assert.equal(move.stop, 'B-o16');
  assert.deepEqual(movementFrames(state.board.pos, { move }), [{ phase: 'move', pos: 'B-o16', ms: 250 }]);
  assert.equal(destinationDetails(move), '7걸음 · 심사 정차');
  assert.equal(pathSegments(state.board.pos, move.path, 'B').length, 6);
});

test('destination copy shows the engine steps, toll, map and review marker without deriving eligibility', () => {
  const state = fixture('A-o11', [2, 2]);
  const moves = reachable(state), remote = moves.find(move => move.node === 'B-o2')!;
  assert.equal(destinationDetails(remote), '4걸음 · 통행료 10만');
  assert.match(destinationName(remote, state.board.pos), /^⇄ 도심 · /);
  assert.doesNotMatch(destinationName(moves[0], state.board.pos), /⇄/);
});

test('dotted preview includes the origin but never bridges coordinates from different maps', () => {
  const move = reachable(fixture('A-o11', [2, 2])).find(move => move.node === 'B-o2')!;
  const segment = (from: string, to: string) => ({ from: gridCell(nodeAt(from)), to: gridCell(nodeAt(to)) });
  assert.deepEqual(pathSegments('A-o11', frozen(move.path), 'A'), [segment('A-o11', 'A-o12'), segment('A-o12', 'A-o13')]);
  assert.deepEqual(pathSegments('A-o11', move.path, 'B'), [segment('B-o1', 'B-o2')]);
  assert.deepEqual(pathSegments('A-o11', move.path, 'C'), []);
  assert.deepEqual(pathSegments('A-o11', [], 'A'), []);
});

test('payment popup uses the engine settlement total once at the first passed salary/start tile', () => {
  const state = fixture('A-o10', [1, 1]); state.board.ledger = { wage: 125, expense: -20 };
  const outcome = choose(state, 'go:A-o12');
  assert.equal(outcome.result.upkeep!.total, 105);
  assert.deepEqual(movementFrames(state.board.pos, frozen(outcome.result)), [
    { phase: 'move', pos: 'A-o11', ms: 250, payment: 105 }, { phase: 'move', pos: 'A-o12', ms: 250 },
  ]);
  const move = { ...outcome.result.move!, passed: { pay: ['A-o11', 'A-o12'], start: [] } };
  assert.deepEqual(movementFrames(state.board.pos, { move, upkeep: { total: -20, lines: [] } })
    .filter(frame => frame.payment !== undefined).map(frame => frame.payment), [-20]);
});

function clocked(frames: Frame[]) {
  const jobs: { run: () => void; ms: number; cancelled: boolean }[] = [], shown: Frame[] = [];
  let completed = 0;
  const control = playback(frozen(frames), frame => shown.push(frame), () => completed++, (run, ms) => {
    const job = { run, ms, cancelled: false }; jobs.push(job); return () => { job.cancelled = true; };
  });
  return { jobs, shown, control, completed: () => completed };
}
const sequence = (): Frame[] => [
  { phase: 'spin', pos: 'A-o13', ms: SPIN_MS },
  { phase: 'transfer', pos: 'A-o13', from: 'A', to: 'B', ms: TRANSFER_MS },
  { phase: 'move', pos: 'B-o1', ms: STEP_MS },
];

test('playback schedules all three durations and finishes once after the last tile', () => {
  const clock = clocked(sequence()); clock.control.next();
  for (let i = 0; i < 3; i++) { assert.equal(clock.completed(), 0); clock.jobs[i].run(); }
  assert.deepEqual(clock.jobs.map(job => job.ms), [700, 600, 250]);
  assert.deepEqual(clock.shown, sequence());
  clock.control.finish(); clock.control.next();
  assert.equal(clock.completed(), 1);
});

test('stopping the wheels advances only spin; skipping movement finishes without replaying stale timers', () => {
  const clock = clocked(sequence()); clock.control.next(); clock.control.next();
  assert.equal(clock.jobs[0].cancelled, true);
  clock.jobs[0].run(); assert.equal(clock.shown.length, 2);
  clock.control.finish(); clock.jobs[1].run(); clock.control.finish();
  assert.equal(clock.completed(), 1); assert.equal(clock.shown.length, 2);
});

test('loading another run cancels playback without completion or stale renders', () => {
  const clock = clocked(sequence()); clock.control.next(); clock.control.cancel();
  assert.equal(clock.jobs[0].cancelled, true);
  clock.jobs[0].run(); clock.control.next(); clock.control.finish();
  assert.equal(clock.completed(), 0); assert.equal(clock.shown.length, 1);
});

test('instant completion and empty movement schedule no timers and complete once', () => {
  for (const frames of [[], sequence()]) {
    const clock = clocked(frames); clock.control.finish(); clock.control.next();
    assert.equal(clock.jobs.length, 0); assert.equal(clock.shown.length, 0); assert.equal(clock.completed(), 1);
  }
  assert.deepEqual(movementFrames('A-o0', {}), []);
});

const { keyboardActivate } = await import(new URL('../scripts/layout-check-life.mjs', import.meta.url).href);
test('layout keyboard driver reaches real focus using Tab and activates with Enter or Space only', async () => {
  const nodes = [{}, {}, {}], pressed: string[] = [];
  let focus = -1;
  const page = { keyboard: { press: async (key: string) => {
    pressed.push(key); if (key === 'Tab') focus = (focus + 1) % nodes.length;
  } } };
  const control = { isEnabled: async () => true, evaluate: async (fn: (node: object) => boolean) =>
    runInNewContext(`(${fn.toString()})(node)`, { node: nodes[2], document: { activeElement: nodes[focus] } }) };
  await keyboardActivate(page, control);
  await keyboardActivate(page, control, 'Space');
  assert.deepEqual(pressed, ['Tab', 'Tab', 'Tab', 'Enter', 'Space']);
  await assert.rejects(keyboardActivate(page, { ...control, isEnabled: async () => false }), /enabled/);
});

test('layout keyboard driver fails on an unreachable target instead of silently using mouse/focus', async () => {
  let tabs = 0;
  await assert.rejects(keyboardActivate({ keyboard: { press: async (key: string) => {
    assert.equal(key, 'Tab'); tabs++;
  } } }, { isEnabled: async () => true, evaluate: async () => false }), /reachable by Tab/);
  assert.equal(tabs, 250);
});
