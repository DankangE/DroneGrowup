import type { GameState, SpaceKind, WorldNode } from '../life/types.ts';
import { MAPS, PLACES, WORLD } from '../life/world.ts';
import { el, svg } from '../ui/dom.ts';
import { tileIcon } from './icons.ts';

export const GRID = { columns: 7, rows: 9 } as const;
const KINDS: Record<SpaceKind, string> = {
  start: '출발', pay: '월급', train: '배움', job: '일감',
  contest: '대회', event: '사건', rest: '휴식', rankup: '심사',
  jobfair: '취업', shop: '상점', estate: '집', life: '생활',
  biz: '상가', luck: '행운', station: '환승', invest: '투자',
};

/** WORLD stores floored cell-center percentages; CSS grid uses one-based cell indices. */
export function gridCell(node: Pick<WorldNode, 'x' | 'y'>): { column: number; row: number } {
  return { column: Math.floor(node.x * GRID.columns / 100) + 1,
    row: Math.floor(node.y * GRID.rows / 100) + 1 };
}

export function board(state: GameState): HTMLElement {
  const current = WORLD.find(node => node.id === state.board.pos)!;
  const nodes = WORLD.filter(node => node.map === current.map);
  const frame = el('section', 'life2-board-frame');
  frame.setAttribute('aria-label', `${MAPS[current.map].name} 지도`);
  const grid = el('div', 'life2-board');
  grid.dataset.map = current.map;
  grid.style.setProperty('--columns', String(GRID.columns));
  grid.style.setProperty('--rows', String(GRID.rows));
  const paths = svg('svg', { viewBox: `0 0 ${GRID.columns} ${GRID.rows}`, preserveAspectRatio: 'none',
    class: 'life2-paths', 'aria-hidden': 'true' });
  for (const node of nodes) {
    const from = gridCell(node);
    for (const id of node.next) {
      const to = gridCell(nodes.find(next => next.id === id)!);
      paths.append(svg('line', { x1: from.column - .5, y1: from.row - .5,
        x2: to.column - .5, y2: to.row - .5 }));
    }
  }
  grid.append(paths);
  for (const node of nodes) {
    const cell = gridCell(node), label = KINDS[node.kind];
    const tile = el('div', 'life2-tile');
    tile.dataset.space = node.id;
    tile.dataset.kind = node.kind;
    tile.style.gridColumn = String(cell.column);
    tile.style.gridRow = String(cell.row);
    tile.title = `${PLACES[node.place].name} · ${label}`;
    tile.setAttribute('aria-label', tile.title);
    tile.append(tileIcon(node.kind), el('span', 'life2-tile-label', label));
    if (node.id === current.id) {
      tile.setAttribute('aria-current', 'location');
      const pawn = svg('svg', { viewBox: '0 0 20 24', class: 'life2-pawn', role: 'img', 'aria-label': '내 위치' });
      pawn.dataset.pawn = node.id;
      pawn.append(svg('circle', { cx: 10, cy: 6, r: 4 }), svg('path', { d: 'M6 11h8l3 10H3z' }));
      tile.append(pawn);
    }
    grid.append(tile);
  }
  frame.append(grid);
  return frame;
}
