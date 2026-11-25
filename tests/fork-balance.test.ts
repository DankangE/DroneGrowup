import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_ROUTE_GAP, forkBalance } from '../scripts/fork-balance.ts';

test('each route must outscore the other for at least two planners', () => {
  const a = { a: 2, b: 1.9 }, b = { a: 1.9, b: 2 }, tie = { a: 2, b: 2 };
  assert.equal(forkBalance([a, a, b, b, tie]).passed, true);
  assert.deepEqual([forkBalance([a, a, b, b, tie]).aWins, forkBalance([a, a, b, b, tie]).bWins], [2, 2]);
  for (const pairs of [[a, a, a, a], [b, b, b, b], [a, b, b, tie], [a, a, b, tie]]) {
    assert.equal(forkBalance(pairs).passed, false);
  }
});

test('no planner may score more than MAX_ROUTE_GAP higher on one route', () => {
  const a = { a: 2, b: 1.9 }, b = { a: 1.9, b: 2 };
  const edge = { a: 100, b: 100 * (1 + MAX_ROUTE_GAP) };
  assert.equal(forkBalance([a, a, b, b, edge]).passed, true);
  const result = forkBalance([a, a, b, b, { a: 100, b: 100 * (1 + MAX_ROUTE_GAP) + 1 }]);
  assert.equal(result.passed, false);
  assert.ok(result.worstGap > MAX_ROUTE_GAP);
});
