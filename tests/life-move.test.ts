import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRADE_STEPS } from '../src/game/data.ts';
import { applyMove, carLevel, reachable, rollDice, stepsFor } from '../src/life/move.ts';
import { MAPS, WORLD } from '../src/life/world.ts';
import type { Cond, GameState, MapId, StatMap, WorldNode } from '../src/life/types.ts';

const mapIds: MapId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
const byId = new Map(WORLD.map(node => [node.id, node]));
const gradeC = GRADE_STEPS.theory![3];
const dicePairs: [number, number][] = Array.from({ length: 36 }, (_, i) => [Math.floor(i / 6) + 1, i % 6 + 1]);

function stateAt(pos = 'A-o0', dice: GameState['board']['dice'] = [1, 2], stats: StatMap = {}): GameState {
  return {
    rng: 1, turn: 10, status: 'jobless', track: null,
    board: { pos, dice, step: 'pick', visited: 1, laps: 0, contests: 0, rankups: 0,
      ledger: { salary: 200 }, lapAt: { A: -1, B: -1, C: -1, D: -1, E: -1, F: -1 } },
    s: { car: 0, money: 99_999, theory: gradeC, ...stats }, flags: ['licensed'], timers: {},
  } as unknown as GameState;
}

function freezeDeep(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(freezeDeep);
  Object.freeze(value);
}

// Small temporary graph fixtures exercise routes absent from the current short walks.
// Restore the table in finally; tests in this file run sequentially.
function withNodes(patches: Record<string, Partial<WorldNode>>, run: () => void): void {
  const originals = Object.entries(patches).map(([id, patch]) => {
    const node = byId.get(id)!;
    const original = { ...node };
    Object.assign(node, patch);
    return { node, original };
  });
  try { run(); } finally {
    for (const { node, original } of originals) {
      Object.assign(node, original);
      if (!original.cross) delete node.cross;
    }
  }
}

