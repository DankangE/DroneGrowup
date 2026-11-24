import { RULES, STAT_LABEL, STAT_MAX } from '../game/data.ts';
import { derived, num } from '../game/engine.ts';
import type { GameState, OptionView, Stage, Stat } from '../game/types.ts';
import { button, countNumber, el, meter, reducedMotion } from './dom.ts';
import { emblem, icon, type IconName } from './icons.ts';

export const signed = (value: number) => `${value > 0 ? '+' : ''}${num(value)}`;
export const statValue = (stat: Stat, value: number) => num(value) + (['money','debt','value'].includes(stat) ? '만원' : ['support','cond'].includes(stat) ? '%' : '');
const tiers: Record<Stage, number> = { student: 0, pilot: 1, employee: 2, instructor: 2, solo: 2, academy: 3, company: 3, director: 3 };
const specialty: Record<Stage, Stat> = { student: 'flights', pilot: 'flights', employee: 'rank', instructor: 'teach', academy: 'students', solo: 'contracts', company: 'value', director: 'support' };

export function hud(state: GameState, choices: OptionView[], onGoal: (id: string) => void, previous?: GameState) {
  const d = derived(state);
  function counter(stat: Stat, label: string, symbol: IconName, max?: number) {
    const pill = el('div', 'counter ' + stat);
    const value = el('b');
    countNumber(value, previous?.s[stat] ?? state.s[stat], state.s[stat], num);
    const copy = el('span', 'counter-copy');
    copy.append(el('small', '', label), value);
    if (stat === 'debt') value.after(el('small', '', ' / ' + num(d.creditLimit)));
    pill.append(icon(symbol), copy);
    if (max) {
      const bar = meter(state.s[stat], max, label);
      pill.append(bar);
      if (previous && !reducedMotion()) {
        bar.firstElementChild?.animate([{width: Math.min(100, previous.s[stat] / max * 100) + '%'}, {width: Math.min(100, state.s[stat] / max * 100) + '%'}], 480);
      }
    }
    if (previous && previous.s[stat] !== state.s[stat] && !reducedMotion()) {
      pill.classList.add('changed');
      const pop = el('span', 'gain', signed(state.s[stat] - previous.s[stat]));
      pop.setAttribute('aria-hidden', 'true');
      pop.addEventListener('animationend', () => pop.remove(), {once:true});
      pill.append(pop);
    }
    return pill;
  }
  const top = el('header', 'top-bar');
  const badge = emblem(tiers[state.stage]);
  if (previous && previous.stage !== state.stage) badge.classList.add('promoted');
  const identity = el('div', 'identity');
  identity.append(el('small', '', d.rankName || '파일럿 수첩'), el('h1', '', d.stageName));
  const debt = counter('debt', '빚 / 한도', 'bank');
  debt.classList.toggle('near-limit', state.s.debt >= d.creditLimit * .85);
  top.append(badge, identity, counter('money', '자금 · 만원', 'coin'), debt);
  const time = el('div', 'time-strip');
  time.append(icon('sun'), el('strong', '', `${d.age}세 ${d.quarter}분기`), meter(state.turn, RULES.maxTurns, '비행 경력'), el('span', '', `남은 ${d.turnsLeft}분기`));

  const next = choices.find(o => o.roll?.success.stage || o.sure?.stage);
  const goal = next ? button('', 'goal', () => onGoal(next.id)) : el('div', 'goal');
  const flag = el('span', 'goal-icon');
  flag.append(icon('flag'));
  const copy = el('span', 'goal-copy');
  copy.append(el('small', '', next ? '다음 목표' : '은퇴까지'), el('strong', '', next?.title ?? `남은 ${d.turnsLeft}분기`));
  goal.append(flag, copy);
  if (next) goal.append(el('small', 'goal-lock', next.enabled ? '도전 가능' : next.locks[0]), icon('arrow'));
  const strip = el('div', 'stat-strip');
  strip.append(counter('xp', '경험치', 'bolt', STAT_MAX.xp), counter('rep', '평판', 'star', STAT_MAX.rep));
  const career = specialty[state.stage];
  if (state.s[career]) strip.append(counter(career, STAT_LABEL[career], 'flag'));
  const equipment = el('div', 'equipment');
  for (const [stat, label, symbol] of [['drone','드론','drone'], ['gear','장비','tool'], ['car','차량','car']] as const) {
    const chip = counter(stat, label, symbol);
    chip.title = d.items[stat].name;
    if (stat === 'drone') {
      chip.title += ` · 기체 상태 ${state.s.cond}%`;
      const condition = meter(state.s.cond, 100, '기체 상태');
      if (previous && previous.s.cond !== state.s.cond && !reducedMotion()) {
        condition.firstElementChild?.animate([{width: previous.s.cond + '%'}, {width: state.s.cond + '%'}], 480);
        const pop = el('span', 'gain', signed(state.s.cond - previous.s.cond) + '%');
        pop.addEventListener('animationend', () => pop.remove(), {once:true});
        chip.classList.add('changed');
        chip.append(pop);
      }
      chip.append(condition);
    }
    equipment.append(chip);
  }
  strip.append(equipment);
  return {top, time, goal, strip};
}
