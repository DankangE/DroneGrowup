import type { Result } from '../life/engine.ts';
import type { MapId } from '../life/types.ts';
import { WORLD } from '../life/world.ts';
import { SPIN_MS } from './wheel.ts';
import { TRANSFER_MS } from './transfer.ts';

export const STEP_MS = 215;
const BY_ID = new Map(WORLD.map(node => [node.id, node]));
export type Frame = { phase: 'spin' | 'move' | 'transfer'; pos: string; ms: number;
  from?: MapId; to?: MapId; payment?: number; callout?: boolean };

/** Presentation only: use the engine's actual route, stop and settlement total. */
export function movementFrames(origin: string, result: Pick<Result, 'move' | 'upkeep'>, spin = false): Frame[] {
  const frames: Frame[] = spin ? [{ phase: 'spin', pos: origin, ms: SPIN_MS }] : [];
  const route = result.move;
  if (!route) return frames;
  const path = route.stop ? route.path.slice(0, route.path.indexOf(route.stop) + 1) : route.path;
  const paymentAt = path.find(id => route.passed.pay.includes(id) || route.passed.start.includes(id));
  let previous = origin;
  for (const pos of path) {
    const from = BY_ID.get(previous)!.map, to = BY_ID.get(pos)!.map;
    if (from !== to) frames.push({ phase: 'transfer', pos: previous, from, to, ms: TRANSFER_MS });
    frames.push({ phase: 'move', pos, ms: STEP_MS,
      ...(pos === paymentAt && result.upkeep ? { payment: result.upkeep.total } : {}) });
    previous = pos;
  }
  return frames;
}

type Schedule = (callback: () => void, ms: number) => () => void;
const schedule: Schedule = (callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); };
type Completion = (frame: Frame, advance: () => void) => (() => void) | undefined;

/** A completion hook may own a frame's wait and cleanup; other frames use their exact duration. */
export function playback(frames: readonly Frame[], show: (frame: Frame) => void, done: () => void,
  later = schedule, completion?: Completion) {
  let index = -1, active = true, cancelTimer = () => {};
  function cancel() { active = false; cancelTimer(); }
  function finish() { if (active) { cancel(); done(); } }
  function next() {
    if (!active) return;
    cancelTimer(); cancelTimer = () => {}; index++;
    const frame = frames[index];
    if (!frame) { finish(); return; }
    const expected = index;
    show(frame);
    const advance = () => { if (active && index === expected) next(); };
    const cleanup = completion?.(frame, advance) ?? later(advance, frame.ms);
    // Also safe when a completion hook settles synchronously.
    if (!active || index !== expected) cleanup(); else cancelTimer = cleanup;
  }
  return { next, finish, cancel };
}

export const MOVE_STYLE = `
.life2 .life2-payment { position:absolute; left:10px; top:10px; z-index:3; padding:6px 10px;
  background:#fff9eb; border:1px solid #3a2861; border-radius:8px; font-size:14px;
  animation:life2-payment ${STEP_MS}ms ease-out both; pointer-events:none; }
@keyframes life2-payment { from { transform:translateY(10px); opacity:0; } to { transform:translateY(0); opacity:1; } }
@media(prefers-reduced-motion:reduce) { .life2 .life2-payment { animation:none!important; } }
`;
