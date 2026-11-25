import { CAREER, CAREER_TOP_LEVEL, ENDINGS, STAGES } from './data.ts';
import type { EndingId, GameState, Stage } from './types.ts';

export type CareerRank = {
  stage: Stage;
  /** The career the rung belongs to, e.g. "드론 회사 직원". */
  field: string;
  /** The rung itself, e.g. "대리". */
  title: string;
  /** Orders every rung of the game; the big number on the rank card. */
  level: number;
  /** Rungs reached inside this career, 1-based, out of `maxStars`. */
  stars: number;
  maxStars: number;
  /** Set when the rung is an achievement ending. */
  ending?: EndingId;
};

type Standing = Pick<GameState, 'stage' | 's' | 'flags'>;

function rung(at: Standing): number {
  switch (at.stage) {
    case 'employee': case 'director': return at.s.rank;
    case 'instructor': return at.flags.includes('examiner') ? 1 : 0;
    case 'academy': return at.s.level - 1;
    case 'company': return at.s.round;
    default: return 0;
  }
}

export function careerRank(at: Standing, achievement?: EndingId | null): CareerRank {
  const rungs = CAREER[at.stage];
  const field = STAGES[at.stage].name;
  if (achievement) {
    const ending = ENDINGS.find(e => e.id === achievement)!;
    return { stage: at.stage, field, title: ending.title, level: CAREER_TOP_LEVEL, stars: rungs.length, maxStars: rungs.length, ending: achievement };
  }
  const i = Math.min(rungs.length - 1, Math.max(0, rung(at)));
  return { stage: at.stage, field, title: rungs[i].title, level: rungs[i].level, stars: i + 1, maxStars: rungs.length };
}