test('stepsFor uses two dice, cumulative car adjustments, and sorted unique positive steps', () => {
  assert.deepEqual(stepsFor([2, 5], 0), [2, 5]);
  assert.deepEqual(stepsFor([2, 5], 1), [1, 2, 4, 5]);
  assert.deepEqual(stepsFor([2, 5], 2), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(stepsFor([2, 5], 3), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(stepsFor([6, 6], 2), [5, 6, 7]);
  assert.deepEqual(stepsFor([3, 2], 2), [1, 2, 3, 4]);
  for (const level of [0, 1, 2, 3]) {
    assert.deepEqual(stepsFor([], level), []);
    assert.deepEqual(stepsFor([6], level), [], 'single-roulette baseline is not part of T02');
    assert.deepEqual(stepsFor([1, 1], level), level >= 2 ? [1, 2] : [1]);
    assert.deepEqual(stepsFor([2, 2, 6], level), stepsFor([2, 2], level));
    for (const dice of dicePairs) {
      const steps = stepsFor(dice, level);
      assert.ok(steps.every(step => Number.isInteger(step) && step >= 1));
      assert.deepEqual(steps, [...new Set(steps)].sort((a, b) => a - b));
    }
  }
});

test('rollDice matches mulberry32 and mutates only rng and board.dice', () => {
  const state = stateAt();
  const before = structuredClone(state);
  for (const expected of [[4, 1], [4, 6], [6, 2], [4, 5]]) {
    const previousRng = state.rng;
    const dice = rollDice(state);
    assert.deepEqual(dice, expected);
    assert.deepEqual(state.board.dice, expected);
    assert.notEqual(state.rng, previousRng);
  }
  assert.equal(state.rng, 1767624617);
  assert.deepEqual(state, { ...before, rng: state.rng, board: { ...before.board, dice: [4, 5] } });
  const faces = new Set<number>();
  for (const seed of [0, 1, 42, 4294967295]) {
    const left = stateAt(), right = stateAt();
    left.rng = right.rng = seed;
    for (let i = 0; i < 300; i++) {
      const dice = rollDice(left);
      assert.deepEqual(dice, rollDice(right));
      assert.equal(left.rng, right.rng);
      assert.ok(Number.isInteger(left.rng) && left.rng >= 0 && left.rng <= 4294967295);
      for (const die of dice) {
        assert.ok(Number.isInteger(die) && die >= 1 && die <= 6);
        faces.add(die);
      }
    }
  }
  assert.deepEqual([...faces].sort(), [1, 2, 3, 4, 5, 6]);
});

test('car trouble disables movement adjustments only before its expiry turn', () => {
  const state = stateAt('A-o0', [2, 5], { car: 3 });
  const before = structuredClone(state);
  assert.equal(carLevel(state), 3);
  assert.deepEqual(state, before);
  state.timers.car_trouble = state.turn + 4;
  const expiry = state.timers.car_trouble;
  for (; state.turn < expiry; state.turn++) {
    assert.equal(carLevel(state), 0);
    assert.deepEqual(reachable(state), reachable(stateAt('A-o0', [2, 5], { car: 0 })));
  }
  assert.equal(carLevel(state), 3);
  assert.deepEqual(reachable(state), reachable(stateAt('A-o0', [2, 5], { car: 3 })));
  state.turn++;
  assert.equal(carLevel(state), 3);
});

const averages = [
  [2.22, 3.38, 2.84, 2.71, 2.57, 2.39],
  [3.70, 5.47, 4.66, 4.46, 4.22, 3.96],
  [5.42, 8.49, 7.04, 6.69, 6.33, 5.87],
];
for (const [car, expected] of averages.entries()) {
  test(`section 3.3 destination averages: car ${car}, all 212 origins × 36 ordered dice pairs`, t => {
    const actual = mapIds.map((map, index) => {
      const nodes = WORLD.filter(node => node.map === map);
      let total = 0;
      for (const node of nodes) for (const dice of dicePairs) total += reachable(stateAt(node.id, dice, { car })).length;
      const average = total / (nodes.length * dicePairs.length);
      assert.ok(Math.abs(average - expected[index]) <= 0.02, `${map}: ${average} versus ${expected[index]}`);
      return average.toFixed(2);
    });
    t.diagnostic(`car ${car}, A–F: ${actual.join(' ')}`);
  });
}

test('both special-zone stations hide D for every dice pair when its gate is unmet', () => {
  const graded = ['theory', 'skill', 'xp', 'rep', 'teach', 'biz', 'net'] as const;
  const belowC = Object.fromEntries(graded.map(stat => [stat, GRADE_STEPS[stat]![3] - 1]));
  for (const station of ['B-o21', 'C-o21']) for (const dice of dicePairs) {
    for (const car of [0, 1, 2]) for (const flags of [[], ['licensed']]) {
      const state = stateAt(station, dice, { ...belowC, car });
      state.flags = flags;
      assert.ok(reachable(state).every(move => byId.get(move.node)!.map !== 'D'));
    }
    const unlicensed = stateAt(station, dice);
    unlicensed.flags = [];
    assert.ok(reachable(unlicensed).every(move => byId.get(move.node)!.map !== 'D'));
  }
  for (const station of ['B-o21', 'C-o21']) for (const stat of graded) {
    const state = stateAt(station, [1, 1], { ...belowC, [stat]: GRADE_STEPS[stat]![3] });
    const move = reachable(state).find(move => move.node === 'D-o1');
    assert.ok(move, `${station}: licensed + ${stat} at C`);
    assert.equal(move.fare, MAPS.D.fareIn);
    assert.equal(move.via, station);
    assert.equal(move.invite, undefined);
  }
});

test('invite alone opens D for free and is consumed only by applying that transfer', () => {
  for (const station of ['B-o21', 'C-o21']) for (const licensed of [false, true]) {
    const state = stateAt(station, [1, 1], { money: 0, theory: licensed ? gradeC : 0 });
    state.flags = ['invite', 'kept', ...(licensed ? ['licensed'] : [])];
    const before = structuredClone(state);
    const move = reachable(state).find(move => move.node === 'D-o1')!;
    assert.ok(move.invite);
    assert.equal(move.fare, 0);
    assert.equal(move.via, station);
    assert.deepEqual(state, before);
    const applied = applyMove(state, move.node);
    assert.deepEqual(applied.move, move);
    assert.equal(applied.state.s.money, 0);
    assert.equal(applied.state.board.pos, 'D-o1');
    assert.deepEqual(applied.state.flags, state.flags.filter(flag => flag !== 'invite'));
    assert.deepEqual(state, before);
    assert.deepEqual(applyMove(state, byId.get(station)!.next[0]).state.flags, state.flags);
  }
});

test('every transfer consumes one step and requires enough money for its toll', () => {
  for (const node of WORLD) for (const cross of node.cross ?? []) {
    const poor = stateAt(node.id, [1, 1], { money: cross.fare - 1 });
    assert.ok(!reachable(poor).some(move => move.node === cross.to));
    assert.ok(reachable(poor).some(move => move.node === node.next[0]), 'free local exit remains');
    const rich = stateAt(node.id, [1, 1], { money: cross.fare });
    assert.deepEqual(reachable(rich).find(move => move.node === cross.to), {
      node: cross.to, steps: 1, path: [cross.to], tolls: [cross.fare], fare: cross.fare, via: node.id,
      passed: { pay: [], start: [] },
    });
  }
  const move = reachable(stateAt('A-o11', [4, 4])).find(move => move.node === 'B-o2');
  assert.deepEqual(move, { node: 'B-o2', steps: 4, path: ['A-o12', 'A-o13', 'B-o1', 'B-o2'],
    tolls: [0, 0, 10, 10], fare: 10, via: 'A-o13', passed: { pay: [], start: [] } });
});

test('multiple transfers accumulate tolls and check the total against money', () => {
  withNodes({
    'A-o0': { next: [], cross: [{ to: 'B-o1', fare: 10 }] },
    'B-o1': { next: [], cross: [{ to: 'C-o1', fare: 30 }] },
  }, () => {
    assert.deepEqual(reachable(stateAt('A-o0', [2, 2], { money: 39 })), []);
    const state = stateAt('A-o0', [2, 2], { money: 40 });
    const result = applyMove(state, 'C-o1');
    assert.equal(result.move.fare, 40);
    assert.equal(result.move.via, 'B-o1');
    assert.deepEqual(result.move.path, ['B-o1', 'C-o1']);
    assert.equal(result.state.s.money, 0);
  });
});

test('dedupe prefers lowest fare, then shortest path, then first discovered path', () => {
  withNodes({
    'A-o0': { next: ['A-o1', 'A-o2'], cross: [{ to: 'B-o1', fare: 30 }] },
    'A-o1': { next: ['A-o3', 'A-o2'] },
    'A-o2': { next: ['A-o3'], cross: [{ to: 'B-o1', fare: 10 }] },
    'A-o3': { next: [], cross: [{ to: 'B-o1', fare: 10 }] },
  }, () => {
    const moves = reachable(stateAt('A-o0', [1, 3], { car: 1 }));
    assert.equal(moves.filter(move => move.node === 'B-o1').length, 1);
    const transfer = moves.find(move => move.node === 'B-o1')!;
    assert.equal(transfer.fare, 10, 'cheaper route beats the direct one-step toll');
    assert.equal(transfer.steps, 2, 'shorter route wins among equal fares');
    assert.deepEqual(transfer.path, ['A-o2', 'B-o1']);
    assert.equal(moves.find(move => move.node === 'A-o2')!.steps, 1);
    assert.deepEqual(moves.find(move => move.node === 'A-o3')!.path, ['A-o1', 'A-o3']);
    assert.deepEqual(moves.map(move => [move.steps, move.node]),
      [[1, 'A-o1'], [1, 'A-o2'], [2, 'A-o3'], [2, 'B-o1'], [3, 'B-o2'], [3, 'B-o3']]);
    assert.deepEqual(reachable(stateAt('A-o0', [1, 3], { car: 1 })), moves);
  });
});

test('a nonempty cycle may land on the origin, but an unrolled state has no destinations', () => {
  withNodes({ 'A-o0': { next: ['A-o1'] }, 'A-o1': { next: ['A-o0'] } }, () => {
    const moves = reachable(stateAt('A-o0', [2, 2]));
    assert.deepEqual(moves.map(move => move.path), [['A-o1', 'A-o0']]);
    assert.equal(moves[0].node, 'A-o0');
    assert.deepEqual(moves[0].passed.start, ['A-o0']);
    assert.deepEqual(reachable(stateAt('A-o0', [])), []);
  });
});

test('gate conditions combine status, track, min/max, flags, notFlags, and nested any', () => {
  const gate: Cond = { status: ['working'], track: ['pilot'], min: { theory: gradeC }, max: { happy: 0 },
    flags: ['licensed'], notFlags: ['barred'], any: [{ min: { skill: gradeC } }, { flags: ['waiver'] }] };
  const cross = { to: 'D-o1', fare: 0, gate };
  withNodes({ 'B-o21': { cross: [cross] } }, () => {
    const base = stateAt('B-o21', [1, 1], { skill: gradeC });
    base.status = 'working'; base.track = 'pilot';
    const opens = (state: GameState) => reachable(state).some(move => move.node === 'D-o1');
    assert.ok(opens(base), 'missing happy is zero, satisfying max');
    const failures: ((state: GameState) => void)[] = [
      state => { state.status = 'student'; }, state => { state.track = null; },
      state => { state.track = 'mechanic'; }, state => { state.s.theory = gradeC - 1; },
      state => { delete (state.s as StatMap).theory; }, state => { state.s.happy = 1; },
      state => { state.flags = []; }, state => { state.flags.push('barred'); },
      state => { state.s.skill = gradeC - 1; },
    ];
    for (const fail of failures) {
      const state = structuredClone(base); fail(state);
      assert.equal(opens(state), false);
    }
    const alternative = structuredClone(base);
    alternative.s.skill = 0; alternative.flags.push('waiver');
    assert.ok(opens(alternative));
    for (const cond of [{ status: [] }, { track: [] }, { any: [] }] as Cond[]) {
      cross.gate = cond;
      assert.equal(opens(base), false);
    }
    cross.gate = { min: { happy: 0 }, max: { happy: 0 } };
    assert.ok(opens(base), 'missing stats are zero for both bounds');
  });
});

test('promotion stops preserve previews and count passed nodes only through the first eligible stop', () => {
  const state = stateAt('A-o21', [6, 6]);
  const plain = reachable(state).find(move => move.node === 'A-o27')!;
  const opts = { canPromote: (current: GameState, node: WorldNode) => {
    assert.equal(current, state);
    assert.equal(node.kind, 'rankup');
    return node.id === 'A-o26';
  } };
  const stopped = reachable(state, opts).find(move => move.node === plain.node)!;
  assert.equal(stopped.stop, 'A-o26');
  assert.equal(stopped.node, plain.node);
  assert.deepEqual(stopped.path, plain.path);
  assert.deepEqual(stopped.passed.pay, ['A-o22']);
  assert.equal(plain.stop, undefined);
  assert.equal(reachable(state, { canPromote: () => false })[0].stop, undefined);
  assert.equal(applyMove(state, plain.node, opts).state.board.pos, 'A-o26');

  const beforePay = stateAt('A-o8', [4, 4]);
  assert.deepEqual(reachable(beforePay)[0].passed.pay, ['A-o11']);
  assert.deepEqual(reachable(beforePay, { canPromote: () => true })[0].passed.pay, []);
  const beforeStart = stateAt('A-o25', [3, 3]);
  assert.deepEqual(reachable(beforeStart)[0].passed.start, ['A-o0']);
  assert.deepEqual(reachable(beforeStart, { canPromote: () => true })[0].passed.start, []);
  const multiple = reachable(stateAt('D-o1', [6, 6]), { canPromote: () => true });
  assert.equal(multiple.find(move => move.node === 'D-o7')!.stop, 'D-o2');
  assert.equal(reachable(stateAt('A-o8', [1, 1]), { canPromote: () => true })[0].stop, undefined);
  assert.equal(reachable(stateAt('A-o9', [1, 1]), { canPromote: () => true })[0].stop, undefined);
});

test('pay/start destinations count as passed, and origins do not', () => {
  assert.deepEqual(reachable(stateAt('A-o10', [1, 1]))[0].passed, { pay: ['A-o11'], start: [] });
  assert.deepEqual(reachable(stateAt('A-o27', [1, 1]))[0].passed, { pay: [], start: ['A-o0'] });
  assert.deepEqual(reachable(stateAt('A-o27', [2, 2]))[0].passed, { pay: [], start: ['A-o0'] });
  for (const origin of ['A-o0', 'A-o11']) {
    assert.deepEqual(reachable(stateAt(origin, [1, 1]))[0].passed, { pay: [], start: [] });
  }
});

test('a stop before the gated transfer preserves the invite and visits only the actual arrival map', () => {
  const state = stateAt('B-o15', [6, 6], { car: 2 });
  state.flags = ['invite'];
  const { state: next, move } = applyMove(state, 'D-o1', { canPromote: () => true });
  assert.equal(move.stop, 'B-o16');
  assert.equal(next.board.pos, 'B-o16');
  assert.deepEqual(next.flags, ['invite']);
  assert.equal(next.board.visited, 1 | (1 << 1));
  const entered = stateAt('B-o21', [3, 3]);
  entered.flags = ['invite'];
  const afterEntry = applyMove(entered, 'D-o3', { canPromote: () => true });
  assert.equal(afterEntry.state.board.pos, 'D-o2');
  assert.deepEqual(afterEntry.state.flags, []);
  assert.equal(afterEntry.state.board.visited, 1 | (1 << 3));
});

test('reachable is read-only; applyMove returns a deep copy changing only movement fields', () => {
  const state = stateAt('A-o13', [1, 1], { money: 10 });
  const before = structuredClone(state);
  freezeDeep(state);
  const moves = reachable(state);
  assert.deepEqual(state, before);
  const { state: next, move } = applyMove(state, 'B-o1');
  assert.deepEqual(move, moves.find(move => move.node === 'B-o1'));
  assert.deepEqual(next, { ...before, s: { ...before.s, money: 0 }, board: { ...before.board, pos: 'B-o1', visited: 3 } });
  next.board.dice[0] = 6; next.board.ledger.salary = 0; next.board.lapAt.A = 20;
  next.flags.push('changed'); next.timers.car_trouble = 15;
  assert.deepEqual(state, before, 'all nested containers belong to the copy');
  assert.throws(() => applyMove(state, 'D-o1'), /Unreachable destination/);
  assert.throws(() => applyMove(state, 'unknown'), /Unreachable destination/);
  assert.deepEqual(state, before);
  for (const [index, map] of mapIds.entries()) {
    assert.equal(applyMove(stateAt(`${map}-o0`, [1, 1]), `${map}-o1`).state.board.visited, 1 | (1 << index));
  }
});

test('a promotion stop before a transfer charges no toll for the unreached transfer', () => {
  const state = stateAt('B-o15', [6, 6], { car: 2, money: 1000, theory: 150 });
  state.flags = ['licensed'];
  const stopped = applyMove(state, 'D-o1', { canPromote: () => true });
  assert.equal(stopped.move.stop, 'B-o16');
  assert.equal(stopped.state.s.money, 1000);
  const through = applyMove(state, 'D-o1');
  assert.equal(through.state.s.money, 700);
});
