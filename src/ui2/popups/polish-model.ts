import type { Stat as GradedStat } from '../../life/base-types.ts';
import { grade } from '../../life/grades.ts';
import { FLAG_LABEL } from '../../life/data.ts';
import { careerIncome, careerSalary, careerTrack, promotionView, rankChange } from '../../life/career2.ts';
import { retirementView } from '../../life/jobs.ts';
import { achievementScore } from '../../life/ending.ts';
import { ECONOMY_KEYS, ECONOMY_RULES } from '../../life/economy.ts';
import { familyPopup } from '../../life/family.ts';
import { LIFE_RULES, STAT_LABEL } from '../../life/life-data.ts';
import { JOB_TEXT, SPECIAL_RULES } from '../../life/tracks.ts';
import type { Cond, GameState, Stat } from '../../life/types.ts';
import { WORLD } from '../../life/world.ts';
import type { OptionView } from '../../life/engine.ts';
import { POLISH as P } from './polish-data.ts';

export type DisplayRow = { label: string; value: string; stat?: Stat; direction?: 'up' | 'down' };
export type StageView = { name: string; remaining: number; elapsed: number; total: number };
export const childName = (index: number) => P.childNames[index] ?? P.childFallback(index);
export const childLabel = (state: GameState, index: number) => P.child(childName(index),
  Math.max(0, Math.floor((state.turn - state.family.kids[index].born) / LIFE_RULES.seasons.length)));
