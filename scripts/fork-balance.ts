/** Paired mean scores on the same seeds. Ties give neither route a win. */
export function forkBalance(pairs: { a: number; b: number }[]) {
  const aWins = pairs.filter(({ a, b }) => a > b).length;
  const bWins = pairs.filter(({ a, b }) => b > a).length;
  return { aWins, bWins, passed: aWins >= 2 && bWins >= 2 };
}
