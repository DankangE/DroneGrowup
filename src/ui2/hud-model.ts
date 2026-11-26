import { LIFE_RULES } from '../life/life-data.ts';
import type { GradeLetter } from '../life/grades.ts';

// Light inks on the navy grade chips; colour supplements the visible letter.
export const GRADE_COLOURS: Record<GradeLetter, string> = {
  G: '#b9c6ce', F: '#a8bfff', E: '#6ed9fa', D: '#78e0b0',
  C: '#d0ed80', B: '#ffbb83', A: '#ff9eb5', S: '#ffdc68',
};

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
export const LIFE_MILESTONES = [
  { age: 35, colour: '#48d6ae' },
  { age: 55, colour: '#5dbbfa' },
  { age: 60, colour: '#c19afa' },
].map(milestone => ({ ...milestone,
  percent: (milestone.age - LIFE_RULES.startAge) * LIFE_RULES.seasons.length * 100 / LIFE_RULES.maxTurns,
}));

// Each milestone closes a coloured leg; the last leg continues to settlement.
export const LIFE_ROUTE_SEGMENTS = [...LIFE_MILESTONES, { percent: 100, colour: '#ffd36d' }]
  .map((milestone, index, route) => ({
    from: route[index - 1]?.percent ?? 0, to: milestone.percent, colour: milestone.colour,
  }));
