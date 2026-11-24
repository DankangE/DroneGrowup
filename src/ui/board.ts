import { careerRank } from '../game/career.ts';
import { RULES } from '../game/data.ts';
import { derived } from '../game/engine.ts';
import type { GameState } from '../game/types.ts';
import { el, reducedMotion, svg } from './dom.ts';
import { chibi } from './pieces.ts';

// Coordinates in the five-by-five track grid, in travelling order.
const corners = [[1, 1], [5, 1], [5, 5], [1, 5]];
const direction = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const signs = ['✿', '☀', '❧', '❄'];
const arrows = ['→', '↓', '←', '↑'];

function footprint() {
  const mark = svg('svg', { viewBox: '0 0 24 24', class: 'footprint', 'aria-hidden': 'true', fill: 'currentColor' });
  for (const [x, y] of [[7, 11], [17, 5]]) {
    mark.append(svg('ellipse', { cx: x, cy: y, rx: 3, ry: 5, transform: `rotate(12 ${x} ${y})` }), svg('circle', { cx: x - 1, cy: y + 8, r: 2 }));
  }
  return mark;
}

export function yearBoard(state: GameState, previous?: GameState) {
  const d = derived(state);
  const step = Math.min(state.s.acts, 3);
  const board = el('section', 'year-board');
  board.dataset.board = '';
  board.setAttribute('aria-label', `올해의 비행판 · ${d.dateLabel} · ${step + 1}번째 칸`);
  const sceneWindow = el('div', 'scene-window');
  sceneWindow.dataset.clipOk = '';
  board.append(sceneWindow);
  const token = el('span', 'board-token');
  token.dataset.token = '';
  token.dataset.season = String(d.season);
  token.dataset.step = String(step);
  token.append(chibi(careerRank(state), true));
  if (state.s.acts > 3) token.append(el('b', 'multiplicity', '×' + state.s.acts));
  RULES.seasons.forEach((name, season) => {
    const rail = el('span', 'track-side' + (season === d.season ? ' lit' : ''));
    rail.dataset.side = String(season);
    rail.setAttribute('aria-hidden', 'true');
    board.append(rail);
    for (let i = 0; i < 4; i++) {
      const cell = el('div', 'space' + (i ? '' : ' corner') + (season === d.season ? ' lit' : ''));
      cell.dataset.space = `${season}-${i}`;
      cell.style.gridColumn = String(corners[season][0] + direction[season][0] * i);
      cell.style.gridRow = String(corners[season][1] + direction[season][1] * i);
      if (!i) {
        const label = el('span', 'season-label');
        label.append(el('i', '', signs[season]), el('b', '', name));
        cell.append(label);
        if (!season) cell.append(el('small', 'corner-age', d.age + '세'));
      } else cell.append(el('span', 'track-arrow', arrows[season]));
      if (season === d.season && i < step) cell.append(footprint());
      if (season === d.season && i === step) cell.append(token);
      board.append(cell);
    }
  });
  function animate() {
    if (!previous) return;
    const oldSeason = derived(previous).season;
    const oldStep = Math.min(previous.s.acts, 3);
    if (oldSeason === 3 && d.season === 0) {
      const birthday = el('b', 'birthday', '한 살 더!');
      sceneWindow.append(birthday);
      setTimeout(() => birthday.remove(), 1200);
    }
    if (reducedMotion() || (oldSeason === d.season && oldStep === step)) return;
    const old = board.querySelector(`[data-space="${oldSeason}-${oldStep}"]`)!.getBoundingClientRect();
    const now = token.parentElement!.getBoundingClientRect();
    const dx = old.x + old.width / 2 - now.x - now.width / 2;
    const dy = old.y + old.height / 2 - now.y - now.height / 2;
    token.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: `translate(${dx / 2}px,${dy / 2 - 22}px) rotate(-9deg)` }, { transform: 'none' }], { duration: 440, easing: 'ease-out' });
  }
  return { board, sceneWindow, animate };
}
