import { careerRank, grade, nextRanks } from '../game/career.ts';
import { RULES, STAT_MAX } from '../game/data.ts';
import { derived, num, staminaBand } from '../game/engine.ts';
import { signed } from '../game/outcome-text.ts';
import type { GameState, OptionView } from '../game/types.ts';
import { button, countNumber, el, meter, reducedMotion } from './dom.ts';
import { icon } from './icons.ts';
import { chibi, gradeBadge, plateStats, requirements, shortLabel, stars } from './pieces.ts';

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

  const years = RULES.maxTurns / RULES.seasons.length;
  const time = el('div', 'life-track');
  time.dataset.lifeTrack = '';
  time.dataset.age = String(d.age);
  time.dataset.turn = String(state.turn);
  const dots = el('span', 'season-dots');
  dots.setAttribute('aria-hidden', 'true');
  RULES.seasons.forEach((_, i) => dots.append(el('i', i === d.season ? 'lit' : '')));
  const date = el('div', 'life-date');
  date.append(el('strong', '', d.dateLabel), dots);
  const timeline = el('div', 'life-meter');
  timeline.append(el('small', '', String(RULES.startAge)), meter(state.turn, RULES.maxTurns, '비행 인생'),
    el('small', '', String(RULES.startAge + years)));
  time.append(date, timeline, el('b', '', Math.min(years, d.age - RULES.startAge + 1) + ' / ' + years + '년'));

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
    const spoken: string[] = [];
    for (const stat of plateStats(state.stage)) {
      const held = grade(stat, state.s[stat])!;
      spoken.push(shortLabel(stat) + ' ' + held.letter + ' ' + num(state.s[stat]));
      const cell = el('span', 'grade-cell');
      const name = el('span', 'grade-name', shortLabel(stat));
      const badge = gradeBadge(state, stat, numbers);
      cell.append(name, badge);
      if (stat === 'stamina') {
        cell.dataset.stamina = band;
        cell.dataset.staminaBand = band;
        if (state.phase === 'action' && state.board.step === 'bonus' && !choices.some(o => (o.kind === 'action' || o.kind === 'job') && o.tire <= state.s.stamina)) cell.classList.add('stamina-warning');
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
      if (numbers) {
        const next = el('small', 'next-grade', held.next === null ? '최고' : '다음 ');
        const suffix = el('span', 'grade-explanation', held.next === null ? ' 등급' : '등급까지 ');
        next.append(suffix);
        if (held.next !== null) next.append(el('span', 'grade-plus', '+'), num(held.next - state.s[stat]));
        cell.append(next);
      }
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
    strip.setAttribute('aria-label', [numbers ? '등급 글자로 보기' : '정확한 수치 보기', ...spoken, gear.textContent].join(' · '));
  }
  drawGrades(true);
  status.append(identity, accounts, strip, time);

  const ladder = button('', 'career-strip', onLadder, 'ladder');
  ladder.dataset.ladder = '';
  const here = el('span', 'current-rung');
  here.append(el('b', '', rank.title), stars(rank));
  const next = nextRanks(state);
  const target = el('span', 'next-rung');
  target.append(el('strong', '', next.length ? '다음 랭크 ▶ ' + next[0].rank.title : '50세에 은퇴'));
  if (next.length) {
    const conditions = el('span', 'rung-conditions');
    conditions.append(requirements(next[0].requirements));
    if (next[0].enabled) conditions.append(el('b', 'ready', '도전 가능'));
    target.append(conditions);
  }
  ladder.append(here, target, el('b', 'ladder-more', next.length > 1 ? '+' + (next.length - 1) : '›'));
  return { status, ladder };
}
