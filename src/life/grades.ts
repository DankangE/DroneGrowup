// Read-only grades, shared by the life board HUD and popup views.
import { GRADES, GRADE_STEPS } from './data.ts';
import type { Stat } from './base-types.ts';

export type GradeLetter = (typeof GRADES)[number];
export type Grade = {
  letter: GradeLetter;
  /** 0 (G) .. 7 (S). */
  index: number;
  /** The lowest value of this grade. */
  from: number;
  /** The lowest value of the next grade; null at S. */
  next: number | null;
};

export const GRADED_STATS = Object.keys(GRADE_STEPS) as Stat[];

/** The letter grade of a value, or null for a stat that has no grades (money, items, counters). */
export function grade(stat: Stat, value: number): Grade | null {
  const steps = GRADE_STEPS[stat];
  if (!steps) return null;
  const index = steps.filter((from) => value >= from).length;
  return { letter: GRADES[index], index, from: index === 0 ? 0 : steps[index - 1], next: steps[index] ?? null };
}

