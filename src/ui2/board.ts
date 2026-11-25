import type { GameState, SpaceKind, WorldNode } from '../life/types.ts';
import { MAPS, PLACES, WORLD } from '../life/world.ts';
import { el, svg } from '../ui/dom.ts';
import { tileIcon } from './icons.ts';

export const GRID = { columns: 7, rows: 9 } as const;
export const TILT = { degrees: 38, perspective: 6000, clearance: 2 } as const;

/** Inverse-project tile centers above the tilted plane, then counter-rotate the
 * upright DOM tiles (including pawn/buildings). Their screen targets remain
 * square, disjoint and at the original grid coordinates, even on 360px phones.
 */
export function uprightTile(x: number, y: number, height: number) {
  const radians = TILT.degrees * Math.PI / 180;
  const sin = Math.sin(radians), cos = Math.cos(radians);
  // Counter-rotation puts the bottom corners behind the board unless lifted.
  // Lift the whole tile (including its flattened face/art/labels/pawn) so the
  // board cannot occlude either its pixels or its native pointer target.
  const lift = height / 2 * sin + TILT.clearance;
  // Solve with dz = lift * scale: after the board rotation, Y = y * scale
  // and Z = perspective * (1 - scale), preserving the original screen square.
  const scale = cos / (cos + (y * sin + lift) / TILT.perspective);
  const planeY = scale * (y + lift * sin) / cos;
  return { dx: x * scale - x, dy: planeY - y, dz: lift * scale, scale };
}
/** Inverse-project path vertices onto z=0, below every lifted tile corner. */
export function groundPoint(x: number, y: number) {
  const radians = TILT.degrees * Math.PI / 180, sin = Math.sin(radians), cos = Math.cos(radians);
  const scale = cos / (cos + y * sin / TILT.perspective);
  return { x: x * scale, y: y * scale / cos };
}
export function projectBoardPaths(grid: HTMLElement): void {
  if (!grid.offsetWidth) return;
  const tilted = grid.className.includes('life2-board-tilted');
  for (const layer of grid.querySelectorAll<SVGSVGElement>('.life2-paths,.life2-preview')) {
    for (const line of layer.querySelectorAll('line')) for (const end of ['1', '2']) {
      const xKey = `flatX${end}`, yKey = `flatY${end}`;
      const x = Number(line.dataset[xKey] ??= line.getAttribute(`x${end}`)!);
      const y = Number(line.dataset[yKey] ??= line.getAttribute(`y${end}`)!);
      const point = groundPoint((x / GRID.columns - .5) * grid.offsetWidth, (y / GRID.rows - .5) * grid.offsetHeight);
      line.setAttribute(`x${end}`, String(tilted ? (point.x / grid.offsetWidth + .5) * GRID.columns : x));
      line.setAttribute(`y${end}`, String(tilted ? (point.y / grid.offsetHeight + .5) * GRID.rows : y));
    }
  }
}
export function setBoardTilt(frame: HTMLElement, enabled: boolean): void {
  const grid = frame.querySelector<HTMLElement>('[data-map]')!;
  grid.className = `life2-board${enabled ? ' life2-board-tilted' : ''}`;
  projectBoardPaths(grid);
  if (!enabled || !grid.offsetWidth) return;
  // Layout dimensions, not projected bounding boxes. No custom pointer math:
  // native DOM hit-testing uses these same inverse-projected tile transforms.
  for (const tile of grid.querySelectorAll<HTMLElement>('[data-space]')) {
    const { dx, dy, dz, scale } = uprightTile(tile.offsetLeft + tile.offsetWidth / 2 - grid.offsetWidth / 2,
      tile.offsetTop + tile.offsetHeight / 2 - grid.offsetHeight / 2, tile.offsetHeight);
    tile.style.setProperty('--upright-x', `${dx}px`); tile.style.setProperty('--upright-y', `${dy}px`);
    tile.style.setProperty('--upright-z', `${dz}px`);
    tile.style.setProperty('--upright-scale', String(scale));
  }
}
export const TILT_STYLE = `
.life2 .life2-board-tilted {
  --cell:min(calc((100cqw - 24px) / 7),calc((100cqh - 16px) / 9),72px);
  isolation:auto; transform-style:preserve-3d;
  transform:perspective(${TILT.perspective}px) rotateX(${TILT.degrees}deg);
}
.life2 .life2-board-tilted .life2-tile,.life2 .life2-board-tilted .life2-tile:active {
  transform:translate3d(var(--upright-x,0px),var(--upright-y,0px),var(--upright-z,0px)) rotateX(-${TILT.degrees}deg) scale(var(--upright-scale,1));
  transform-style:flat;
  background:transparent; border-color:transparent; box-shadow:none;
}
/* Tilt the tile face while its readable content and native target stand upright. */
.life2 .life2-board-tilted .life2-tile::before { content:''; position:absolute; inset:0; z-index:-1; pointer-events:none;
  background:var(--face,#fff9eb); border:1px solid #80758b; border-radius:6px; box-shadow:0 3px 0 #80758b;
  transform:rotateX(${TILT.degrees}deg); }
.life2 .life2-board-tilted [data-kind=station] { --face:#d8e9ff; }
.life2 .life2-board-tilted [data-kind=rankup] { --face:#f1dfff; }
.life2 .life2-board-tilted [data-kind=pay],.life2 .life2-board-tilted [data-kind=start] { --face:#ffe39b; }
.life2 .life2-board-tilted [aria-current] { --face:#c5efdf; }
.life2 .life2-board-tilted [data-dest] { --face:#e8dcff; }
.life2 .life2-board-tilted [aria-current]::before,.life2 .life2-board-tilted [data-dest]::before { border:2px solid #6c3ec4; }
.life2 .life2-board-tilted .life2-paths,.life2 .life2-board-tilted .life2-preview {
  /* Lines stay on the board plane. Counter-rotating this board-sized SVG lifts
     its far edge through the upright tile faces, regardless of z-index. */
  transform:none; overflow:visible;
}
/* Animate the transfer overlay only: board opacity would flatten its 3D children. */
.life2[data-phase=transfer] .life2-board-tilted { animation:none; }
/* Static tilt is intentional. No camera transition, also with reduced motion. */
@media(prefers-reduced-motion:reduce) { .life2 .life2-board-tilted { transition:none; animation:none; } }
`;
export const KINDS: Record<SpaceKind, string> = {
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

export function board(state: GameState, position = state.board.pos): HTMLElement {
  const current = WORLD.find(node => node.id === position)!;
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
    tile.append(tileIcon(node.kind, node.place), el('span', 'life2-tile-label', label));
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
