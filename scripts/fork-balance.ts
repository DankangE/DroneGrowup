/**
 * Largest allowed gap between the better and the worse route for one planner: better / worse - 1.
 * 25% because the 상장 planner's forced-route mean moves by about 6% of itself per 300 seeds (its runs split
 * between a ~60,000 listing and a 0-point debtor ending), so a smaller limit would fail on seed luck, while a route
 * that is a quarter better for every career is a choice nobody should have to think about.
 */
export const MAX_ROUTE_GAP = 0.25;

/** Paired mean scores on the same seeds. Ties give neither route a win. */
export function forkBalance(pairs: { a: number; b: number }[]) {
  const aWins = pairs.filter(({ a, b }) => a > b).length;
  const bWins = pairs.filter(({ a, b }) => b > a).length;
  const gaps = pairs.map(({ a, b }) => Math.max(a, b) / Math.max(1, Math.min(a, b)) - 1);
  const worstGap = Math.max(0, ...gaps);
  return { aWins, bWins, worstGap, passed: aWins >= 2 && bWins >= 2 && worstGap <= MAX_ROUTE_GAP };
}
