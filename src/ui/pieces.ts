import { careerRank, grade } from '../game/career.ts';
import type { CareerRank, Requirement } from '../game/career.ts';
import { STAT_LABEL } from '../game/data.ts';
import { num } from '../game/engine.ts';
import type { GameState, Stage, Stat } from '../game/types.ts';
import { chibiArt } from './art.ts';
import { el } from './dom.ts';
import { emblem } from './icons.ts';
import { artImage } from './images.ts';

const specialty: Partial<Record<Stage, Stat>> = {
  pilot: 'net', employee: 'net', instructor: 'teach', academy: 'teach', solo: 'biz', company: 'biz', director: 'support',
};

export function plateStats(stage: Stage): Stat[] {
  const extra = specialty[stage];
  const stats: Stat[] = ['stamina', 'theory', 'skill', 'xp', 'rep'];
  if (extra) stats.push(extra);
  return stats;
}

export const shortLabel = (stat: Stat) => stat === 'skill' ? '조종' : stat === 'xp' ? '경험' : STAT_LABEL[stat];

export function gradeBadge(state: GameState, stat: Stat, numbers = false) {
  const value = state.s[stat];
  const held = grade(stat, value)!;
  const badge = el('b', 'grade-badge', numbers ? num(value) : held.letter);
  badge.dataset.stat = stat;
  badge.dataset.grade = held.letter;
  badge.setAttribute('aria-label', `${STAT_LABEL[stat]} ${held.letter}등급 · ${num(value)}`);
  return badge;
}

export function standingGrades(state: GameState, stats = plateStats(state.stage)) {
  const strip = el('div', 'standing-grades');
  for (const stat of stats) {
    const cell = el('span', 'standing-grade', shortLabel(stat));
    cell.append(gradeBadge(state, stat));
    strip.append(cell);
  }
  return strip;
}

export function chibi(rank: CareerRank, head = false) {
  const frame = el('span', head ? 'chibi head' : 'chibi body');
  frame.dataset.clipOk = '';
  frame.setAttribute('aria-hidden', 'true');
  frame.append(emblem(rank.level), artImage(chibiArt(rank.stage)));
  return frame;
}

export function stars(rank: CareerRank) {
  const row = el('span', 'stars', '★'.repeat(rank.stars) + '☆'.repeat(rank.maxStars - rank.stars));
  row.setAttribute('aria-label', `별 ${rank.maxStars}개 중 ${rank.stars}개`);
  return row;
}

export function requirements(items: Requirement[], detailed = false) {
  const group = el('span', detailed ? 'requirements detailed' : 'requirements');
  for (const item of items) {
    const target = item.needGrade ?? (item.need === undefined ? '' : num(item.need));
    const badge = el('span', item.met ? 'met' : 'unmet', [item.met ? '✓' : '○', item.label, target].filter(Boolean).join(' '));
    if (detailed && item.need !== undefined) badge.append(el('small', '', `${num(item.need)} 이상 · 지금 ${num(item.have!)}${item.haveGrade ? ' (' + item.haveGrade + ')' : ''}`));
    group.append(badge);
  }
  return group;
}

export function rankLine(state: GameState) {
  const rank = careerRank(state);
  const line = el('div', 'rank-line');
  line.append(el('strong', '', rank.title), el('span', 'level', 'Lv ' + rank.level), stars(rank));
  return line;
}
