import { careerRank, grade, nextRanks } from '../game/career.ts';
import { RULES, STAT_MAX } from '../game/data.ts';
import { derived, num, staminaBand } from '../game/engine.ts';
import type { GameState, OptionView, Stat } from '../game/types.ts';
import { button, countNumber, el, meter, reducedMotion } from './dom.ts';
import { icon } from './icons.ts';
import { chibi, gradeBadge, plateStats, requirements, shortLabel, stars } from './pieces.ts';

export const signed = (value: number) => `${value > 0 ? '+' : ''}${num(value)}`;
export const statValue = (stat: Stat, value: number) => num(value) + (['money','debt','value'].includes(stat) ? '만원' : ['support','cond'].includes(stat) ? '%' : '');

function changePop(node: HTMLElement, diff: number) {
  if (!diff || reducedMotion()) return;
  const pop = el('span', 'gain', signed(diff));
  pop.setAttribute('aria-hidden', 'true');
  pop.addEventListener('animationend', () => pop.remove(), { once: true });
  node.append(pop);
}

export function hud(state: GameState, choices: OptionView[], numbers: boolean, onFlip: (numbers: boolean) => void, onLadder: () => void, previous?: GameState) {
  const d = derived(state);
  const rank = careerRank(state);
  const status = el('header', 'player-plate');
  const identity = el('div', 'identity');
  const title = el('div', 'player-name');
  const level = el('span', 'level', 'Lv ' + rank.level);
  if (previous && (careerRank(previous).level !== rank.level || previous.stage !== state.stage)) level.classList.add('promoted');
  title.append(el('h1', '', rank.title), stars(rank), level);
  identity.append(chibi(rank, true), title);

  const time = el('div', 'calendar');
  const acts = el('span', '', `계절 행동 ${state.s.acts}회`);
  acts.dataset.acts = String(state.s.acts);
  time.append(el('strong', '', d.dateLabel), acts, el('small', '', `${d.age - RULES.startAge + 1} / ${RULES.maxTurns / RULES.seasons.length}바퀴`));

  const accounts = el('div', 'accounts');
  for (const stat of ['money', 'debt'] as const) {
    const pill = el('div', 'account ' + stat);
    const figure = el('b', 'figure');
    countNumber(figure, previous?.s[stat] ?? state.s[stat], state.s[stat], num);
    pill.title = stat === 'debt' ? '빚 / 신용 한도 (만원)' : '자금 (만원)';
    pill.append(icon(stat === 'money' ? 'coin' : 'bank'), el('small', '', stat === 'money' ? '자금' : '빚'), figure);
    pill.append(el('small', '', stat === 'money' ? '만원' : ' / ' + num(d.creditLimit)));
    if (stat === 'debt' && state.s.debt >= d.creditLimit * .85) pill.classList.add('near-limit');
    if (previous) changePop(pill, state.s[stat] - previous.s[stat]);
    accounts.append(pill);
  }

  const strip = button('', 'grade-strip', () => {
    numbers = !numbers;
    drawGrades();
    onFlip(numbers);
  }, 'grades');
  const band = staminaBand(state);
  const words = { fresh: '쌩쌩', normal: '', tired: '지침', exhausted: '탈진' };
  function drawGrades(feedback = false) {
    strip.replaceChildren();
    strip.dataset.grades = numbers ? 'numbers' : 'letters';
    strip.setAttribute('aria-pressed', String(numbers));
    const stats = el('span', 'plate-grades');
    for (const stat of plateStats(state.stage)) {
      const held = grade(stat, state.s[stat])!;
      const cell = el('span', 'grade-cell');
      const name = el('span', 'grade-name', shortLabel(stat));
      const badge = gradeBadge(state, stat, numbers);
      cell.append(name, badge);
      if (stat === 'stamina') {
        cell.dataset.stamina = band;
        cell.dataset.staminaBand = band;
        if (state.phase === 'action' && !choices.some(o => !o.free && o.id !== 'rest' && o.tire <= state.s.stamina)) cell.classList.add('stamina-warning');
        const value = el('b', 'stamina-value');
        if (!numbers) {
          countNumber(value, feedback && previous ? previous.s.stamina : state.s.stamina, state.s.stamina, num);
          name.append(' ', value);
        }
        if (words[band]) cell.append(el('small', 'band', words[band]));
        const bar = meter(state.s.stamina, STAT_MAX.stamina!, '체력');
        cell.append(bar);
        if (feedback && previous && !reducedMotion()) bar.firstElementChild?.animate([{width: previous.s.stamina + '%'}, {width: state.s.stamina + '%'}], 480);
      }
      if (numbers) cell.append(el('small', 'next-grade', held.next === null ? '최고 등급' : '다음 등급까지 ' + num(held.next - state.s[stat])));
      if (feedback && previous && previous.s[stat] !== state.s[stat]) {
        if (numbers) countNumber(badge, previous.s[stat], state.s[stat], num);
        changePop(cell, state.s[stat] - previous.s[stat]);
        if (grade(stat, previous.s[stat])?.letter !== held.letter) badge.classList.add('flip');
      }
      stats.append(cell);
    }
    const gear = el('span', 'equipment');
    for (const [stat, label, symbol] of [['drone','드론','drone'], ['gear','장비','tool'], ['car','차량','car']] as const) {
      const item = el('span', 'item-chip');
      item.title = d.items[stat].name;
      item.append(icon(symbol), label + ' ' + state.s[stat]);
      gear.append(item);
    }
    const flip = el('span', 'flip-hint', '↻');
    flip.setAttribute('aria-hidden', 'true');
    gear.append(flip);
    strip.title = '등급과 수치 전환';
    strip.append(stats, gear);
    strip.setAttribute('aria-label', [numbers ? '등급 글자로 보기' : '정확한 수치 보기', stats.textContent, gear.textContent].join(' · '));
  }
  drawGrades(true);
  status.append(identity, time, accounts, strip);

  const ladder = button('', 'career-strip', onLadder, 'ladder');
  ladder.dataset.ladder = '';
  const here = el('span', 'current-rung');
  here.append(el('b', '', rank.title), stars(rank));
  const next = nextRanks(state);
  const target = el('span', 'next-rung');
  target.append(el('strong', '', next.length ? '다음 랭크 ▶ ' + next[0].rank.title : '50세에 은퇴'));
  if (next.length) {
    target.append(requirements(next[0].requirements));
    if (next[0].enabled) target.append(el('b', 'ready', '도전 가능'));
  }
  ladder.append(here, target, el('b', 'ladder-more', next.length > 1 ? '+' + (next.length - 1) : '›'));
  return { status, ladder };
}
