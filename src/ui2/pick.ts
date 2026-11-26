import type { Move, StopReason } from '../life/move.ts';
import type { MapId } from '../life/types.ts';
import { MAPS, PLACES, WORLD } from '../life/world.ts';
import { button, el, svg } from '../ui/dom.ts';
import { GRID, gridCell, projectBoardPaths } from './board.ts';
import { COPY } from './popups/data.ts';

const BY_ID = new Map(WORLD.map(node => [node.id, node]));
/** Why the token stops short of the rolled sum; older moves without a reason were review stops. */
export const STOP_LABEL: Record<StopReason, string> = { review: '심사 정차', exam: '시험장 정차', life: '결혼·출산 정차', estate: '부동산 정차' };
export const stopLabel = (move: Pick<Move, 'stop' | 'stopReason'>): string =>
  move.stop ? STOP_LABEL[move.stopReason ?? 'review'] : '';
export const destinationDetails = (move: Move): string =>
  `${move.steps}걸음${move.fare ? ` · 통행료 ${move.fare}만` : ''}${move.stop ? ` · ${stopLabel(move)}` : ''}`;
export function destinationName(move: Move, origin: string): string {
  const node = BY_ID.get(move.node)!;
  return `${node.map !== BY_ID.get(origin)!.map ? `⇄ ${MAPS[node.map].name} · ` : ''}${node.kind === 'start' && node.map !== 'A' ? '출발 광장' : PLACES[node.place].name}`;
}

/** Never draw a line across unrelated maps; previews retain the engine's full path. */
export function pathSegments(origin: string, path: readonly string[], map: MapId) {
  return path.flatMap((id, index) => {
    const from = BY_ID.get(index === 0 ? origin : path[index - 1])!, to = BY_ID.get(id)!;
    return from.map === map && to.map === map ? [{ from: gridCell(from), to: gridCell(to) }] : [];
  });
}

export const PICK_STYLE = `
.life2 .life2-tile { z-index:1; }
.life2 button.life2-tile { padding:0; min-width:0; gap:0; box-shadow:inset 0 0 0 2px #6c3ec4; background:#e8dcff; }
.life2 button.life2-tile .life2-glyph { font-size:15px; line-height:16px; }
.life2 .life2-tile .life2-fare { font-size:11px; line-height:11px; }
.life2 [data-dest]:focus-visible { outline:3px solid #ad361b; outline-offset:-3px; }
.life2 .life2-preview { position:absolute; inset:0; width:100%; height:100%; z-index:0; pointer-events:none; }
.life2 .life2-preview line { stroke:#ad361b; stroke-width:.065; stroke-dasharray:.12 .1; }
.life2 .life2-transfer-badge { border:2px solid #6c3ec4; background:#e8dcff; }
`;

export function pick(frame: HTMLElement, origin: string, moves: readonly Move[], heading: HTMLElement,
  take: (id: string) => void) {
  const grid = frame.querySelector<HTMLElement>('[data-map]')!;
  const map = BY_ID.get(origin)!.map;
  const preview = svg('svg', { viewBox: `0 0 ${GRID.columns} ${GRID.rows}`, preserveAspectRatio: 'none',
    class: 'life2-preview', 'aria-hidden': 'true' });
  grid.append(preview);
  heading.setAttribute('aria-live', 'polite');
  function show(move: Move) {
    heading.textContent = COPY.pickDestination;
    preview.dataset.pathPreview = move.node;
    preview.replaceChildren(...pathSegments(origin, move.path, map).map(({ from, to }) => svg('line', {
      x1: from.column - .5, y1: from.row - .5, x2: to.column - .5, y2: to.row - .5,
    })));
    projectBoardPaths(grid);
  }
  function decorate(control: HTMLButtonElement, move: Move) {
    control.dataset.dest = move.node;
    control.title = `${destinationName(move, origin)} · ${destinationDetails(move)}`;
    control.setAttribute('aria-label', control.title);
    if (move.stop && (move.stopReason ?? 'review') === 'review') control.dataset.reviewStop = move.stop;
    if (move.stop) control.dataset.stop = move.stop;
    control.addEventListener('focus', () => show(move));
    control.addEventListener('pointerenter', () => show(move));
  }
  for (const move of moves) {
    const tile = grid.querySelector<HTMLElement>(`[data-space="${move.node}"]`);
    if (!tile) continue; // Other-map badges live in the pager along the board's edge.
    const control = button('', tile.className, () => take(`go:${move.node}`));
    for (const attribute of tile.attributes) control.setAttribute(attribute.name, attribute.value);
    control.append(...tile.childNodes);
    const label = control.querySelector('.life2-tile-label')!;
    label.textContent = `${label.textContent} ${move.steps}${move.stop ? '!' : ''}`;
    if (move.fare) control.append(el('small', 'life2-fare', `${move.fare}만`));
    decorate(control, move); tile.replaceWith(control);
  }
  if (moves[0]) show(moves[0]);
  return decorate;
}
