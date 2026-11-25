import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forkBalance } from '../scripts/fork-balance.ts';

test('each route must outscore the other for at least two planners', () => {
  const a = { a: 2, b: 1 }, b = { a: 1, b: 2 }, tie = { a: 2, b: 2 };
  assert.deepEqual(forkBalance([a, a, b, b, tie]), { aWins: 2, bWins: 2, passed: true });
  for (const pairs of [[a, a, a, a], [b, b, b, b], [a, b, b, tie], [a, a, b, tie]]) {
    assert.equal(forkBalance(pairs).passed, false);
  }
});
