// Read-only views for the board UI: letter grades, the rank a run stands on, the ranks it can reach next and
// what a rank-up changed. Pure and DOM-free like engine.ts. Nothing here changes a state, a roll or a payout:
// every figure comes from `options`, `derived` and the data tables.
import { ACTIONS, CAREER, CAREER_TOP_LEVEL, ENDINGS, FLAG_LABEL, GRADES, GRADE_STEPS, STAGES, STAT_LABEL } from './data.ts';
import { derived, options } from './engine.ts';
import type { Effect, EndingId, GameState, PlaceId, Stage, Stat } from './types.ts';

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

export function careerRank(at: Standing): CareerRank {
  const rungs = CAREER[at.stage];
  const i = Math.min(rungs.length - 1, Math.max(0, rung(at)));
  return { stage: at.stage, field: STAGES[at.stage].name, title: rungs[i].title, level: rungs[i].level, stars: i + 1, maxStars: rungs.length };
}

/** Where the run would stand once `effect` has been applied. */
function rankAfter(state: GameState, effect: Effect): CareerRank {
  if (effect.end) {
    const ending = ENDINGS.find((e) => e.id === effect.end)!;
    const here = careerRank(state);
    return { ...here, title: ending.title, level: CAREER_TOP_LEVEL, stars: here.maxStars, ending: ending.id };
  }
  const s = { ...state.s };
  for (const [k, v] of Object.entries(effect.add ?? {}) as [Stat, number][]) s[k] += v;
  Object.assign(s, effect.set);
  return careerRank({ stage: effect.stage ?? state.stage, s, flags: effect.flag ? [...state.flags, effect.flag] : state.flags });
}

export type Perk = { id: 'income' | 'credit' | 'jobPct'; label: string; value: number; unit: '만원' | '%' };

/** What a rank is worth each season, from the engine's own upkeep lines and stage table. */
export function careerPerks(state: GameState): Perk[] {
  const d = derived(state);
  const income = d.upkeep.lines.reduce((sum, line) => sum + Math.max(0, line.amount), 0);
  return [
    { id: 'income', label: '계절 수입', value: income, unit: '만원' },
    { id: 'credit', label: '신용 한도', value: d.creditLimit, unit: '만원' },
    { id: 'jobPct', label: '일감 단가', value: STAGES[state.stage].jobPct, unit: '%' },
  ];
}

export type Requirement = {
  label: string;
  met: boolean;
  /** Present for a stat requirement. */
  stat?: Stat;
  need?: number;
  have?: number;
  /** The grade the requirement asks for and the grade held, for a graded stat. */
  needGrade?: GradeLetter;
  haveGrade?: GradeLetter;
};

export type NextRank = {
  /** The option that leads there; pick it in the 홈 list to try. */
  optionId: string;
  /** The option's title, e.g. "대리 승진 심사". */
  action: string;
  place: PlaceId;
  rank: CareerRank;
  cost: number;
  tire: number;
  /** Success chance in percent as the engine would roll it now; undefined for a sure outcome. */
  chance?: number;
  enabled: boolean;
  /** The engine's own Korean reasons while it is locked. */
  locks: string[];
  requirements: Requirement[];
};

/** The higher rungs the run can reach from here, in the engine's order. Empty once nothing higher is on offer. */
export function nextRanks(state: GameState): NextRank[] {
  if (state.phase === 'ended') return [];
  // An event may be waiting; the ladder still reads the actions of the season behind it.
  const acting: GameState = state.phase === 'action' ? state : { ...state, phase: 'action', eventId: null };
  const here = careerRank(state);
  const out: NextRank[] = [];
  for (const o of options(acting)) {
    const action = ACTIONS.find((a) => a.id === o.id);
    const effect = action?.roll?.success ?? action?.effect;
    if (!action || !effect || o.id === 'rest') continue;
    const rank = rankAfter(state, effect);
    if (rank.level <= here.level) continue;
    const requirements: Requirement[] = [];
    for (const [stat, need] of Object.entries(action.need?.min ?? {}) as [Stat, number][]) {
      const have = state.s[stat];
      requirements.push({ label: STAT_LABEL[stat], met: have >= need, stat, need, have, needGrade: grade(stat, need)?.letter, haveGrade: grade(stat, have)?.letter });
    }
    for (const flag of action.need?.flags ?? []) requirements.push({ label: FLAG_LABEL[flag] ?? flag, met: state.flags.includes(flag) });
    if (o.cost > 0) requirements.push({ label: STAT_LABEL.money, met: state.s.money >= o.cost, stat: 'money', need: o.cost, have: state.s.money });
    out.push({ optionId: o.id, action: o.title, place: o.place, rank, cost: o.cost, tire: o.tire, chance: o.roll?.chance, enabled: o.enabled, locks: o.locks, requirements });
  }
  return out;
}

export type RankChange = {
  /** `up`: a higher rung. `move`: another career at the same or a lower level (퇴사, 해고, 전직). */
  kind: 'up' | 'move';
  from: CareerRank;
  to: CareerRank;
  /** The new rank's perks with the difference to the old rank's. */
  perks: (Perk & { gain: number })[];
  next: NextRank[];
};

/** What changed between the states before and after one choice; null while the rung is the same. */
export function rankChange(before: GameState, after: GameState): RankChange | null {
  const from = careerRank(before);
  const to = careerRank(after);
  if (from.stage === to.stage && from.level === to.level) return null;
  const old = careerPerks(before);
  const perks = careerPerks(after).map((perk, i) => ({ ...perk, gain: perk.value - old[i].value }));
  return { kind: to.level > from.level ? 'up' : 'move', from, to, perks, next: nextRanks(after) };
}
