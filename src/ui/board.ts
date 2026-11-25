import { careerRank } from '../game/career.ts';
import { boardView } from '../game/engine.ts';
import type { GameState, Result } from '../game/types.ts';
import { button, el, reducedMotion, svg } from './dom.ts';
import { chibi } from './pieces.ts';
import { shortNames } from './scene.ts';

type Board = ReturnType<typeof boardView>;
export const NOTICE_MS = 4500;
type Node = Board['nodes'][number];

/** Each branch carries its route name up to (but excluding) the common join. */
export function routeLanes(board: Board, fork: Node) {
  return fork.next.map(first => {
    const lane: Node[] = [];
    let node = board.nodes[first];
    while (node.routeName && node.routeName === board.nodes[first].routeName) {
      lane.push(node);
      node = board.nodes[node.next[0]];
    }
    return lane;
  });
}

function roulette(face: number, spin?: () => void) {
  const control = spin ? button('', 'roulette', spin) : el('div', 'roulette');
  control.dataset.roulette = '';
  if (!spin) control.setAttribute('role', 'img');
  const disc = el('span', 'roulette-disc');
  for (let i = 0; i < 6; i++) {
    const number = el('b', '', String(i + 1));
    const angle = (i + .5) * Math.PI / 3;
    number.style.left = (50 + 35 * Math.sin(angle)) + '%';
    number.style.top = (50 - 35 * Math.cos(angle)) + '%';
    disc.append(number);
  }
  const hub = el('span', 'roulette-hub');
  control.append(disc, hub);
  const rotation = (value: number) => value ? 360 - (value - .5) * 60 : 0;
  function stop(value: number) {
    control.dataset.spin = 'done';
    if (value) control.dataset.face = String(value);
    disc.style.transform = 'rotate(' + rotation(value) + 'deg)';
    disc.style.setProperty('--counterturn', -rotation(value) + 'deg');
    hub.textContent = value ? String(value) : '✦';
    control.setAttribute('aria-label', [spin && '주사위 굴리기', value && `주사위 ${value}칸`].filter(Boolean).join(' · ') || '주사위');
  }
  stop(face);
  function turn(value: number) {
    const start = rotation(Number(control.dataset.face) || 0);
    delete control.dataset.face;
    control.dataset.spin = 'spinning';
    const animation = disc.animate([
      { transform: `rotate(${start}deg)` }, { transform: `rotate(${1440 + rotation(value)}deg)` },
    ], { duration: 520, easing: 'cubic-bezier(.18,.67,.18,1)' });
    return animation;
  }
  return { control, stop, turn };
}

