import { LIFE_RULES } from '../life/life-data.ts';

/** Presentation of the same zero-based season used by derived().dateLabel. */
export function lifeProgress(turn: number) {
  const total = LIFE_RULES.maxTurns;
  const completed = Math.min(total, Math.max(0, Number.isFinite(turn) ? Math.floor(turn) : 0));
  return {
    completed, total, percent: completed * 100 / total,
    season: Math.min(completed + 1, total),
    startAge: LIFE_RULES.startAge,
    endAge: LIFE_RULES.startAge + total / LIFE_RULES.seasons.length,
  };
}

// Display ticks only; career gates and stamina rules stay in the engine.
export const LIFE_MILESTONES = [35, 55, 60].map(age => ({
  age, percent: (age - LIFE_RULES.startAge) * LIFE_RULES.seasons.length * 100 / LIFE_RULES.maxTurns,
}));