export function featLabels(state: GameState): string[] {
  return achievementScore(state).rows.map(row => row.id.startsWith('kid_independent:')
    ? P.childFeat(childName(Number(row.id.split(':')[1]))) : row.title);
}
export function humanCopy(text: string): string {
  return Object.entries(P.flagLabels).reduce((line, [id, label]) => line.replace(new RegExp(`\\b${id}\\b`, 'g'), label), text)
    .replace(/([가-힣]+)으로/g, (_all, word: string) => {
      const final = (word.charCodeAt(word.length - 1) - 0xac00) % 28;
      return word + (final === 0 || final === 8 ? '로' : '으로');
    }).replace(/\.{2,}/g, '.').replace(/\s*·\s*$/, '');
}
export function educationBody(state: GameState) {
  const popup = familyPopup(state);
  if (!popup || popup.kind === 'dual') return undefined;
  return { title: popup.kind === 'gift' ? P.independent : P.education,
    body: `${childLabel(state, popup.kid)}. ${popup.kind === 'gift' ? P.independentBody : P.educationBody}` };
}
/** Presentation grouping only. The wedding sheet owns wedding choices; the mandatory dual step is shown once. */
export function visibleOptions(state: GameState, offered: readonly OptionView[], wedding = false) {
  const hospital = WORLD.find(node => node.id === state.board.pos)?.place === 'hospital';
  return offered.filter(option => (!hospital || !option.id.startsWith('dual:') || familyPopup(state)?.kind === 'dual')
    && (!wedding || !option.id.startsWith('lifestyle:')));
}
export function graduateLine(state: GameState): string | undefined {
  const until = state.timers[ECONOMY_KEYS.graduateUntil];
  return state.flags.includes(SPECIAL_RULES.master) ? P.master
    : until !== undefined ? `${P.graduate} · ${P.enrolled(Math.max(0, until - state.turn))}` : undefined;
}
export const graduateCost = () => P.tuition(ECONOMY_RULES.graduateTuition, ECONOMY_RULES.graduateSeasons);
export function stageView(state: GameState): StageView {
  const period = LIFE_RULES.periods.find(row => LIFE_RULES.startAge + Math.floor(state.turn / LIFE_RULES.seasons.length) <= row.maxAge)
    ?? LIFE_RULES.periods.at(-1)!;
  const total = period.seasons, start = (period.minAge - LIFE_RULES.startAge) * LIFE_RULES.seasons.length;
  const elapsed = Math.min(total, Math.max(0, state.turn - start));
  const name = period === LIFE_RULES.periods[0] ? state.status === 'student' ? P.stages.student : P.stages.youth
    : period === LIFE_RULES.periods[1] ? P.stages.middle : P.stages.later;
  return { name, remaining: total - elapsed, elapsed, total };
}
function needText(need: Cond): string[] {
  return [...Object.entries(need.min ?? {}).map(([stat, min]) => P.need(STAT_LABEL[stat as Stat],
    grade(stat as GradedStat, min!) ? `${grade(stat as GradedStat, min!)!.letter}등급` : String(min))),
  ...(need.flags ?? []).map(flag => JOB_TEXT.flag[flag] ?? FLAG_LABEL[flag] ?? P.flagLabels[flag] ?? flag),
  ...(need.any ? [need.any.map(part => needText(part).join(', ')).join(' 또는 ')] : [])];
}
export function careerRows(state: GameState, before?: GameState): DisplayRow[] {
  const track = careerTrack(state), change = before ? rankChange(before, state) : null;
  const rows: DisplayRow[] = [{ label: P.current, value: track?.ranks[state.job.rank].title ?? (state.status === 'retired' ? P.retirement : P.noCareer) },
    { label: P.income, value: P.pay(careerSalary(state), change?.salaryDelta) }];
  if (state.status === 'retired') rows.push({ label: P.pension, value: P.pay(careerIncome(state).pension) });
  const retiring = retirementView(state);
  if (retiring.due) rows.push({ label: P.severance, value: P.pay(retiring.severance) },
    { label: P.pension, value: P.pay(retiring.pension) });
  if (track) {
    const next = track.ranks[state.job.rank + 1], promotion = promotionView(state);
    rows.push({ label: P.next, value: next?.title ?? P.top });
    if (next) {
      rows.push(...[...needText(next.need), JOB_TEXT.tenure(next.tenure)].map(value => ({ label: P.requirements, value })));
      rows.push(...promotion.locks.map(value => ({ label: P.requirements, value: humanCopy(value) })));
    }
    rows.push(...(change?.maintenance ?? []).map(value => ({ label: P.maintenance, value: humanCopy(value) })));
  }
  return rows.filter((row, index) => rows.findIndex(other => other.label === row.label && other.value === row.value) === index);
}
export function statChanges(before: GameState, after: GameState): DisplayRow[] {
  return (Object.keys(STAT_LABEL) as Stat[]).filter(stat => before.s[stat] !== after.s[stat] && stat !== 'acts'
    && stat !== 'rank').map(stat => {
    const value = (state: GameState) => {
      const g = grade(stat as GradedStat, state.s[stat]); return g ? P.grade(g.letter, state.s[stat]) : String(state.s[stat]);
    };
    return { label: STAT_LABEL[stat], value: `${value(before)} → ${value(after)}`, stat,
      direction: after.s[stat] > before.s[stat] ? 'up' : 'down' };
  });
}
/** Whole items stay together; a long story gets its own page. */
export function itemPages<T>(items: readonly T[], length: (item: T) => number, limit: number = P.rowLimit, count: number = P.rowCount): T[][] {
  const pages: T[][] = []; let current: T[] = [], size = 0;
  for (const item of items) {
    const next = length(item);
    if (current.length && (size + next > limit || current.length >= count)) { pages.push(current); current = []; size = 0; }
    current.push(item); size += next;
  }
  if (current.length || !pages.length) pages.push(current);
  return pages;
}
export function labelledRows(lines: readonly string[], label: string = P.detail): DisplayRow[] {
  return lines.map(line => {
    const [first, ...rest] = line.split(' · ');
    if (rest.length) return { label: first, value: rest.join(' · ') };
    const stat = Object.values(STAT_LABEL).find(name => line.startsWith(name + ' '));
    const field = stat ?? ['순자산', '현금', '빚', '생활 수준', '체력'].find(name => line.startsWith(name + ' '));
    return field ? { label: field, value: line.slice(field.length + 1) } : { label, value: line };
  });
}