export function flightBoard(state: GameState, view: Board, face: number, spin?: () => void) {
  const board = el('section', 'flight-board');
  board.dataset.board = '';
  board.dataset.step = view.step;
  board.tabIndex = -1;
  board.setAttribute('aria-label', '비행 코스');
  const track = el('div', 'board-track');
  const edges = svg('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', class: 'board-edges', 'aria-hidden': 'true' });
  const cells = new Map<number, HTMLElement>();
  const forks = view.nodes.filter(node => node.next.length > 1).map(fork => ({ fork, lanes: routeLanes(view, fork) }));
  const inner = new Set(forks.flatMap(({ lanes }) => lanes[1].map(node => node.id)));
  const reachable = new Set(Object.values(view.reachable).flat());
  for (const node of view.nodes) {
    for (const id of node.next) {
      const to = view.nodes[id];
      const line = svg('line', { x1: node.x, y1: node.y, x2: to.x, y2: to.y, 'vector-effect': 'non-scaling-stroke' });
      if (inner.has(node.id) || inner.has(id)) line.classList.add('detour');
      line.dataset.edge = node.id + '-' + id;
      edges.append(line);
    }
    const cell = el('div', 'board-space');
    cell.dataset.space = String(node.id);
    cell.dataset.kind = node.kind;
    cell.setAttribute('role', 'group');
    cell.setAttribute('aria-label', node.label + ' · ' + shortNames[node.place]);
    cell.classList.toggle('inner-space', inner.has(node.id));
    cell.classList.toggle('reachable', !!spin && reachable.has(node.id));
    cell.style.left = node.x + '%';
    cell.style.top = node.y + '%';
    cell.append(el('b', '', node.label), el('small', '', shortNames[node.place]));
    cells.set(node.id, cell);
    track.append(cell);
  }
  for (const { fork, lanes } of forks) {
    lanes.forEach((lane, i) => {
      const first = lane[0];
      const name = el('span', 'lane-name', first.routeName);
      // The outer name sits between its first two spaces, the inner name beside its first space.
      name.style.left = (i ? 50 : first.x) + '%';
      name.style.top = (i ? first.y : (first.y + lane[1].y) / 2) + '%';
      track.append(name);
      if (fork.id === view.pos && (view.step === 'fork' || view.step === 'space')) {
        const stops = [fork.id, ...lane.map(node => node.id), lane[lane.length - 1].next[0]];
        for (const node of lane) cells.get(node.id)!.dataset.lane = String(i);
        stops.slice(1).forEach((to, index) => {
          edges.querySelector<SVGLineElement>(`[data-edge="${stops[index]}-${to}"]`)!.dataset.lane = String(i);
        });
      }
    });
  }
  const token = el('span', 'board-token');
  token.dataset.token = '';
  token.append(chibi(careerRank(state), true));
  function stand(id: number) {
    token.parentElement?.removeAttribute('aria-current');
    token.dataset.pos = String(id);
    const cell = cells.get(id)!;
    cell.setAttribute('aria-current', 'location');
    cell.append(token);
  }
  stand(view.pos);
  const wheel = roulette(face, spin);
  track.prepend(edges);
  track.append(wheel.control);
  board.append(track);

  async function move(movement: NonNullable<Result['move']>, rolled: boolean) {
    if (reducedMotion()) {
      wheel.stop(movement.roll);
      stand(movement.landed);
      return;
    }
    let walking = false;
    let skipWalk = false;
    let animation: Animation | undefined;
    const skipInput = new AbortController();
    function skip(event: Event) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event instanceof KeyboardEvent && event.repeat) return;
      if (walking) skipWalk = true;
      animation?.finish();
    }
    const listener = { capture: true, signal: skipInput.signal };
    document.addEventListener('click', skip, listener);
    document.addEventListener('keydown', skip, listener);
    try {
      if (rolled) {
        animation = wheel.turn(movement.roll);
        await animation.finished;
      }
      wheel.stop(movement.roll);
      walking = true;
      for (const id of movement.path) {
        if (skipWalk) break;
        const before = token.getBoundingClientRect();
        stand(id);
        const after = token.getBoundingClientRect();
        const dx = before.x - after.x;
        const dy = before.y - after.y;
        animation = token.animate([
          { transform: `translate(${dx}px,${dy}px)` },
          { transform: `translate(${dx / 2}px,${dy / 2 - 10}px)` },
          { transform: 'none' },
        ], { duration: 110, easing: 'ease-in-out' });
        await animation.finished;
      }
      stand(movement.landed);
    } finally {
      skipInput.abort();
    }
  }
  function highlight(lane?: number) {
    if (lane === undefined) delete board.dataset.highlight;
    else board.dataset.highlight = String(lane);
  }
  function toast(gain: number) {
    const note = el('div', 'board-toast');
    note.dataset.toast = '';
    note.setAttribute('aria-live', 'polite');
    board.append(note);
    note.textContent = '체력 +' + gain;
    setTimeout(() => note.remove(), 2000);
  }
  /** A settlement that needs no answer: shown over the board while the next prompt is already live. */
  function notice(note: HTMLElement) {
    board.querySelector('[data-settle]')?.remove();
    board.append(note);
    setTimeout(() => note.remove(), NOTICE_MS);
  }
  return { board, move, highlight, toast, notice };
}
